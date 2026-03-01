/**
 * Escrow Service - Contract Interaction Layer
 * 
 * Provides methods to interact with the sBTC Escrow smart contract.
 * Uses @stacks/transactions for read-only calls and @stacks/connect for transactions.
 */

import {
  fetchCallReadOnlyFunction,
  cvToValue,
  uintCV,
  principalCV,
  stringUtf8CV,
  Cl,
} from '@stacks/transactions';
import { request } from '@stacks/connect';
import type { TransactionResult } from '@stacks/connect/dist/types/methods';
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  CONTRACT_PRINCIPAL,
  NETWORK,
  NETWORK_STRING,
  EscrowStatus,
  microStxToStx,
  stxToMicroStx,
} from './stacks-config';

// Types
export interface Escrow {
  id: number;
  buyer: string;
  seller: string;
  amount: bigint; // in microSTX
  amountStx: number; // in STX for display
  description: string;
  status: EscrowStatus;
  expiresAt: bigint; // block height
  createdAt?: number; // timestamp if available
}

export interface PlatformConfig {
  admin: string;
  platformFeeBps: bigint;
  escrowExpiry: bigint;
  isPaused: boolean;
}

export interface PlatformStats {
  totalEscrows: bigint;
  activeEscrows: bigint;
  totalVolume: bigint;
  totalFeesCollected: bigint;
  totalReleased: bigint;
  totalRefunded: bigint;
}

export interface UserStats {
  escrowsCreated: bigint;
  escrowsReceived: bigint;
  totalSent: bigint;
  totalReceived: bigint;
}

// Helper to call read-only functions
async function callReadOnly<T>(
  functionName: string,
  functionArgs: any[] = [],
  senderAddress?: string
): Promise<T> {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName,
      functionArgs,
      network: NETWORK,
      senderAddress: senderAddress || CONTRACT_ADDRESS,
    });
    return cvToValue(result) as T;
  } catch (error) {
    console.error(`Contract call failed: ${functionName}`, error);
    throw error;
  }
}

// =============================================================================
// READ-ONLY FUNCTIONS
// =============================================================================

/**
 * Get the current escrow count
 */
export async function getEscrowCount(): Promise<number> {
  try {
    const result = await callReadOnly<bigint | number | string>('get-escrow-count');
    console.log('[escrow-service] get-escrow-count result:', result, typeof result);
    return Number(result);
  } catch (error) {
    console.error('[escrow-service] getEscrowCount failed:', error);
    // Return 0 if contract call fails (e.g., contract not deployed)
    return 0;
  }
}

/**
 * Get escrow by ID
 */
export async function getEscrow(id: number): Promise<Escrow | null> {
  try {
    const result = await callReadOnly<any>('get-escrow', [uintCV(id)]);
    console.log(`[escrow-service] get-escrow(${id}) raw result:`, result);

    // Handle optional (some/none) response
    if (!result) {
      return null;
    }

    // cvToValue converts (some {...}) to { value: {...} } and (none) to null
    const data = result.value ?? result;
    
    if (!data || !data.buyer) {
      console.log(`[escrow-service] Escrow ${id} not found or invalid data`);
      return null;
    }

    return {
      id,
      buyer: data.buyer,
      seller: data.seller,
      amount: BigInt(data.amount || 0),
      amountStx: microStxToStx(data.amount || 0),
      description: data.description || '',
      status: Number(data.status ?? 0) as EscrowStatus,
      expiresAt: BigInt(data['expires-at'] || 0),
    };
  } catch (error) {
    console.error(`[escrow-service] getEscrow(${id}) failed:`, error);
    return null;
  }
}

/**
 * Get platform configuration
 */
export async function getConfig(): Promise<PlatformConfig> {
  const result = await callReadOnly<any>('get-config');
  return {
    admin: result.admin,
    platformFeeBps: BigInt(result['platform-fee-bps']),
    escrowExpiry: BigInt(result['escrow-expiry']),
    isPaused: result['is-paused'],
  };
}

/**
 * Get platform statistics
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const result = await callReadOnly<any>('get-platform-stats');
    console.log('[escrow-service] get-platform-stats result:', result);
    return {
      totalEscrows: BigInt(result?.['total-escrows'] ?? 0),
      activeEscrows: BigInt(result?.['active-escrows'] ?? 0),
      totalVolume: BigInt(result?.['total-volume'] ?? 0),
      totalFeesCollected: BigInt(result?.['total-fees-collected'] ?? 0),
      totalReleased: BigInt(result?.['total-released'] ?? 0),
      totalRefunded: BigInt(result?.['total-refunded'] ?? 0),
    };
  } catch (error) {
    console.error('[escrow-service] getPlatformStats failed:', error);
    return {
      totalEscrows: BigInt(0),
      activeEscrows: BigInt(0),
      totalVolume: BigInt(0),
      totalFeesCollected: BigInt(0),
      totalReleased: BigInt(0),
      totalRefunded: BigInt(0),
    };
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(address: string): Promise<UserStats> {
  try {
    const result = await callReadOnly<any>('get-user-stats', [
      principalCV(address),
    ]);
    console.log('[escrow-service] get-user-stats result:', result);
    return {
      escrowsCreated: BigInt(result?.['escrows-created'] ?? 0),
      escrowsReceived: BigInt(result?.['escrows-received'] ?? 0),
      totalSent: BigInt(result?.['total-sent'] ?? 0),
      totalReceived: BigInt(result?.['total-received'] ?? 0),
    };
  } catch (error) {
    console.error('[escrow-service] getUserStats failed:', error);
    return {
      escrowsCreated: BigInt(0),
      escrowsReceived: BigInt(0),
      totalSent: BigInt(0),
      totalReceived: BigInt(0),
    };
  }
}

/**
 * Calculate escrow fee for an amount
 */
