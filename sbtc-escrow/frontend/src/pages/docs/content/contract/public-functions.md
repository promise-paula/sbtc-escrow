# Public Functions

These are the core user-facing functions for managing escrows.

## create-escrow

Creates a new escrow and transfers funds from the buyer into the contract.

```clarity
(define-public (create-escrow
  (seller principal)
  (amount uint)
  (description (string-utf8 256))
  (duration uint)
  (token-type uint))
  (response uint uint))
```

### Parameters

| Name | Type | Required | Description |
|------|------|:--------:|-------------|
| `seller` | `principal` | ✅ | The recipient's Stacks address. Cannot be the same as `tx-sender`. |
| `amount` | `uint` | ✅ | The escrow amount in smallest unit (microSTX for STX, satoshis for sBTC). Does **not** include the fee — the contract calculates and adds it. |
| `description` | `string-utf8 256` | ✅ | A human-readable description of the escrow purpose. Max 256 UTF-8 characters. |
| `duration` | `uint` | ✅ | Duration in Stacks blocks until the escrow expires. Must be between 1 and 350,400 (~365 days). |
| `token-type` | `uint` | ✅ | `u0` for STX, `u1` for sBTC. |

### Returns

**`(ok uint)`** — The newly created escrow ID (auto-incrementing).

### Errors

| Code | Constant | Cause |
|:----:|----------|-------|
| 1001 | `ERR_UNAUTHORIZED` | `contract-caller != tx-sender` |
| 1002 | `ERR_CONTRACT_PAUSED` | Contract is paused |
| 2005 | `ERR_INVALID_AMOUNT` | Amount outside min/max bounds for token type |
| 2006 | `ERR_INVALID_DURATION` | Duration is 0 or exceeds MAX_DURATION |
| 2007 | `ERR_SELF_ESCROW` | `tx-sender == seller` |
| 2012 | `ERR_INVALID_TOKEN` | Token type is not 0 or 1 |
| 3001 | `ERR_TRANSFER_FAILED` | STX/sBTC transfer failed |

### Example

```clarity
;; Create a 10 STX escrow lasting ~7 days
(contract-call? .escrow-v5 create-escrow
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG  ;; seller
  u10000000                                       ;; 10 STX
  u"Website redesign - milestone 1"               ;; description
  u6720                                           ;; ~7 days
  u0                                              ;; STX
)
;; → (ok u1)
```

### Behavior

1. Validates all inputs (pause, authorization, bounds, token type)
2. Calculates fee: `amount * feeBPS / 10000`
3. Transfers `amount + fee` from `tx-sender` to contract
4. Increments escrow counter
5. Stores escrow record in the `escrows` map
6. Updates buyer/seller stats
7. Prints event data
8. Returns the new escrow ID

---

## release

Releases escrowed funds to the seller and platform fee to the fee recipient.

```clarity
(define-public (release (escrow-id uint))
  (response bool uint))
```

### Parameters

| Name | Type | Required | Description |
|------|------|:--------:|-------------|
| `escrow-id` | `uint` | ✅ | The ID of the escrow to release. |

**Authorization:** Buyer only. The caller must be the escrow's `buyer`.

### Errors

| Code | Constant | Cause |
|:----:|----------|-------|
| 1001 | `ERR_UNAUTHORIZED` | Not the buyer or contract-caller check failed |
| 2001 | `ERR_ESCROW_NOT_FOUND` | Invalid escrow ID |
| 2002 | `ERR_ESCROW_ALREADY_COMPLETED` | Status is not PENDING |
| 3001 | `ERR_TRANSFER_FAILED` | Fund transfer failed |

### Example

```clarity
(contract-call? .escrow-v5 release u1)
;; → (ok true)
```

### Behavior

1. Validates escrow exists and is PENDING
2. Verifies `tx-sender == buyer`
3. Transfers `amount` to seller (STX or sBTC based on token-type)
4. Transfers `fee-amount` to fee recipient
5. Updates escrow status to RELEASED
6. Sets `completed-at` to current block height
7. Updates seller's received stats
8. Updates platform stats (volume, fees, released count)

