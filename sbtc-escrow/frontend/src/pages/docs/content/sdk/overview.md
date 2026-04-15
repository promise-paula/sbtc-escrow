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

<div style="display:flex;flex-direction:column;gap:10px;font-family:ui-monospace,monospace;font-size:13px;max-width:100%;overflow-x:auto">
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 16px;text-align:center;max-width:200px;margin:0 auto"><strong>Your Application</strong></div>
<div style="text-align:center;color:#F7931A;font-size:18px">▼</div>
<div style="border:2px solid #F7931A;border-radius:8px;padding:16px;background:rgba(247,147,26,0.05);max-width:480px;margin:0 auto">
<div style="font-weight:700;margin-bottom:10px;text-align:center">EscrowClient</div>
<div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px"><span>• Read methods</span><span style="opacity:0.6">→ <code>callReadOnlyFunction()</code> → Stacks API</span></div>
<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px"><span>• Write methods</span><span style="opacity:0.6">→ <code>makeContractCall()</code> → Stacks Node</span></div>
<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px"><span>• Admin methods</span><span style="opacity:0.6">→ <code>broadcastTransaction()</code> → Mempool</span></div>
<div><span>• Helpers</span></div>
</div>
</div>
</div>

## Next Steps

- [Installation](/docs/sdk/installation) — Install the SDK and set up your environment
- [Client](/docs/sdk/client) — Initialize and configure the EscrowClient
- [Read Methods](/docs/sdk/read-methods) — Query contract state
- [Write Methods](/docs/sdk/write-methods) — Create and manage escrows
- [Types](/docs/sdk/types) — TypeScript type definitions
