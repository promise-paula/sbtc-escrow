# Fees & Limits

All fee parameters and limits are configurable by the contract owner but are bounded by hard-coded maximums to prevent abuse.

## Platform Fee

The platform charges a fee on every escrow creation, deducted when funds are released to the seller.

| Parameter | Value | Configurable |
|-----------|-------|:------------:|
| Current fee | 50 BPS (0.5%) | ✅ |
| Maximum fee | 500 BPS (5%) | ❌ (hard-coded) |
| Minimum fee | 0 BPS (0%) | ✅ |

### Fee Calculation

```
fee_amount = principal_amount × fee_bps ÷ 10,000
total_deposit = principal_amount + fee_amount
```

**Example:** Creating a 100 STX escrow at 50 BPS (0.5%):

```
fee = 100,000,000 × 50 ÷ 10,000 = 500,000 µSTX (0.5 STX)
total = 100,000,000 + 500,000 = 100,500,000 µSTX (100.5 STX)
```

### Fee Distribution

- **On release**: Seller gets `principal_amount`, fee recipient gets `fee_amount`
- **On refund**: Buyer gets `total_deposit` (principal + fee). No fee charged.
- **On dispute → seller**: Same as release
- **On dispute → buyer**: Same as refund

### Fee Recipient

The fee recipient is configurable and defaults to the contract owner. It can be changed:

```clarity
(contract-call? .escrow-v5 set-fee-recipient 'ST_NEW_FEE_ADDRESS)
```

## Amount Limits

### STX

| Parameter | Value | Human Readable |
|-----------|-------|:--------------:|
| Minimum | 1,000 µSTX | 0.001 STX |
| Maximum | 100,000,000,000,000 µSTX | 100M STX |

### sBTC

| Parameter | Value | Human Readable |
|-----------|-------|:--------------:|
| Minimum | 10,000 sats | 0.0001 BTC |
| Maximum | 10,000,000,000 sats | 100 BTC |

> ℹ️ **Info:** Amount limits are validated in the contract's `validate-amount` function. Amounts outside these bounds will fail with `ERR_INVALID_AMOUNT` (error code 2005).

## Duration Limits

| Parameter | Value | Human Readable |
|-----------|-------|:--------------:|
| Minimum | 1 block | ~90 seconds |
| Maximum | 350,400 blocks | ~365 days |

Duration is specified in Stacks blocks when creating an escrow. The escrow's `expires-at` is calculated as `block-height + duration`.

### Block Time

Post-Nakamoto, Stacks blocks are produced approximately every **90 seconds**. Common duration values:

| Duration | Blocks |
|----------|:------:|
| 1 hour | ~40 |
| 1 day | ~960 |
| 1 week | ~6,720 |
| 30 days | ~28,800 |
| 365 days | ~350,400 |

## Dispute Timeout

| Parameter | Value | Human Readable |
|-----------|-------|:--------------:|
| Default | 28,800 blocks | ~30 days |
| Configurable | ✅ (owner only) | — |

The dispute timeout is the period after which a buyer can self-recover funds from a disputed escrow without admin intervention.

```clarity
;; Check if dispute has timed out
(> burn-block-height (+ disputed-at dispute-timeout))
```

## Admin Fee Configuration

The contract owner can adjust the fee rate:

```clarity
;; Set fee to 1% (100 BPS)
(contract-call? .escrow-v5 set-fee-bps u100)
```

> ⚠️ **Warning:** The fee cannot exceed `MAX_FEE_BPS` (500 = 5%). Attempting to set a higher fee will fail with `ERR_INVALID_FEE`.

## Summary Table

| Parameter | Default | Min | Max | Unit |
|-----------|:-------:|:---:|:---:|------|
| Platform Fee | 50 | 0 | 500 | BPS |
| STX Amount | — | 1,000 | 100T | µSTX |
| sBTC Amount | — | 10,000 | 10B | sats |
| Duration | — | 1 | 350,400 | blocks |
| Dispute Timeout | 28,800 | — | — | blocks |
