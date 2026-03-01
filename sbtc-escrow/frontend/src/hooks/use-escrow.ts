/**
 * Escrow Data Hooks
 * 
 * React Query hooks for fetching and caching escrow data from the contract.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/contexts/WalletContext';
import {
  getEscrowCount,
  getEscrow,
  getUserEscrows,
  getAllEscrows,
  getUserStats,
  getPlatformStats,
  getConfig,
  getCurrentBlockHeight,
  createEscrow,
  releaseEscrow,
  refundEscrow,
  disputeEscrow,
  type Escrow,
  type UserStats,
  type PlatformStats,
  type PlatformConfig,
} from '@/lib/escrow-service';
import { EscrowStatus } from '@/lib/stacks-config';
import { useToast } from './use-toast';

// Query keys
const QUERY_KEYS = {
  escrowCount: ['escrow-count'],
  allEscrows: ['all-escrows'],
  escrow: (id: number) => ['escrow', id],
  userEscrows: (address: string) => ['user-escrows', address],
  userStats: (address: string) => ['user-stats', address],
  platformStats: ['platform-stats'],
  config: ['config'],
  blockHeight: ['block-height'],
} as const;

/**
 * Get escrow count
 */
export function useEscrowCount() {
  return useQuery({
    queryKey: QUERY_KEYS.escrowCount,
    queryFn: getEscrowCount,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });
}

/**
 * Get all escrows (for activity page)
 */
export function useAllEscrows() {
  return useQuery({
    queryKey: QUERY_KEYS.allEscrows,
    queryFn: getAllEscrows,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/**
 * Get single escrow by ID
 */
export function useEscrow(id: number | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.escrow(id!),
    queryFn: () => getEscrow(id!),
    enabled: id !== undefined && id > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/**
 * Get all escrows for current user
 */
export function useUserEscrows() {
  const { address } = useWallet();

  return useQuery({
    queryKey: QUERY_KEYS.userEscrows(address!),
    queryFn: () => getUserEscrows(address!),
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/**
 * Get filtered user escrows
 */
export function useFilteredUserEscrows(filter: 'all' | 'active' | 'completed' | 'disputed') {
  const { data: escrows = [], ...rest } = useUserEscrows();

  const filtered = escrows.filter((escrow) => {
    switch (filter) {
      case 'active':
        return escrow.status === EscrowStatus.PENDING;
      case 'completed':
        return escrow.status === EscrowStatus.RELEASED || escrow.status === EscrowStatus.REFUNDED;
      case 'disputed':
        return escrow.status === EscrowStatus.DISPUTED;
      default:
        return true;
    }
  });

  return { data: filtered, ...rest };
}

/**
 * Get user statistics
 */
export function useUserStats() {
  const { address } = useWallet();

  return useQuery({
    queryKey: QUERY_KEYS.userStats(address!),
    queryFn: () => getUserStats(address!),
    enabled: !!address,
    staleTime: 30_000,
  });
}

/**
 * Get platform statistics
 */
export function usePlatformStats() {
  return useQuery({
    queryKey: QUERY_KEYS.platformStats,
    queryFn: getPlatformStats,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/**
 * Get platform configuration
 */
export function useConfig() {
  return useQuery({
    queryKey: QUERY_KEYS.config,
    queryFn: getConfig,
    staleTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Get current block height
 */
export function useBlockHeight() {
  return useQuery({
    queryKey: QUERY_KEYS.blockHeight,
    queryFn: getCurrentBlockHeight,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create escrow mutation
 */
export function useCreateEscrow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { address } = useWallet();

  return useMutation({
    mutationFn: async ({
      sellerAddress,
      amountStx,
      description,
    }: {
      sellerAddress: string;
      amountStx: number;
      description: string;
    }) => {
      return createEscrow(sellerAddress, amountStx, description);
    },
    onSuccess: (result) => {
      toast({
        title: 'Escrow Created!',
        description: `Transaction submitted: ${result.txid.slice(0, 10)}...`,
      });

      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.escrowCount });
      if (address) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userEscrows(address) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userStats(address) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformStats });
    },
    onError: (error) => {
      toast({
        title: 'Failed to create escrow',
        description: error instanceof Error ? error.message : 'Transaction failed',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Release escrow mutation
 */
export function useReleaseEscrow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { address } = useWallet();

  return useMutation({
    mutationFn: async (escrowId: number) => {
      return releaseEscrow(escrowId);
    },
    onSuccess: (result, escrowId) => {
      toast({
        title: 'Funds Released!',
        description: 'The escrow funds have been released to the seller.',
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.escrow(escrowId) });
      if (address) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userEscrows(address) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userStats(address) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformStats });
    },
    onError: (error) => {
      toast({
        title: 'Failed to release escrow',
        description: error instanceof Error ? error.message : 'Transaction failed',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Refund escrow mutation
 */
export function useRefundEscrow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { address } = useWallet();

  return useMutation({
    mutationFn: async (escrowId: number) => {
      return refundEscrow(escrowId);
    },
    onSuccess: (result, escrowId) => {
      toast({
        title: 'Escrow Refunded',
        description: 'The funds have been returned to the buyer.',
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.escrow(escrowId) });
      if (address) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userEscrows(address) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userStats(address) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformStats });
    },
    onError: (error) => {
      toast({
        title: 'Failed to refund escrow',
        description: error instanceof Error ? error.message : 'Transaction failed',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Dispute escrow mutation
 */
export function useDisputeEscrow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { address } = useWallet();

  return useMutation({
    mutationFn: async (escrowId: number) => {
      return disputeEscrow(escrowId);
    },
    onSuccess: (result, escrowId) => {
      toast({
        title: 'Dispute Filed',
        description: 'Your dispute has been submitted for review.',
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.escrow(escrowId) });
      if (address) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userEscrows(address) });
      }
    },
    onError: (error) => {
      toast({
        title: 'Failed to dispute escrow',
        description: error instanceof Error ? error.message : 'Transaction failed',
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// DERIVED DATA
// =============================================================================

/**
 * Get user's role in an escrow
 */
export function useUserRole(escrow: Escrow | undefined | null) {
  const { address } = useWallet();

  if (!escrow || !address) return null;
  if (escrow.buyer === address) return 'buyer';
  if (escrow.seller === address) return 'seller';
  return null;
}

/**
 * Dashboard statistics derived from user data
 */
export function useDashboardStats() {
  const { data: escrows = [] } = useUserEscrows();
  const { data: userStats } = useUserStats();
  const { address } = useWallet();

  const activeCount = escrows.filter((e) => e.status === EscrowStatus.PENDING).length;
  const completedCount = escrows.filter(
    (e) => e.status === EscrowStatus.RELEASED || e.status === EscrowStatus.REFUNDED
  ).length;

  const asBuyer = escrows.filter((e) => e.buyer === address);
  const asSeller = escrows.filter((e) => e.seller === address);

  const totalSent = asBuyer.reduce((sum, e) => sum + e.amountStx, 0);
  const totalReceived = asSeller
    .filter((e) => e.status === EscrowStatus.RELEASED)
    .reduce((sum, e) => sum + e.amountStx, 0);

  return {
    activeCount,
    completedCount,
    totalSent,
    totalReceived,
    escrowsAsBuyer: asBuyer.length,
    escrowsAsSeller: asSeller.length,
  };
}
