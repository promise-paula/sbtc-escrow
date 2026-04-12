export const STACKS_NETWORK = 'testnet' as const;
export const STACKS_API_URL = 'https://api.testnet.hiro.so';

export const CONTRACT_ADDRESS = 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N';
export const CONTRACT_NAME = 'escrow-v3';
export const CONTRACT_PRINCIPAL = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`;

export const BLOCKS_PER_DAY = 144;
export const BLOCKS_PER_WEEK = 1_008;
export const DEFAULT_DISPUTE_TIMEOUT = 4_320; // ~30 days
export const MAX_DISPUTE_TIMEOUT = 8_640; // ~60 days
export const MIN_DISPUTE_TIMEOUT = 1;
export const MAX_FEE_BPS = 500; // 5%
export const MAX_DURATION_BLOCKS = 52_560; // ~365 days

export const EXPLORER_BASE = 'https://explorer.stacks.co';
