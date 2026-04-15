# Write Methods

Write methods create blockchain transactions that modify contract state. They require a `SignerOptions` object with a private key.

> ⚠️ **Warning:** Write methods require a private key. Only use in server-side or CLI environments. For browser apps, use [Stacks Connect](/docs/frontend/wallet-integration).

## createEscrow

Create a new escrow with funds.

```typescript
const result = await client.createEscrow(
  {
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 1_000_000,           // 1 STX in microSTX
    description: 'Logo design',
    durationBlocks: 6720,        // ~7 days
    tokenType: TokenType.STX,
  },
  {
    senderKey: 'private-key-hex',
    fee: 10_000,
  }
);

console.log('TX:', result.txid);
```

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `seller` | `string` | Seller's Stacks address |
| `amount` | `number` | Amount in smallest unit (µSTX or sats) |
| `description` | `string` | Description (max 256 chars) |
| `durationBlocks` | `number` | Duration in blocks |
| `tokenType` | `TokenType` | `TokenType.STX` or `TokenType.SBTC` |

---

## release

Release funds to the seller. Must be called by the buyer.

```typescript
const result = await client.release(1, {
  senderKey: 'buyer-private-key',
});
```

---

## refund

Refund funds to the buyer. Called by seller (anytime) or anyone (after expiry).

```typescript
const result = await client.refund(1, {
  senderKey: 'seller-private-key',
});
```

---

## dispute

Raise a dispute on a pending escrow. Called by buyer or seller.

```typescript
const result = await client.dispute(1, {
  senderKey: 'buyer-or-seller-key',
});
```

---

## extendEscrow

Extend the deadline of a pending escrow. Buyer only.

```typescript
const result = await client.extendEscrow(1, 960, {
  senderKey: 'buyer-private-key',
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `escrowId` | `number` | Escrow ID to extend |
| `additionalBlocks` | `number` | Blocks to add |

---

## resolveExpiredDispute

Buyer self-recovery after dispute timeout. Buyer only.

```typescript
const result = await client.resolveExpiredDispute(1, {
  senderKey: 'buyer-private-key',
});
```

## Full Workflow Example

```typescript
import { EscrowClient, TokenType } from 'sbtc-escrow-sdk';

const client = new EscrowClient({ network: 'testnet' });
const signerOpts = { senderKey: process.env.SENDER_KEY! };

// 1. Create escrow
const create = await client.createEscrow(
  {
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 5_000_000, // 5 STX
    description: 'Milestone 1 payment',
    durationBlocks: 6720,
    tokenType: TokenType.STX,
  },
  signerOpts
);
console.log('Created:', create.txid);

// 2. Wait for confirmation...

// 3. Release to seller
const release = await client.release(1, signerOpts);
console.log('Released:', release.txid);
```
