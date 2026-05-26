import { useQuery } from '@tanstack/react-query';
import {
  fetchCallReadOnlyFunction,
  cvToJSON,
  principalCV,
} from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { useWallet } from '@/contexts/WalletContext';
import { STACKS_NETWORK, STACKS_API_URL, SBTC_CONTRACT } from '@/lib/stacks-config';
import { TokenType } from '@/lib/types';

const network = () => {
  const net = STACKS_NETWORK === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
  if (STACKS_API_URL) net.client = { ...net.client, baseUrl: STACKS_API_URL };
  return net;
};

async function fetchStxBalance(address: string): Promise<bigint> {
  const res = await fetch(`${STACKS_API_URL}/v2/accounts/${address}?proof=0`);
  if (!res.ok) throw new Error(`Account fetch failed: ${res.status}`);
  const data = await res.json();
  // Hiro returns balance as 0x-prefixed hex of microSTX.
  return BigInt(data.balance ?? '0x0');
}

async function fetchSbtcBalance(address: string): Promise<bigint> {
  const [contractAddress, contractName] = SBTC_CONTRACT.split('.');
  const result = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: 'get-balance',
    functionArgs: [principalCV(address)],
    network: network(),
    senderAddress: address,
  });
  const json = cvToJSON(result);
  // SIP-010 returns (response uint uint) — unwrap the ok branch.
  const raw = json.value?.value ?? json.value ?? '0';
  return BigInt(raw);
}

/**
 * Read the connected wallet's spendable balance for a given token.
 * Returns balance in smallest units (microSTX for STX, sats for sBTC).
 */
export function useWalletBalance(tokenType: TokenType) {
  const { address } = useWallet();
  return useQuery({
    queryKey: ['wallet-balance', address, tokenType, STACKS_NETWORK],
    queryFn: async () => {
      if (!address) return 0n;
      return tokenType === TokenType.SBTC
        ? fetchSbtcBalance(address)
        : fetchStxBalance(address);
    },
    enabled: !!address,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * STX balance is needed alongside any sBTC tx because gas is paid in STX.
 * Convenience hook that returns it regardless of which token the user
 * selected for the escrow amount.
 */
export function useStxGasBalance() {
  const { address } = useWallet();
  return useQuery({
    queryKey: ['wallet-balance', address, 'stx-gas', STACKS_NETWORK],
    queryFn: () => (address ? fetchStxBalance(address) : 0n),
    enabled: !!address,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
