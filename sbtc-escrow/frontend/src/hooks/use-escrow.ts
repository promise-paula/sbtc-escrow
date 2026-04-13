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
  });
}

export function useEscrowEvents(escrowId?: number) {
  return useQuery({
    queryKey: ['events', escrowId],
    queryFn: async (): Promise<EscrowEvent[]> => {
      if (!isSupabaseConfigured) return [];
      let query = supabase.from('escrow_events').select('*').order('block_height', { ascending: false });
      if (escrowId) query = query.eq('escrow_id', escrowId);
      const { data, error } = await query;
      if (error || !data?.length) return [];
      return data.map(mapEventRow);
    },
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEscrowRow(row: any): Escrow {
  return {
    id: row.id,
    buyer: row.buyer,
    seller: row.seller,
    amount: row.amount,
    feeAmount: row.fee_amount ?? row.feeAmount ?? 0,
    tokenType: (row.token_type ?? row.tokenType ?? 0) as TokenType,
    description: row.description ?? '',
    status: row.status as EscrowStatus,
    createdAt: row.created_at_block ?? row.createdAt ?? 0,
    expiresAt: row.expires_at_block ?? row.expiresAt ?? 0,
    completedAt: row.completed_at_block ?? row.completedAt ?? null,
    disputedAt: row.disputed_at_block ?? row.disputedAt ?? null,
    txHash: row.tx_id ?? row.txHash,
    indexedAt: row.indexed_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEventRow(row: any): EscrowEvent {
  const eventData = row.data ?? {};
  return {
    id: row.id,
    escrowId: row.escrow_id ?? row.escrowId,
    eventType: row.event_type ?? row.eventType,
    actor: eventData.buyer ?? eventData.seller ?? eventData['disputed-by'] ?? eventData['resolved-by'] ?? '',
    blockHeight: row.block_height ?? row.blockHeight,
    timestamp: row.indexed_at ?? new Date().toISOString(),
    metadata: eventData,
  };
}
