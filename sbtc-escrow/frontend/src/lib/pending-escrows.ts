/**
 * Optimistic store for escrows the user has just submitted to the chain but
 * which haven't been indexed into Supabase yet.
 *
 * The point: between "user signs tx" and "chainhook → Supabase row appears"
 * there's a 1–3 minute gap (block time + chainhook lag + occasional edge
 * function cold start). The dashboard would otherwise look broken during
 * that window. We hold a local placeholder, render it as "Submitting", and
 * drop it the moment the real row lands.
 *
 * Persisted to localStorage so a page refresh or tab close doesn't lose the
 * placeholder mid-flight. Keyed per wallet address.
 */

import type { TokenType } from './types';

const STORAGE_KEY = 'pending_escrows_v1';
const MAX_AGE_MS = 60 * 60 * 1000; // 60 min — drop stale placeholders

export type PendingTxStatus = 'submitted' | 'confirmed' | 'failed';

export interface PendingEscrow {
  txId: string;
  buyer: string;
  seller: string;
  amount: number;
  feeAmount: number;
  tokenType: TokenType;
  description: string;
  durationBlocks: number;
  submittedAt: string; // ISO
  txStatus: PendingTxStatus;
}

type Store = Record<string, PendingEscrow[]>; // keyed by buyer address (lowercase)

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
    // Storage full or disabled — silently degrade; optimistic UI is best-effort.
  }
  notify();
}

// Tiny pub-sub so React hooks can re-render on changes.
const listeners = new Set<() => void>();
function notify(): void {
  // Bust the snapshot cache before notifying React. useSyncExternalStore
  // demands referential stability from getSnapshot, but state HAS changed —
  // listeners need to see the new snapshot, so clear cached refs first.
  snapshotCache.clear();
  listeners.forEach((l) => l());
}

// Snapshot cache, keyed by lowercase address. Critical for useSyncExternalStore:
// it requires getSnapshot to return the SAME reference when nothing has changed,
// or React will re-render non-stop and throw "Maximum update depth exceeded"
// (error #185). Cleared on every write() via notify().
const snapshotCache = new Map<string, PendingEscrow[]>();
const EMPTY_SNAPSHOT: PendingEscrow[] = [];

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function key(address: string): string {
  return address.toLowerCase();
}

function pruneStale(entries: PendingEscrow[]): PendingEscrow[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return entries.filter((e) => new Date(e.submittedAt).getTime() > cutoff);
}

export function getPending(address: string | null): PendingEscrow[] {
  if (!address) return EMPTY_SNAPSHOT;
  const k = key(address);
  const cached = snapshotCache.get(k);
  if (cached) return cached;

  const all = read();
  const own = pruneStale(all[k] ?? []);
  const sorted = own.slice().sort((a, b) =>
    new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
  // If there are no pending entries, return the shared EMPTY_SNAPSHOT
  // singleton — keeps reference identity across calls for empty cases too.
  const result = sorted.length === 0 ? EMPTY_SNAPSHOT : sorted;
  snapshotCache.set(k, result);
  return result;
}

export function addPending(entry: PendingEscrow): void {
  const all = read();
  const k = key(entry.buyer);
  const existing = pruneStale(all[k] ?? []);
  // Dedupe by txId in case of accidental double-submit.
  const filtered = existing.filter((e) => e.txId !== entry.txId);
  all[k] = [entry, ...filtered];
  write(all);
}

export function updatePendingStatus(
  address: string,
  txId: string,
  txStatus: PendingTxStatus,
): void {
  const all = read();
  const k = key(address);
  const list = all[k];
  if (!list) return;
  const idx = list.findIndex((e) => e.txId === txId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], txStatus };
  all[k] = list;
  write(all);
}

export function removePending(address: string, txId: string): void {
  const all = read();
  const k = key(address);
  const list = all[k];
  if (!list) return;
  const filtered = list.filter((e) => e.txId !== txId);
  if (filtered.length === list.length) return;
  all[k] = filtered;
  write(all);
}

/**
 * Drop any pending entries whose txId now appears in the real (indexed)
 * escrow list. Call this whenever the Supabase-backed list refreshes.
 */
export function reconcileAgainstIndexed(
  address: string,
  indexedTxIds: Iterable<string>,
): number {
  const all = read();
  const k = key(address);
  const list = all[k];
  if (!list?.length) return 0;
  const indexedSet = new Set(indexedTxIds);
  const kept = list.filter((e) => !indexedSet.has(e.txId));
  const removed = list.length - kept.length;
  if (removed > 0) {
    all[k] = kept;
    write(all);
  }
  return removed;
}
