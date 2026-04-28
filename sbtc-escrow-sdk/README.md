# sBTC Escrow SDK

TypeScript SDK for the sBTC Escrow smart contract on Stacks. Targets `escrow-v6`
on testnet and `escrow-mainnet` on mainnet. Supports both **STX** (native) and
**sBTC** (SIP-010 fungible token) escrows.

## Installation

```bash
npm install sbtc-escrow-sdk @stacks/transactions @stacks/network
```

## Quick Start

```typescript
import { EscrowClient, EscrowStatus, TokenType } from 'sbtc-escrow-sdk';

// Initialize client
const client = new EscrowClient({ network: 'testnet' });

// Read escrow data
const escrow = await client.getEscrow(1);
if (escrow) {
  const label = escrow.tokenType === TokenType.SBTC ? 'sBTC' : 'STX';
  console.log(`${escrow.amount} ${label} — ${EscrowStatus[escrow.status]}`);
}

// Get platform stats (per-token volumes)
const stats = await client.getPlatformStats();
console.log(`STX volume: ${stats.totalVolumeStx}, sBTC volume: ${stats.totalVolumeSbtc}`);
```

## Usage

### Read-Only Operations

```typescript
const client = new EscrowClient({ network: 'testnet' });

// Get contract configuration (per-token bounds)
const config = await client.getConfig();
console.log(`Fee: ${config.platformFeeBps / 100}%`);
console.log(`STX bounds: ${config.minAmountStx}–${config.maxAmountStx}`);
console.log(`sBTC bounds: ${config.minAmountSbtc}–${config.maxAmountSbtc}`);
console.log(`Dispute timeout: ${config.disputeTimeout} blocks`);

// Get escrow by ID
const escrow = await client.getEscrow(1);
if (escrow) {
  console.log(`Token: ${TokenType[escrow.tokenType]}`);
  console.log(`Status: ${EscrowStatus[escrow.status]}`);
  console.log(`Disputed at: ${escrow.disputedAt}`);
}

// Get user statistics (per-token sent/received)
const userStats = await client.getUserStats('ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N');
console.log(`STX sent: ${userStats.totalSentStx}, sBTC sent: ${userStats.totalSentSbtc}`);

// Calculate fee
const fee = await client.calculateEscrowFee(1_000_000); // 1 STX
console.log(`Fee for 1 STX: ${fee / 1_000_000} STX`);

// Check contract state
const paused = await client.isPaused();
const expired = await client.isExpired(1);
const timedOut = await client.isDisputeTimedOut(1);
const status = await client.getStatus(1);
const role = await client.getUserRole(1, 'ST...');
```

### Write Operations (Require Private Key)

```typescript
const client = new EscrowClient({ network: 'testnet' });
const senderKey = 'your-private-key-hex';

// Create an STX escrow
const result = await client.createEscrow(
  {
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 1_000_000, // 1 STX
    description: 'Payment for services',
    durationBlocks: 144, // ~24 hours
    tokenType: TokenType.STX,
  },
  { senderKey }
);

// Create an sBTC escrow
const btcResult = await client.createEscrow(
  {
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 100_000, // 0.001 BTC
    description: 'BTC payment',
    durationBlocks: 144,
    tokenType: TokenType.SBTC,
  },
  { senderKey }
);

if (result.success) {
  console.log(`TX: ${result.txid}`);
  console.log(`Explorer: ${client.getExplorerTxUrl(result.txid)}`);
}

// Release funds to seller (buyer only)
await client.release(1, { senderKey });

// Refund to buyer (seller voluntarily, or anyone after expiry)
await client.refund(1, { senderKey });

// Dispute an escrow (buyer or seller)
await client.dispute(1, { senderKey });

// Extend escrow expiry (buyer only, before expiry)
await client.extendEscrow(1, 144, { senderKey });

// Resolve expired dispute (buyer self-service after timeout)
await client.resolveExpiredDispute(1, { senderKey });
```

### Admin Operations

```typescript
const adminKey = 'admin-private-key';

// Resolve dispute for buyer (refund)
await client.resolveDisputeForBuyer(1, { senderKey: adminKey });

// Resolve dispute for seller (release)
await client.resolveDisputeForSeller(1, { senderKey: adminKey });

// Update platform fee (max 500 = 5%)
await client.setPlatformFee(100, { senderKey: adminKey }); // 1%

// Update fee recipient
await client.setFeeRecipient('ST...', { senderKey: adminKey });

// Update dispute timeout (1–57600 blocks)
await client.setDisputeTimeout(28800, { senderKey: adminKey });

// Pause / unpause contract
await client.pauseContract({ senderKey: adminKey });
await client.unpauseContract({ senderKey: adminKey });

// 2-step ownership transfer
await client.transferOwnership('ST_NEW_OWNER...', { senderKey: adminKey });
// New owner calls:
await client.acceptOwnership({ senderKey: newOwnerKey });
```

## Configuration

```typescript
const client = new EscrowClient({
  network: 'testnet',           // or 'mainnet'
  contractAddress: 'ST1HK6...', // optional, uses default
  contractName: 'escrow-v6',    // optional; default: 'escrow-v6' (testnet), 'escrow-mainnet' (mainnet)
  sbtcContract: 'ST1F7Q...sbtc-token', // optional, per-network default
  apiUrl: 'https://api.testnet.hiro.so', // optional
});
```

## Types

### TokenType

```typescript
enum TokenType {
  STX = 0,   // Native Stacks token (6 decimals / microSTX)
  SBTC = 1,  // SIP-010 fungible token (8 decimals / satoshis)
}
```

### EscrowStatus

```typescript
enum EscrowStatus {
  PENDING = 0,
  RELEASED = 1,
  REFUNDED = 2,
  DISPUTED = 3,
}
```

### Escrow

```typescript
interface Escrow {
  id: number;
  buyer: string;
  seller: string;
  amount: number;
  feeAmount: number;
  tokenType: TokenType;
  description: string;
  status: EscrowStatus;
  createdAt: number;   // block height
  expiresAt: number;   // block height
  completedAt: number | null;
  disputedAt: number | null;
}
```

### PlatformStats

```typescript
interface PlatformStats {
  totalEscrows: number;
  totalVolumeStx: number;
  totalVolumeSbtc: number;
  totalFeesCollectedStx: number;
  totalFeesCollectedSbtc: number;
  totalReleased: number;
  totalRefunded: number;
  activeDisputes: number;
}
```

### EscrowConfig

```typescript
interface EscrowConfig {
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
```

### UserStats

```typescript
interface UserStats {
  escrowsCreated: number;
  escrowsReceived: number;
  totalSentStx: number;
  totalSentSbtc: number;
  totalReceivedStx: number;
  totalReceivedSbtc: number;
}
```

## Contract Addresses

| Network | Contract                                                  |
|---------|-----------------------------------------------------------|
| Testnet | `ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v6`     |
| Mainnet | `SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet` |

## License

MIT
