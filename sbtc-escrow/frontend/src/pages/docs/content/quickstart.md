# Quickstart

This guide walks you through creating, releasing, and refunding an escrow on testnet.

## Prerequisites

1. **Install a Stacks wallet** — Install [Leather](https://leather.io/) or [Xverse](https://www.xverse.app/) browser extension. Create or import an account and **switch to Testnet**.

2. **Get testnet STX** — Visit the [Stacks Testnet Faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet) and request STX tokens. You'll need at least 1 STX to create an escrow.

3. **Get testnet sBTC (optional)** — If you want to create sBTC escrows, bridge testnet BTC to sBTC via the [sBTC Bridge](https://bridge.sbtc.tech/).

## Option A: Use the App

The fastest way to try sBTC Escrow is the hosted frontend at [sbtc-escrow.vercel.app](https://sbtc-escrow.vercel.app).

1. **Connect wallet** — Click "Connect Wallet" and approve the connection
2. **Create escrow** — Navigate to "Create Escrow", enter the seller's address, amount, description, and duration
3. **Confirm transaction** — Review the post-conditions in your wallet and confirm
4. **Track progress** — View your escrow on the Dashboard or My Escrows page

## Option B: Use the SDK

Install the SDK and interact programmatically:

```bash
npm install sbtc-escrow-sdk
```

### Read contract state (no wallet needed)

```typescript
import { EscrowClient } from 'sbtc-escrow-sdk';

const client = new EscrowClient({ network: 'testnet' });

// Check platform configuration
const config = await client.getConfig();
console.log('Fee:', config.platformFeeBps, 'BPS');
console.log('Paused:', config.isPaused);

// Get an escrow by ID
const escrow = await client.getEscrow(1);
console.log(escrow);

// Check user stats
const stats = await client.getUserStats('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
console.log(stats);
```

### Create an escrow (requires signing)

```typescript
import { EscrowClient, TokenType } from 'sbtc-escrow-sdk';

const client = new EscrowClient({ network: 'testnet' });

const result = await client.createEscrow(
  {
    seller: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 1_000_000,        // 1 STX in microSTX
    description: 'Logo design milestone 1',
    durationBlocks: 960,      // ~1 day
    tokenType: TokenType.STX,
  },
  {
    senderKey: 'your-private-key-hex',
    fee: 10_000,
  }
);

console.log('TX:', result.txid);
console.log('Explorer:', client.getExplorerTxUrl(result.txid));
```

### Release funds to seller

```typescript
const result = await client.release(1, {
  senderKey: 'buyer-private-key-hex',
});

console.log('Released! TX:', result.txid);
```

## Option C: Use Clarinet (Local Development)

Test against a local simnet with zero cost:

```bash
# Clone the repo
git clone https://github.com/promise-paula/sbtc-escrow.git
cd sbtc-escrow

# Install dependencies
npm install

# Run the test suite
npm test
```

> 💡 **Tip:** Clarinet provides 8 pre-funded wallets with 100M STX each on simnet. No faucet needed.

### Interactive console

```bash
clarinet console
```

```clarity
;; Create an escrow (as wallet_1 → wallet_2)
(contract-call? .escrow-v5 create-escrow
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG  ;; seller
  u1000000                                         ;; 1 STX
  u"Test escrow"                                   ;; description
  u960                                             ;; ~1 day
  u0                                               ;; STX token
)

;; Check it
(contract-call? .escrow-v5 get-escrow u1)
```

## Next Steps

- **[Escrow Lifecycle](/docs/concepts/escrow-lifecycle)** — Understand the full state machine
- **[Contract Reference](/docs/contract/overview)** — Deep dive into every function
- **[SDK Reference](/docs/sdk/overview)** — Full TypeScript API reference
- **[Testing Guide](/docs/guides/testing)** — Comprehensive test scenarios
