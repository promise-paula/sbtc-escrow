/**
 * Global tx-watcher: polls Hiro directly for any pending tx in localStorage
 * and invalidates the relevant React Query caches the moment Hiro reports
 * confirmation. Cuts the "user signed → UI says confirmed" latency from
 * ~90-120s (waiting for chainhook → Supabase → realtime) down to ~15-30s.
 *
 * Works alongside the existing `useEscrowRealtime` subscription. Both paths
 * race; whichever lands first triggers the cache invalidation. If Hiro is
 * unreachable the realtime path still wins; if realtime isn't published the
 * polling path still wins. Defense in depth.
 *
 * Mount once at the app root (AppLayout) so polling persists across route
 * changes — a user who creates an escrow and immediately navigates to
 * Dashboard still gets the confirmed state without manual refresh.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/contexts/WalletContext';
import {
  getPending,
  subscribePending,
  removePending,
  type PendingEscrow,
} from '@/lib/pending-escrows';
import {
  getAllPendingActions,
  subscribePendingActions,
  clearPendingAction,
  type PendingAction,
} from '@/lib/pending-actions';
import { pollTxStatus } from '@/lib/tx-watch';

const EMPTY_PENDING_ESCROWS: PendingEscrow[] = [];
const EMPTY_PENDING_ACTIONS: PendingAction[] = [];

/**
 * Reactive subscription to the current wallet's pending-escrow placeholders.
 */
function usePendingEscrowsForCurrentWallet(): PendingEscrow[] {
  const { address } = useWallet();
  return useSyncExternalStore(
    subscribePending,
    () => (address ? getPending(address) : EMPTY_PENDING_ESCROWS),
    () => EMPTY_PENDING_ESCROWS,
  );
}

/**
 * Reactive subscription to all pending action overlays (release/refund/etc).
 */
function usePendingActions(): PendingAction[] {
  return useSyncExternalStore(
    subscribePendingActions,
    getAllPendingActions,
    () => EMPTY_PENDING_ACTIONS,
  );
}

/**
 * Mount once. Watches every pending tx (create + action) in localStorage
 * via Hiro polling. On confirmation or failure, clears the optimistic
 * overlay and invalidates the corresponding React Query caches so the UI
 * reflects the final state immediately.
 */
export function useTxWatcher(): void {
  const queryClient = useQueryClient();
  const { address } = useWallet();
  const pendingEscrows = usePendingEscrowsForCurrentWallet();
  const pendingActions = usePendingActions();

  // Track which txIds we're already watching so we don't start duplicate
  // polling loops on re-renders. Keyed by lowercased txId.
  const watchedRef = useRef<Map<string, AbortController>>(new Map());

  // Watch pending-escrow placeholders (the create flow)
  useEffect(() => {
    if (!address) return;
    const currentWatched = watchedRef.current;

    for (const entry of pendingEscrows) {
      const key = entry.txId.toLowerCase();
      if (currentWatched.has(key)) continue;

      const controller = new AbortController();
      currentWatched.set(key, controller);

      pollTxStatus(entry.txId, { signal: controller.signal }).then((result) => {
        currentWatched.delete(key);
        if (result.outcome === 'aborted') return;

        // Any terminal state (confirmed / failed / dropped / timeout) drops
        // the optimistic placeholder so the UI doesn't show "Submitting"
        // forever. Confirmation triggers immediate query invalidation so the
        // real indexed row appears without waiting for the next refetch tick.
        removePending(address, entry.txId);

        if (result.outcome === 'confirmed') {
          queryClient.invalidateQueries({ queryKey: ['escrows'] });
          queryClient.invalidateQueries({ queryKey: ['escrow'] });
          queryClient.invalidateQueries({ queryKey: ['user-stats'] });
          queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
        }
      });
    }

    // Abort any watchers whose tx is no longer in the pending list (already
    // reconciled by the indexer path).
    const liveKeys = new Set(pendingEscrows.map((e) => e.txId.toLowerCase()));
    for (const [key, ctrl] of currentWatched) {
      if (!liveKeys.has(key)) {
        // Only abort entries that came from THIS effect. Action watchers
        // live in a different keyspace — namespace them to avoid collisions
        // by prefixing below.
      }
    }
  }, [pendingEscrows, address, queryClient]);

  // Watch pending action overlays (release / refund / dispute / etc).
  // Keyed with an `action:` prefix so the two effects don't fight over the
  // same map entries.
  useEffect(() => {
    const currentWatched = watchedRef.current;

    for (const action of pendingActions) {
      const key = `action:${action.txId.toLowerCase()}`;
      if (currentWatched.has(key)) continue;

      const controller = new AbortController();
      currentWatched.set(key, controller);

      pollTxStatus(action.txId, { signal: controller.signal }).then((result) => {
        currentWatched.delete(key);
        if (result.outcome === 'aborted') return;

        // Same logic as pending escrows: clear the optimistic overlay on
        // any terminal state, invalidate caches on confirmation.
        clearPendingAction(action.contractId, action.escrowId);

        if (result.outcome === 'confirmed') {
          queryClient.invalidateQueries({ queryKey: ['escrow', action.escrowId] });
          queryClient.invalidateQueries({ queryKey: ['escrows'] });
          queryClient.invalidateQueries({ queryKey: ['events', action.contractId, action.escrowId] });
          queryClient.invalidateQueries({ queryKey: ['user-stats'] });
          queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
          queryClient.invalidateQueries({ queryKey: ['disputed-escrows'] });
        }
      });
    }
  }, [pendingActions, queryClient]);

  // On unmount, abort everything.
  useEffect(() => {
    const watched = watchedRef.current;
    return () => {
      for (const ctrl of watched.values()) ctrl.abort();
      watched.clear();
    };
  }, []);
}
