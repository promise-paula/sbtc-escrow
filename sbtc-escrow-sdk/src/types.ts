/**
 * sBTC Escrow SDK — public types.
 *
 * Mirrors the on-chain shape of:
 * - escrow-v8 (testnet, current default — v3-equivalent: burn-block timing,
 *   beneficiary delegation, seller self-rescue, time-bounded pause, sweep-orphans)
 * - escrow-mainnet-v3 (mainnet, current default — same v3 feature set)
 * - escrow-v7 / escrow-mainnet-v2 (legacy v7+: DELIVERED status, review window,
 *   partial dispute splits)
 * - escrow-v6 / escrow-mainnet (legacy pre-v7, still readable)
 *
 * Methods/fields specific to v3+ are marked. Use `supportsV3Features(contractId)`
 * at runtime to gate them.
 */

/**
 * Escrow status enum matching contract constants.
 *
 * `DELIVERED` (u4) is only emitted by escrow-v7+. Earlier contracts will never
 * return this value.
 */
export enum EscrowStatus {
  PENDING = 0,
  RELEASED = 1,
  REFUNDED = 2,
  DISPUTED = 3,
  /** Seller has signaled delivery on-chain. Available on escrow-v7+ only. */
  DELIVERED = 4,
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
  /**
   * Post-delivery review window in blocks. While inside this window after a
   * seller calls `deliver()`, the buyer cannot unilaterally refund.
   * Only present on escrow-v7+; `undefined` when reading older deployments.
   */
  reviewPeriod?: number;
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
  /**
   * Block height when the seller signaled delivery via `deliver()`.
   * Only set on escrow-v7+; `null` when reading older deployments or before
   * delivery has been signaled.
   */
  deliveredAt: number | null;
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
  /**
   * Duration in blocks.
   *
   * On v3+ contracts (`escrow-mainnet-v3`, etc.) this is interpreted as
   * **burn blocks** (Bitcoin chain, ~144 per day, stable). On v2 and earlier
   * it is interpreted as **Stacks blocks** (variable rate). The SDK does not
   * translate between the two — pass the value appropriate for the target
   * contract. See `usesBurnBlockClock()` if you need to dispatch dynamically.
   */
  durationBlocks: number;
  tokenType: TokenType;
  /**
   * Optional secondary authority on the escrow.
   *
   * **v3+ only.** If set on a v3+ contract, the beneficiary has the same
   * release / refund / dispute / extend rights as the buyer. Useful for
   * integrators (marketplaces, payment processors) that wrap `createEscrow`
   * on behalf of an end-user — pass the end-user as `beneficiary` so they
   * retain agency over their own escrow.
   *
   * Passing this on a non-v3 contract throws at call time. Cannot equal
   * `seller` (would muddy authorization) or the buyer (redundant).
   */
  beneficiary?: string;
}

/** Options for EscrowClient constructor */
export interface EscrowClientConfig {
  /** Contract address (default: testnet deployment) */
  contractAddress?: string;
  /** Contract name (default: escrow-v7 on testnet, escrow-mainnet-v2 on mainnet) */
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
