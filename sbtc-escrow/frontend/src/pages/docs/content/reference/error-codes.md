# Error Codes

Reference for all error codes returned by the active `escrow-mainnet-v3`
(mainnet) and `escrow-v8` (testnet) contracts. Older contract versions
(v6/v7, escrow-mainnet, escrow-mainnet-v2) use a similar scheme; the
frontend's error mapping handles both.

## Authorization (1xxx)

| Code | Constant | Description |
| --- | --- | --- |
| `u1001` | `ERR_UNAUTHORIZED` | Caller is not the buyer / seller / beneficiary / admin for this action. |
| `u1002` | `ERR_CONTRACT_PAUSED` | Contract is currently paused. Create / deliver / release / refund / dispute / extend are all blocked until the pause lifts. Admin dispute resolution and seller self-rescue still work. |
| `u1003` | `ERR_OWNERSHIP_PENDING` | Ownership transfer is in progress; the new owner has not yet accepted. |
| `u1004` | `ERR_NOT_PENDING_OWNER` | Only the address designated as the pending new owner can accept ownership. |

## Escrow State (2xxx)

| Code | Constant | Description |
| --- | --- | --- |
| `u2001` | `ERR_ESCROW_NOT_FOUND` | No escrow exists with the given ID. |
| `u2002` | `ERR_ESCROW_ALREADY_COMPLETED` | Escrow has already been released, refunded, or otherwise finalised. Most commonly a race: the counterparty acted first. |
| `u2003` | `ERR_ESCROW_EXPIRED` | The deadline has passed. Buyer can refund instead of releasing. |
| `u2004` | `ERR_ESCROW_NOT_EXPIRED` | The deadline has not yet been reached. Refund / seller self-rescue paths reject until expiry. |
| `u2005` | `ERR_INVALID_AMOUNT` | Amount outside the allowed bounds for the token type (see Protocol Numbers in the introduction). |
| `u2006` | `ERR_INVALID_DURATION` | Duration outside `MIN_DURATION..MAX_DURATION` (1 burn block to ~365 days on v3+). |
| `u2007` | `ERR_SELF_ESCROW` | Buyer address equals seller address. |
| `u2008` | `ERR_DISPUTE_NOT_TIMED_OUT` | Buyer tried to claim an expired dispute before the dispute timeout elapsed. |
| `u2009` | `ERR_NOT_DISPUTED` | Caller tried to resolve a dispute on an escrow that has no active dispute. |
| `u2010` | `ERR_INVALID_EXTENSION` | Duration extension is zero or pushes total duration past the max. |
| `u2011` | `ERR_INVALID_TIMEOUT` | Admin tried to set `dispute-timeout` outside its allowed range (1..MAX_DISPUTE_TIMEOUT). |
| `u2012` | `ERR_INVALID_TOKEN` | Token-type uint is neither 0 (STX) nor 1 (sBTC). |
| `u2013` | `ERR_INVALID_BPS` | Basis-point value out of range (0..10000 for split resolutions, 0..MAX_FEE_BPS for fee setting). |
| `u2014` | `ERR_IN_REVIEW_PERIOD` | Buyer attempted to refund during the post-delivery review window. Must wait for the window to lapse or raise a dispute. |
| `u2015` | `ERR_INVALID_STATUS` | Action incompatible with current escrow status (e.g. trying to deliver a Released escrow). |
| `u2016` | `ERR_NOT_DELIVERED` | Seller tried to self-rescue without first signaling delivery on-chain. |
| `u2017` | `ERR_SELF_BENEFICIARY` | Beneficiary address equals buyer or seller — must be a distinct third party. |

## Transfer (3xxx)

| Code | Constant | Description |
| --- | --- | --- |
| `u3001` | `ERR_TRANSFER_FAILED` | STX or sBTC `transfer?` call reverted. Usually a wallet balance issue or a post-condition mismatch. |
| `u3002` | `ERR_INSUFFICIENT_BALANCE` | Contract noticed a balance shortfall mid-transfer. |

## v3+ Specific (4xxx)

These codes only fire on `escrow-mainnet-v3` and `escrow-v8`.

| Code | Constant | Description |
| --- | --- | --- |
| `u4001` | `ERR_INVALID_PAUSE_DURATION` | Admin called `pause-contract(duration)` with `duration = 0` or `duration > MAX_PAUSE_DURATION`. |
| `u4002` | `ERR_SWEEP_EXCEEDS_FREE_BALANCE` | Admin tried to `sweep-orphans` more than the un-locked balance. The contract enforces `amount ≤ balance − total_locked` so active escrows are never touched. |
| `u4003` | `ERR_PAUSE_COOLDOWN_ACTIVE` | Admin tried to re-pause while the anti-chaining cooldown from a previous pause is still active. Cooldown ends `2 × duration` blocks after the original pause confirmed. |

## Frontend handling

The frontend's [`categorizeTxError`](https://github.com/promise-paula/sbtc-escrow/blob/main/frontend/src/lib/tx-errors.ts) helper maps these codes to friendly toast messages. Wallet-rejection and network errors are caught first; then any `uXXXX` string in the wallet's error message is matched against this table.

```typescript
// Example mappings shipped with the frontend:
if (err.includes('u1002')) return { title: 'Contract is paused', ... };
if (err.includes('u4003')) return { title: 'Pause cooldown still active', ... };
if (err.includes('u2014')) return { title: 'Review period active', ... };
if (err.includes('u2017')) return { title: 'Beneficiary must differ', ... };
```

## SDK handling

```typescript
import { EscrowClient } from 'sbtc-escrow-sdk';

try {
  await client.createEscrow({ /* … */ });
} catch (error) {
  // Stacks contract errors come back as strings like "(err u2007)" or
  // the wallet's error message containing the code. Match on substring.
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('u2007')) {
    console.log('Cannot create an escrow to yourself');
  } else if (msg.includes('u1002')) {
    console.log('Contract is paused');
  }
}
```

## Notes on legacy contracts

`escrow-v6` and `escrow-mainnet` use a different error code scheme (1000-5001 range, kebab-case `err-not-sender` names). The frontend handles both; if you're calling those contracts directly via the SDK, refer to the inline contract source in `contracts/escrow-v6.clar` or the explorer for the exact mapping.
