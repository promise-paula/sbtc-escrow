# Error Codes

Reference for all error codes returned by the escrow-v5 smart contract.

## Authentication Errors (1xxx)

| Code | Constant | Description |
|------|----------|-------------|
| 1000 | `err-owner-only` | Caller is not the contract owner. Admin functions require the deployer address. |
| 1001 | `err-not-sender` | Caller is not the escrow sender. Only the sender can release or refund. |
| 1002 | `err-not-participant` | Caller is neither the sender nor recipient. Only participants can dispute. |

## Escrow Errors (2xxx)

| Code | Constant | Description |
|------|----------|-------------|
| 2000 | `err-escrow-not-found` | No escrow exists with the given ID. |
| 2001 | `err-already-funded` | The escrow has already been funded. Cannot fund twice. |
| 2002 | `err-not-funded` | The escrow is not in "funded" status. Cannot release or dispute. |
| 2003 | `err-already-completed` | The escrow has already been completed. No further actions allowed. |
| 2004 | `err-already-refunded` | The escrow has already been refunded. No further actions allowed. |
| 2005 | `err-already-disputed` | The escrow is already in dispute. Cannot dispute again. |
| 2006 | `err-not-disputed` | The escrow is not in dispute. Cannot resolve a non-disputed escrow. |
| 2007 | `err-self-escrow` | Cannot create an escrow where sender equals recipient. |
| 2008 | `err-invalid-amount` | The escrow amount must be greater than zero. |
| 2009 | `err-invalid-expiry` | The expiry must be in the future (greater than current block height). |

## Transfer Errors (3xxx)

| Code | Constant | Description |
|------|----------|-------------|
| 3000 | `err-transfer-failed` | The STX or token transfer failed. Check balance and post-conditions. |
| 3001 | `err-insufficient-balance` | Insufficient balance to fund the escrow. |

## Expiry Errors (4xxx)

| Code | Constant | Description |
|------|----------|-------------|
| 4000 | `err-not-expired` | Cannot refund: the escrow has not yet expired. Wait until the expiry block. |
| 4001 | `err-expired` | Cannot perform this action: the escrow has expired. Only refund is available. |

## Dispute Errors (5xxx)

| Code | Constant | Description |
|------|----------|-------------|
| 5000 | `err-invalid-resolution` | The dispute resolution value is invalid. Must be a valid resolution type. |
| 5001 | `err-dispute-timeout` | The dispute timeout has passed. The dispute can be auto-resolved. |

---

## Handling Errors in the Frontend

The frontend maps contract error codes to user-friendly messages:

```typescript
const ERROR_MESSAGES: Record<number, string> = {
  1000: "Only the contract admin can perform this action.",
  1001: "Only the escrow sender can perform this action.",
  1002: "Only escrow participants can perform this action.",
  2000: "Escrow not found.",
  2001: "This escrow has already been funded.",
  2002: "This escrow must be funded first.",
  2007: "You cannot create an escrow with yourself.",
  2008: "Amount must be greater than zero.",
  2009: "Expiry must be in the future.",
  3000: "Token transfer failed. Check your balance.",
  4000: "This escrow has not expired yet.",
  4001: "This escrow has expired.",
};
```

## Handling Errors in the SDK

```typescript
import { EscrowClient } from "sbtc-escrow-sdk";

try {
  await client.createEscrow({ ... });
} catch (error) {
  if (error.code === 2007) {
    console.log("Cannot escrow to yourself");
  }
}
```
