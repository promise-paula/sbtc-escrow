/**
 * Shared Types for sBTC Escrow Frontend
 * 
 * These types bridge the contract data and UI components.
 */

import { EscrowStatus } from './stacks-config';

export type UserRole = 'buyer' | 'seller';

export interface EscrowDisplay {
  id: string | number;
  status: EscrowStatus;
  buyer: string;
  seller: string;
  amount: number; // in STX (not microSTX)
  usdValue?: number;
  description: string;
  expiresAt: number | bigint; // block height
  createdAt?: Date;
  userRole?: UserRole;
}

export interface DashboardStats {
  totalVolume: number;
  activeEscrows: number;
  completedEscrows: number;
}

// Convert escrow from service to display format
export function toEscrowDisplay(
  escrow: {
    id: number;
    buyer: string;
    seller: string;
    amount?: bigint;
    amountStx?: number;
    description: string;
    status: EscrowStatus;
    expiresAt: bigint;
  },
  userAddress?: string
): EscrowDisplay {
  // Determine user role
  let userRole: UserRole | undefined;
  if (userAddress) {
    if (escrow.buyer === userAddress) userRole = 'buyer';
    else if (escrow.seller === userAddress) userRole = 'seller';
  }

  return {
    id: escrow.id,
    status: escrow.status,
    buyer: escrow.buyer,
    seller: escrow.seller,
    amount: escrow.amountStx ?? Number(escrow.amount) / 1_000_000,
    description: escrow.description,
    expiresAt: escrow.expiresAt,
    userRole,
  };
}

// Status helpers
export function getStatusLabel(status: EscrowStatus): string {
  switch (status) {
    case EscrowStatus.PENDING:
      return 'Pending';
    case EscrowStatus.RELEASED:
      return 'Released';
    case EscrowStatus.REFUNDED:
      return 'Refunded';
    case EscrowStatus.DISPUTED:
      return 'Disputed';
    default:
      return 'Unknown';
  }
}

export function getStatusColor(status: EscrowStatus): 'warning' | 'success' | 'info' | 'error' {
  switch (status) {
    case EscrowStatus.PENDING:
      return 'warning';
    case EscrowStatus.RELEASED:
      return 'success';
    case EscrowStatus.REFUNDED:
      return 'info';
    case EscrowStatus.DISPUTED:
      return 'error';
    default:
      return 'info';
  }
}

export function isActiveStatus(status: EscrowStatus): boolean {
  return status === EscrowStatus.PENDING;
}

// Time helpers for block-based expiry
export function getBlockTimeRemaining(
  expiresAtBlock: number | bigint,
  currentBlock: number
): string {
  const targetBlock = Number(expiresAtBlock);
  const blocksRemaining = targetBlock - currentBlock;

  if (blocksRemaining <= 0) return 'Expired';

  // Assume ~10 minutes per block
  const minutesRemaining = blocksRemaining * 10;
  const hoursRemaining = Math.floor(minutesRemaining / 60);
  const daysRemaining = Math.floor(hoursRemaining / 24);

  if (daysRemaining > 0) {
    return `${daysRemaining}d ${hoursRemaining % 24}h remaining`;
  }
  if (hoursRemaining > 0) {
    return `${hoursRemaining}h ${minutesRemaining % 60}m remaining`;
  }
  return `${minutesRemaining}m remaining`;
}
