import { useQuery } from '@tanstack/react-query';
import { fetchCallReadOnlyFunction, cvToJSON, principalCV } from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { STACKS_API_URL, STACKS_NETWORK, SBTC_CONTRACT } from '@/lib/stacks-config';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Compute the "free" balance held by an escrow contract — the portion the
 * admin can `sweep-orphans` without touching active escrow funds. Returns
 * separate STX and sBTC numbers because the contract holds both as
 * independent pools.
 *
 *   free = on-chain contract balance − sum(amount + fee) of live escrows
 *
 * Live escrows = status in (Pending, Disputed, Delivered). On-chain balance
 * comes from Hiro's `/v2/accounts/...` (STX) and the sBTC contract's
 * `get-balance` (sBTC). Locked totals come from the Supabase index, which
 * may lag the chain by a few seconds — acceptable here since the contract
 * itself enforces the safety check (`amount ≤ balance − locked`) on every
 * sweep call, so any UI under-reading just causes the operator to attempt
 * a slightly smaller sweep than possible, never an unsafe one.
 */

const network = () => {
  const net = STACKS_NETWORK === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
  if (STACKS_API_URL) net.client = { ...net.client, baseUrl: STACKS_API_URL };
  return net;
};

interface FreeBalance {
  balanceStx: bigint;
  lockedStx: bigint;
  freeStx: bigint;
  balanceSbtc: bigint;
  lockedSbtc: bigint;
  freeSbtc: bigint;
  /** Number of currently-live escrows holding any of the locked funds. */
  liveCount: number;
}

async function fetchContractStxBalance(principal: string): Promise<bigint> {
  const res = await fetch(`${STACKS_API_URL}/v2/accounts/${principal}?proof=0`);
  if (!res.ok) return 0n;
  const data = await res.json();
  return BigInt(data.balance ?? '0x0');
}

async function fetchContractSbtcBalance(principal: string): Promise<bigint> {
  try {
    const [contractAddress, contractName] = SBTC_CONTRACT.split('.');
    const result = await fetchCallReadOnlyFunction({
      contractAddress,
      contractName,
      functionName: 'get-balance',
      functionArgs: [principalCV(principal)],
      network: network(),
      senderAddress: contractAddress,
    });
    const json = cvToJSON(result);
    const raw = json.value?.value ?? json.value ?? '0';
    return BigInt(raw);
  } catch {
    // sBTC contract not deployed on the network or read failed — treat as 0.
    return 0n;
  }
}

async function fetchLockedTotals(
  contractId: string,
): Promise<{ stx: bigint; sbtc: bigint; liveCount: number }> {
  if (!isSupabaseConfigured) return { stx: 0n, sbtc: 0n, liveCount: 0 };
  // Pending (0), Disputed (3), Delivered (4) — every status that still
  // holds funds on-chain. Released (1) and Refunded (2) have already
  // moved funds out.
  const { data, error } = await supabase
    .from('escrows')
    .select('amount, fee_amount, token_type')
    .eq('contract_id', contractId)
    .in('status', [0, 3, 4]);
  if (error || !data) return { stx: 0n, sbtc: 0n, liveCount: 0 };
  let stx = 0n;
  let sbtc = 0n;
  for (const row of data) {
    const total = BigInt(row.amount ?? 0) + BigInt(row.fee_amount ?? 0);
    // token_type 0 = STX in the contract's encoding, 1 = sBTC.
    if (row.token_type === 0) stx += total;
    else sbtc += total;
  }
  return { stx, sbtc, liveCount: data.length };
}

export function useContractFreeBalance(contractId: string) {
  return useQuery<FreeBalance>({
    queryKey: ['contract-free-balance', contractId],
    queryFn: async () => {
      const [stxBal, sbtcBal, locked] = await Promise.all([
        fetchContractStxBalance(contractId),
        fetchContractSbtcBalance(contractId),
        fetchLockedTotals(contractId),
      ]);
      return {
        balanceStx: stxBal,
        lockedStx: locked.stx,
        freeStx: stxBal > locked.stx ? stxBal - locked.stx : 0n,
        balanceSbtc: sbtcBal,
        lockedSbtc: locked.sbtc,
        freeSbtc: sbtcBal > locked.sbtc ? sbtcBal - locked.sbtc : 0n,
        liveCount: locked.liveCount,
      };
    },
    // Free balance can shift block-to-block as escrows release/refund;
    // 30s feels right — fresh enough to trust, not chatty enough to spam
    // the public Hiro API.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
