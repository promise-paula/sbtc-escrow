// supabase/functions/indexer-health/index.ts
// Health check for the on-chain -> Supabase indexer.
//
// GET /functions/v1/indexer-health
// Returns: { healthy, reasons, contracts, chainhooks, chainhook, database, lag, checked_at }
//
// Two independent signals:
//
//   1. Reconciliation (primary). For every contract in ESCROW_CONTRACT_IDS,
//      compare the chain with the database: every successful contract call
//      from the last HEALTH_RECENT_DAYS days must have reached escrow_events
//      within HEALTH_GRACE_MINUTES, and the on-chain escrow count must match
//      the indexed one. This catches a disabled or deleted chainhook, a hook
//      watching the wrong contract, webhook write errors and missing secrets,
//      and does not depend on which chainhook UUID is configured.
//
//   2. Chainhook status (secondary). For each UUID in CHAINHOOK_UUIDS (or the
//      legacy CHAINHOOK_UUID), ask the Hiro Chainhooks API whether the hook is
//      enabled and streaming, and how far its scanner trails the chain tip.
//      This gives early warning even when no escrow activity has happened.
//
// `healthy` is false if any reason is raised or the scanner lag is >= 10
// blocks. `chainhook` and `lag` keep their previous shape for the app banner
// and indexer-monitor. Results are cached for 60s per instance so polling
// clients don't multiply Hiro API calls.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  type ContractReport,
  fetchWithTimeout,
  readChainState,
  reconcile,
} from "./checks.ts";

const STACKS_NETWORK = Deno.env.get("STACKS_NETWORK") ?? "testnet";
const HIRO_API_KEY = Deno.env.get("HIRO_API_KEY") ?? "";
const STACKS_API = `https://api.${STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet"}.hiro.so`;
const CHAINHOOKS_API = `${STACKS_API}/chainhooks/v1/me`;

const splitList = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const CHAINHOOK_UUIDS = splitList(
  Deno.env.get("CHAINHOOK_UUIDS") || Deno.env.get("CHAINHOOK_UUID"),
);
const CONTRACT_IDS = splitList(Deno.env.get("ESCROW_CONTRACT_IDS"));
const GRACE_SEC = parseInt(Deno.env.get("HEALTH_GRACE_MINUTES") ?? "10", 10) * 60;
const RECENT_SEC = parseInt(Deno.env.get("HEALTH_RECENT_DAYS") ?? "7", 10) * 86_400;
const SCANNER_LAG_LIMIT = 10;
const CACHE_MS = 60_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const apiHeaders: Record<string, string> = HIRO_API_KEY ? { "x-api-key": HIRO_API_KEY } : {};

interface HookStatus {
  uuid: string;
  name: string | null;
  enabled: boolean;
  status: string;
  last_evaluated_block: number | null;
  last_occurrence_block: number | null;
  occurrence_count: number;
  evaluated_blocks: number;
  lag_blocks: number | null;
  error: string | null;
}

async function readHook(uuid: string, chainTip: number | null): Promise<HookStatus> {
  const base: HookStatus = {
    uuid,
    name: null,
    enabled: false,
    status: "unknown",
    last_evaluated_block: null,
    last_occurrence_block: null,
    occurrence_count: 0,
    evaluated_blocks: 0,
    lag_blocks: null,
    error: null,
  };
  try {
    const res = await fetchWithTimeout(`${CHAINHOOKS_API}/${uuid}`, { headers: apiHeaders });
    if (!res.ok) return { ...base, status: "missing", error: `HTTP ${res.status}` };
    const data = await res.json();
    const lastEvaluated = data.status?.last_evaluated_block_height ?? null;
    return {
      ...base,
      name: data.definition?.name ?? data.name ?? null,
      enabled: data.status?.enabled ?? false,
      status: data.status?.status ?? "unknown",
      last_evaluated_block: lastEvaluated,
      last_occurrence_block: data.status?.last_occurrence_block_height ?? null,
      occurrence_count: data.status?.occurrence_count ?? 0,
      evaluated_blocks: data.status?.evaluated_block_count ?? 0,
      lag_blocks:
        chainTip !== null && lastEvaluated !== null ? Math.max(0, chainTip - lastEvaluated) : null,
    };
  } catch (err) {
    return { ...base, status: "unreachable", error: String(err).slice(0, 120) };
  }
}

async function readChainTip(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(`${STACKS_API}/v2/info`, { headers: apiHeaders });
    if (!res.ok) return null;
    return (await res.json()).stacks_tip_height ?? null;
  } catch {
    return null;
  }
}

