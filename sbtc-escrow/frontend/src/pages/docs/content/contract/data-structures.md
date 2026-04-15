# Data Structures

The contract stores data in maps and data variables.

## Maps

### `escrows`

Primary escrow storage, keyed by escrow ID.

```clarity
(define-map escrows uint {
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
})
```

| Field | Type | Description |
|-------|------|-------------|
| `buyer` | `principal` | Address that created and funded the escrow |
| `seller` | `principal` | Address that receives funds on release |
| `amount` | `uint` | Principal amount (excluding fee) |
| `fee-amount` | `uint` | Platform fee calculated at creation |
| `description` | `string-utf8 256` | Human-readable description |
| `status` | `uint` | Current state (0=Pending, 1=Released, 2=Refunded, 3=Disputed) |
| `token-type` | `uint` | 0=STX, 1=sBTC |
| `created-at` | `uint` | Block height when created |
| `expires-at` | `uint` | Block height when escrow expires |
| `completed-at` | `uint` | Block height when released/refunded (0 if pending) |
| `disputed-at` | `uint` | Block height when disputed (0 if not disputed) |

### `user-stats`

Per-user statistics, keyed by principal address.

```clarity
(define-map user-stats principal {
  escrows-as-buyer: uint,
  escrows-as-seller: uint,
  total-amount-sent: uint,
  total-amount-received: uint,
  disputes-initiated: uint
})
```

| Field | Type | Description |
|-------|------|-------------|
| `escrows-as-buyer` | `uint` | Number of escrows created as buyer |
| `escrows-as-seller` | `uint` | Number of escrows received as seller |
| `total-amount-sent` | `uint` | Total principal locked as buyer |
| `total-amount-received` | `uint` | Total principal received as seller |
| `disputes-initiated` | `uint` | Number of disputes raised |

## Data Variables

### Platform Stats

```clarity
(define-data-var platform-stats {
  total-escrows: uint,
  total-volume: uint,
  total-fees-collected: uint,
  active-disputes: uint,
  released-count: uint,
  refunded-count: uint
} { ... })
```

### Configuration

```clarity
(define-data-var contract-owner principal tx-sender)
(define-data-var fee-bps uint u50)
(define-data-var fee-recipient principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var dispute-timeout uint u28800)
(define-data-var pending-owner (optional principal) none)
(define-data-var escrow-count uint u0)
```

## Storage Costs

Clarity charges per-byte storage fees. An escrow record is approximately **350–600 bytes** depending on the description length.

| Component | Approximate Size |
|-----------|:----------------:|
| Fixed fields (principals, uints) | ~200 bytes |
| Description (variable) | 4–260 bytes |
| Map overhead | ~50 bytes |
| **Total per escrow** | **~250–510 bytes** |

User stats records are approximately **80 bytes** each.
