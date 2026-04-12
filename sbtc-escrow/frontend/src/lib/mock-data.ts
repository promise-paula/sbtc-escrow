import { Escrow, EscrowEvent, EscrowStatus, PlatformConfig, PlatformStats, UserStats } from './types';

const CURRENT_BLOCK = 156_200;

export const MOCK_WALLET = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
export const MOCK_ADMIN = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

export const mockConfig: PlatformConfig = {
  owner: MOCK_ADMIN,
  feeRecipient: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
  platformFeeBps: 50,
  isPaused: false,
  minAmount: 1_000_000, // 1 STX
  maxAmount: 100_000_000_000, // 100,000 STX
  maxDuration: 52_560, // ~365 days
  disputeTimeout: 4_320, // ~30 days
};

export const mockEscrows: Escrow[] = [
  {
    id: 1,
    buyer: MOCK_WALLET,
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 50_000_000,
    feeAmount: 250_000,
    description: 'Logo design for sBTC marketplace',
    status: EscrowStatus.Pending,
    createdAt: CURRENT_BLOCK - 200,
    expiresAt: CURRENT_BLOCK + 4_000,
    completedAt: null,
    disputedAt: null,
  },
  {
    id: 2,
    buyer: 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC',
    seller: MOCK_WALLET,
    amount: 150_000_000,
    feeAmount: 750_000,
    description: 'Smart contract audit for DeFi protocol',
    status: EscrowStatus.Released,
    createdAt: CURRENT_BLOCK - 2_000,
    expiresAt: CURRENT_BLOCK - 500,
    completedAt: CURRENT_BLOCK - 800,
    disputedAt: null,
    txHash: '0xabc123def456',
  },
  {
    id: 3,
    buyer: MOCK_WALLET,
    seller: 'ST3NBRSFKX28FQ2ZJ1MAKPH2VMMSP119H72PPMP3',
    amount: 25_000_000,
    feeAmount: 125_000,
    description: 'Website development milestone 1',
    status: EscrowStatus.Refunded,
    createdAt: CURRENT_BLOCK - 5_000,
    expiresAt: CURRENT_BLOCK - 3_000,
    completedAt: CURRENT_BLOCK - 3_200,
    disputedAt: null,
  },
  {
    id: 4,
    buyer: 'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0',
    seller: MOCK_WALLET,
    amount: 500_000_000,
    feeAmount: 2_500_000,
    description: 'NFT collection development and deployment',
    status: EscrowStatus.Disputed,
    createdAt: CURRENT_BLOCK - 3_000,
    expiresAt: CURRENT_BLOCK + 1_000,
    completedAt: null,
    disputedAt: CURRENT_BLOCK - 1_000,
  },
  {
    id: 5,
    buyer: MOCK_WALLET,
    seller: 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB',
    amount: 10_000_000,
    feeAmount: 50_000,
    description: 'Content writing for blog posts',
    status: EscrowStatus.Pending,
    createdAt: CURRENT_BLOCK - 50,
    expiresAt: CURRENT_BLOCK + 8_000,
    completedAt: null,
    disputedAt: null,
  },
  {
    id: 6,
    buyer: 'ST18MDW2PDTBSCR1ACXYRG6MMPZVFMCTPVT6YC9MX',
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 75_000_000,
    feeAmount: 375_000,
    description: 'UI/UX design for mobile wallet',
    status: EscrowStatus.Disputed,
    createdAt: CURRENT_BLOCK - 6_000,
    expiresAt: CURRENT_BLOCK - 1_000,
    completedAt: null,
    disputedAt: CURRENT_BLOCK - 4_500, // near timeout
  },
  {
    id: 7,
    buyer: MOCK_WALLET,
    seller: 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ',
    amount: 200_000_000,
    feeAmount: 1_000_000,
    description: 'sBTC integration consulting',
    status: EscrowStatus.Released,
    createdAt: CURRENT_BLOCK - 10_000,
    expiresAt: CURRENT_BLOCK - 6_000,
    completedAt: CURRENT_BLOCK - 7_000,
    disputedAt: null,
    txHash: '0xdef789abc012',
  },
];

export const mockPlatformStats: PlatformStats = {
  totalEscrows: 142,
  totalVolume: 15_750_000_000,
  totalFeesCollected: 78_750_000,
  totalReleased: 98,
  totalRefunded: 31,
  activeDisputes: 4,
};

