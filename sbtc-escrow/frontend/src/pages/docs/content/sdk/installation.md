# Installation

## Install the SDK

```bash
npm install sbtc-escrow-sdk
```

Or with other package managers:

```bash
yarn add sbtc-escrow-sdk
pnpm add sbtc-escrow-sdk
```

## Peer Dependencies

The SDK requires the following Stacks libraries (installed automatically):

| Package | Version | Purpose |
|---------|---------|---------|
| `@stacks/transactions` | `^7.x` | Transaction construction and signing |
| `@stacks/network` | `^7.x` | Network configuration |
| `@stacks/common` | `^7.x` | Shared utilities |

## Import

```typescript
// Named imports
import { EscrowClient, TokenType, EscrowStatus } from 'sbtc-escrow-sdk';

// Type imports
import type { Escrow, EscrowConfig, UserStats, PlatformStats } from 'sbtc-escrow-sdk';
```

## Environment Setup

### Node.js

```typescript
import { EscrowClient } from 'sbtc-escrow-sdk';

const client = new EscrowClient({ network: 'testnet' });
```

### Browser

```typescript
import { EscrowClient } from 'sbtc-escrow-sdk';

// Same API — works in both environments
const client = new EscrowClient({ network: 'testnet' });
```

### Environment Variables

For scripts and backend services:

```bash
# .env
STACKS_NETWORK=testnet
SENDER_KEY=your-private-key-hex
```

```typescript
const client = new EscrowClient({
  network: process.env.STACKS_NETWORK as 'testnet' | 'mainnet',
});
```

> ⚠️ **Warning:** Never commit private keys. Use environment variables or a secure key management solution.
