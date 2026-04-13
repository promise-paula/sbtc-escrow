import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { PlatformStats, PlatformConfig, Escrow, EscrowStatus, TokenType } from '@/lib/types';

const EMPTY_STATS: PlatformStats = {
  totalEscrows: 0,
  totalVolumeStx: 0,
  totalVolumeSbtc: 0,
  totalFeesStx: 0,
  totalFeesSbtc: 0,
  totalReleased: 0,
  totalRefunded: 0,
  activeDisputes: 0,
};

const DEFAULT_CONFIG: PlatformConfig = {
  owner: '',
  feeRecipient: '',
  platformFeeBps: 50,
  isPaused: false,
  minAmount: 1_000_000,
  maxAmount: 100_000_000_000,
  minAmountSbtc: 10_000,
  maxAmountSbtc: 10_000_000_000,
  maxDuration: 52_560,
  disputeTimeout: 4_320,
};

export function usePlatformStats() {
  return useQuery({
    queryKey: ['platform-stats'],
    queryFn: async (): Promise<PlatformStats> => {
      if (!isSupabaseConfigured) return EMPTY_STATS;
      const { data, error } = await supabase.from('escrows').select('amount, fee_amount, status, token_type');
      if (error || !data?.length) return EMPTY_STATS;
      const stx = data.filter(r => (r.token_type ?? 0) === 0);
      const sbtc = data.filter(r => (r.token_type ?? 0) === 1);
      return {
        totalEscrows: data.length,
        totalVolumeStx: stx.reduce((s, r) => s + (r.amount ?? 0), 0),
        totalVolumeSbtc: sbtc.reduce((s, r) => s + (r.amount ?? 0), 0),
        totalFeesStx: stx.reduce((s, r) => s + (r.fee_amount ?? 0), 0),
        totalFeesSbtc: sbtc.reduce((s, r) => s + (r.fee_amount ?? 0), 0),
        totalReleased: data.filter(r => r.status === EscrowStatus.Released).length,
        totalRefunded: data.filter(r => r.status === EscrowStatus.Refunded).length,
        activeDisputes: data.filter(r => r.status === EscrowStatus.Disputed).length,
      };
    },
  });
}

export function usePlatformConfig() {
  return useQuery({
    queryKey: ['platform-config'],
    queryFn: async (): Promise<PlatformConfig> => {
      if (!isSupabaseConfigured) return DEFAULT_CONFIG;
      const { data, error } = await supabase.from('platform_config').select('*').eq('id', 1).single();
      if (error || !data) return DEFAULT_CONFIG;
      return {
        owner: data.contract_owner ?? '',
        feeRecipient: data.fee_recipient ?? '',
        platformFeeBps: data.fee_bps ?? 50,
        isPaused: data.contract_paused ?? false,
        minAmount: 1_000_000,
        maxAmount: 100_000_000_000,
        minAmountSbtc: 10_000,
        maxAmountSbtc: 10_000_000_000,
        maxDuration: 52_560,
        disputeTimeout: data.dispute_timeout ?? 4_320,
      };
    },
  });
}

export function useDisputedEscrows() {
  return useQuery({
    queryKey: ['disputed-escrows'],
    queryFn: async (): Promise<Escrow[]> => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .eq('status', EscrowStatus.Disputed)
        .order('disputed_at_block', { ascending: true });
      if (error || !data?.length) return [];

      // Fetch dispute events to get "disputed-by" for each escrow
      const escrowIds = data.map(r => r.id);
      const { data: events } = await supabase
        .from('escrow_events')
        .select('escrow_id, data')
        .in('escrow_id', escrowIds)
        .eq('event_type', 'escrow-disputed');
      const disputeByMap: Record<number, string> = {};
      (events || []).forEach((evt) => {
        disputeByMap[evt.escrow_id] = evt.data?.['disputed-by'] ?? '';
      });

      return data.map((row) => ({
        id: row.id,
        buyer: row.buyer,
        seller: row.seller,
        amount: row.amount,
        feeAmount: row.fee_amount ?? 0,
        tokenType: (row.token_type ?? 0) as TokenType,
        description: row.description ?? '',
        status: row.status as EscrowStatus,
        createdAt: row.created_at_block ?? 0,
        expiresAt: row.expires_at_block ?? 0,
        completedAt: row.completed_at_block ?? null,
        disputedAt: row.disputed_at_block ?? null,
        txHash: row.tx_id,
        indexedAt: row.indexed_at,
        disputedBy: disputeByMap[row.id] || undefined,
      }));
    },
  });
}

export function useResolvedDisputes() {
  return useQuery({
    queryKey: ['resolved-disputes'],
    queryFn: async (): Promise<Escrow[]> => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .not('disputed_at_block', 'is', null)
        .in('status', [EscrowStatus.Released, EscrowStatus.Refunded])
        .order('completed_at_block', { ascending: false });
      if (error || !data?.length) return [];
      return data.map((row) => ({
        id: row.id,
        buyer: row.buyer,
        seller: row.seller,
        amount: row.amount,
        feeAmount: row.fee_amount ?? 0,
        tokenType: (row.token_type ?? 0) as TokenType,
        description: row.description ?? '',
        status: row.status as EscrowStatus,
        createdAt: row.created_at_block ?? 0,
        expiresAt: row.expires_at_block ?? 0,
        completedAt: row.completed_at_block ?? null,
        disputedAt: row.disputed_at_block ?? null,
        txHash: row.tx_id,
        indexedAt: row.indexed_at,
      }));
    },
  });
}