export const mockUserStats: UserStats = {
  totalLocked: 60_000_000,
  activeEscrows: 2,
  completedEscrows: 3,
  asBuyer: 4,
  asSeller: 3,
};

export const mockEvents: EscrowEvent[] = [
  {
    id: 'evt-1',
    escrowId: 5,
    eventType: 'created',
    actor: MOCK_WALLET,
    blockHeight: CURRENT_BLOCK - 50,
    timestamp: new Date(Date.now() - 50 * 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-2',
    escrowId: 4,
    eventType: 'disputed',
    actor: 'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0',
    blockHeight: CURRENT_BLOCK - 1_000,
    timestamp: new Date(Date.now() - 1000 * 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-3',
    escrowId: 2,
    eventType: 'released',
    actor: 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC',
    blockHeight: CURRENT_BLOCK - 800,
    timestamp: new Date(Date.now() - 800 * 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-4',
    escrowId: 3,
    eventType: 'refunded',
    actor: MOCK_WALLET,
    blockHeight: CURRENT_BLOCK - 3_200,
    timestamp: new Date(Date.now() - 3200 * 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-5',
    escrowId: 1,
    eventType: 'created',
    actor: MOCK_WALLET,
    blockHeight: CURRENT_BLOCK - 200,
    timestamp: new Date(Date.now() - 200 * 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-6',
    escrowId: 7,
    eventType: 'released',
    actor: MOCK_WALLET,
    blockHeight: CURRENT_BLOCK - 7_000,
    timestamp: new Date(Date.now() - 7000 * 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-7',
    escrowId: 6,
    eventType: 'disputed',
    actor: 'ST18MDW2PDTBSCR1ACXYRG6MMPZVFMCTPVT6YC9MX',
    blockHeight: CURRENT_BLOCK - 4_500,
    timestamp: new Date(Date.now() - 4500 * 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-8',
    escrowId: 1,
    eventType: 'extended',
    actor: MOCK_WALLET,
    blockHeight: CURRENT_BLOCK - 100,
    timestamp: new Date(Date.now() - 100 * 10 * 60 * 1000).toISOString(),
    metadata: { newExpiresAt: CURRENT_BLOCK + 4_000, previousExpiresAt: CURRENT_BLOCK + 2_000 },
  },
];

export const CURRENT_BLOCK_HEIGHT = CURRENT_BLOCK;

export interface MonthlyAnalytics {
  month: string;
  volume: number;
  escrowCount: number;
  feesCollected: number;
  released: number;
  refunded: number;
  disputed: number;
}

export const mockMonthlyAnalytics: MonthlyAnalytics[] = [
  { month: 'May', volume: 820_000_000, escrowCount: 8, feesCollected: 4_100_000, released: 5, refunded: 2, disputed: 1 },
  { month: 'Jun', volume: 1_150_000_000, escrowCount: 11, feesCollected: 5_750_000, released: 7, refunded: 3, disputed: 1 },
  { month: 'Jul', volume: 950_000_000, escrowCount: 9, feesCollected: 4_750_000, released: 6, refunded: 2, disputed: 1 },
  { month: 'Aug', volume: 1_400_000_000, escrowCount: 14, feesCollected: 7_000_000, released: 9, refunded: 3, disputed: 2 },
  { month: 'Sep', volume: 1_100_000_000, escrowCount: 10, feesCollected: 5_500_000, released: 7, refunded: 2, disputed: 1 },
  { month: 'Oct', volume: 1_650_000_000, escrowCount: 15, feesCollected: 8_250_000, released: 10, refunded: 3, disputed: 2 },
  { month: 'Nov', volume: 1_300_000_000, escrowCount: 12, feesCollected: 6_500_000, released: 8, refunded: 3, disputed: 1 },
  { month: 'Dec', volume: 900_000_000, escrowCount: 8, feesCollected: 4_500_000, released: 5, refunded: 2, disputed: 1 },
  { month: 'Jan', volume: 1_500_000_000, escrowCount: 13, feesCollected: 7_500_000, released: 9, refunded: 3, disputed: 1 },
  { month: 'Feb', volume: 1_750_000_000, escrowCount: 16, feesCollected: 8_750_000, released: 11, refunded: 3, disputed: 2 },
  { month: 'Mar', volume: 1_980_000_000, escrowCount: 14, feesCollected: 9_900_000, released: 10, refunded: 3, disputed: 1 },
  { month: 'Apr', volume: 1_250_000_000, escrowCount: 12, feesCollected: 6_250_000, released: 8, refunded: 3, disputed: 1 },
];
