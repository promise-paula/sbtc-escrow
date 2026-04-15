# Services

Service modules that interact with the Stacks blockchain and external APIs.

## escrow-service.ts

Core service for reading escrow data from the blockchain and Supabase.

### Key Functions

```typescript
import {
  getEscrow,
  getEscrows,
  getUserEscrows,
  getEscrowStats,
} from "@/lib/escrow-service";
```

| Function | Description | Returns |
|----------|-------------|---------|
| `getEscrow(id)` | Fetch single escrow by ID | `Escrow` |
| `getEscrows(filters)` | Fetch escrows with optional filters | `Escrow[]` |
| `getUserEscrows(address)` | Fetch escrows for a specific user | `Escrow[]` |
| `getEscrowStats()` | Aggregate statistics | `EscrowStats` |

### Supabase vs On-Chain

The service primarily reads from Supabase (indexed data) for performance. For critical operations, it verifies against on-chain data:

```typescript
// Fast: Read from Supabase index
const escrow = await getEscrow(id);

// Verified: Compare with on-chain state
const onChainEscrow = await getEscrowOnChain(id);
```

---

## admin-service.ts

Admin-only operations for contract management.

```typescript
import {
  getContractOwner,
  getPlatformFee,
  getDisputeTimeout,
  setPlatformFee,
  setDisputeTimeout,
  resolveDispute,
} from "@/lib/admin-service";
```

| Function | Description | Auth |
|----------|-------------|------|
| `getContractOwner()` | Get contract owner address | Public |
| `getPlatformFee()` | Get current fee percentage | Public |
| `getDisputeTimeout()` | Get timeout in blocks | Public |
| `setPlatformFee(fee)` | Update platform fee | Admin |
| `setDisputeTimeout(blocks)` | Update dispute timeout | Admin |
| `resolveDispute(id, resolution)` | Resolve a disputed escrow | Admin |

---

## post-conditions.ts

Builds Stacks post-conditions for safe transactions.

```typescript
import {
  makeFundPostConditions,
  makeReleasePostConditions,
} from "@/lib/post-conditions";
```

Post-conditions ensure that a transaction only executes if certain conditions are met. This prevents unexpected token transfers:

```typescript
// Funding: sender must send exactly the escrow amount
const postConditions = makeFundPostConditions(
  senderAddress,
  amount,
  tokenType // "STX" | "sBTC"
);

// Release: contract must send exactly the escrow amount to recipient
const releaseConditions = makeReleasePostConditions(
  escrowId,
  amount,
  recipientAddress,
  tokenType
);
```

---

## stacks-config.ts

Network configuration for Stacks blockchain connections.

```typescript
import { network, contractAddress, contractName } from "@/lib/stacks-config";
```

Configuration is determined by `VITE_STACKS_NETWORK` environment variable:

| Variable | Values |
|----------|--------|
| `VITE_STACKS_NETWORK` | `mainnet`, `testnet`, `devnet` |
| `VITE_CONTRACT_ADDRESS` | Deployer address |
| `VITE_CONTRACT_NAME` | Contract name (default: `escrow-v5`) |

---

## generate-receipt.ts

Generates PDF receipts for completed escrows.

```typescript
import { generateReceipt } from "@/lib/generate-receipt";

// Download a PDF receipt
await generateReceipt(escrow);
```

---

## supabase.ts

Supabase client initialization.

```typescript
import { supabase } from "@/lib/supabase";

// Direct queries (use sparingly - prefer hooks)
const { data } = await supabase
  .from("escrows")
  .select("*")
  .eq("status", "funded");
```

---

## types.ts

TypeScript type definitions shared across the frontend.

```typescript
import type {
  Escrow,
  EscrowStatus,
  TokenType,
  EscrowStats,
  DisputeResolution,
} from "@/lib/types";
```

Key types:

```typescript
type EscrowStatus =
  | "pending"
  | "funded"
  | "completed"
  | "refunded"
  | "disputed"
  | "resolved"
  | "expired";

type TokenType = "STX" | "sBTC";

interface Escrow {
  id: number;
  sender: string;
  recipient: string;
  amount: number;
  tokenType: TokenType;
  status: EscrowStatus;
  createdAt: number;
  expiresAt: number;
  description?: string;
}
```