async function computeHealth() {
  const nowSec = Math.floor(Date.now() / 1000);
  const reasons: string[] = [];

  if (CONTRACT_IDS.length === 0) {
    reasons.push("ESCROW_CONTRACT_IDS is not set, so the webhook is not indexing the intended contracts");
  }

  // 1. Chain side, in parallel: tip, each hook, each contract.
  const chainTip = await readChainTip();
  const [hooks, chainStates] = await Promise.all([
    HIRO_API_KEY ? Promise.all(CHAINHOOK_UUIDS.map((u) => readHook(u, chainTip))) : Promise.resolve([]),
    Promise.all(CONTRACT_IDS.map((id) => readChainState(STACKS_API, id, apiHeaders, nowSec, RECENT_SEC))),
  ]);

  for (const h of hooks) {
    const label = h.name ? `chainhook ${h.name}` : `chainhook ${h.uuid.slice(0, 8)}`;
    if (h.status === "missing") reasons.push(`${label} not found (${h.error}); it may have been deleted`);
    else if (h.status === "unreachable") continue; // can't check right now; not evidence of failure
    else if (!h.enabled) reasons.push(`${label} is disabled`);
    else if (h.status !== "streaming" && h.status !== "scanning") reasons.push(`${label} is ${h.status}`);
  }

  // 2. Database side, per contract, then reconcile.
  const contracts: ContractReport[] = [];
  for (const state of chainStates) {
    const ids = state.recent_txs.map((t) => t.tx_id);
    let indexed = new Set<string>();
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from("escrow_events")
        .select("tx_id")
        .eq("contract_id", state.contract_id)
        .in("tx_id", ids);
      if (error) throw new Error(`escrow_events lookup failed: ${error.message}`);
      indexed = new Set((data ?? []).map((r: { tx_id: string }) => r.tx_id));
    }
    const { count, error: countErr } = await supabase
      .from("escrows")
      .select("*", { count: "exact", head: true })
      .eq("contract_id", state.contract_id);
    if (countErr) throw new Error(`escrows count failed: ${countErr.message}`);

    const result = reconcile(state, indexed, count ?? 0, nowSec, GRACE_SEC);
    contracts.push(result.report);
    reasons.push(...result.reasons);
  }

  // 3. Database totals (informational). Latest is by indexed_at: v2 events
  // store Stacks block heights and v3+ store Bitcoin block heights, so
  // ordering by block_height across contracts is meaningless.
  const [{ data: latestEvent }, { count: escrowCount }, { count: eventCount }] = await Promise.all([
    supabase.from("escrow_events").select("block_height, indexed_at, contract_id")
      .order("indexed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("escrows").select("*", { count: "exact", head: true }),
    supabase.from("escrow_events").select("*", { count: "exact", head: true }),
  ]);

  const lags = hooks.map((h) => h.lag_blocks).filter((l): l is number => l !== null);
  const scannerLag = lags.length > 0 ? Math.max(...lags) : null;
  const scannerCaughtUp = scannerLag === null || scannerLag < SCANNER_LAG_LIMIT;

  const primary = hooks[0] ?? null;
  return {
    healthy: reasons.length === 0 && scannerCaughtUp,
    reasons,
    contracts,
    chainhooks: hooks,
    // Previous single-hook shape, kept for the app banner and indexer-monitor.
    chainhook: primary
      ? {
          enabled: primary.enabled,
          status: primary.status,
          last_evaluated_block: primary.last_evaluated_block,
          last_occurrence_block: primary.last_occurrence_block,
          occurrence_count: primary.occurrence_count,
          evaluated_blocks: primary.evaluated_blocks,
        }
      : null,
    database: {
      escrow_count: escrowCount ?? 0,
      event_count: eventCount ?? 0,
      latest_block: latestEvent?.block_height ?? null,
      latest_indexed_at: latestEvent?.indexed_at ?? null,
      latest_contract_id: latestEvent?.contract_id ?? null,
    },
    lag: {
      blocks: scannerLag,
      chain_tip: chainTip,
      note:
        reasons.length > 0
          ? "Indexing problem detected"
          : scannerLag === null
            ? "Chainhook lag unknown"
            : scannerLag < 3
              ? "Healthy"
              : scannerLag < SCANNER_LAG_LIMIT
                ? "Slight delay"
                : "Scanner falling behind — check chainhook status",
    },
    settings: {
      grace_minutes: GRACE_SEC / 60,
      recent_days: RECENT_SEC / 86_400,
      contracts_checked: CONTRACT_IDS.length,
      chainhooks_checked: hooks.length,
    },
    checked_at: new Date().toISOString(),
  };
}

let cache: { at: number; body: string } | null = null;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      cache = { at: Date.now(), body: JSON.stringify(await computeHealth()) };
    }
    return new Response(cache.body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ healthy: false, reasons: [`health check failed: ${String(err).slice(0, 200)}`] }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
