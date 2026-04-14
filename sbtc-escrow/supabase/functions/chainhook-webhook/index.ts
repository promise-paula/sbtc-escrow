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
    "ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v5"
  ).split(",").map((s) => s.trim()),
);

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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

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
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    } else {
      throw new Error(`[${label}] failed after ${MAX_RETRIES} attempts: ${error.message}`);
    }
  }
  throw new Error(`[${label}] unreachable`);
}

async function insertEvent(
  escrowId: number | null,
  eventType: string,
  blockHeight: number,
  txId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await withRetry(`insertEvent(${eventType})`, () =>
    supabase.from("escrow_events").insert({
      escrow_id: escrowId,
      event_type: eventType,
      block_height: blockHeight,
      tx_id: txId,
      data,
    }),
  );
}

async function upsertEscrow(
  escrowId: number,
  fields: Record<string, unknown>,
): Promise<void> {
  await withRetry(`upsertEscrow(${escrowId})`, () =>
    supabase.from("escrows").upsert({
      id: escrowId,
      ...fields,
    }),
  );
}

async function updateEscrow(
  escrowId: number,
  fields: Record<string, unknown>,
): Promise<void> {
  await withRetry(`updateEscrow(${escrowId})`, () =>
    supabase.from("escrows").update(fields).eq("id", escrowId),
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
// Event routing
// ============================================================================

async function routeEvent(
  data: Record<string, unknown>,
  blockHeight: number,
  txId: string,
): Promise<void> {
  const event = data.event as string;
  const escrowId = (data["escrow-id"] as number) ?? null;

  switch (event) {
    // ----- Escrow lifecycle events -----
    case "escrow-created":
      await upsertEscrow(escrowId!, {
        buyer: data.buyer,
        seller: data.seller,
        amount: data.amount,
        fee_amount: data.fee,
        token_type: (data["token-type"] as number) ?? 0,
        description: "", // not in print event
        status: 0,
        created_at_block: blockHeight,
        expires_at_block: data["expires-at"],
        tx_id: txId,
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    case "escrow-released":
      await updateEscrow(escrowId!, {
        status: 1,
        completed_at_block: blockHeight,
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    case "escrow-refunded":
      await updateEscrow(escrowId!, {
        status: 2,
        completed_at_block: blockHeight,
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    case "escrow-disputed":
      await updateEscrow(escrowId!, {
        status: 3,
        disputed_at_block: data["disputed-at"] ?? blockHeight,
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    case "escrow-extended":
      await updateEscrow(escrowId!, {
        expires_at_block: data["new-expires-at"],
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    // ----- Dispute resolution -----
    case "dispute-resolved-for-buyer":
      await updateEscrow(escrowId!, {
        status: 2, // refunded
        completed_at_block: blockHeight,
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    case "dispute-resolved-for-seller":
      await updateEscrow(escrowId!, {
        status: 1, // released
        completed_at_block: blockHeight,
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    case "dispute-expired-resolved":
      await updateEscrow(escrowId!, {
        status: 2, // refunded
        completed_at_block: blockHeight,
      });
      await insertEvent(escrowId, event, blockHeight, txId, data);
      break;

    // ----- Platform config events (no escrow_id) -----
    case "contract-paused":
      await updateConfig({ contract_paused: true });
      await insertEvent(null, event, blockHeight, txId, data);
      break;

    case "contract-unpaused":
      await updateConfig({ contract_paused: false });
      await insertEvent(null, event, blockHeight, txId, data);
      break;

    case "platform-fee-updated":
      await updateConfig({ fee_bps: data["fee-bps"] });
      await insertEvent(null, event, blockHeight, txId, data);
      break;

    case "fee-recipient-updated":
      await updateConfig({ fee_recipient: data.recipient });
      await insertEvent(null, event, blockHeight, txId, data);
      break;

    case "dispute-timeout-updated":
      await updateConfig({ dispute_timeout: data.timeout });
      await insertEvent(null, event, blockHeight, txId, data);
      break;

    case "ownership-transfer-initiated":
      // No state change yet — just log it
      await insertEvent(null, event, blockHeight, txId, data);
      break;

    case "ownership-transferred":
      await updateConfig({ contract_owner: data["new-owner"] });
      await insertEvent(null, event, blockHeight, txId, data);
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
  const { data: affectedEscrows } = await supabase
    .from("escrow_events")
    .select("escrow_id, event_type")
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
    if (affected.event_type === "escrow-created") continue; // Already deleted above

    // Find the most recent event before this block to restore previous state
    const { data: priorEvent } = await supabase
      .from("escrow_events")
      .select("event_type, block_height, data")
      .eq("escrow_id", affected.escrow_id)
      .lt("block_height", blockHeight)
      .order("block_height", { ascending: false })
      .limit(1)
      .single();

    if (priorEvent) {
      const statusMap: Record<string, number> = {
        "escrow-created": 0,
        "escrow-disputed": 3,
        "escrow-released": 1,
        "escrow-refunded": 2,
        "dispute-resolved-for-buyer": 2,
        "dispute-resolved-for-seller": 1,
        "dispute-expired-resolved": 2,
      };
      const prevStatus = statusMap[priorEvent.event_type];
      if (prevStatus !== undefined) {
        await updateEscrow(affected.escrow_id, {
          status: prevStatus,
          completed_at_block: prevStatus >= 1 && prevStatus <= 2 ? priorEvent.block_height : null,
        });
        console.log(`[rollback] Reverted escrow ${affected.escrow_id} to status ${prevStatus}`);
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

    // --- Apply blocks (new canonical data) ---
    for (const block of payload?.event?.apply ?? []) {
      const blockHeight = block.block_identifier.index;

      for (const tx of block.transactions ?? []) {
        if (tx.metadata?.status !== "success") continue;
        const txId = tx.transaction_identifier.hash;

        for (const op of tx.operations ?? []) {
          if (op.type !== "contract_log") continue;
          if (!CONTRACT_IDS.has(op.metadata?.contract_identifier as string)) continue;

          const data = extractEventData(op.metadata.value);
          if (!data?.event) {
            console.warn(
              `[skip] Malformed event at block ${blockHeight}, tx ${txId}:`,
              JSON.stringify(op.metadata.value).slice(0, 200),
            );
            continue;
          }

          try {
            await routeEvent(data, blockHeight, txId);
            processedCount++;
          } catch (err) {
            const msg = `Event ${data.event} at block ${blockHeight}: ${err}`;
            console.error(`[routeEvent] ${msg}`);
            errors.push(msg);
          }
        }
      }
    }

    // --- Rollback blocks (reorg) ---
    for (const block of payload?.event?.rollback ?? []) {
      try {
        await handleRollback(block);
      } catch (err) {
        const msg = `Rollback block ${block?.block_identifier?.index}: ${err}`;
        console.error(`[rollback] ${msg}`);
        errors.push(msg);
      }
    }

    // Return 500 if any operations failed — Chainhook will retry
    if (errors.length > 0) {
      console.error(`[webhook] ${errors.length} error(s), ${processedCount} event(s) succeeded`);
      return new Response(
        JSON.stringify({ ok: false, errors, processed: processedCount }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, processed: processedCount }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
