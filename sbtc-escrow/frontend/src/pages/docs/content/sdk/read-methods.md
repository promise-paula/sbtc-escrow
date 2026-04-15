# Read Methods

Read methods query the contract state without requiring a wallet or signing. These use `callReadOnlyFunction` under the hood.

## getEscrow

Get full details for an escrow by ID.

```typescript
const escrow = await client.getEscrow(1);
```

### Returns

```typescript
interface Escrow {
  id: number;
  buyer: string;
  seller: string;
  amount: number;
  feeAmount: number;
  description: string;
  status: EscrowStatus;
  tokenType: TokenType;
  createdAt: number;
  expiresAt: number;
  completedAt: number;
  disputedAt: number;
}
```

### Example

```typescript
const escrow = await client.getEscrow(1);
console.log(`Escrow #${escrow.id}: ${escrow.amount} µSTX`);
console.log(`Status: ${EscrowStatus[escrow.status]}`);
console.log(`Buyer: ${escrow.buyer}`);
console.log(`Seller: ${escrow.seller}`);
```

---

## getEscrowCount

Get the total number of escrows created.

```typescript
const count = await client.getEscrowCount();
console.log(`Total escrows: ${count}`);
```

---

## getUserStats

Get statistics for a specific user.

```typescript
const stats = await client.getUserStats('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
```

### Returns

```typescript
interface UserStats {
  escrowsAsBuyer: number;
  escrowsAsSeller: number;
  totalAmountSent: number;
  totalAmountReceived: number;
  disputesInitiated: number;
}
```

---

## getPlatformStats

Get platform-wide statistics.

```typescript
const stats = await client.getPlatformStats();
console.log(`Total volume: ${stats.totalVolume}`);
console.log(`Active disputes: ${stats.activeDisputes}`);
```

### Returns

```typescript
interface PlatformStats {
  totalEscrows: number;
  totalVolume: number;
  totalFeesCollected: number;
  activeDisputes: number;
  releasedCount: number;
  refundedCount: number;
}
```

---

## getConfig

Get the current contract configuration.

```typescript
const config = await client.getConfig();
console.log(`Fee: ${config.platformFeeBps} BPS`);
console.log(`Paused: ${config.isPaused}`);
```

### Returns

```typescript
interface EscrowConfig {
  owner: string;
  platformFeeBps: number;
  feeRecipient: string;
  isPaused: boolean;
  disputeTimeout: number;
  pendingOwner: string | null;
}
```

---

## calculateFee

Calculate the fee for a given amount.

```typescript
const fee = await client.calculateFee(1_000_000);
console.log(`Fee for 1 STX: ${fee} µSTX`); // 5000
```

---

## isExpired

Check if an escrow has expired.

```typescript
const expired = await client.isExpired(1);
if (expired) {
  console.log('Escrow has expired — anyone can refund');
}
```
