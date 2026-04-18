import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
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
    queryKey: ['escrows', address],
    queryFn: async (): Promise<Escrow[]> => {
      if (!isSupabaseConfigured || !address) return [];
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .or(`buyer.eq.${address},seller.eq.${address}`)
        .order('indexed_at', { ascending: false });
      if (error || !data?.length) return [];
      return data.map(mapEscrowRow);
    },
    enabled: !!address,
  });
}

export function useEscrow(id: number) {
  return useQuery({
    queryKey: ['escrow', id],
    queryFn: async (): Promise<Escrow | null> => {
      if (!isSupabaseConfigured) return null;
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) return null;
      return mapEscrowRow(data);
    },
    enabled: !!id,
  });
}

export function useEscrowEvents(escrowId?: number) {
  return useQuery({
    queryKey: ['events', escrowId],
    queryFn: async (): Promise<EscrowEvent[]> => {
      if (!isSupabaseConfigured) return [];
      let query = supabase.from('escrow_events').select('*').order('block_height', { ascending: false });
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
    queryKey: ['user-events', address],
    queryFn: async (): Promise<EscrowEvent[]> => {
      if (!isSupabaseConfigured || !address) return [];
      // First get the user's escrow IDs
      const { data: escrows, error: escrowErr } = await supabase
        .from('escrows')
        .select('id')
        .or(`buyer.eq.${address},seller.eq.${address}`);
      if (escrowErr || !escrows?.length) return [];
      const ids = escrows.map(e => e.id);
      // Then get events for those escrows
      const { data, error } = await supabase
        .from('escrow_events')
        .select('*')
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
    queryKey: ['user-stats', address],
    queryFn: async (): Promise<UserStats> => {
      if (!isSupabaseConfigured || !address) return EMPTY_STATS;
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .or(`buyer.eq.${address},seller.eq.${address}`);
      if (error || !data?.length) return EMPTY_STATS;
      const escrows = data.map(mapEscrowRow);
      const active = escrows.filter(e => e.status === EscrowStatus.Pending || e.status === EscrowStatus.Disputed);
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
  tx_id: string;
  indexed_at: string;
}

function mapEscrowRow(row: SupabaseEscrowRow): Escrow {
  return {
    id: row.id,
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
