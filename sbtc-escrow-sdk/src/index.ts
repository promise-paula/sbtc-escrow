/**
 * sBTC Escrow SDK
 *
 * TypeScript SDK for the sBTC Escrow smart contract on Stacks. Targets
 * `escrow-v6` on testnet and `escrow-mainnet` on mainnet. Supports both STX
 * (native) and sBTC (SIP-010) escrows.
 *
 * @packageDocumentation
 */

// Main client
export { EscrowClient } from './client';

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
