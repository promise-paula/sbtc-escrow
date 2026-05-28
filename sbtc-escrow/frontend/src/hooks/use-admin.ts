import { useQuery } from '@tanstack/react-query';
import { fetchCallReadOnlyFunction, cvToJSON } from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { PlatformStats, PlatformConfig, Escrow, EscrowStatus, TokenType } from '@/lib/types';
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  CONTRACT_PRINCIPAL,
  STACKS_API_URL,
  STACKS_NETWORK,
  DEFAULT_DISPUTE_TIMEOUT,
  MAX_DURATION_BLOCKS,
  MIN_AMOUNT_STX,
  MAX_AMOUNT_STX,
  MIN_AMOUNT_SBTC,
  MAX_AMOUNT_SBTC,
} from '@/lib/stacks-config';

const EMPTY_STATS: PlatformStats = {
  totalEscrows: 0,
  totalVolumeStx: 0,
  totalVolumeSbtc: 0,
  totalFeesStx: 0,
  totalFeesSbtc: 0,
  totalReleased: 0,
  totalRefunded: 0,
  activeDisputes: 0,
  resolvedDisputes: 0,
};

const DEFAULT_CONFIG: PlatformConfig = {
  owner: '',
  feeRecipient: '',
  platformFeeBps: 50,
  isPaused: false,
  minAmount: MIN_AMOUNT_STX,
  maxAmount: MAX_AMOUNT_STX,
  minAmountSbtc: MIN_AMOUNT_SBTC,
  maxAmountSbtc: MAX_AMOUNT_SBTC,
  maxDuration: MAX_DURATION_BLOCKS,
  disputeTimeout: DEFAULT_DISPUTE_TIMEOUT,
};

export function usePlatformStats() {
  return useQuery({
    // Intentionally NOT scoped by contract_id: admin platform stats must reflect
    // the cumulative state across every contract version we've ever deployed,
    // so cutting over from v6 → v7 doesn't make the dashboard look like the
    // platform shrank to zero. User-facing views still scope to the active
    // contract; only the admin aggregation is cross-version.
    queryKey: ['platform-stats'],
    queryFn: async (): Promise<PlatformStats> => {
      if (!isSupabaseConfigured) return EMPTY_STATS;
      const { data, error } = await supabase
        .from('escrows')
        .select('amount, fee_amount, status, token_type');
      if (error || !data?.length) return EMPTY_STATS;
      const stx = data.filter(r => (r.token_type ?? 0) === 0);
      const sbtc = data.filter(r => (r.token_type ?? 0) === 1);

      // Count resolved disputes from events table (any final dispute resolution),
      // cross-version for the same reason as above.
      const { count: resolvedDisputes } = await supabase
        .from('escrow_events')
        .select('*', { count: 'exact', head: true })
        .in('event_type', [
          'dispute-resolved-for-buyer',
          'dispute-resolved-for-seller',
          'dispute-resolved-split',
          'dispute-expired-resolved',
        ]);

      return {
        totalEscrows: data.length,
        totalVolumeStx: stx.reduce((s, r) => s + (r.amount ?? 0), 0),
        totalVolumeSbtc: sbtc.reduce((s, r) => s + (r.amount ?? 0), 0),
        totalFeesStx: stx.reduce((s, r) => s + (r.fee_amount ?? 0), 0),
        totalFeesSbtc: sbtc.reduce((s, r) => s + (r.fee_amount ?? 0), 0),
        totalReleased: data.filter(r => r.status === EscrowStatus.Released).length,
        totalRefunded: data.filter(r => r.status === EscrowStatus.Refunded).length,
        activeDisputes: data.filter(r => r.status === EscrowStatus.Disputed).length,
        resolvedDisputes: resolvedDisputes ?? 0,
      };
    },
  });
}

/**
 * Read live platform config directly from chain. The contract is the source
 * of truth — owner / fee_recipient / pause state / fees / dispute timeout
 * all live on-chain and only become stale in the DB cache if a chainhook
 * event is missed or if the contract was just deployed (no events emitted
 * yet, which is exactly why the dashboard was showing an empty Owner field).
 *
 * Returns null on any failure so the caller can fall back to the DB cache.
 */
