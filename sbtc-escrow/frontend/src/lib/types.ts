export enum EscrowStatus {
  Pending = 0,
  Released = 1,
  Refunded = 2,
  Disputed = 3,
}

export interface Escrow {
  id: number;
  buyer: string;
  seller: string;
  amount: number; // microSTX
  feeAmount: number;
  description: string;
  status: EscrowStatus;
  createdAt: number; // block height
  expiresAt: number;
  completedAt: number | null;
  disputedAt: number | null;
  txHash?: string;
}

export interface EscrowEvent {
  id: string;
  escrowId: number;
  eventType: 'created' | 'released' | 'refunded' | 'disputed' | 'dispute-resolved' | 'dispute-timeout-resolved' | 'extended' | 'expired';
  actor: string;
  blockHeight: number;
  timestamp: string; // ISO
  metadata?: Record<string, unknown>;
}

export interface PlatformStats {
  totalEscrows: number;
  totalVolume: number; // microSTX
  totalFeesCollected: number;
  totalReleased: number; // count
  totalRefunded: number; // count
  activeDisputes: number; // count
}

export interface PlatformConfig {
  owner: string;
  feeRecipient: string;
  platformFeeBps: number;
  isPaused: boolean;
  minAmount: number;
  maxAmount: number;
  maxDuration: number;
  disputeTimeout: number; // blocks
}

export interface UserStats {
  totalLocked: number;
  activeEscrows: number;
  completedEscrows: number;
  asBuyer: number;
  asSeller: number;
}

export type StatusLabel = 'Pending' | 'Released' | 'Refunded' | 'Disputed';

export const STATUS_LABELS: Record<EscrowStatus, StatusLabel> = {
  [EscrowStatus.Pending]: 'Pending',
  [EscrowStatus.Released]: 'Released',
  [EscrowStatus.Refunded]: 'Refunded',
  [EscrowStatus.Disputed]: 'Disputed',
};
