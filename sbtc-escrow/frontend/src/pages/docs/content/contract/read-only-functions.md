# Read-Only Functions

Read-only functions query contract state without requiring a transaction or wallet.

## get-escrow

Returns full details for an escrow by ID.

```clarity
(define-read-only (get-escrow (escrow-id uint))
  (response {
    id: uint,
    buyer: principal,
    seller: principal,
    amount: uint,
    fee-amount: uint,
    description: (string-utf8 256),
    status: uint,
    token-type: uint,
    created-at: uint,
    expires-at: uint,
    completed-at: uint,
    disputed-at: uint
  } uint))
```

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `escrow-id` | `uint` | The escrow ID to look up |

### Returns

Returns escrow record or `ERR_ESCROW_NOT_FOUND` (2001).

### Example

```clarity
(contract-call? .escrow-v5 get-escrow u1)
;; → (ok { id: u1, buyer: 'ST1..., seller: 'ST2..., ... })
```

---

## get-escrow-count

Returns the total number of escrows created.

```clarity
(define-read-only (get-escrow-count)
  (response uint uint))
```

### Example

```clarity
(contract-call? .escrow-v5 get-escrow-count)
;; → (ok u42)
```

---

## get-user-stats

Returns statistics for a specific user.

```clarity
(define-read-only (get-user-stats (user principal))
  (response {
    escrows-as-buyer: uint,
    escrows-as-seller: uint,
    total-amount-sent: uint,
    total-amount-received: uint,
    disputes-initiated: uint
  } uint))
```

### Example

```clarity
(contract-call? .escrow-v5 get-user-stats 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM)
```

---

## get-platform-stats

Returns platform-wide statistics.

```clarity
(define-read-only (get-platform-stats)
  (response {
    total-escrows: uint,
    total-volume: uint,
    total-fees-collected: uint,
    active-disputes: uint,
    released-count: uint,
    refunded-count: uint
  } uint))
```

### Example

```clarity
(contract-call? .escrow-v5 get-platform-stats)
```

---

## get-config

Returns the current contract configuration.

```clarity
(define-read-only (get-config)
  (response {
    owner: principal,
    fee-bps: uint,
    fee-recipient: principal,
    is-paused: bool,
    dispute-timeout: uint,
    pending-owner: (optional principal)
  } uint))
```

### Example

```clarity
(contract-call? .escrow-v5 get-config)
;; → (ok { owner: 'ST1..., fee-bps: u50, is-paused: false, ... })
```

---

## calculate-fee

Calculates the fee for a given amount.

```clarity
(define-read-only (calculate-fee (amount uint))
  (response uint uint))
```

### Example

```clarity
(contract-call? .escrow-v5 calculate-fee u1000000)
;; → (ok u5000) ;; 0.5% of 1 STX = 5000 µSTX
```

---

## is-expired

Checks whether an escrow has passed its deadline.

```clarity
(define-read-only (is-expired (escrow-id uint))
  (response bool uint))
```

### Example

```clarity
(contract-call? .escrow-v5 is-expired u1)
;; → (ok false)
```
