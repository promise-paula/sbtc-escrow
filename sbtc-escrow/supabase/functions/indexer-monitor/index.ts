// supabase/functions/indexer-monitor/index.ts
//
// Scheduled health check + alert router. pg_cron triggers this every ~5 min.
// It internally calls /indexer-health, classifies the result as healthy or
// unhealthy, and posts to ALERT_WEBHOOK_URL (Slack / Discord / generic) only
// on state TRANSITIONS — not every check. Avoids alert spam while still
// catching real incidents within minutes.
//
// Re-alert policy: if a degraded state persists past REPEAT_AFTER_MS we
// alert again as a reminder, so an unresolved issue doesn't fall off radar.
//
// Required env:
//   SUPABASE_URL                 (auto)
//   SUPABASE_SERVICE_ROLE_KEY    (auto)
//   ALERT_WEBHOOK_URL            Slack/Discord/etc. POST endpoint
// Optional env:
//   ALERT_LAG_THRESHOLD          int blocks; default 25 (lag at which we alert)
//   ALERT_REPEAT_HOURS           hours; default 4 (re-alert cadence while broken)
//   STACKS_NETWORK               for the alert label; default 'mainnet'

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALERT_WEBHOOK_URL = Deno.env.get("ALERT_WEBHOOK_URL") ?? "";
const LAG_THRESHOLD = parseInt(Deno.env.get("ALERT_LAG_THRESHOLD") ?? "25", 10);
const REPEAT_HOURS = parseInt(Deno.env.get("ALERT_REPEAT_HOURS") ?? "4", 10);
const NETWORK_LABEL = Deno.env.get("STACKS_NETWORK") ?? "mainnet";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type HealthState = "healthy" | "unhealthy" | "unknown";

interface HealthSnapshot {
  state: HealthState;
  reason: string;
  lag_blocks: number | null;
  chainhook_status: string | null;
  raw_healthy: boolean;
}

