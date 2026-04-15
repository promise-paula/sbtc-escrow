# Token Support

sBTC Escrow v5 supports two token types natively: **STX** (Stacks native token) and **sBTC** (Bitcoin-backed SIP-010 token).

## Token Types

| Token | ID | Standard | Decimals | Unit |
|-------|:--:|----------|:--------:|------|
| **STX** | `0` | Native | 6 | microSTX |
| **sBTC** | `1` | SIP-010 | 8 | satoshis |

The `token-type` parameter is passed when creating an escrow and determines how funds are transferred:

```clarity
;; STX escrow
(contract-call? .escrow-v5 create-escrow seller u1000000 u"Payment" u960 u0)

;; sBTC escrow
(contract-call? .escrow-v5 create-escrow seller u100000 u"Payment" u960 u1)
```

## Amount Limits

Each token has independent min/max constraints:

| Token | Minimum | Maximum | Minimum (human) | Maximum (human) |
|-------|---------|---------|:---------------:|:---------------:|
| STX | 1,000 µSTX | 100,000,000,000,000 µSTX | 0.001 STX | 100M STX |
| sBTC | 10,000 sats | 10,000,000,000 sats | 0.0001 BTC | 100 BTC |

> ⚠️ **Warning:** Amounts are always in the **smallest unit** — microSTX for STX, satoshis for sBTC. Make sure to convert correctly.

## Conversion Helpers

### SDK

```typescript
import { TokenType } from 'sbtc-escrow-sdk';

// The SDK handles amounts in smallest units
const stxAmount = 1_000_000;   // 1 STX
const sbtcAmount = 100_000;    // 0.001 BTC
```

### Frontend Utilities

```typescript
import { microToSTX, satsToBTC, toSmallestUnit } from '@/lib/utils';

microToSTX(1_000_000);                    // 1
satsToBTC(100_000_000);                   // 1
toSmallestUnit(1, TokenType.STX);         // 1_000_000
toSmallestUnit(0.001, TokenType.SBTC);    // 100_000
```

## How Transfers Work

### STX Transfers

STX uses native `stx-transfer?` built into Clarity:

```clarity
;; Buyer → Contract (on create)
(try! (stx-transfer? total-deposit tx-sender (as-contract tx-sender)))

;; Contract → Seller (on release)
(as-contract (try! (stx-transfer? amount (as-contract tx-sender) seller)))
```

### sBTC Transfers

sBTC uses the SIP-010 fungible token standard via `contract-call?`:

```clarity
;; Buyer → Contract (on create)
(try! (contract-call? .sbtc-token transfer
  total-deposit tx-sender (as-contract tx-sender) none))

;; Contract → Seller (on release)
(as-contract (try! (contract-call? .sbtc-token transfer
  amount (as-contract tx-sender) seller none)))
```

## sBTC Contract Addresses

| Network | Contract |
|---------|----------|
| **Testnet** | `ST1F8Z1ZQKG0QHFGKQ6E5HMN2QHD3G4CZGFQRWESR.sbtc-token` |
| **Mainnet** | `SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc-token` |

## Post-Conditions

Both frontend and SDK use Stacks post-conditions to guarantee transaction safety:

- **STX escrows**: `Pc.principal(sender).willSendEq(totalDeposit).ustx()`
- **sBTC escrows**: `Pc.principal(sender).willSendEq(totalDeposit).ft(sbtcContract, 'sbtc-token')`

Post-conditions are enforced at the protocol level — if the actual transfer doesn't match the post-condition, the entire transaction is reverted.
