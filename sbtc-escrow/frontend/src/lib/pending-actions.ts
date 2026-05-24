/**
 * Optimistic store for per-escrow actions the user has submitted on-chain
 * but for which the indexer hasn't yet seen the resulting event.
 *
 * Why: between "user signs Release tx" and "Supabase row updates to Released"
 * there's a 30s–3min gap (block inclusion + Hiro indexing + chainhook fire +
 * webhook write). Without an optimistic overlay the UI looks frozen and users
 * worry their action didn't go through. With it, the action surfaces as
 * "Releasing…" instantly, then flips to the real state when the indexer
 * catches up.
 *
 * The store is the equivalent piece for write actions that `pending-escrows`
 * provides for the create flow. Persisted to localStorage so a page refresh
 * mid-flight doesn't lose the pending state.
 *
 * Scope per row: at most one pending action per escrow at a time. The contract
 * prevents concurrent conflicting actions anyway (a refunded escrow can't be
 * re-released), so a single-slot store matches the real-world flow.
 */

export type ActionType =
  | 'release'
  | 'refund'
  | 'dispute'
  | 'deliver'
  | 'extend'
  | 'resolve-expired';

/** Final escrow status that should clear a pending action of this type. */
export const ACTION_EXPECTED_STATUS: Record<ActionType, number | null> = {
  release: 1, // RELEASED
  refund: 2, // REFUNDED
  dispute: 3, // DISPUTED
  deliver: 4, // DELIVERED
  // extend doesn't change status — clears when expires_at_block moves forward.
  extend: null,
  'resolve-expired': 2, // REFUNDED
};

/** Human label for the "Releasing…" / "Refunding…" badge. */
export const ACTION_LABEL: Record<ActionType, string> = {
  release: 'Releasing',
  refund: 'Refunding',
  dispute: 'Disputing',
  deliver: 'Signaling delivery',
  extend: 'Extending',
  'resolve-expired': 'Recovering',
};

export interface PendingAction {
  contractId: string;
  escrowId: number;
  type: ActionType;
  txId: string;
  submittedAt: string; // ISO
}

const STORAGE_KEY = 'pending_actions_v1';
// Drop optimistic state after 15 min — by then either the indexer has
// caught up (in which case it's already cleared) or the tx failed silently
// and we shouldn't keep showing a phantom "Releasing…" forever.
const MAX_AGE_MS = 15 * 60 * 1000;

type Store = Record<string, PendingAction>; // key = `${contract_id}/${escrow_id}`

function rowKey(contractId: string, escrowId: number): string {
  return `${contractId}/${escrowId}`;
}

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full / disabled — optimistic UI is best-effort.
  }
  notify();
}

// Pub-sub for React hooks (useSyncExternalStore).
const listeners = new Set<() => void>();
function notify(): void {
  // Invalidate any cached snapshot before listeners run, so getSnapshot
  // returns fresh references when React calls it. See the pattern in
  // pending-escrows.ts that fixed React error #185 (Maximum update depth).
  snapshotCache.clear();
  listeners.forEach((l) => l());
}

export function subscribePendingActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshotCache = new Map<string, PendingAction | null>();

function isStale(entry: PendingAction): boolean {
  return Date.now() - new Date(entry.submittedAt).getTime() > MAX_AGE_MS;
}

/**
 * Reactive read: returns the pending action for an escrow, or null. Cached so
 * useSyncExternalStore sees referential equality on repeated calls until a
 * write or stale-prune happens.
 */
export function getPendingAction(
  contractId: string,
  escrowId: number,
): PendingAction | null {
  const key = rowKey(contractId, escrowId);
  if (snapshotCache.has(key)) {
    return snapshotCache.get(key) ?? null;
  }
  const all = read();
  const entry = all[key] ?? null;
  if (entry && isStale(entry)) {
    // Best-effort prune on read so the UI doesn't show 'Releasing…' forever
    // if the tx never confirmed. Write removes it from storage too.
    delete all[key];
    write(all);
    snapshotCache.set(key, null);
    return null;
  }
  snapshotCache.set(key, entry);
  return entry;
}

export function setPendingAction(entry: PendingAction): void {
  const all = read();
  all[rowKey(entry.contractId, entry.escrowId)] = entry;
  write(all);
}

export function clearPendingAction(
  contractId: string,
  escrowId: number,
): void {
  const all = read();
  const key = rowKey(contractId, escrowId);
  if (!(key in all)) return;
  delete all[key];
  write(all);
}

/**
 * Drop the pending action for a row if its current indexed status matches
 * the action's expected outcome. Called when an Escrow query refreshes —
 * the chainhook has caught up, so the optimistic overlay can disappear.
 *
 * `extend` is the special case: status doesn't change, so we never clear it
 * via status reconciliation. It'll either time out (15 min) or get cleared
 * by an explicit `clearPendingAction` when the caller knows the extension
 * landed (e.g. expires_at_block advanced).
 */
export function reconcileActionWithIndexedStatus(
  contractId: string,
  escrowId: number,
  indexedStatus: number,
): void {
  const all = read();
  const key = rowKey(contractId, escrowId);
  const entry = all[key];
  if (!entry) return;
  const expected = ACTION_EXPECTED_STATUS[entry.type];
  if (expected !== null && indexedStatus === expected) {
    delete all[key];
    write(all);
  }
}