export async function calculateEscrowFee(amountMicroStx: bigint): Promise<bigint> {
  const result = await callReadOnly<bigint>('calculate-escrow-fee', [
    uintCV(amountMicroStx),
  ]);
  return BigInt(result);
}

/**
 * Get all escrows for a user (buyer or seller)
 */
export async function getUserEscrows(address: string): Promise<Escrow[]> {
  try {
    const count = await getEscrowCount();
    console.log(`[escrow-service] Escrow count: ${count}, fetching for address: ${address}`);
    
    if (count === 0) {
      return [];
    }
    
    const escrows: Escrow[] = [];

    // Fetch all escrows and filter by user
    // Note: In production, use an indexer for better performance
    for (let i = 1; i <= count; i++) {
      try {
        const escrow = await getEscrow(i);
        if (escrow && (escrow.buyer === address || escrow.seller === address)) {
          escrows.push(escrow);
        }
      } catch (err) {
        console.warn(`[escrow-service] Failed to fetch escrow ${i}:`, err);
        // Continue to next escrow
      }
    }

    return escrows;
  } catch (error) {
    console.error('[escrow-service] getUserEscrows failed:', error);
    throw error;
  }
}

/**
 * Get user's role in an escrow
 */
export function getUserRole(escrow: Escrow, userAddress: string): 'buyer' | 'seller' | null {
  if (escrow.buyer === userAddress) return 'buyer';
  if (escrow.seller === userAddress) return 'seller';
  return null;
}

/**
 * Get all escrows (for activity page)
 */
export async function getAllEscrows(): Promise<Escrow[]> {
  try {
    const count = await getEscrowCount();
    console.log(`[escrow-service] Fetching all ${count} escrows`);
    
    if (count === 0) {
      return [];
    }
    
    const escrows: Escrow[] = [];

    // Fetch all escrows
    // Note: In production, use an indexer for better performance
    for (let i = 1; i <= count; i++) {
      try {
        const escrow = await getEscrow(i);
        if (escrow) {
          escrows.push(escrow);
        }
      } catch (err) {
        console.warn(`[escrow-service] Failed to fetch escrow ${i}:`, err);
        // Continue to next escrow
      }
    }

    return escrows;
  } catch (error) {
    console.error('[escrow-service] getAllEscrows failed:', error);
    throw error;
  }
}

// =============================================================================
// TRANSACTION FUNCTIONS
// =============================================================================

/**
 * Create a new escrow
 */
export async function createEscrow(
  sellerAddress: string,
  amountStx: number,
  description: string
): Promise<TransactionResult> {
  const amountMicroStx = stxToMicroStx(amountStx);
  
  const result: TransactionResult = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'create-escrow',
    functionArgs: [
      Cl.principal(sellerAddress),
      Cl.uint(amountMicroStx),
      Cl.stringUtf8(description),
    ],
    network: NETWORK_STRING,
    postConditionMode: 'allow', // TODO: Add proper post-conditions
  });

  return result;
}

/**
 * Release escrow funds to seller (buyer only)
 */
export async function releaseEscrow(escrowId: number): Promise<TransactionResult> {
  const result: TransactionResult = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'release-escrow',
    functionArgs: [Cl.uint(escrowId)],
    network: NETWORK_STRING,
    postConditionMode: 'allow',
  });

  return result;
}

/**
 * Refund escrow to buyer (seller only, after expiry)
 */
export async function refundEscrow(escrowId: number): Promise<TransactionResult> {
  const result: TransactionResult = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'refund-escrow',
    functionArgs: [Cl.uint(escrowId)],
    network: NETWORK_STRING,
    postConditionMode: 'allow',
  });

  return result;
}

/**
 * Dispute an escrow (buyer or seller)
 */
export async function disputeEscrow(escrowId: number): Promise<TransactionResult> {
  const result: TransactionResult = await request('stx_callContract', {
    contract: CONTRACT_PRINCIPAL,
    functionName: 'dispute-escrow',
    functionArgs: [Cl.uint(escrowId)],
    network: NETWORK_STRING,
    postConditionMode: 'allow',
  });

  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if an escrow is expired based on current block height
 * Note: This requires fetching current block height from the network
 */
export async function isEscrowExpired(escrow: Escrow): Promise<boolean> {
  try {
    const response = await fetch(`${NETWORK.client.baseUrl}/v2/info`);
    const info = await response.json();
    const currentHeight = BigInt(info.stacks_tip_height);
    return currentHeight >= escrow.expiresAt;
  } catch (error) {
    console.error('Failed to check escrow expiry:', error);
    return false;
  }
}

/**
 * Get current block height
 */
export async function getCurrentBlockHeight(): Promise<number> {
  const response = await fetch(`${NETWORK.client.baseUrl}/v2/info`);
  const info = await response.json();
  return info.stacks_tip_height;
}

/**
 * Estimate time until block height (assuming ~10 min per block)
 */
export function estimateTimeToBlock(targetBlock: bigint, currentBlock: number): string {
  const blocksRemaining = Number(targetBlock) - currentBlock;
  if (blocksRemaining <= 0) return 'Expired';

  const minutesRemaining = blocksRemaining * 10; // ~10 min per block
  const hoursRemaining = Math.floor(minutesRemaining / 60);
  const daysRemaining = Math.floor(hoursRemaining / 24);

  if (daysRemaining > 0) {
    return `${daysRemaining}d ${hoursRemaining % 24}h`;
  }
  if (hoursRemaining > 0) {
    return `${hoursRemaining}h ${minutesRemaining % 60}m`;
  }
  return `${minutesRemaining}m`;
}
