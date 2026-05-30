/**
 * sBTC Escrow SDK
 *
 * TypeScript SDK for the sBTC Escrow smart contracts on Stacks. Supports
 * STX (native) and sBTC (SIP-010) escrows across multiple contract versions:
 *
 *   • Mainnet: `escrow-mainnet-v3` (active), `escrow-mainnet-v2` (legacy)
 *   • Testnet: `escrow-v8` (active, v3-equivalent), `escrow-v7` (legacy)
 *
 * v3+ contracts add burn-block-anchored expiry, beneficiary delegation,
 * seller self-rescue, time-bounded admin pause, sweep-orphans, and
 * partial dispute resolution. The SDK auto-dispatches per-contract via
 * the `supportsV3Features()` capability registry — code paths that only
 * apply to v3 (e.g. `resolveExpiredDisputeForSeller`, `sweepOrphans`)
 * short-circuit when called against a legacy contract.
 *
 * @packageDocumentation
 */

// Main client
export { EscrowClient, supportsV3Features } from './client';

// Types
export {
  EscrowStatus,
  TokenType,
  NetworkType,
  EscrowConfig,
  Escrow,
  UserStats,
  PlatformStats,
  CreateEscrowOptions,
  EscrowClientConfig,
  SignedTxOptions,
  BroadcastResult,
  TxResult,
} from './types';

// Re-export useful stacks types for convenience
export type { ClarityValue } from '@stacks/transactions';
