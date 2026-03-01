/**
 * Stacks Network and Contract Configuration
 * 
 * This file contains all configuration for connecting to the Stacks blockchain
 * and interacting with the sBTC Escrow smart contract.
 */

import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

// Environment configuration
export const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet';
export const NETWORK = IS_MAINNET ? STACKS_MAINNET : STACKS_TESTNET;
export const NETWORK_STRING = IS_MAINNET ? 'mainnet' : 'testnet';

// Contract configuration
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N';
export const CONTRACT_NAME = import.meta.env.VITE_CONTRACT_NAME || 'escrow-v2';
export const CONTRACT_PRINCIPAL = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;

// API endpoints
export const API_BASE_URL = IS_MAINNET
  ? 'https://api.mainnet.hiro.so'
  : 'https://api.testnet.hiro.so';

export const EXPLORER_BASE_URL = IS_MAINNET
  ? 'https://explorer.stacks.co'
  : 'https://explorer.stacks.co/?chain=testnet';

// STX price (would normally fetch from API)
export const STX_PRICE_USD = 1.50;

// Escrow status codes (matching contract)
export enum EscrowStatus {
  PENDING = 0,
  RELEASED = 1,
  REFUNDED = 2,
  DISPUTED = 3,
}

export const STATUS_LABELS: Record<EscrowStatus, string> = {
  [EscrowStatus.PENDING]: 'Pending',
  [EscrowStatus.RELEASED]: 'Released',
  [EscrowStatus.REFUNDED]: 'Refunded',
  [EscrowStatus.DISPUTED]: 'Disputed',
};

export const STATUS_COLORS: Record<EscrowStatus, string> = {
  [EscrowStatus.PENDING]: 'warning',
  [EscrowStatus.RELEASED]: 'success',
  [EscrowStatus.REFUNDED]: 'info',
  [EscrowStatus.DISPUTED]: 'error',
};

// Utility functions
export function getExplorerTxUrl(txId: string): string {
  const cleanTxId = txId.startsWith('0x') ? txId : `0x${txId}`;
  return `${EXPLORER_BASE_URL}/txid/${cleanTxId}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${EXPLORER_BASE_URL}/address/${address}`;
}

export function getExplorerContractUrl(): string {
  return `${EXPLORER_BASE_URL}/address/${CONTRACT_PRINCIPAL}`;
}

// Convert microSTX to STX
export function microStxToStx(microStx: bigint | number): number {
  return Number(microStx) / 1_000_000;
}

// Convert STX to microSTX
export function stxToMicroStx(stx: number): bigint {
  return BigInt(Math.floor(stx * 1_000_000));
}

// Format STX amount for display
export function formatStx(microStx: bigint | number, decimals = 2): string {
  const stx = microStxToStx(microStx);
  return stx.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 6,
  });
}

// Format USD amount
export function formatUsd(stxAmount: number): string {
  const usd = stxAmount * STX_PRICE_USD;
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Truncate address for display
export function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

// Validate Stacks address
export function isValidStacksAddress(address: string): boolean {
  // Stacks addresses start with SP (mainnet) or ST (testnet)
  const regex = /^S[PT][0-9A-Z]{26,39}$/;
  return regex.test(address);
}

// Calculate platform fee (0.5% = 50 basis points)
export const PLATFORM_FEE_BPS = 50;

export function calculateFee(amountMicroStx: bigint): bigint {
  return (amountMicroStx * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
}

export function calculateTotal(amountMicroStx: bigint): bigint {
  return amountMicroStx + calculateFee(amountMicroStx);
}
