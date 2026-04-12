import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { mockPlatformStats, mockConfig, mockEscrows } from '@/lib/mock-data';
import { PlatformStats, PlatformConfig, Escrow, EscrowStatus } from '@/lib/types';

export function usePlatformStats() {
  return useQuery({
    queryKey: ['platform-stats'],
    queryFn: async (): Promise<PlatformStats> => {
      if (!isSupabaseConfigured) return mockPlatformStats;
      try {
        const { data, error } = await supabase.from('platform_config').select('*').eq('id', 1).single();
        if (error || !data) return mockPlatformStats;
        return {
          totalEscrows: data.total_escrows ?? mockPlatformStats.totalEscrows,
          totalVolume: data.total_volume ?? mockPlatformStats.totalVolume,
          totalFeesCollected: data.total_fees_collected ?? mockPlatformStats.totalFeesCollected,
          totalReleased: data.total_released ?? mockPlatformStats.totalReleased,
          totalRefunded: data.total_refunded ?? mockPlatformStats.totalRefunded,
          activeDisputes: data.active_disputes ?? mockPlatformStats.activeDisputes,
        };
      } catch {
        return mockPlatformStats;
      }
    },
  });
}

export function usePlatformConfig() {
  return useQuery({
    queryKey: ['platform-config'],
    queryFn: async (): Promise<PlatformConfig> => {
      if (!isSupabaseConfigured) return mockConfig;
      try {
        const { data, error } = await supabase.from('platform_config').select('*').eq('id', 1).single();
        if (error || !data) return mockConfig;
        return {
          owner: data.owner ?? mockConfig.owner,
          feeRecipient: data.fee_recipient ?? mockConfig.feeRecipient,
          platformFeeBps: data.platform_fee_bps ?? mockConfig.platformFeeBps,
          isPaused: data.is_paused ?? mockConfig.isPaused,
          minAmount: data.min_amount ?? mockConfig.minAmount,
          maxAmount: data.max_amount ?? mockConfig.maxAmount,
          maxDuration: data.max_duration ?? mockConfig.maxDuration,
          disputeTimeout: data.dispute_timeout ?? mockConfig.disputeTimeout,
        };
      } catch {
        return mockConfig;
      }
    },
  });
}

export function useDisputedEscrows() {
  return useQuery({
    queryKey: ['disputed-escrows'],
    queryFn: async (): Promise<Escrow[]> => {
      if (!isSupabaseConfigured) return mockEscrows.filter(e => e.status === EscrowStatus.Disputed);
      try {
        const { data, error } = await supabase
          .from('escrows')
          .select('*')
          .eq('status', EscrowStatus.Disputed)
          .order('disputed_at_block', { ascending: true });
        if (error || !data?.length) return mockEscrows.filter(e => e.status === EscrowStatus.Disputed);
        return data.map((row) => ({
          id: row.id,
          buyer: row.buyer,
          seller: row.seller,
          amount: row.amount,
          feeAmount: row.fee_amount ?? 0,
          description: row.description ?? '',
          status: row.status as EscrowStatus,
          createdAt: row.created_at_block ?? 0,
          expiresAt: row.expires_at_block ?? 0,
          completedAt: row.completed_at_block ?? null,
          disputedAt: row.disputed_at_block ?? null,
          txHash: row.tx_hash,
        }));
      } catch {
        return mockEscrows.filter(e => e.status === EscrowStatus.Disputed);
      }
    },
  });
}

export function useResolvedDisputes() {
  return useQuery({
    queryKey: ['resolved-disputes'],
    queryFn: async (): Promise<Escrow[]> => {
      const mockResult = mockEscrows.filter(
        e => (e.status === EscrowStatus.Released || e.status === EscrowStatus.Refunded) && e.disputedAt
      );
      if (!isSupabaseConfigured) return mockResult;
      try {
        const { data, error } = await supabase
          .from('escrows')
          .select('*')
          .not('disputed_at_block', 'is', null)
          .in('status', [EscrowStatus.Released, EscrowStatus.Refunded])
          .order('completed_at_block', { ascending: false });
        if (error || !data?.length) return mockResult;
        return data.map((row) => ({
          id: row.id,
          buyer: row.buyer,
          seller: row.seller,
          amount: row.amount,
          feeAmount: row.fee_amount ?? 0,
          description: row.description ?? '',
          status: row.status as EscrowStatus,
          createdAt: row.created_at_block ?? 0,
          expiresAt: row.expires_at_block ?? 0,
          completedAt: row.completed_at_block ?? null,
          disputedAt: row.disputed_at_block ?? null,
          txHash: row.tx_hash,
        }));
      } catch {
        return mockResult;
      }
    },
  });
}
