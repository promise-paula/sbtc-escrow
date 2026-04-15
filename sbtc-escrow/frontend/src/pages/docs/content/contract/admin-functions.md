# Admin Functions

These functions are restricted to the contract owner for platform management and dispute resolution.

## resolve-dispute-for-buyer

Resolves a disputed escrow in the buyer's favor, refunding all funds.

```clarity
(define-public (resolve-dispute-for-buyer (escrow-id uint))
  (response bool uint))
```

**Authorization:** Contract owner only.

### Behavior

1. Validates escrow is in DISPUTED status
2. Transfers `amount + fee-amount` back to buyer
3. Updates status to REFUNDED
4. Decrements active dispute count

### Example

```clarity
(contract-call? .escrow-v5 resolve-dispute-for-buyer u5)
;; → (ok true)
```

---

## resolve-dispute-for-seller

Resolves a disputed escrow in the seller's favor, releasing funds.

```clarity
(define-public (resolve-dispute-for-seller (escrow-id uint))
  (response bool uint))
```

**Authorization:** Contract owner only.

### Behavior

1. Validates escrow is in DISPUTED status
2. Transfers `amount` to seller
3. Transfers `fee-amount` to fee recipient
4. Updates status to RELEASED
5. Decrements active dispute count

### Example

```clarity
(contract-call? .escrow-v5 resolve-dispute-for-seller u5)
;; → (ok true)
```

---

## resolve-expired-dispute

Allows the buyer to self-recover funds from a dispute that has timed out.

```clarity
(define-public (resolve-expired-dispute (escrow-id uint))
  (response bool uint))
```

**Authorization:** Buyer only, after `dispute-timeout` blocks have passed since `disputed-at`.

### Behavior

1. Validates escrow is DISPUTED
2. Verifies caller is the buyer
3. Checks that `block-height > disputed-at + dispute-timeout`
4. Refunds buyer in full
5. Updates status to REFUNDED

> ℹ️ **Info:** This is a safety mechanism ensuring buyers can always recover funds, even if the admin is unresponsive.

---

## set-paused

Pauses or unpauses new escrow creation.

```clarity
(define-public (set-paused (paused bool))
  (response bool uint))
```

**Authorization:** Contract owner only.

> 📝 **Note:** Pausing only blocks `create-escrow`. Existing escrows can still be released, refunded, disputed, and resolved.

### Example

```clarity
;; Pause the contract
(contract-call? .escrow-v5 set-paused true)

;; Unpause
(contract-call? .escrow-v5 set-paused false)
```

---

## set-fee-bps

Updates the platform fee rate.

```clarity
(define-public (set-fee-bps (new-fee uint))
  (response bool uint))
```

**Authorization:** Contract owner only. Fee cannot exceed `MAX_FEE_BPS` (500 = 5%).

### Example

```clarity
;; Set fee to 1%
(contract-call? .escrow-v5 set-fee-bps u100)
```

---

## set-fee-recipient

Updates the address that receives platform fees.

```clarity
(define-public (set-fee-recipient (new-recipient principal))
  (response bool uint))
```

**Authorization:** Contract owner only.

---

## set-dispute-timeout

Updates the dispute timeout period.

```clarity
(define-public (set-dispute-timeout (new-timeout uint))
  (response bool uint))
```

**Authorization:** Contract owner only.

### Example

```clarity
;; Set timeout to ~60 days
(contract-call? .escrow-v5 set-dispute-timeout u57600)
```

---

## set-pending-owner

Initiates a two-step ownership transfer.

```clarity
(define-public (set-pending-owner (new-owner principal))
  (response bool uint))
```

**Authorization:** Current contract owner only.

---

## confirm-owner

Accepts a pending ownership transfer.

```clarity
(define-public (confirm-owner)
  (response bool uint))
```

**Authorization:** The pending owner only.

### Two-Step Transfer Flow

```clarity
;; Step 1: Current owner initiates transfer
(contract-call? .escrow-v5 set-pending-owner 'ST_NEW_OWNER)

;; Step 2: New owner accepts
;; (called by ST_NEW_OWNER)
(contract-call? .escrow-v5 confirm-owner)
```
