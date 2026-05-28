// supabase/functions/indexer-health/index.ts
// Health check: compares Hiro chainhook status with local indexed data
//
// GET /functions/v1/indexer-health
// Returns: { healthy, chainhook, database, lag }

import { createClient } from "jsr:@supabase/supabase-js@2";

const CHAINHOOK_UUID = Deno.env.get("CHAINHOOK_UUID") ?? "";
const HIRO_API_KEY = Deno.env.get("HIRO_API_KEY") ?? "";
const STACKS_NETWORK = Deno.env.get("STACKS_NETWORK") ?? "testnet";
const HIRO_BASE = `https://api.${STACKS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'}.hiro.so/chainhooks/v1/me`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Check Hiro chainhook status
    let chainhookStatus = null;
    if (HIRO_API_KEY) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${HIRO_BASE}/${CHAINHOOK_UUID}`, {
        headers: { "x-api-key": HIRO_API_KEY },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        chainhookStatus = {
          enabled: data.status?.enabled ?? false,
          status: data.status?.status ?? "unknown",
          last_evaluated_block: data.status?.last_evaluated_block_height,
          last_occurrence_block: data.status?.last_occurrence_block_height,
          occurrence_count: data.status?.occurrence_count ?? 0,
          evaluated_blocks: data.status?.evaluated_block_count ?? 0,
        };
      }
    }

    // 2. Check local database state
    const { data: latestEvent } = await supabase
      .from("escrow_events")
      .select("block_height, indexed_at")
      .order("block_height", { ascending: false })
      .limit(1)
      .single();

    const { count: escrowCount } = await supabase
      .from("escrows")
      .select("*", { count: "exact", head: true });

    const { count: eventCount } = await supabase
      .from("escrow_events")
      .select("*", { count: "exact", head: true });

    const dbStatus = {
      escrow_count: escrowCount ?? 0,
      event_count: eventCount ?? 0,
      latest_block: latestEvent?.block_height ?? null,
      latest_indexed_at: latestEvent?.indexed_at ?? null,
    };

    // 3. Calculate scanner lag (chain tip vs last block the predicate scanned).
    // This is the *real* health signal — does NOT depend on contract activity.
    // The earlier metric (hiro_block - db_block) grew forever on a quiet
    // contract and made the system look broken when it was fine.
    let chainTip: number | null = null;
    try {
      const tipController = new AbortController();
      const tipTimeout = setTimeout(() => tipController.abort(), 5000);
      const tipRes = await fetch(
        `https://api.${STACKS_NETWORK === "mainnet" ? "mainnet" : "testnet"}.hiro.so/v2/info`,
        { signal: tipController.signal },
      );
      clearTimeout(tipTimeout);
      if (tipRes.ok) {
        const tipData = await tipRes.json();
        chainTip = tipData.stacks_tip_height ?? null;
      }
    } catch {
      // Tip lookup is best-effort; without it we fall back to "trust chainhook status"
    }

    const lastEvaluated = chainhookStatus?.last_evaluated_block ?? null;
    const scannerLag =
      chainTip !== null && lastEvaluated !== null
        ? Math.max(0, chainTip - lastEvaluated)
        : null;

    // Historical "db_lag" — how far the DB is behind the predicate's last
    // scanned block. Informational only (grows forever on a quiet contract);
    // do NOT use for the healthy/unhealthy decision.
    const dbLag =
      lastEvaluated !== null && dbStatus.latest_block !== null
        ? Math.max(0, lastEvaluated - dbStatus.latest_block)
        : null;

    // Healthy iff predicate is enabled AND in a live state AND caught up to tip.
    const chainhookLive =
      (chainhookStatus?.enabled ?? false) &&
      (chainhookStatus?.status === "streaming" || chainhookStatus?.status === "scanning");
    const scannerCaughtUp = scannerLag === null || scannerLag < 10;
    const healthy = chainhookLive && scannerCaughtUp;

    return new Response(
      JSON.stringify({
        healthy,
        chainhook: chainhookStatus,
        database: dbStatus,
        // `lag.blocks` is the scanner lag — kept under the same key for
        // backwards compatibility with the existing IndexerHealthBanner.
        lag: {
          blocks: scannerLag,
          db_lag_blocks: dbLag,
          chain_tip: chainTip,
          note:
            scannerLag === null
              ? "Chain tip unknown"
              : scannerLag < 3
                ? "Healthy"
                : scannerLag < 10
                  ? "Slight delay"
                  : "Scanner falling behind — check predicate status",
        },
        checked_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ healthy: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
