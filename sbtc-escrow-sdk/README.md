# sBTC Escrow SDK

TypeScript SDK for the sBTC Escrow smart contracts on Stacks. Supports both
**STX** (native) and **sBTC** (SIP-010 fungible token) escrows across the full
contract version history.

| Network | Active contract | Legacy (read/act on existing escrows) |
| --- | --- | --- |
| Mainnet | `escrow-mainnet-v3` | `escrow-mainnet-v2` |
| Testnet | `escrow-v8` (v3-equivalent) | `escrow-v7` |

**v3 features**: burn-block-anchored expiry (Bitcoin-block timing, stable
~10 min/block), beneficiary delegation (third-party with buyer-equivalent
rights), seller self-rescue after 2× dispute timeout, time-bounded admin
pause with anti-chaining cooldown, sweep-orphans for misdirected funds,
and partial dispute resolution. See [What's new in v3](#whats-new-in-v3)
at the bottom.

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

// Refund to buyer (seller voluntarily, or anyone after expiry on v6 / buyer
// after expiry + review window on v7+)
await client.refund(1, { senderKey });

// Dispute an escrow (buyer or seller)
await client.dispute(1, { senderKey });

// Extend escrow expiry (buyer only, before expiry)
await client.extendEscrow(1, 144, { senderKey });

// Resolve expired dispute (buyer self-service after timeout)
await client.resolveExpiredDispute(1, { senderKey });
```

#### v7+ Operations

These methods are available on `escrow-v7` and later contracts (`escrow-v8`,
`escrow-mainnet-v2`, `escrow-mainnet-v3`). Older contracts (`escrow-v6`,
`escrow-mainnet`) don't expose them. Gate with `supportsV3Features(contractId)`
or its v7+ equivalent if you target multiple contract versions.

```typescript
// Seller signals delivery on-chain. Flips status to DELIVERED and starts
// the review window during which the buyer cannot unilaterally refund
// without raising a dispute first. Proof on-chain that work was delivered.
await client.deliver(1, { senderKey });

// Check whether an escrow is currently inside its post-delivery review
// window. Returns true only after deliver() was called and before the
// review period elapsed.
const inReview = await client.isInReviewPeriod(1);

// Admin/arbiter: resolve a disputed escrow with a partial split.
// `buyerBps` is the buyer's share of the principal in basis points (0–10000).
// Seller gets the remainder. Fee is split pro-rata.
//   buyerBps = 0      → identical to resolve-dispute-for-seller
//   buyerBps = 10000  → identical to resolve-dispute-for-buyer
//   buyerBps = 7000   → 70% to buyer, 30% to seller
await adminClient.resolveDisputeSplit(1, 7000, { senderKey: adminKey });
```

#### v3+ Operations

These methods are only available on `escrow-mainnet-v3` (mainnet) and
`escrow-v8` (testnet). Gate with `supportsV3Features(contractId)`:

```typescript
import { supportsV3Features } from 'sbtc-escrow-sdk';

if (supportsV3Features(contractId)) {
  // Create with optional beneficiary — a third party with buyer-equivalent
  // release/refund/dispute rights. Useful for marketplace flows where the
  // platform itself can act on behalf of the buyer.
  await client.createEscrow({
    seller: 'SP…',
    amount: 100_000_000n,
    duration: 4320,                         // burn blocks (~30 days mainnet)
    description: 'Logo design',
    tokenType: 'STX',
    beneficiary: 'SP_PLATFORM…',            // optional
  }, { senderKey });

  // Seller self-rescue: only callable on a DELIVERED escrow after 2× the
  // dispute timeout has elapsed. Lets a seller recover funds when admin
  // has not resolved a disputed-but-delivered escrow. Read-only check
  // first to gate the UI button.
  const eligible = await client.isSellerRescueEligible(1);
  if (eligible) {
    await client.resolveExpiredDisputeForSeller(1, { senderKey });
  }

  // Admin sweep of orphan funds — recovers tokens that landed at the
  // contract address outside any escrow (misdirected transfers). The
  // contract enforces `amount ≤ free_balance` where free_balance =
  // contract_balance - total_locked, so active escrows are untouchable.
  await client.sweepOrphans('STX', 1_000_000n, { senderKey: adminKey });
}
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
//   v6 / escrow-mainnet: pauseContract takes no args (indefinite pause).
//   v3+ (escrow-mainnet-v3, escrow-v8): pauseContract requires `durationBlocks` —
//   the contract auto-unpauses after that many burn blocks AND blocks any
//   re-pause attempt until 2× the duration has elapsed (anti-chaining cooldown).
await client.pauseContract({ senderKey: adminKey }, 144);  // 144 = ~24h mainnet
await client.unpauseContract({ senderKey: adminKey });

// 2-step ownership transfer
await client.transferOwnership('ST_NEW_OWNER...', { senderKey: adminKey });
// New owner calls:
await client.acceptOwnership({ senderKey: newOwnerKey });
```

## Configuration

```typescript
const client = new EscrowClient({
  network: 'testnet',                   // or 'mainnet'
  contractAddress: 'ST1HK6...',         // optional, uses default
  contractName: 'escrow-v8',            // optional; defaults: 'escrow-v8' (testnet), 'escrow-mainnet-v3' (mainnet)
  sbtcContract: 'ST1F7Q...sbtc-token',  // optional, per-network default
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
  DELIVERED = 4,   // v7+ only
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
  deliveredAt: number | null;   // v7+ only: block height the seller called deliver()
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
  reviewPeriod?: number;   // v7+ only — blocks after deliver() during which
                           // the buyer cannot unilaterally refund
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

| Network | Active | Legacy (read-only) |
| --- | --- | --- |
| Mainnet | `SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v3` | `SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v2` |
| Testnet | `ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v8` | `ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v7` |

Legacy contracts remain readable and actionable (release / refund / dispute /
resolve) for existing escrows — the SDK auto-dispatches by `contractId`. New
escrows should target the active contract on each network.

## What's new in v3

The `escrow-mainnet-v3` / `escrow-v8` contracts add six material changes
over v2/v7. The SDK handles all of these — gate on `supportsV3Features(contractId)`
in your client code where you need to surface them in the UI.

### 1. Burn-block-anchored expiry (Bitcoin-block timing)

v2/v7 stored expiry as `stacks-block-height`. With variable Stacks block
production (~5s to ~2min post-Nakamoto), a "30-day" escrow could resolve in
20 or 40 days depending on chain conditions. v3 anchors all time fields to
`burn-block-height` — Bitcoin's ~10-min cadence, stabilized by difficulty
retarget over each 2016-block epoch. Predictable, regardless of Stacks side.

### 2. Beneficiary delegation

`create-escrow` accepts an optional `beneficiary` principal — a third party
with the same release/refund/dispute rights as the buyer. Useful for
marketplace flows where the platform itself can act on behalf of the buyer,
or escrows held on behalf of a DAO/multisig.

### 3. Seller self-rescue (`resolve-expired-dispute-for-seller`)

If a seller delivered (signaled via `deliver()`) but the buyer then disputed
AND the admin/arbiter failed to resolve within 2× the dispute timeout, the
seller can recover funds themselves. Prevents admin-griefing of legitimate
deliveries.

### 4. Time-bounded admin pause with anti-chaining cooldown

`pause-contract(duration)` now requires a duration. The contract auto-unpauses
after `duration` burn blocks, and a re-pause attempt is rejected with
`ERR_PAUSE_COOLDOWN_ACTIVE` (u4003) until `2 * duration` blocks elapse.
Manual `unpause-contract` lifts the pause early but does NOT reset the
cooldown. Closes an indefinite-pause griefing vector found in the v3 audit.

### 5. Sweep-orphans for misdirected funds

If someone sends STX or sBTC directly to the contract principal (outside
any escrow), `sweep-orphans(token-type, amount)` lets the admin recover
those funds to the fee-recipient. Locked-balance accounting prevents the
sweep from touching active escrow funds: `amount ≤ contract_balance - total_locked`.

### 6. Per-escrow fee-recipient snapshot + partial dispute resolution

Each escrow snapshots the fee-recipient at create time, so changing the
platform-level fee-recipient mid-stream doesn't affect in-flight escrows.
v7+ `resolve-dispute-split(escrow-id, buyer-bps)` is fully supported on v3
too, with the fee deducted pro-rata from each side.

## License

MIT
