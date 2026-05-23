import { useSyncExternalStore, useEffect } from 'react';
import { getPending, subscribePending, reconcileAgainstIndexed, type PendingEscrow } from '@/lib/pending-escrows';
import { CONTRACT_PRINCIPAL } from '@/lib/stacks-config';
import type { Escrow } from '@/lib/types';
import { EscrowStatus } from '@/lib/types';

/** Reactive list of the user's pending (not-yet-indexed) escrows. */
export function usePendingEscrows(address: string | null): PendingEscrow[] {
  return useSyncExternalStore(
    subscribePending,
    () => getPending(address),
    () => [],
  );
}

/**
 * Convenience: returns `[...pendingAsEscrow, ...indexedEscrows]` with pending
 * entries shaped as `Escrow` placeholders. Also auto-drops pending entries
 * whose tx has now appeared in the indexed list.
 *
 * Use this in place of `useEscrows` anywhere you want optimistic UI for the
 * "just created an escrow" window.
 */
export function useMergedEscrows(
  address: string | null,
  indexed: Escrow[] | undefined,
): Escrow[] {
  const pending = usePendingEscrows(address);

  // Reconcile: once a pending tx shows up in the indexed list, drop the placeholder.
  useEffect(() => {
    if (!address || !indexed?.length) return;
    const txIds = indexed.map((e) => e.txHash).filter((t): t is string => !!t);
    if (txIds.length) reconcileAgainstIndexed(address, txIds);
  }, [address, indexed]);

  if (!pending.length) return indexed ?? [];

  const placeholders: Escrow[] = pending.map(pendingToEscrow);
  return [...placeholders, ...(indexed ?? [])];
}

/**
 * Synthetic id for pending placeholders. Negative so it can never collide
 * with a real on-chain escrow id (which start at 1). We use the txId hash to
 * make it stable per-pending-entry within a session.
 */
function syntheticId(txId: string): number {
  let h = 0;
  for (let i = 0; i < txId.length; i++) {
    h = ((h << 5) - h + txId.charCodeAt(i)) | 0;
  }
  return -(Math.abs(h) || 1);
}

function pendingToEscrow(p: PendingEscrow): Escrow {
  return {
    id: syntheticId(p.txId),
    // Pending placeholders are always against the currently active contract
    // — new creates can only target the contract the SDK is configured for.
    contractId: CONTRACT_PRINCIPAL,
    buyer: p.buyer,
    seller: p.seller,
    amount: p.amount,
    feeAmount: p.feeAmount,
    tokenType: p.tokenType,
    description: p.description,
    status: EscrowStatus.Pending,
    createdAt: 0,
    expiresAt: 0,
    completedAt: null,
    disputedAt: null,
    txHash: p.txId,
    indexedAt: p.submittedAt,
    isPending: true,
    pendingTxStatus: p.txStatus,
  };
}
