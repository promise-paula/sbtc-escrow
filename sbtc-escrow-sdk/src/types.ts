/**
 * sBTC Escrow SDK — public types.
 * Mirrors the on-chain shape of escrow-v6 (testnet) / escrow-mainnet (mainnet).
 */

/** Escrow status enum matching contract constants */
export enum EscrowStatus {
  PENDING = 0,
  RELEASED = 1,
  REFUNDED = 2,
  DISPUTED = 3,
}

/** Token type enum matching contract constants (u0 = STX, u1 = sBTC) */
export enum TokenType {
  STX = 0,
  SBTC = 1,
}

/** Network type for contract interactions */
export type NetworkType = 'mainnet' | 'testnet';

/** Contract configuration returned by `get-config` (per-token amount bounds). */
export interface EscrowConfig {
  owner: string;
  feeRecipient: string;
  platformFeeBps: number;
  isPaused: boolean;
  minAmountStx: number;
  maxAmountStx: number;
  minAmountSbtc: number;
  maxAmountSbtc: number;
  maxDuration: number;
  disputeTimeout: number;
}

/** Escrow data returned by `get-escrow`. */
export interface Escrow {
  id: number;
  buyer: string;
  seller: string;
  amount: number;
  feeAmount: number;
  tokenType: TokenType;
  description: string;
  status: EscrowStatus;
  createdAt: number;
  expiresAt: number;
  completedAt: number | null;
  disputedAt: number | null;
}

/** Per-user statistics returned by `get-user-stats` (counts + per-token totals). */
export interface UserStats {
  escrowsCreated: number;
  escrowsReceived: number;
  totalSentStx: number;
  totalSentSbtc: number;
  totalReceivedStx: number;
  totalReceivedSbtc: number;
}

/** Platform-wide statistics returned by `get-platform-stats` (per-token volumes & fees). */
export interface PlatformStats {
  totalEscrows: number;
  totalVolumeStx: number;
  totalVolumeSbtc: number;
  totalFeesCollectedStx: number;
  totalFeesCollectedSbtc: number;
  totalReleased: number;
  totalRefunded: number;
  activeDisputes: number;
}

/** Options for `EscrowClient.createEscrow`. */
export interface CreateEscrowOptions {
  seller: string;
  amount: number;
  description: string;
  durationBlocks: number;
  tokenType: TokenType;
}

/** Options for EscrowClient constructor */
export interface EscrowClientConfig {
  /** Contract address (default: testnet deployment) */
  contractAddress?: string;
  /** Contract name (default: escrow-v6 on testnet, escrow-mainnet on mainnet) */
  contractName?: string;
  /** sBTC SIP-010 contract principal (default: per-network) */
  sbtcContract?: string;
  /** Network type */
  network: NetworkType;
  /** Stacks API URL (optional, uses default for network) */
  apiUrl?: string;
}

/** Transaction result */
export interface TxResult {
  txid: string;
  success: boolean;
  error?: string;
}

/** Signed transaction options for write operations */
export interface SignedTxOptions {
  /** Sender's private key (hex string) */
  senderKey: string;
  /** Fee in microSTX (optional, uses estimate) */
  fee?: number;
  /** Nonce (optional, uses account nonce) */
  nonce?: number;
}

/** Broadcast transaction result */
export interface BroadcastResult {
  txid: string;
  success: boolean;
  error?: string;
  rawResult?: any;
}
