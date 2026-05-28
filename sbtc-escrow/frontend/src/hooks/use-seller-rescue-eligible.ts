import { useQuery } from '@tanstack/react-query';
import { fetchCallReadOnlyFunction, cvToJSON, uintCV } from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { STACKS_API_URL, STACKS_NETWORK, supportsV3Features } from '@/lib/stacks-config';

/**
 * v3+ only. Read-only check whether an escrow has crossed the seller's
 * self-rescue threshold (`2 * dispute-timeout` blocks past `disputed-at`,
 * AND was DELIVERED before being disputed). Returns `false` on contracts
 * that don't expose the function — no network call attempted in that case.
 *
 * We poll every 30s while a dispute is active so the affordance appears
 * the moment the threshold passes, even without a manual refresh.
 */
export function useSellerRescueEligible(contractId: string | undefined, escrowId: number | undefined) {
  return useQuery({
    queryKey: ['seller-rescue-eligible', contractId, escrowId],
    queryFn: async (): Promise<boolean> => {
      if (!contractId || !escrowId) return false;
      if (!supportsV3Features(contractId)) return false;

      const [address, name] = contractId.split('.');
      const net = STACKS_NETWORK === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
      if (STACKS_API_URL) net.client = { ...net.client, baseUrl: STACKS_API_URL };

      try {
        const result = await fetchCallReadOnlyFunction({
          contractAddress: address,
          contractName: name,
          functionName: 'is-seller-rescue-eligible',
          functionArgs: [uintCV(escrowId)],
          network: net,
          senderAddress: address,
        });
        return cvToJSON(result).value === true;
      } catch {
        return false;
      }
    },
    enabled: !!contractId && !!escrowId && supportsV3Features(contractId ?? ''),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}
