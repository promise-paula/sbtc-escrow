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

    // 3. Calculate lag
    const hiroBlock = chainhookStatus?.last_evaluated_block ?? null;
    const localBlock = dbStatus.latest_block;
    const blockLag =
      hiroBlock && localBlock ? hiroBlock - localBlock : null;

    const healthy =
      (chainhookStatus?.enabled ?? false) &&
      (blockLag === null || blockLag < 100);

    return new Response(
      JSON.stringify({
        healthy,
        chainhook: chainhookStatus,
        database: dbStatus,
        lag: {
          blocks: blockLag,
          note:
            blockLag === null
              ? "No events indexed yet"
              : blockLag < 10
                ? "Healthy"
                : blockLag < 100
                  ? "Slight delay"
                  : "Significant lag — check Edge Function logs",
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
