// supabase/functions/chainhook-webhook/index.ts
// Chainhook v2 webhook handler — indexes escrow contract events into Supabase
//
// Requires chainhook option: decode_clarity_values: true
// Deployed with --no-verify-jwt (Hiro does not send Supabase JWTs)
//
// Env vars (auto-injected by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Secrets (set via `supabase secrets set`):
//   CHAINHOOK_AUTH_TOKEN — shared secret to validate webhook origin
//   ESCROW_CONTRACT_IDS — comma-separated contract identifiers (optional)

import { createClient } from "jsr:@supabase/supabase-js@2";

// Environment-driven contract IDs — no hardcoded values for mainnet
const CONTRACT_IDS = new Set(
  (Deno.env.get("ESCROW_CONTRACT_IDS") ||
    "ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v7"
  ).split(",").map((s) => s.trim()),
);

// v3+ contracts anchor their on-chain `created-at` / `delivered-at` /
// `disputed-at` / `completed-at` to burn-block-height (Bitcoin chain, stable
// ~10 min/block). For events emitted by these contracts the webhook stores
// burn blocks in the corresponding DB columns so the frontend can compute
// expiry / countdown math consistently. Legacy v2/v7 contracts store Stacks
// block heights — those rows continue to use the Stacks tip from the
// chainhook payload.
//
// Source of truth: V3_PLUS_CONTRACTS env var (set via `supabase secrets`).
// Empty/unset means no contracts use burn-block clock — webhook falls back
// to stacks-block indexing for all events. This is the safer default: if an
// operator forgets to add a new v3+ contract here, the worst case is that
// its rows have Stacks-block timestamps instead of burn-block ones (data
// is mixed but the frontend's `usesBurnBlockClock` registry still knows
// which way to interpret it). The previous "hardcoded fallback" pattern
// caused silent data drift when env state diverged from code state.
const V3_PLUS_CONTRACTS = new Set(
  (Deno.env.get("V3_PLUS_CONTRACTS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
function isV3Plus(contractId: string): boolean {
  return V3_PLUS_CONTRACTS.has(contractId);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ============================================================================
// Clarity repr parser (for decode_clarity_values: true payloads)
// ============================================================================

function parseClarityValue(str: string): unknown {
  str = str.trim();
  // uint — u12345
  if (/^u\d+$/.test(str)) return parseInt(str.slice(1), 10);
  // int — -123 or 123 (no u prefix)
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  // booleans
  if (str === "true") return true;
  if (str === "false") return false;
  // none
  if (str === "none") return null;
  // (some <value>)
  if (str.startsWith("(some ") && str.endsWith(")")) {
    return parseClarityValue(str.slice(6, -1));
  }
  // string-ascii — "hello"
  if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
  // string-utf8 — u"hello"
  if (str.startsWith('u"') && str.endsWith('"')) return str.slice(2, -1);
  // principal with leading apostrophe — 'ST1HK6...
  if (str.startsWith("'")) return str.slice(1);
  // principal without apostrophe (fallback)
  if (/^S[TPM][A-Z0-9]/.test(str)) return str;
  return str;
}

/**
 * Parse a Clarity tuple repr into a flat JS object.
 * Handles (tuple (k1 v1) (k2 v2) ...) format from decode_clarity_values.
 */
function parseTupleRepr(repr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let inner = repr.trim();

  // (tuple (k1 v1) (k2 v2) ...)
  if (inner.startsWith("(tuple ")) {
    inner = inner.slice(7, -1).trim();
  } else if (inner.startsWith("{") && inner.endsWith("}")) {
    // { k1: v1, k2: v2, ... } shorthand
    inner = inner.slice(1, -1).trim();
    const regex = /([a-z][\w-]*)\s*:\s*((?:[^,{}]+|\{[^}]*\})+)/g;
    let m;
    while ((m = regex.exec(inner)) !== null) {
      result[m[1]] = parseClarityValue(m[2].trim());
    }
    return result;
  } else {
    return result;
  }

  // Walk (key value) pairs handling one level of nested parens
  let depth = 0;
  let current = "";
  const pairs: string[] = [];

  for (const char of inner) {
    if (char === "(") {
      depth++;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (char === ")") {
      depth--;
      if (depth === 0) {
        pairs.push(current.trim());
        current = "";
        continue;
      }
    }
    if (depth > 0) current += char;
  }

  for (const pair of pairs) {
    const idx = pair.indexOf(" ");
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const val = pair.slice(idx + 1).trim();
    result[key] = parseClarityValue(val);
  }

  return result;
}

/** Extract event data from a Chainhook contract_log operation value. */
function extractEventData(
  value: unknown,
): Record<string, unknown> | null {
  // decode_clarity_values: true → { hex, repr, type }
  if (typeof value === "object" && value !== null && "repr" in value) {
    return parseTupleRepr((value as { repr: string }).repr);
  }
  // Raw hex string — not supported without decode_clarity_values
  if (typeof value === "string" && value.startsWith("0x")) {
    console.warn(
      "Received raw hex value. Enable decode_clarity_values on the chainhook.",
    );
    return null;
  }
  return null;
}

// ============================================================================
// Database helpers — all throw on failure so errors propagate to HTTP response
// ============================================================================

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 300;

async function withRetry<T>(
  label: string,
  fn: () => Promise<{ data: T; error: { message: string; code?: string } | null }>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await fn();
    if (!error) return data;

    // Duplicate key = idempotent success (event already processed)
    if (error.code === "23505") {
      console.log(`[${label}] Duplicate detected (idempotent skip)`);
      return data;
    }

    console.error(`[${label}] attempt ${attempt}/${MAX_RETRIES}:`, error.message);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    } else {
      throw new Error(`[${label}] failed after ${MAX_RETRIES} attempts: ${error.message}`);
    }
  }
  throw new Error(`[${label}] unreachable`);
}

async function insertEvent(
  contractId: string,
  escrowId: number | null,
  eventType: string,
  blockHeight: number,
  txId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await withRetry(`insertEvent(${eventType})`, () =>
    supabase.from("escrow_events").insert({
      contract_id: contractId,
      escrow_id: escrowId,
      event_type: eventType,
      block_height: blockHeight,
      tx_id: txId,
      data,
    }),
  );
}

async function upsertEscrow(
  contractId: string,
  escrowId: number,
  fields: Record<string, unknown>,
): Promise<void> {
  await withRetry(`upsertEscrow(${contractId}/${escrowId})`, () =>
    supabase.from("escrows").upsert(
      {
        contract_id: contractId,
        id: escrowId,
        ...fields,
      },
      { onConflict: "contract_id,id" },
    ),
  );
}

async function updateEscrow(
  contractId: string,
  escrowId: number,
  fields: Record<string, unknown>,
): Promise<void> {
  await withRetry(`updateEscrow(${contractId}/${escrowId})`, () =>
    supabase
      .from("escrows")
      .update(fields)
      .eq("contract_id", contractId)
      .eq("id", escrowId),
  );
}

async function updateConfig(
  fields: Record<string, unknown>,
): Promise<void> {
  await withRetry("updateConfig", () =>
    supabase.from("platform_config").update(fields).eq("id", 1),
  );
}

// ============================================================================
// On-chain read helpers
// ============================================================================

const STACKS_API_BASE = Deno.env.get("STACKS_NETWORK") === "mainnet"
  ? "https://api.mainnet.hiro.so"
  : "https://api.testnet.hiro.so";

/**
 * Fetch the description for an escrow by reading on-chain state.
 * Falls back to empty string if the call fails.
 */
async function fetchEscrowDescription(
  contractId: string,
  escrowId: number,
): Promise<string> {
  try {
    const [deployer, contractName] = contractId.split(".");
    // Encode escrow ID as Clarity uint: 0x01 + 16-byte big-endian
    const hex = escrowId.toString(16).padStart(32, "0");
    const clarityArg = `0x01${hex}`;

    // 5-second timeout to prevent hanging the webhook
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `${STACKS_API_BASE}/v2/contracts/call-read/${deployer}/${contractName}/get-escrow`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: deployer,
          arguments: [clarityArg],
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return "";
    const body = await res.json();
    if (!body.okay || !body.result) return "";

    // body.result is hex-encoded Clarity value (e.g. "0x0a0c000000...")
    const hexStr = (body.result as string).startsWith("0x")
      ? (body.result as string).slice(2)
      : (body.result as string);

    // Find "description" field in the serialized tuple.
    // Clarity tuple fields: 1-byte name length + name bytes + serialized value
    // "description" = 11 chars → 0x0b + hex("description") = 0b6465736372697074696f6e
    // Followed by string-utf8 type byte 0e + 4-byte big-endian length + UTF-8 bytes
    const descFieldMarker = "0b6465736372697074696f6e";
    const idx = hexStr.indexOf(descFieldMarker);
    if (idx === -1) return "";

    const valueStart = idx + descFieldMarker.length;
    const typeByte = hexStr.slice(valueStart, valueStart + 2);
    if (typeByte !== "0e") return ""; // not string-utf8

    const lenHex = hexStr.slice(valueStart + 2, valueStart + 10);
    const strLen = parseInt(lenHex, 16);
    if (strLen === 0 || strLen > 512) return "";

    const strHex = hexStr.slice(valueStart + 10, valueStart + 10 + strLen * 2);
    const bytes = new Uint8Array(strLen);
    for (let i = 0; i < strLen; i++) {
      bytes[i] = parseInt(strHex.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch (err) {
    console.warn(`[fetchDescription] Failed for escrow ${escrowId}:`, err);
    return "";
  }
}

/**
 * Resolve a Stacks tx's anchoring Bitcoin (burn) block height by querying
 * Hiro's tx API. Ground truth for v3+ contracts, which anchor all on-chain
 * timing to burn-block-height. Used as a fallback / authoritative source
 * when the chainhook payload's `block.metadata` doesn't expose the burn
 * height in any of the field paths we recognize.
 *
 * Tradeoffs:
 *   • Costs one extra API roundtrip per v3+ event (200-500ms typical).
 *     Acceptable since chainhook delivery is already async on Hiro's side.
 *   • Hiro tx API has had occasional outages; on failure we return null and
 *     the caller falls back to the chainhook-payload extraction (which
 *     historically returns 0 — the frontend then renders "Pending indexer…"
 *     gracefully, and an operator can backfill from Hiro once recovered).
 *   • Memoized per request via the caller's cache so multi-event txs don't
 *     re-fetch.
 */
async function fetchTxBurnBlock(txId: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${STACKS_API_BASE}/extended/v1/tx/${txId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const body = await res.json();
    const h = body?.burn_block_height;
    return typeof h === "number" && h > 0 ? h : null;
  } catch (err) {
    console.warn(`[fetchTxBurnBlock] ${txId}:`, err);
    return null;
  }
}

// ============================================================================
// Event routing
// ============================================================================

async function routeEvent(
  data: Record<string, unknown>,
  blockHeight: number,
  burnBlockHeight: number,
  txId: string,
  contractId: string,
): Promise<void> {
  const event = data.event as string;
  const escrowId = (data["escrow-id"] as number) ?? null;
  // For v3+ contracts use burn-block-height for the *_at_block columns so the
  // DB is consistent with the contract's on-chain clock. For v2/v7 we keep
  // using the Stacks tip from the chainhook payload.
  const effBlock = isV3Plus(contractId) ? burnBlockHeight : blockHeight;

  switch (event) {
    // ----- Escrow lifecycle events -----
    case "escrow-created": {
      // Fetch description best-effort — never let it block escrow indexing
      let description = "";
      try {
        description = await fetchEscrowDescription(contractId, escrowId!);
      } catch (descErr) {
        console.warn(`[escrow-created] Description fetch failed for #${escrowId}, proceeding without:`, descErr);
      }
      // v3+ event includes `beneficiary` (optional principal) and `fee-recipient`
      // (per-escrow snapshot). Earlier contract versions omit both fields, so
      // the spread-with-fallback shape keeps the upsert backwards-compatible
      // without forcing a column-presence check at every call site.
      const beneficiary =
        (data.beneficiary as string | null | undefined) ?? null;
      await upsertEscrow(contractId, escrowId!, {
        buyer: data.buyer,
        seller: data.seller,
        beneficiary,
        amount: data.amount,
        fee_amount: data.fee,
        token_type: (data["token-type"] as number) ?? 0,
        description,
        status: 0,
        created_at_block: effBlock,
        expires_at_block: data["expires-at"],
        tx_id: txId,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;
    }

    // v7+: seller signaled delivery on-chain
    case "escrow-delivered":
      await updateEscrow(contractId, escrowId!, {
        status: 4, // DELIVERED
        delivered_at_block: data["delivered-at"] ?? effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    case "escrow-released":
      await updateEscrow(contractId, escrowId!, {
        status: 1,
        completed_at_block: effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    case "escrow-refunded":
      await updateEscrow(contractId, escrowId!, {
        status: 2,
        completed_at_block: effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    case "escrow-disputed":
      await updateEscrow(contractId, escrowId!, {
        status: 3,
        disputed_at_block: data["disputed-at"] ?? effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    case "escrow-extended":
      await updateEscrow(contractId, escrowId!, {
        expires_at_block: data["new-expires-at"],
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    // ----- Dispute resolution -----
    case "dispute-resolved-for-buyer":
      await updateEscrow(contractId, escrowId!, {
        status: 2, // refunded
        completed_at_block: effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    case "dispute-resolved-for-seller":
      await updateEscrow(contractId, escrowId!, {
        status: 1, // released
        completed_at_block: effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    case "dispute-expired-resolved":
      await updateEscrow(contractId, escrowId!, {
        status: 2, // refunded
        completed_at_block: effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    // v3+: seller self-rescue after 2x dispute-timeout on a delivered escrow.
    // Treated as a final RELEASED state from the indexer's perspective.
    case "dispute-expired-resolved-for-seller":
      await updateEscrow(contractId, escrowId!, {
        status: 1, // released
        completed_at_block: effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    // v3+: admin sweep of orphan funds (donations that landed at the contract
    // principal). Doesn't touch an escrow — record as a config-scope event
    // for audit-trail purposes only.
    case "orphans-swept":
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    // v7+: admin/arbiter resolved a dispute with a partial split. Treated as a
    // final RELEASED state; the split breakdown lives in the event's data field
    // (buyer-bps, buyer-payout, seller-payout, platform-fee).
    case "dispute-resolved-split":
      await updateEscrow(contractId, escrowId!, {
        status: 1, // released (final)
        completed_at_block: effBlock,
      });
      await insertEvent(contractId, escrowId, event, effBlock, txId, data);
      break;

    // ----- Platform config events (no escrow_id) -----
    case "contract-paused":
      await updateConfig({ contract_paused: true });
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    case "contract-unpaused":
      await updateConfig({ contract_paused: false });
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    case "platform-fee-updated":
      await updateConfig({ fee_bps: data["fee-bps"] });
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    case "fee-recipient-updated":
      await updateConfig({ fee_recipient: data.recipient });
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    case "dispute-timeout-updated":
      await updateConfig({ dispute_timeout: data.timeout });
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    case "ownership-transfer-initiated":
      // No state change yet — just log it
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    case "ownership-transferred":
      await updateConfig({ contract_owner: data["new-owner"] });
      await insertEvent(contractId, null, event, blockHeight, txId, data);
      break;

    default:
      console.warn(`Unknown event type: ${event}`);
  }
}

// ============================================================================
// Rollback handling (chain reorgs)
// ============================================================================

interface BlockPayload {
  block_identifier: { index: number; hash: string };
  transactions: Array<{
    transaction_identifier: { hash: string };
    metadata: { status: string };
    operations: Array<{
      type: string;
      metadata: { contract_identifier?: string; value?: unknown };
    }>;
  }>;
}

async function handleRollback(block: BlockPayload): Promise<void> {
  const blockHeight = block.block_identifier.index;
  console.log(`Rolling back block ${blockHeight}`);

  // 1. Find escrows that had status changes at this block (not just created)
  //    — scope by contract_id too so v6 and v7 don't get mixed up
  const { data: affectedEscrows } = await supabase
    .from("escrow_events")
    .select("contract_id, escrow_id, event_type")
    .eq("block_height", blockHeight);

  // 2. Remove events indexed from this block
  const { error: evtErr } = await supabase
    .from("escrow_events")
    .delete()
    .eq("block_height", blockHeight);
  if (evtErr) throw new Error(`[rollback] event delete: ${evtErr.message}`);

  // 3. Remove escrows that were just created in this block (still pending)
  const { error: escErr } = await supabase
    .from("escrows")
    .delete()
    .eq("created_at_block", blockHeight)
    .eq("status", 0);
  if (escErr) throw new Error(`[rollback] escrow delete: ${escErr.message}`);

  // 4. Revert status of escrows that had state changes in this block
  for (const affected of affectedEscrows ?? []) {
    if (!affected.escrow_id) continue;
    if (!affected.contract_id) continue;
    if (affected.event_type === "escrow-created") continue; // Already deleted above

    // Find the most recent event before this block to restore previous state.
    // Scope by (contract_id, escrow_id) since IDs are reused across contracts.
    const { data: priorEvent } = await supabase
      .from("escrow_events")
      .select("event_type, block_height, data")
      .eq("contract_id", affected.contract_id)
      .eq("escrow_id", affected.escrow_id)
      .lt("block_height", blockHeight)
      .order("block_height", { ascending: false })
      .limit(1)
      .single();

    if (priorEvent) {
      const statusMap: Record<string, number> = {
        "escrow-created": 0,
        "escrow-delivered": 4,
        "escrow-disputed": 3,
        "escrow-released": 1,
        "escrow-refunded": 2,
        "dispute-resolved-for-buyer": 2,
        "dispute-resolved-for-seller": 1,
        "dispute-resolved-split": 1,
        "dispute-expired-resolved": 2,
        "dispute-expired-resolved-for-seller": 1, // v3+: seller self-rescue
      };
      const prevStatus = statusMap[priorEvent.event_type];
      if (prevStatus !== undefined) {
        await updateEscrow(affected.contract_id, affected.escrow_id, {
          status: prevStatus,
          completed_at_block: prevStatus >= 1 && prevStatus <= 2 ? priorEvent.block_height : null,
        });
        console.log(`[rollback] Reverted escrow ${affected.contract_id}/${affected.escrow_id} to status ${prevStatus}`);
      }
    }
  }
}

// ============================================================================
// HTTP handler
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Warm-ping endpoint — keeps the edge function out of cold-start.
  // Hit on a cron so the first real webhook after idle doesn't eat the
  // Deno boot tax (1–3s). Does no work, no auth required.
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "warm", ts: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Authenticate — verify shared auth token if configured
  const authToken = Deno.env.get("CHAINHOOK_AUTH_TOKEN");
  if (authToken) {
    const received =
      req.headers.get("authorization")?.replace("Bearer ", "") ??
      req.headers.get("x-webhook-token");
    if (received !== authToken) {
      console.error("[auth] Unauthorized webhook request");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const payload = await req.json();
    const errors: string[] = [];
    let processedCount = 0;

    // Per-request burn-block cache. A single payload often groups several
    // events under one tx (e.g. create + delivered + released sequentially),
    // so memoizing the tx → burn-block lookup is the difference between one
    // API call per payload and one per event.
    const burnBlockByTx = new Map<string, number>();

    // --- Apply blocks (new canonical data) ---
    for (const block of payload?.event?.apply ?? []) {
      const blockHeight = block.block_identifier.index;
      // Chainhook v2 puts the anchoring Bitcoin block height on the block
      // metadata. Different builds and predicate types use different field
      // names; cover the ones we've seen in the wild. v3+ contracts depend
      // on this — if all paths return 0 we log the metadata shape so we can
      // add the field path on the next deploy without guessing.
      const md = block.metadata ?? {};
      const burnBlockHeight =
        md.bitcoin_anchor_block_identifier?.index ??
        md.burn_block_identifier?.index ??
        md.burn_block?.index ??
        md.burn_block?.height ??
        md.burn_block_height ??
        (block as Record<string, unknown>).burn_block_height ??
        0;
      if (burnBlockHeight === 0) {
        console.warn(
          `[burn-block-extract] stacks block ${blockHeight} returned 0 — payload metadata keys: ` +
            JSON.stringify(Object.keys(md)) +
            ` | sample: ${JSON.stringify(md).slice(0, 400)}`,
        );
      }

      for (const tx of block.transactions ?? []) {
        if (tx.metadata?.status !== "success") continue;
        const txId = tx.transaction_identifier.hash;

        for (const op of tx.operations ?? []) {
          if (op.type !== "contract_log") continue;
          const contractId = op.metadata?.contract_identifier as string;
          if (!CONTRACT_IDS.has(contractId)) {
            // Loud-skip: log a structured warning so the indexer-monitor
            // alert pipeline catches configuration drift (e.g. a new
            // contract version registered with Hiro but missing from
            // ESCROW_CONTRACT_IDS). The Hiro POST still returns 200 so
            // the predicate doesn't go into a retry loop, but the
            // operator gets a Slack ping within minutes instead of
            // discovering it via a user report.
            console.error(
              `[skip] Event from non-allowlisted contract '${contractId}' at block ${blockHeight}, tx ${txId}. ` +
                `Update ESCROW_CONTRACT_IDS to include this contract or remove its Hiro predicate.`,
            );
            continue;
          }

          const data = extractEventData(op.metadata.value);
          if (!data?.event) {
            console.warn(
              `[skip] Malformed event at block ${blockHeight}, tx ${txId}:`,
              JSON.stringify(op.metadata.value).slice(0, 200),
            );
            continue;
          }

          // For v3+ contracts the contract anchors timing to burn blocks, so
          // we MUST land a real height. If the chainhook payload didn't
          // surface one (all 6 paths returned 0), authoritatively resolve it
          // via Hiro's tx API — cached per request so a multi-event tx pays
          // the lookup at most once.
          let effectiveBurnBlock = burnBlockHeight;
          if (effectiveBurnBlock === 0 && isV3Plus(op.metadata.contract_identifier)) {
            const cached = burnBlockByTx.get(txId);
            if (cached !== undefined) {
              effectiveBurnBlock = cached;
            } else {
              const resolved = await fetchTxBurnBlock(txId);
              if (resolved && resolved > 0) {
                effectiveBurnBlock = resolved;
                burnBlockByTx.set(txId, resolved);
              }
            }
          }

          try {
            await routeEvent(data, blockHeight, effectiveBurnBlock, txId, op.metadata.contract_identifier);
            processedCount++;
          } catch (err) {
            const msg = `Event ${data.event} at block ${blockHeight}: ${err}`;
            console.error(`[routeEvent] ${msg}`);
            errors.push(msg);
          }
        }
      }
    }

    // --- Rollback blocks (reorg) — best-effort, never block the 200 response ---
    for (const block of payload?.event?.rollback ?? []) {
      try {
        // Cap rollback processing at 4s to stay within edge function limits
        const result = await Promise.race([
          handleRollback(block),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("rollback timeout (4s)")), 4000)
          ),
        ]);
      } catch (err) {
        const msg = `Rollback block ${block?.block_identifier?.index}: ${err}`;
        console.error(`[rollback] ${msg}`);
        errors.push(msg);
      }
    }

    // ALWAYS return 200 to Hiro — returning 500 causes retries and
    // eventually marks the chainhook as "interrupted" (disabled).
    // Errors are logged and surfaced via the indexer-health endpoint.
    if (errors.length > 0) {
      console.error(`[webhook] ${errors.length} error(s), ${processedCount} event(s) succeeded`);
    }

    return new Response(
      JSON.stringify({
        ok: errors.length === 0,
        processed: processedCount,
        ...(errors.length > 0 ? { errors } : {}),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    // Even top-level errors return 200 to prevent chainhook interruption.
    // The error is logged and will surface via indexer-health checks.
    console.error("[webhook] Top-level error (returning 200 to protect chainhook):", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
