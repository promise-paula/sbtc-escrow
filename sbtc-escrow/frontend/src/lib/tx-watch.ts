/**
 * Direct Stacks tx-status polling against Hiro's /extended/v1/tx endpoint.
 *
 * Purpose: shortens the "user signed → UI says confirmed" gap. Without this,
 * the UI waits for chainhook → Supabase → realtime invalidation, which adds
 * ~60-120s on top of block-mine time. Polling Hiro directly catches the
 * confirmation within ~10-30s of the block landing.
 *
 * Used as ONE LEG of a two-leg confirmation strategy. The other leg is the
 * existing Supabase realtime subscription in `use-escrow-realtime.ts`. The
 * UI reflects the faster of the two — if Hiro is rate-limited, realtime
 * still wins; if chainhook is lagging, polling still wins.
 *
 * All calls go through the Vercel Edge proxy when `STACKS_API_URL` points
 * there in production, so the server-side HIRO_API_KEY is applied
 * automatically.
 */

import { STACKS_API_URL } from './stacks-config';

/** Terminal states reported by Hiro for a confirmed (or rejected) tx. */
export type TxStatus =
  | 'pending'
  | 'success'
  | 'abort_by_response'
  | 'abort_by_post_condition'
  | 'dropped_replace_by_fee'
  | 'dropped_replace_across_fork'
  | 'dropped_too_expensive'
  | 'dropped_stale_garbage_collect'
  | 'dropped_problematic';

export type TxOutcome = 'confirmed' | 'failed' | 'dropped' | 'timeout' | 'aborted';

export interface PollTxOptions {
  /** Interval between poll attempts, in ms. Default 8s (matches sbtc-pay). */
  intervalMs?: number;
  /** Max attempts before giving up. Default 45 (= 6 minutes at 8s). */
  maxAttempts?: number;
  /** Abort signal for early cancellation (component unmount, user navigates). */
  signal?: AbortSignal;
}

interface PollTxResult {
  outcome: TxOutcome;
  status?: TxStatus;
  /** Raw result string from the contract, when available (success or failure). */
  result?: string;
}

/**
 * Normalize a tx id to Hiro's expected form (lowercase, `0x`-prefixed).
 * The wallet returns bare hex; Hiro requires the prefix.
 */
function normalizeTxId(txId: string): string {
  const lower = txId.toLowerCase();
  return lower.startsWith('0x') ? lower : `0x${lower}`;
}

/**
 * Determine which terminal bucket a Hiro tx_status belongs to. Hiro reports
 * multiple drop/abort variants we coalesce into 'failed' (contract rejected)
 * vs 'dropped' (mempool eviction, never made it on-chain).
 */
function bucketize(status: TxStatus): TxOutcome | null {
  if (status === 'pending') return null;
  if (status === 'success') return 'confirmed';
  if (status === 'abort_by_response' || status === 'abort_by_post_condition') return 'failed';
  if (status.startsWith('dropped_')) return 'dropped';
  return null;
}

/**
 * Poll Hiro until the tx reaches a terminal state, times out, or is aborted.
 *
 * Does NOT throw on individual fetch failures — single misses are retried
 * silently so a transient network hiccup doesn't kill the watcher. Only
 * AbortError propagates (caller asked to cancel).
 */
export async function pollTxStatus(
  txId: string,
  opts: PollTxOptions = {},
): Promise<PollTxResult> {
  const { intervalMs = 8000, maxAttempts = 45, signal } = opts;
  const id = normalizeTxId(txId);
  const url = `${STACKS_API_URL}/extended/v1/tx/${id}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) return { outcome: 'aborted' };

    try {
      const res = await fetch(url, { signal });
      if (res.ok) {
        const data = (await res.json()) as { tx_status?: TxStatus; tx_result?: { repr?: string } };
        const status = data.tx_status ?? 'pending';
        const bucket = bucketize(status);
        if (bucket) {
          return { outcome: bucket, status, result: data.tx_result?.repr };
        }
      }
      // 404 or other non-OK: tx hasn't propagated yet. Retry on next interval.
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return { outcome: 'aborted' };
      }
      // Network error — swallow and retry. Caller never sees transient failures.
    }

    // Wait before next attempt, honoring abort signal.
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, intervalMs);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    } catch {
      return { outcome: 'aborted' };
    }
  }

  return { outcome: 'timeout' };
}
