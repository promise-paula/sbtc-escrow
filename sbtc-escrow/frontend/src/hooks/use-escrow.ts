import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { mockEscrows, mockEvents, mockUserStats, CURRENT_BLOCK_HEIGHT } from '@/lib/mock-data';
import { Escrow, EscrowEvent, EscrowStatus, UserStats } from '@/lib/types';

export function useEscrows(address: string | null) {
  return useQuery({
    queryKey: ['escrows', address],
    queryFn: async (): Promise<Escrow[]> => {
      if (!isSupabaseConfigured || !address) return mockEscrows.filter(e => e.buyer === address || e.seller === address);
      try {
        const { data, error } = await supabase
          .from('escrows')
          .select('*')
          .or(`buyer.eq.${address},seller.eq.${address}`)
          .order('created_at', { ascending: false });
        if (error || !data?.length) return mockEscrows.filter(e => e.buyer === address || e.seller === address);
        return data.map(mapEscrowRow);
      } catch {
        return mockEscrows.filter(e => e.buyer === address || e.seller === address);
      }
    },
    enabled: !!address,
  });
}

export function useEscrow(id: number) {
  return useQuery({
    queryKey: ['escrow', id],
    queryFn: async (): Promise<Escrow | null> => {
      if (!isSupabaseConfigured) return mockEscrows.find(e => e.id === id) || null;
      try {
        const { data, error } = await supabase
          .from('escrows')
          .select('*')
          .eq('id', id)
          .single();
        if (error || !data) return mockEscrows.find(e => e.id === id) || null;
        return mapEscrowRow(data);
      } catch {
        return mockEscrows.find(e => e.id === id) || null;
      }
    },
  });
}

export function useEscrowEvents(escrowId?: number) {
  return useQuery({
    queryKey: ['events', escrowId],
    queryFn: async (): Promise<EscrowEvent[]> => {
      if (!isSupabaseConfigured) {
        return escrowId
          ? mockEvents.filter(e => e.escrowId === escrowId)
          : mockEvents;
      }
      try {
        let query = supabase.from('escrow_events').select('*').order('block_height', { ascending: false });
        if (escrowId) query = query.eq('escrow_id', escrowId);
        const { data, error } = await query;
        if (error || !data?.length) {
          return escrowId ? mockEvents.filter(e => e.escrowId === escrowId) : mockEvents;
        }
        return data.map(mapEventRow);
      } catch {
        return escrowId ? mockEvents.filter(e => e.escrowId === escrowId) : mockEvents;
      }
    },
  });
}

export function useUserStats(address: string | null) {
  return useQuery({
    queryKey: ['user-stats', address],
    queryFn: async (): Promise<UserStats> => {
      if (!isSupabaseConfigured || !address) return mockUserStats;
      try {
        const { data, error } = await supabase
          .from('escrows')
          .select('*')
          .or(`buyer.eq.${address},seller.eq.${address}`);
        if (error || !data?.length) return mockUserStats;
        const escrows = data.map(mapEscrowRow);
        const active = escrows.filter(e => e.status === EscrowStatus.Pending || e.status === EscrowStatus.Disputed);
        return {
          totalLocked: active.reduce((sum, e) => sum + e.amount, 0),
          activeEscrows: active.length,
          completedEscrows: escrows.filter(e => e.status === EscrowStatus.Released || e.status === EscrowStatus.Refunded).length,
          asBuyer: escrows.filter(e => e.buyer === address).length,
          asSeller: escrows.filter(e => e.seller === address).length,
        };
      } catch {
        return mockUserStats;
      }
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
    description: row.description ?? '',
    status: row.status as EscrowStatus,
    createdAt: row.created_at_block ?? row.createdAt ?? CURRENT_BLOCK_HEIGHT,
    expiresAt: row.expires_at_block ?? row.expiresAt ?? CURRENT_BLOCK_HEIGHT,
    completedAt: row.completed_at_block ?? row.completedAt ?? null,
    disputedAt: row.disputed_at_block ?? row.disputedAt ?? null,
    txHash: row.tx_hash ?? row.txHash,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEventRow(row: any): EscrowEvent {
  return {
    id: row.id,
    escrowId: row.escrow_id ?? row.escrowId,
    eventType: row.event_type ?? row.eventType,
    actor: row.actor,
    blockHeight: row.block_height ?? row.blockHeight,
    timestamp: row.timestamp ?? row.created_at,
    metadata: row.metadata,
  };
}
