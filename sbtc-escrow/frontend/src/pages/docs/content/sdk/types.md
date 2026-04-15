# Types

TypeScript type definitions exported by the SDK.

## Enums

### EscrowStatus

```typescript
enum EscrowStatus {
  Pending = 0,
  Released = 1,
  Refunded = 2,
  Disputed = 3,
}
```

### TokenType

```typescript
enum TokenType {
  STX = 0,
  SBTC = 1,
}
```

## Interfaces

### Escrow

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

### EscrowConfig

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

### UserStats

```typescript
interface UserStats {
  escrowsAsBuyer: number;
  escrowsAsSeller: number;
  totalAmountSent: number;
  totalAmountReceived: number;
  disputesInitiated: number;
}
```

### PlatformStats

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

### CreateEscrowParams

```typescript
interface CreateEscrowParams {
  seller: string;
  amount: number;
  description: string;
  durationBlocks: number;
  tokenType: TokenType;
}
```

### SignerOptions

```typescript
interface SignerOptions {
  senderKey: string;
  fee?: number;
  nonce?: number;
}
```

### BroadcastResult

```typescript
interface BroadcastResult {
  txid: string;
  error?: string;
}
```

### EscrowClientOptions

```typescript
interface EscrowClientOptions {
  network: 'testnet' | 'mainnet';
  contractAddress?: string;
  contractName?: string;
  apiUrl?: string;
}
```
