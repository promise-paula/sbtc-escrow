import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EscrowStatus, TokenType } from "./types";
import { STACKS_NETWORK, DEFAULT_MINUTES_PER_BLOCK, EXPLORER_BASE } from "./stacks-config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function microToSTX(micro: number): number {
  return micro / 1_000_000;
}

export function satsToBTC(sats: number): number {
  return sats / 100_000_000;
}

export function formatSTX(micro: number): string {
  return microToSTX(micro).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function formatSBTC(sats: number): string {
  return satsToBTC(sats).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
}

export function formatAmount(value: number, tokenType: TokenType): string {
  return tokenType === TokenType.SBTC ? formatSBTC(value) : formatSTX(value);
}

export function tokenLabel(tokenType: TokenType): string {
  return tokenType === TokenType.SBTC ? 'sBTC' : 'STX';
}

export function tokenDecimals(tokenType: TokenType): number {
  return tokenType === TokenType.SBTC ? 8 : 6;
}

export function toSmallestUnit(human: number, tokenType: TokenType): number {
  return Math.floor(human * (10 ** tokenDecimals(tokenType)));
}

export function formatUSD(micro: number, price = 0.85): string {
  const usd = microToSTX(micro) * price;
  return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ${hrs % 24}h ago`;
  return `${days}d ago`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function blocksToTime(blocks: number, minutesPerBlock = DEFAULT_MINUTES_PER_BLOCK): string {
  const minutes = Math.round(blocks * minutesPerBlock);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ${hours % 24}h`;
  return `${days}d`;
}

export function blockToEstimatedDate(blockHeight: number, currentBlock: number, minutesPerBlock = DEFAULT_MINUTES_PER_BLOCK): Date {
  const blockDiff = blockHeight - currentBlock;
  return new Date(Date.now() + blockDiff * minutesPerBlock * 60 * 1000);
}

export function calculateFee(amount: number, feeBps: number): number {
  return Math.floor((amount * feeBps) / 10_000);
}

export function isValidStacksAddress(address: string): boolean {
  return /^S[TPMN][A-Z0-9]{38,40}$/.test(address);
}

/**
 * Detect which Stacks network an address belongs to from its prefix.
 *   SP, SM → mainnet
 *   ST, SN → testnet
 * Returns null for malformed input.
 */
export function getAddressNetwork(address: string | null | undefined): 'mainnet' | 'testnet' | null {
  if (!address) return null;
  if (address.startsWith('SP') || address.startsWith('SM')) return 'mainnet';
  if (address.startsWith('ST') || address.startsWith('SN')) return 'testnet';
  return null;
}

export function getStatusColor(status: EscrowStatus): string {
  switch (status) {
    case EscrowStatus.Pending: return 'status-pending';
    case EscrowStatus.Released: return 'status-released';
    case EscrowStatus.Refunded: return 'status-refunded';
    case EscrowStatus.Disputed: return 'status-disputed';
  }
}

export function getExplorerUrl(type: 'tx' | 'address' | 'block', value: string): string {
  const pathSegment = type === 'tx' ? 'txid' : type;
  return `${EXPLORER_BASE}/${pathSegment}/${value}?chain=${STACKS_NETWORK}`;
}

// Mapped to escrow-v5.clar error constants. Keep in sync with the contract.
export const CONTRACT_ERRORS: Record<number, string> = {
  // Authorization
  1001: 'Not authorized for this action',
  1002: 'Contract is paused — try again later',
  1003: 'No pending ownership transfer',
  1004: 'You are not the pending owner',

  // Escrow lifecycle
  2001: 'Escrow not found',
  2002: 'Escrow already completed',
  2003: 'Escrow has expired',
  2004: 'Escrow has not yet expired',
  2005: 'Amount is outside the allowed range',
  2006: 'Duration is outside the allowed range',
  2007: 'Cannot create an escrow with yourself',
  2008: 'Dispute timeout not yet reached',
  2009: 'Escrow is not in dispute',
  2010: 'Extension would exceed the maximum duration',
  2011: 'Dispute timeout is outside the allowed range',
  2012: 'Invalid token type',

  // Transfer
  3001: 'Transfer failed',
  3002: 'Insufficient balance',
};
