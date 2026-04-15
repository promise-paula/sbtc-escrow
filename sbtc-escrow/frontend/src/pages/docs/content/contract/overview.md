# Smart Contract Overview

The sBTC Escrow smart contract (`escrow-v5.clar`) is a Clarity v4 contract deployed on the Stacks blockchain. It serves as the trustless, on-chain core of the escrow protocol.

## Contract Identity

| Property | Value |
|----------|-------|
| **Name** | `escrow-v5` |
| **Language** | Clarity v4 |
| **Testnet** | `ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v5` |
| **Mainnet** | TBD |

## Constants

### Status Codes

| Constant | Value | Meaning |
|----------|:-----:|---------|
| `STATUS_PENDING` | `u0` | Escrow created, funds locked |
| `STATUS_RELEASED` | `u1` | Funds sent to seller |
| `STATUS_REFUNDED` | `u2` | Funds returned to buyer |
| `STATUS_DISPUTED` | `u3` | Frozen, awaiting resolution |

### Token Types

| Constant | Value | Token |
|----------|:-----:|-------|
| `TOKEN_STX` | `u0` | Native STX |
| `TOKEN_SBTC` | `u1` | sBTC (SIP-010) |

### Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_FEE_BPS` | `u500` | Max fee 5% |
| `MAX_DURATION` | `u350400` | ~365 days in blocks |
| `MIN_STX_AMOUNT` | `u1000` | 0.001 STX |
| `MAX_STX_AMOUNT` | `u100000000000000` | 100M STX |
| `MIN_SBTC_AMOUNT` | `u10000` | 0.0001 BTC |
| `MAX_SBTC_AMOUNT` | `u10000000000` | 100 BTC |

### Error Codes

| Range | Category |
|-------|----------|
| 1000–1999 | Authorization errors |
| 2000–2999 | Escrow state errors |
| 3000–3999 | Transfer errors |

## Function Index

### Public Functions (User)

| Function | Description |
|----------|-------------|
| [`create-escrow`](/docs/contract/public-functions) | Create a new escrow with funds |
| [`release`](/docs/contract/public-functions) | Release funds to seller |
| [`refund`](/docs/contract/public-functions) | Refund funds to buyer |
| [`dispute`](/docs/contract/public-functions) | Raise a dispute |
| [`extend-escrow`](/docs/contract/public-functions) | Extend escrow deadline |

### Public Functions (Admin)

| Function | Description |
|----------|-------------|
| [`resolve-dispute-for-buyer`](/docs/contract/admin-functions) | Resolve dispute in buyer's favor |
| [`resolve-dispute-for-seller`](/docs/contract/admin-functions) | Resolve dispute in seller's favor |
| [`resolve-expired-dispute`](/docs/contract/admin-functions) | Buyer self-recovery after timeout |
| [`set-paused`](/docs/contract/admin-functions) | Pause/unpause contract |
| [`set-fee-bps`](/docs/contract/admin-functions) | Update platform fee |
| [`set-fee-recipient`](/docs/contract/admin-functions) | Update fee recipient address |
| [`set-dispute-timeout`](/docs/contract/admin-functions) | Update dispute timeout period |
| [`set-pending-owner`](/docs/contract/admin-functions) | Initiate ownership transfer |
| [`confirm-owner`](/docs/contract/admin-functions) | Accept ownership transfer |

### Read-Only Functions

| Function | Description |
|----------|-------------|
| [`get-escrow`](/docs/contract/read-only-functions) | Get escrow details by ID |
| [`get-escrow-count`](/docs/contract/read-only-functions) | Total number of escrows |
| [`get-user-stats`](/docs/contract/read-only-functions) | User's escrow statistics |
| [`get-platform-stats`](/docs/contract/read-only-functions) | Platform-wide statistics |
| [`get-config`](/docs/contract/read-only-functions) | Current contract configuration |
| [`calculate-fee`](/docs/contract/read-only-functions) | Calculate fee for an amount |
| [`is-expired`](/docs/contract/read-only-functions) | Check if an escrow has expired |
