export type EscrowStatus = "pending" | "active" | "released" | "refunded" | "disputed" | "expired";
export type UserRole = "buyer" | "seller";

export interface EscrowEvent {
  id: string;
  type: "created" | "funded" | "released" | "disputed" | "refunded" | "expired";
  timestamp: Date;
  description: string;
  txId?: string;
}

export interface Escrow {
  id: string;
  status: EscrowStatus;
  buyerAddress: string;
  sellerAddress: string;
  amount: number; // in STX
  usdValue: number;
  description: string;
  createdAt: Date;
  expiresAt: Date;
  userRole: UserRole;
  events: EscrowEvent[];
}

export const STX_PRICE_USD = 1.42;

export const MOCK_WALLET_ADDRESS = "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7";

export const MOCK_ESCROWS: Escrow[] = [
  {
    id: "ESC-001",
    status: "active",
    buyerAddress: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    sellerAddress: "SP1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE",
    amount: 25000,
    usdValue: 35500,
    description: "NFT Collection Purchase — CryptoPunks derivative set",
    createdAt: new Date("2026-02-18T10:30:00"),
    expiresAt: new Date("2026-02-25T10:30:00"),
    userRole: "buyer",
    events: [
      { id: "e1", type: "created", timestamp: new Date("2026-02-18T10:30:00"), description: "Escrow created by buyer" },
      { id: "e2", type: "funded", timestamp: new Date("2026-02-18T10:32:00"), description: "25,000 STX deposited", txId: "0xabc123" },
    ],
  },
  {
    id: "ESC-002",
    status: "pending",
    buyerAddress: "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
    sellerAddress: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    amount: 8500,
    usdValue: 12070,
    description: "Smart Contract Audit — DeFi Protocol v2",
    createdAt: new Date("2026-02-19T14:15:00"),
    expiresAt: new Date("2026-03-05T14:15:00"),
    userRole: "seller",
    events: [
      { id: "e3", type: "created", timestamp: new Date("2026-02-19T14:15:00"), description: "Escrow created by buyer" },
    ],
  },
  {
    id: "ESC-003",
    status: "released",
    buyerAddress: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    sellerAddress: "SPNWZ5V2TPWGQGVDR6T7B6RQ4XMGZ4PXTEE0VQ0S",
    amount: 50000,
    usdValue: 71000,
    description: "DAO Treasury Management Setup",
    createdAt: new Date("2026-02-10T09:00:00"),
    expiresAt: new Date("2026-02-20T09:00:00"),
    userRole: "buyer",
    events: [
      { id: "e4", type: "created", timestamp: new Date("2026-02-10T09:00:00"), description: "Escrow created by buyer" },
      { id: "e5", type: "funded", timestamp: new Date("2026-02-10T09:05:00"), description: "50,000 STX deposited", txId: "0xdef456" },
      { id: "e6", type: "released", timestamp: new Date("2026-02-17T16:20:00"), description: "Funds released to seller", txId: "0xghi789" },
    ],
  },
  {
    id: "ESC-004",
    status: "disputed",
    buyerAddress: "SP2C2YFP12AJZB1MADFWKX5Q4RAP3PCR7T3HKGGXC",
    sellerAddress: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    amount: 15000,
    usdValue: 21300,
    description: "Website Development — E-commerce Platform",
    createdAt: new Date("2026-02-05T11:00:00"),
    expiresAt: new Date("2026-02-19T11:00:00"),
    userRole: "seller",
    events: [
      { id: "e7", type: "created", timestamp: new Date("2026-02-05T11:00:00"), description: "Escrow created by buyer" },
      { id: "e8", type: "funded", timestamp: new Date("2026-02-05T11:10:00"), description: "15,000 STX deposited", txId: "0xjkl012" },
      { id: "e9", type: "disputed", timestamp: new Date("2026-02-15T08:30:00"), description: "Dispute raised by buyer" },
    ],
  },
  {
    id: "ESC-005",
    status: "refunded",
    buyerAddress: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    sellerAddress: "SP1K1A1PMQP3MRGX7CKGKXQJEZ1WQH0DWBFT8MN2",
    amount: 3200,
    usdValue: 4544,
    description: "Logo Design — Rebrand Project",
    createdAt: new Date("2026-01-28T16:00:00"),
    expiresAt: new Date("2026-02-07T16:00:00"),
    userRole: "buyer",
    events: [
      { id: "e10", type: "created", timestamp: new Date("2026-01-28T16:00:00"), description: "Escrow created by buyer" },
      { id: "e11", type: "funded", timestamp: new Date("2026-01-28T16:05:00"), description: "3,200 STX deposited", txId: "0xmno345" },
      { id: "e12", type: "refunded", timestamp: new Date("2026-02-04T12:00:00"), description: "Funds refunded to buyer", txId: "0xpqr678" },
    ],
  },
  {
    id: "ESC-006",
    status: "active",
    buyerAddress: "SP1234ABCD5678EFGH9012IJKL3456MNOP7890QRST",
    sellerAddress: "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
    amount: 120000,
    usdValue: 170400,
    description: "Full-Stack dApp Development — Lending Protocol",
    createdAt: new Date("2026-02-15T08:00:00"),
    expiresAt: new Date("2026-03-15T08:00:00"),
    userRole: "seller",
    events: [
      { id: "e13", type: "created", timestamp: new Date("2026-02-15T08:00:00"), description: "Escrow created by buyer" },
      { id: "e14", type: "funded", timestamp: new Date("2026-02-15T08:12:00"), description: "120,000 STX deposited", txId: "0xstu901" },
    ],
  },
];

export const PLATFORM_STATS = {
  totalVolume: 2450000,
  totalVolumeUsd: 3479000,
  activeEscrows: 47,
  completedEscrows: 312,
  totalUsers: 1289,
  avgEscrowSize: 18500,
  avgEscrowSizeUsd: 26270,
  successRate: 96.8,
};

export function formatStxAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

export function formatUsdAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

export function truncateAddress(address: string, startChars = 5, endChars = 4): string {
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

export function getTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}

export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
