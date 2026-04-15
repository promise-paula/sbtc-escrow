# SDK Overview

The **sBTC Escrow SDK** (`sbtc-escrow-sdk`) is a TypeScript client library for interacting with the sBTC Escrow smart contract on the Stacks blockchain.

## Features

- **Read-only queries** — No wallet needed. Query escrow state, user stats, and platform config.
- **Write transactions** — Create escrows, release, refund, dispute with a private key.
- **Admin operations** — Resolve disputes, pause contract, manage fees.
- **Network-aware** — Auto-configures for testnet or mainnet.
- **Post-conditions** — Automatic STX/sBTC post-condition generation.
- **Type-safe** — Full TypeScript types for all operations.

## Quick Example

```typescript
import { EscrowClient, TokenType } from 'sbtc-escrow-sdk';

// Initialize client
const client = new EscrowClient({ network: 'testnet' });

// Read operations (no wallet needed)
const config = await client.getConfig();
const escrow = await client.getEscrow(1);
const stats = await client.getPlatformStats();

// Write operations (requires private key)
const result = await client.createEscrow(
  {
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 1_000_000,
    description: 'Payment for services',
    durationBlocks: 960,
    tokenType: TokenType.STX,
  },
  { senderKey: 'your-private-key-hex' }
);

console.log('Created escrow TX:', result.txid);
```

## Architecture

```
┌──────────────────┐
│  Your Application │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  EscrowClient    │
│                  │
│  • Read methods  │──── callReadOnlyFunction() ──▶ Stacks API
│  • Write methods │──── makeContractCall() ──────▶ Stacks Node
│  • Admin methods │──── broadcastTransaction() ──▶ Mempool
│  • Helpers       │
└──────────────────┘
```

## Next Steps

- [Installation](/docs/sdk/installation) — Install the SDK and set up your environment
- [Client](/docs/sdk/client) — Initialize and configure the EscrowClient
- [Read Methods](/docs/sdk/read-methods) — Query contract state
- [Write Methods](/docs/sdk/write-methods) — Create and manage escrows
- [Types](/docs/sdk/types) — TypeScript type definitions
