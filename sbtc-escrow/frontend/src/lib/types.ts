export enum EscrowStatus {
  Pending = 0,
  Released = 1,
  Refunded = 2,
  Disputed = 3,
  /** Seller signaled delivery on-chain. Available on escrow-v7+. */
  Delivered = 4,
}

export enum TokenType {
  STX = 0,
  SBTC = 1,
}

export interface Escrow {
  id: number;
  buyer: string;
  seller: string;
  amount: number; // microSTX or satoshis depending on tokenType
  feeAmount: number;
  tokenType: TokenType;
  description: string;
  status: EscrowStatus;
  createdAt: number; // block height
  expiresAt: number;
  completedAt: number | null;
  disputedAt: number | null;
  /** Block height at which the seller called deliver() (v7+). Null if never delivered. */
  deliveredAt?: number | null;
  txHash?: string;
  indexedAt?: string; // ISO timestamp from DB
  disputedBy?: string; // address that triggered the dispute
  /**
   * True for client-side optimistic placeholders that haven't been indexed
   * into Supabase yet. The contract hasn't confirmed the tx (or it has, but
   * the chainhook indexer hasn't caught up). `id` is a synthetic sentinel
   * (negative number) until the real row arrives and replaces this entry.
   */
  isPending?: boolean;
  /** When `isPending`, the on-chain status of the submitted tx. */
  pendingTxStatus?: 'submitted' | 'confirmed' | 'failed';
}

export interface EscrowEvent {
  id: string;
  escrowId: number;
  eventType:
    | 'escrow-created'
    | 'escrow-delivered'
    | 'escrow-released'
    | 'escrow-refunded'
    | 'escrow-disputed'
    | 'escrow-extended'
    | 'dispute-resolved-for-buyer'
    | 'dispute-resolved-for-seller'
    | 'dispute-resolved-split'
    | 'dispute-expired-resolved';
  actor: string;
  blockHeight: number;
  timestamp: string; // ISO
  metadata?: Record<string, unknown>;
}

export interface PlatformStats {
  totalEscrows: number;
  totalVolumeStx: number;
  totalVolumeSbtc: number;
  totalFeesStx: number;
  totalFeesSbtc: number;
  totalReleased: number; // count
  totalRefunded: number; // count
  activeDisputes: number; // count
  resolvedDisputes: number; // count
}

export interface PlatformConfig {
  owner: string;
  feeRecipient: string;
  platformFeeBps: number;
  isPaused: boolean;
  minAmount: number;
  maxAmount: number;
  minAmountSbtc: number;
  maxAmountSbtc: number;
  maxDuration: number;
  disputeTimeout: number; // blocks
}

export interface UserStats {
  totalLockedStx: number;
  totalLockedSbtc: number;
  activeEscrows: number;
  completedEscrows: number;
  asBuyer: number;
  asSeller: number;
}

export type StatusLabel = 'Pending' | 'Delivered' | 'Released' | 'Refunded' | 'Disputed';

export const STATUS_LABELS: Record<EscrowStatus, StatusLabel> = {
  [EscrowStatus.Pending]: 'Pending',
  [EscrowStatus.Delivered]: 'Delivered',
  [EscrowStatus.Released]: 'Released',
  [EscrowStatus.Refunded]: 'Refunded',
  [EscrowStatus.Disputed]: 'Disputed',
};