> ℹ️ **Info:** Release works **even after expiry**. The buyer can always choose to release regardless of the deadline.

---

## refund

Returns the full deposit (amount + fee) to the buyer.

```clarity
(define-public (refund (escrow-id uint))
  (response bool uint))
```

### Parameters

| Name | Type | Required | Description |
|------|------|:--------:|-------------|
| `escrow-id` | `uint` | ✅ | The ID of the escrow to refund. |

**Authorization:**
- **Before expiry:** Seller only
- **After expiry:** Anyone

### Errors

| Code | Constant | Cause |
|:----:|----------|-------|
| 1001 | `ERR_UNAUTHORIZED` | Not seller (before expiry) or contract-caller check |
| 2001 | `ERR_ESCROW_NOT_FOUND` | Invalid escrow ID |
| 2002 | `ERR_ESCROW_ALREADY_COMPLETED` | Status is not PENDING |
| 3001 | `ERR_TRANSFER_FAILED` | Fund transfer failed |

### Example

```clarity
;; Seller refunds before expiry
(contract-call? .escrow-v5 refund u1)
;; → (ok true)

;; Anyone refunds after expiry
(contract-call? .escrow-v5 refund u1)
;; → (ok true)
```

### Behavior

1. Validates escrow exists and is PENDING
2. Checks authorization (seller anytime, or anyone after expiry)
3. Transfers `amount + fee-amount` back to buyer
4. Updates status to REFUNDED
5. Sets `completed-at`
6. Updates platform refunded count

---

## dispute

Raises a dispute on a pending escrow, freezing it until resolution.

```clarity
(define-public (dispute (escrow-id uint))
  (response bool uint))
```

### Parameters

| Name | Type | Required | Description |
|------|------|:--------:|-------------|
| `escrow-id` | `uint` | ✅ | The ID of the escrow to dispute. |

**Authorization:** Buyer or seller. Either party in the escrow can raise a dispute.

### Errors

| Code | Constant | Cause |
|:----:|----------|-------|
| 1001 | `ERR_UNAUTHORIZED` | Not buyer or seller |
| 2001 | `ERR_ESCROW_NOT_FOUND` | Invalid escrow ID |
| 2002 | `ERR_ESCROW_ALREADY_COMPLETED` | Status is not PENDING |

### Example

```clarity
(contract-call? .escrow-v5 dispute u1)
;; → (ok true)
```

### Behavior

1. Validates escrow exists and is PENDING
2. Verifies caller is buyer or seller
3. Updates status to DISPUTED
4. Records `disputed-at` block height (for timeout calculation)
5. Increments platform active dispute count

> 📝 **Note:** Disputes can be raised **after expiry**. This allows parties to dispute even if the deadline has passed, preventing a race condition where funds are refunded just before a dispute is filed.

---

## extend-escrow

Extends the deadline of a pending escrow.

```clarity
(define-public (extend-escrow
  (escrow-id uint)
  (additional-blocks uint))
  (response bool uint))
```

### Parameters

| Name | Type | Required | Description |
|------|------|:--------:|-------------|
| `escrow-id` | `uint` | ✅ | The ID of the escrow to extend. |
| `additional-blocks` | `uint` | ✅ | Number of additional blocks to add to the deadline. |

**Authorization:** Buyer only. Must be called before the escrow expires.

### Errors

| Code | Constant | Cause |
|:----:|----------|-------|
| 1001 | `ERR_UNAUTHORIZED` | Not the buyer |
| 2001 | `ERR_ESCROW_NOT_FOUND` | Invalid escrow ID |
| 2002 | `ERR_ESCROW_ALREADY_COMPLETED` | Not PENDING status |
| 2003 | `ERR_ESCROW_EXPIRED` | Escrow already expired |
| 2010 | `ERR_INVALID_EXTENSION` | Extension is 0 or exceeds max |

### Example

```clarity
;; Add ~1 week to the deadline
(contract-call? .escrow-v5 extend-escrow u1 u6720)
;; → (ok true)
```
