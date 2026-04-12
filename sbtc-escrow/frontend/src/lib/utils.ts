import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EscrowStatus, TokenType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ~10 minutes per block on Stacks
const MINUTES_PER_BLOCK = 10;

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

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function blocksToTime(blocks: number): string {
  const minutes = blocks * MINUTES_PER_BLOCK;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ${hours % 24}h`;
  return `${days}d`;
}

export function blockToEstimatedDate(blockHeight: number, currentBlock: number): Date {
  const blockDiff = blockHeight - currentBlock;
  return new Date(Date.now() + blockDiff * MINUTES_PER_BLOCK * 60 * 1000);
}

export function calculateFee(amount: number, feeBps: number): number {
  return Math.floor((amount * feeBps) / 10_000);
}

export function isValidStacksAddress(address: string): boolean {
  return /^S[TPM][A-Z0-9]{38,40}$/.test(address);
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
  return `https://explorer.stacks.co/${type}/${value}?chain=testnet`;
}

export const CONTRACT_ERRORS: Record<number, string> = {
  1001: 'Not authorized',
  1002: 'Contract is paused',
  1003: 'Invalid fee configuration',
  2001: 'Invalid amount',
  2002: 'Invalid duration',
  2003: 'Cannot escrow to yourself',
  2004: 'Description cannot be empty',
  2005: 'Escrow not found',
  2006: 'Escrow already completed',
  2007: 'Not a party to this escrow',
  2008: 'Escrow not expired',
  2009: 'Escrow has expired',
  2010: 'Escrow not in dispute',
  2011: 'Dispute timeout not reached',
  3001: 'Transfer failed',
  3002: 'Already disputed',
};
