import { useSyncExternalStore, useEffect } from 'react';
import {
  getPendingAction,
  subscribePendingActions,
  reconcileActionWithIndexedStatus,
  type PendingAction,
} from '@/lib/pending-actions';

/**
 * Reactive read of the pending action overlay for a single escrow.
 *
 * Returns null when there's no in-flight action for this row, or a
 * {type, txId, submittedAt} object while the user is waiting for the
 * indexer to catch up after a Release / Refund / Dispute / etc.
 *
 * The store uses a snapshot cache so getPendingAction returns referentially
 * stable results across calls — critical for useSyncExternalStore, which
 * loops forever (React #185) if the snapshot identity changes every time.
 */
export function usePendingAction(
  contractId: string | undefined,
  escrowId: number,
): PendingAction | null {
  return useSyncExternalStore(
    subscribePendingActions,
    () => (contractId ? getPendingAction(contractId, escrowId) : null),
    () => null,
  );
}

/**
 * Drops the optimistic overlay for a row as soon as its indexed status
 * matches the action's expected outcome (e.g. Released after a `release`).
 * Call from any component that fetches the indexed escrow — typically
 * `EscrowDetail` right after the `useEscrow` query resolves.
 */
export function useReconcilePendingAction(
  contractId: string | undefined,
  escrowId: number,
  indexedStatus: number | undefined,
): void {
  useEffect(() => {
    if (!contractId || indexedStatus === undefined) return;
    reconcileActionWithIndexedStatus(contractId, escrowId, indexedStatus);
  }, [contractId, escrowId, indexedStatus]);
}
