import { useQuery } from '@tanstack/react-query';
import { fetchCallReadOnlyFunction, cvToJSON, uintCV, type ClarityValue } from '@stacks/transactions';
import { getStacksNetwork, supportsV3Features, supportsV4Rules } from '@/lib/stacks-config';

export interface EscrowTiming {
  /** The contract's own answer: past the deadline (pause-adjusted on v4). */
  isExpired: boolean;
  /** The contract's own answer: delivered and still inside the review window. */
  inReview: boolean;
  /** The contract's own answer: disputed and past the dispute timeout. */
  disputeTimedOut: boolean;
  /** v4: the deadline after any pause adjustment. Null on earlier contracts. */
  effectiveExpiresAt: number | null;
  /** v4: the review deadline after any pause adjustment. Null if not delivered. */
  effectiveReviewEndsAt: number | null;
  /** v4: this escrow's dispute timeout, snapshotted at creation. */
  disputeTimeout: number | null;
}

// cvToJSON shapes: uint -> { value: '123' }; optional some -> { value: inner };
// optional none -> { value: null }; tuple -> { value: { field: ... } }.
const asNumber = (j: { value?: unknown } | undefined | null): number | null =>
  j && j.value != null ? Number(j.value) : null;

/**
 * v3+ only. Reads expiry, review-window and dispute-timeout state from the
 * contract's read-only functions instead of re-implementing them. The
 * contract counts an escrow as expired only after its deadline block, and v4
 * pushes deadlines that fall inside a pause; re-deriving either locally has
 * already produced off-by-one bugs. Legacy contracts return no data and
 * callers fall back to local math.
 *
 * Polls every 30s so buttons flip close to the block where the contract does.
 */
export function useEscrowTiming(contractId: string | undefined, escrowId: number | undefined) {
  const enabled = !!contractId && !!escrowId && supportsV3Features(contractId ?? '');
  return useQuery({
    queryKey: ['escrow-timing', contractId, escrowId],
    enabled,
    refetchInterval: 30_000,
    staleTime: 20_000,
    queryFn: async (): Promise<EscrowTiming> => {
      const [contractAddress, contractName] = (contractId as string).split('.');
      const call = (functionName: string): Promise<ClarityValue> =>
        fetchCallReadOnlyFunction({
          contractAddress,
          contractName,
          functionName,
          functionArgs: [uintCV(escrowId as number)],
          network: getStacksNetwork(),
          senderAddress: contractAddress,
        });
      const v4 = supportsV4Rules(contractId as string);

      const [expired, review, timedOut, deadlines, escrow] = await Promise.all([
        call('is-expired'),
        call('is-in-review-period'),
        call('is-dispute-timed-out'),
        v4 ? call('get-effective-deadlines') : Promise.resolve(null),
        v4 ? call('get-escrow') : Promise.resolve(null),
      ]);

      const deadlineFields = deadlines ? cvToJSON(deadlines)?.value?.value : null;
      const escrowFields = escrow ? cvToJSON(escrow)?.value?.value : null;

      return {
        isExpired: cvToJSON(expired).value === true,
        inReview: cvToJSON(review).value === true,
        disputeTimedOut: cvToJSON(timedOut).value === true,
        effectiveExpiresAt: asNumber(deadlineFields?.['expires-at']),
        effectiveReviewEndsAt: asNumber(deadlineFields?.['review-ends-at']?.value),
        disputeTimeout: asNumber(escrowFields?.['dispute-timeout']),
      };
    },
  });
}