async function fetchHealth(): Promise<HealthSnapshot> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/indexer-health`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (!res.ok) {
      return {
        state: "unhealthy",
        reason: `indexer-health returned ${res.status}`,
        lag_blocks: null,
        chainhook_status: null,
        raw_healthy: false,
      };
    }
    const data = await res.json();
    const lag = data?.lag?.blocks ?? null;
    const chainhook = data?.chainhook?.status ?? null;
    const enabled = data?.chainhook?.enabled ?? false;

    // Classification: healthy iff chainhook enabled AND streaming AND lag tolerable.
    // "unknown" only when there are no events indexed yet (fresh deploys).
    if (lag === null && chainhook === null) {
      return {
        state: "unknown",
        reason: "no chainhook + no events indexed yet",
        lag_blocks: null,
        chainhook_status: null,
        raw_healthy: false,
      };
    }

    const lagOk = lag === null || lag < LAG_THRESHOLD;
    const chainhookOk = enabled && (chainhook === "streaming" || chainhook === "scanning");
    const ok = lagOk && chainhookOk;

    return {
      state: ok ? "healthy" : "unhealthy",
      reason: !chainhookOk
        ? `chainhook ${chainhook ?? "missing"} (enabled=${enabled})`
        : !lagOk
          ? `lag ${lag} blocks (threshold ${LAG_THRESHOLD})`
          : "ok",
      lag_blocks: lag,
      chainhook_status: chainhook,
      raw_healthy: !!data?.healthy,
    };
  } catch (err) {
    return {
      state: "unhealthy",
      reason: `indexer-health unreachable: ${String(err).slice(0, 200)}`,
      lag_blocks: null,
      chainhook_status: null,
      raw_healthy: false,
    };
  }
}

function buildAlertPayload(args: {
  kind: "regression" | "recovery" | "reminder";
  snapshot: HealthSnapshot;
  prevState: HealthState;
  consecutiveFailures: number;
}): Record<string, unknown> {
  const { kind, snapshot, prevState, consecutiveFailures } = args;
  const emoji =
    kind === "recovery" ? "✅" : kind === "reminder" ? "⚠️" : "🚨";
  const title =
    kind === "recovery"
      ? `${emoji} sBTC Escrow indexer RECOVERED (${NETWORK_LABEL})`
      : kind === "reminder"
        ? `${emoji} sBTC Escrow indexer still DEGRADED (${NETWORK_LABEL})`
        : `${emoji} sBTC Escrow indexer DEGRADED (${NETWORK_LABEL})`;

  const lines = [
    `*Reason:* ${snapshot.reason}`,
    `*State:* ${prevState} → ${snapshot.state}`,
    snapshot.lag_blocks !== null ? `*Lag:* ${snapshot.lag_blocks} blocks` : null,
    snapshot.chainhook_status
      ? `*Chainhook status:* ${snapshot.chainhook_status}`
      : null,
    consecutiveFailures > 1
      ? `*Consecutive failed checks:* ${consecutiveFailures}`
      : null,
    `*Time:* ${new Date().toISOString()}`,
  ].filter(Boolean);

  // Slack / Discord (with /slack suffix) compatible format
  return {
    text: `${title}\n${lines.join("\n")}`,
  };
}

async function sendAlert(payload: Record<string, unknown>): Promise<boolean> {
  if (!ALERT_WEBHOOK_URL) {
    console.log("[monitor] ALERT_WEBHOOK_URL not set; would have sent:", JSON.stringify(payload));
    return false;
  }
  try {
    const res = await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[monitor] webhook returned ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[monitor] webhook POST failed:", err);
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const snapshot = await fetchHealth();

  // Load prior state
  const { data: prior } = await supabase
    .from("indexer_monitor_state")
    .select("*")
    .eq("id", 1)
    .single();

  const prevState: HealthState = (prior?.last_state as HealthState) ?? "unknown";
  const lastAlertedAt = prior?.last_alerted_at
    ? new Date(prior.last_alerted_at).getTime()
    : 0;
  const repeatAfterMs = REPEAT_HOURS * 60 * 60 * 1000;

  // Decide whether to alert
  let alertKind: "regression" | "recovery" | "reminder" | null = null;
  if (snapshot.state === "unhealthy" && prevState !== "unhealthy") {
    alertKind = "regression";
  } else if (snapshot.state === "healthy" && prevState === "unhealthy") {
    alertKind = "recovery";
  } else if (
    snapshot.state === "unhealthy" &&
    prevState === "unhealthy" &&
    Date.now() - lastAlertedAt > repeatAfterMs
  ) {
    alertKind = "reminder";
  }

  let alertSent = false;
  if (alertKind) {
    const newConsecutive =
      snapshot.state === "unhealthy" ? (prior?.consecutive_failures ?? 0) + 1 : 0;
    alertSent = await sendAlert(
      buildAlertPayload({
        kind: alertKind,
        snapshot,
        prevState,
        consecutiveFailures: newConsecutive,
      }),
    );
  }

  // Persist new state
  await supabase.from("indexer_monitor_state").upsert({
    id: 1,
    last_state: snapshot.state,
    last_state_at:
      snapshot.state !== prevState
        ? new Date().toISOString()
        : prior?.last_state_at ?? new Date().toISOString(),
    last_check_at: new Date().toISOString(),
    last_alerted_at: alertSent
      ? new Date().toISOString()
      : prior?.last_alerted_at ?? null,
    last_lag_blocks: snapshot.lag_blocks,
    last_chainhook_status: snapshot.chainhook_status,
    consecutive_failures:
      snapshot.state === "unhealthy" ? (prior?.consecutive_failures ?? 0) + 1 : 0,
  });

  return new Response(
    JSON.stringify({
      state: snapshot.state,
      reason: snapshot.reason,
      prev_state: prevState,
      alert_kind: alertKind,
      alert_sent: alertSent,
      lag_blocks: snapshot.lag_blocks,
      chainhook_status: snapshot.chainhook_status,
      checked_at: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
