// supabase/functions/indexer-health/checks.ts
//
// Chain-vs-database reconciliation for indexer-health. For each escrow
// contract, read its recent successful transactions and its on-chain escrow
// count from the Stacks API, then compare them with what the indexer stored.
//
// This catches every way indexing can silently stop (a disabled or deleted
// chainhook, a hook registered for the wrong contract, webhook write errors,
// a contract missing from ESCROW_CONTRACT_IDS) without depending on the
// Hiro Platform dashboard or on which chainhook UUID is configured.
//
// Pure helpers only (no Supabase client), so they can be exercised directly
// with `deno run`.

export interface ChainTx {
  tx_id: string;
  function_name: string;
  /** Unix seconds. */
  block_time: number;
}

export interface ContractChainState {
  contract_id: string;
  /** On-chain `get-escrow-count`; null if the call failed. */
  escrow_count: number | null;
  /** Successful calls to this contract inside the recent window, newest first. */
  recent_txs: ChainTx[];
  error: string | null;
}

export interface MissingTx {
  tx_id: string;
  function_name: string;
  age_minutes: number;
}

export interface ContractReport {
  contract_id: string;
  chain_escrow_count: number | null;
  db_escrow_count: number | null;
  recent_txs_checked: number;
  missing_txs: MissingTx[];
  latest_chain_tx_at: string | null;
  error: string | null;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Decode a Clarity `uint` from a call-read hex result (0x01 + 16 bytes). */
export function decodeUint(hex: string): number | null {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!h.startsWith("01") || h.length !== 34) return null;
  return Number(BigInt(`0x${h.slice(2)}`));
}

export async function readChainState(
  apiBase: string,
  contractId: string,
  headers: Record<string, string>,
  nowSec: number,
  recentWindowSec: number,
): Promise<ContractChainState> {
  const [address, name] = contractId.split(".");
  const state: ContractChainState = {
    contract_id: contractId,
    escrow_count: null,
    recent_txs: [],
    error: null,
  };

  try {
    const res = await fetchWithTimeout(
      `${apiBase}/extended/v2/addresses/${contractId}/transactions?limit=50`,
      { headers },
    );
    if (!res.ok) throw new Error(`transactions HTTP ${res.status}`);
    const body = await res.json();
    for (const item of body.results ?? []) {
      const tx = item.tx ?? {};
      const time = Number(tx.block_time ?? tx.burn_block_time ?? 0);
      if (
        tx.tx_type === "contract_call" &&
        tx.tx_status === "success" &&
        tx.contract_call?.contract_id === contractId &&
        time > 0 &&
        nowSec - time <= recentWindowSec
      ) {
        state.recent_txs.push({
          tx_id: tx.tx_id,
          function_name: tx.contract_call.function_name,
          block_time: time,
        });
      }
    }
    state.recent_txs.sort((a, b) => b.block_time - a.block_time);
  } catch (err) {
    state.error = `could not read recent transactions: ${String(err).slice(0, 120)}`;
  }

  try {
    const res = await fetchWithTimeout(
      `${apiBase}/v2/contracts/call-read/${address}/${name}/get-escrow-count`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sender: address, arguments: [] }),
      },
    );
    if (res.ok) {
      const body = await res.json();
      if (body.okay && typeof body.result === "string") {
        state.escrow_count = decodeUint(body.result);
      }
    }
  } catch {
    // Count is a secondary signal; the transaction check still runs.
  }

  return state;
}

const shortName = (contractId: string) => contractId.split(".")[1] ?? contractId;
const hhmm = (unixSec: number) => new Date(unixSec * 1000).toISOString().slice(11, 16);

/**
 * Compare one contract's chain state with what the indexer stored.
 * A transaction counts as missing only once it is older than `graceSec`,
 * so normal indexing delay (typically ~15s) never raises a reason.
 */
export function reconcile(
  state: ContractChainState,
  indexedTxIds: Set<string>,
  dbEscrowCount: number | null,
  nowSec: number,
  graceSec: number,
): { report: ContractReport; reasons: string[] } {
  const name = shortName(state.contract_id);
  const reasons: string[] = [];
  const graceMinutes = Math.round(graceSec / 60);

  const missing: MissingTx[] = state.recent_txs
    .filter((t) => nowSec - t.block_time >= graceSec && !indexedTxIds.has(t.tx_id))
    .map((t) => ({
      tx_id: t.tx_id,
      function_name: t.function_name,
      age_minutes: Math.floor((nowSec - t.block_time) / 60),
    }));

  if (missing.length > 0) {
    const newest = state.recent_txs.find((t) => t.tx_id === missing[0].tx_id)!;
    reasons.push(
      `${name}: ${missing.length} on-chain transaction${missing.length > 1 ? "s" : ""} not indexed after ${graceMinutes} min ` +
        `(latest ${missing[0].function_name} ${missing[0].tx_id.slice(0, 10)}… at ${hhmm(newest.block_time)} UTC)`,
    );
  }

  const chainCount = state.escrow_count;
  if (chainCount !== null && dbEscrowCount !== null && chainCount !== dbEscrowCount) {
    if (chainCount > dbEscrowCount) {
      // A create inside the grace window may simply not be indexed yet.
      const newestCreate = state.recent_txs.find((t) => t.function_name === "create-escrow");
      const settled = !newestCreate || nowSec - newestCreate.block_time >= graceSec;
      if (settled) {
        const gap = chainCount - dbEscrowCount;
        reasons.push(
          `${name}: ${gap} escrow${gap > 1 ? "s" : ""} on-chain missing from the database (${chainCount} on-chain, ${dbEscrowCount} indexed)`,
        );
      }
    } else {
      reasons.push(
        `${name}: database has more escrows than the chain (${dbEscrowCount} indexed, ${chainCount} on-chain)`,
      );
    }
  }

  // A failed read (e.g. a Hiro API blip) is reported in `error` but is not a
  // reason: it says we couldn't check, not that indexing is broken.

  return {
    report: {
      contract_id: state.contract_id,
      chain_escrow_count: chainCount,
      db_escrow_count: dbEscrowCount,
      recent_txs_checked: state.recent_txs.length,
      missing_txs: missing,
      latest_chain_tx_at: state.recent_txs[0]
        ? new Date(state.recent_txs[0].block_time * 1000).toISOString()
        : null,
      error: state.error,
    },
    reasons,
  };
}
