// Network & contract configuration — all environment-driven for mainnet safety
export const STACKS_NETWORK = (import.meta.env.VITE_STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet';
export const STACKS_API_URL = import.meta.env.VITE_STACKS_API_URL ||
  (STACKS_NETWORK === 'mainnet' ? 'https://api.mainnet.hiro.so' : 'https://api.testnet.hiro.so');

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N';
export const CONTRACT_NAME = import.meta.env.VITE_CONTRACT_NAME || 'escrow-v4';
export const CONTRACT_PRINCIPAL = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;

export const SBTC_CONTRACT = (import.meta.env.VITE_SBTC_CONTRACT ||
  (STACKS_NETWORK === 'mainnet'
    ? 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-sbtc'  // mainnet sBTC
    : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token')) as `${string}.${string}`;  // testnet sBTC

// Post-Nakamoto: Stacks blocks are fast (~seconds); use useBlockRate() for live rate.
// This fallback is used when the API is unavailable.
export const DEFAULT_MINUTES_PER_BLOCK = 1.5;
export const DEFAULT_DISPUTE_TIMEOUT = 4_320; // on-chain constant (stacks-block-height based)
export const MAX_DISPUTE_TIMEOUT = 8_640; // on-chain constant
export const MIN_DISPUTE_TIMEOUT = 1;
export const MAX_FEE_BPS = 500; // 5%
export const MAX_DURATION_BLOCKS = 52_560; // on-chain MAX_DURATION constant

// Per-token amount bounds (from V4 contract constants)
export const MIN_AMOUNT_STX = 1_000; // 0.001 STX
export const MAX_AMOUNT_STX = 100_000_000_000_000; // 100M STX
export const MIN_AMOUNT_SBTC = 10_000; // 0.0001 BTC
export const MAX_AMOUNT_SBTC = 10_000_000_000; // 100 BTC

export const EXPLORER_BASE = 'https://explorer.hiro.so';
