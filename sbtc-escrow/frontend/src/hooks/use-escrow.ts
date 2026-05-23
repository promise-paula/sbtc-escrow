import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { CONTRACT_PRINCIPAL } from '@/lib/stacks-config';
import { Escrow, EscrowEvent, EscrowStatus, TokenType, UserStats } from '@/lib/types';

const EMPTY_STATS: UserStats = {
  totalLockedStx: 0,
  totalLockedSbtc: 0,
  activeEscrows: 0,
  completedEscrows: 0,
  asBuyer: 0,
  asSeller: 0,
};

export function useEscrows(address: string | null) {
  return useQuery({
    queryKey: ['escrows', CONTRACT_PRINCIPAL, address],
    queryFn: async (): Promise<Escrow[]> => {
      if (!isSupabaseConfigured || !address) return [];
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .or(`buyer.eq.${address},seller.eq.${address}`)
        .order('indexed_at', { ascending: false });
      if (error || !data?.length) return [];
      return data.map(mapEscrowRow);
    },
    enabled: !!address,
  });
}

/**
 * Look up a single escrow by ID. Prefers the active contract version; falls
 * back to any contract version if no match (so links to legacy v6 escrows
 * still resolve after a v7 cutover). The returned row carries its own
 * `contractId` so consumers can route subsequent reads / actions correctly.
 */
export function useEscrow(id: number) {
  return useQuery({
    queryKey: ['escrow', id],
    queryFn: async (): Promise<Escrow | null> => {
      if (!isSupabaseConfigured) return null;
      // 1) Active contract preferred (the common case).
      const active = await supabase
        .from('escrows')
        .select('*')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .eq('id', id)
        .maybeSingle();
      if (active.data) return mapEscrowRow(active.data);

      // 2) Fallback: legacy contract version. Sort descending so if multiple
      //    historical contracts share the same id, the newer one wins.
      const fallback = await supabase
        .from('escrows')
        .select('*')
        .eq('id', id)
        .order('contract_id', { ascending: false })
        .limit(1)
        .maybeSingle();
      return fallback.data ? mapEscrowRow(fallback.data) : null;
    },
    enabled: !!id,
  });
}

/**
 * Fetch events for an escrow (or the global feed when no escrowId is passed).
 *
 * Pass `contractId` to scope to a specific contract version — useful when the
 * caller is on the detail page of a legacy escrow and wants that escrow's
 * history. Omit it for the global activity feed, which stays scoped to the
 * currently active contract (so day-to-day users don't see legacy noise).
 */
export function useEscrowEvents(escrowId?: number, contractId?: string) {
  const scopedContract = contractId ?? CONTRACT_PRINCIPAL;
  return useQuery({
    queryKey: ['events', scopedContract, escrowId],
    queryFn: async (): Promise<EscrowEvent[]> => {
      if (!isSupabaseConfigured) return [];
      let query = supabase
        .from('escrow_events')
        .select('*')
        .eq('contract_id', scopedContract)
        .order('block_height', { ascending: false });
      if (escrowId) {
        query = query.eq('escrow_id', escrowId);
      } else {
        // Exclude config events (null escrow_id) from the global feed
        query = query.not('escrow_id', 'is', null);
      }
      const { data, error } = await query;
      if (error || !data?.length) return [];
      return data.map(mapEventRow);
    },
  });
}

/** Events scoped to escrows where the given address is buyer or seller. */
export function useUserEscrowEvents(address: string | null) {
  return useQuery({
    queryKey: ['user-events', CONTRACT_PRINCIPAL, address],
    queryFn: async (): Promise<EscrowEvent[]> => {
      if (!isSupabaseConfigured || !address) return [];
      // First get the user's escrow IDs (scoped to the active contract)
      const { data: escrows, error: escrowErr } = await supabase
        .from('escrows')
        .select('id')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .or(`buyer.eq.${address},seller.eq.${address}`);
      if (escrowErr || !escrows?.length) return [];
      const ids = escrows.map(e => e.id);
      // Then get events for those escrows
      const { data, error } = await supabase
        .from('escrow_events')
        .select('*')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .in('escrow_id', ids)
        .order('block_height', { ascending: false });
      if (error || !data?.length) return [];
      return data.map(mapEventRow);
    },
    enabled: !!address,
  });
}

export function useUserStats(address: string | null) {
  return useQuery({
    queryKey: ['user-stats', CONTRACT_PRINCIPAL, address],
    queryFn: async (): Promise<UserStats> => {
      if (!isSupabaseConfigured || !address) return EMPTY_STATS;
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .or(`buyer.eq.${address},seller.eq.${address}`);
      if (error || !data?.length) return EMPTY_STATS;
      const escrows = data.map(mapEscrowRow);
      // Pending, Delivered, and Disputed all keep funds locked on-chain.
      const active = escrows.filter(e =>
        e.status === EscrowStatus.Pending ||
        e.status === EscrowStatus.Delivered ||
        e.status === EscrowStatus.Disputed
      );
      return {
        totalLockedStx: active.filter(e => e.tokenType === TokenType.STX).reduce((sum, e) => sum + e.amount + e.feeAmount, 0),
        totalLockedSbtc: active.filter(e => e.tokenType === TokenType.SBTC).reduce((sum, e) => sum + e.amount + e.feeAmount, 0),
        activeEscrows: active.length,
        completedEscrows: escrows.filter(e => e.status === EscrowStatus.Released || e.status === EscrowStatus.Refunded).length,
        asBuyer: escrows.filter(e => e.buyer === address).length,
        asSeller: escrows.filter(e => e.seller === address).length,
      };
    },
    enabled: !!address,
  });
}

interface SupabaseEscrowRow {
  id: number;
  contract_id: string;
  buyer: string;
  seller: string;
  amount: number;
  fee_amount: number;
  token_type: number;
  description: string;
  status: string;
  created_at_block: number;
  expires_at_block: number;
  completed_at_block: number | null;
  disputed_at_block: number | null;
  delivered_at_block: number | null;
  tx_id: string;
  indexed_at: string;
}

function mapEscrowRow(row: SupabaseEscrowRow): Escrow {
  return {
    id: row.id,
    contractId: row.contract_id,
    buyer: row.buyer,
    seller: row.seller,
    amount: row.amount,
    feeAmount: row.fee_amount ?? 0,
    tokenType: (row.token_type ?? 0) as TokenType,
    description: row.description ?? '',
    status: row.status as unknown as EscrowStatus,
    createdAt: row.created_at_block ?? 0,
    expiresAt: row.expires_at_block ?? 0,
    completedAt: row.completed_at_block ?? null,
    disputedAt: row.disputed_at_block ?? null,
    deliveredAt: row.delivered_at_block ?? null,
    txHash: row.tx_id,
    indexedAt: row.indexed_at,
  };
}

interface SupabaseEventRow {
  id: string | number;
  escrow_id: number;
  event_type: string;
  block_height: number;
  indexed_at: string;
  data: Record<string, string> | null;
}

function mapEventRow(row: SupabaseEventRow): EscrowEvent {
  const eventData = row.data ?? {};
  return {
    id: String(row.id),
    escrowId: row.escrow_id,
    eventType: row.event_type as EscrowEvent['eventType'],
    actor: eventData.buyer ?? eventData.seller ?? eventData['disputed-by'] ?? eventData['resolved-by'] ?? '',
    blockHeight: row.block_height,
    timestamp: row.indexed_at ?? new Date().toISOString(),
    metadata: eventData,
  };
}