async function readPlatformConfigFromChain(): Promise<Partial<PlatformConfig> | null> {
  try {
    const network = STACKS_NETWORK === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
    if (STACKS_API_URL) {
      network.client = { ...network.client, baseUrl: STACKS_API_URL };
    }
    const result = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'get-config',
      functionArgs: [],
      network,
      senderAddress: CONTRACT_ADDRESS,
    });
    const data = cvToJSON(result).value;
    return {
      owner: data['owner']?.value ?? '',
      feeRecipient: data['fee-recipient']?.value ?? '',
      platformFeeBps: parseInt(data['platform-fee-bps']?.value ?? '50'),
      isPaused: !!data['is-paused']?.value,
      disputeTimeout: parseInt(data['dispute-timeout']?.value ?? String(DEFAULT_DISPUTE_TIMEOUT)),
    };
  } catch (err) {
    console.warn('[usePlatformConfig] chain read failed, falling back to DB cache:', err);
    return null;
  }
}

export function usePlatformConfig() {
  return useQuery({
    queryKey: ['platform-config', CONTRACT_PRINCIPAL],
    // Keep data fresh for 2 min so optimistic updates from admin actions
    // aren't overwritten by stale Supabase data before the chainhook indexes.
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<PlatformConfig> => {
      // Source of truth: read from chain. Falls back to the Supabase cache
      // only if the chain RPC is unreachable.
      const [chainCfg, dbResult] = await Promise.all([
        readPlatformConfigFromChain(),
        isSupabaseConfigured
          ? supabase.from('platform_config').select('*').eq('id', 1).single()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const data = dbResult.data;
      if (!chainCfg && !data) return DEFAULT_CONFIG;

      // Chain wins for fields that exist on-chain. DB only fills in when chain
      // read failed.
      return {
        owner: chainCfg?.owner ?? data?.contract_owner ?? '',
        feeRecipient: chainCfg?.feeRecipient ?? data?.fee_recipient ?? '',
        platformFeeBps: chainCfg?.platformFeeBps ?? data?.fee_bps ?? 50,
        isPaused: chainCfg?.isPaused ?? data?.contract_paused ?? false,
        minAmount: MIN_AMOUNT_STX,
        maxAmount: MAX_AMOUNT_STX,
        minAmountSbtc: MIN_AMOUNT_SBTC,
        maxAmountSbtc: MAX_AMOUNT_SBTC,
        maxDuration: MAX_DURATION_BLOCKS,
        disputeTimeout: data.dispute_timeout ?? DEFAULT_DISPUTE_TIMEOUT,
      };
    },
  });
}

export function useDisputedEscrows() {
  return useQuery({
    queryKey: ['disputed-escrows', CONTRACT_PRINCIPAL],
    queryFn: async (): Promise<Escrow[]> => {
      if (!isSupabaseConfigured) return [];
      const { data, error } = await supabase
        .from('escrows')
        .select('*')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .eq('status', EscrowStatus.Disputed)
        .order('disputed_at_block', { ascending: true });
      if (error || !data?.length) return [];

      // Fetch dispute events to get "disputed-by" for each escrow
      const escrowIds = data.map(r => r.id);
      const { data: events } = await supabase
        .from('escrow_events')
        .select('escrow_id, data')
        .eq('contract_id', CONTRACT_PRINCIPAL)
        .in('escrow_id', escrowIds)
        .eq('event_type', 'escrow-disputed');
      const disputeByMap: Record<number, string> = {};
      (events || []).forEach((evt) => {
        disputeByMap[evt.escrow_id] = evt.data?.['disputed-by'] ?? '';
      });

      return data.map((row) => ({
        id: row.id,
        contractId: row.contract_id,
        buyer: row.buyer,
        seller: row.seller,
        beneficiary: row.beneficiary ?? null,
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
    // Cross-version: admin needs the full historical record of resolved
    // disputes, including ones from contract versions that are no longer
    // the active default.
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
        contractId: row.contract_id,
        buyer: row.buyer,
        seller: row.seller,
        beneficiary: row.beneficiary ?? null,
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
