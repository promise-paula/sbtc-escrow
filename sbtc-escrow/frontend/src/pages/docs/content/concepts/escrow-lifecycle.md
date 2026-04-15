# Escrow Lifecycle

Every escrow follows a deterministic state machine enforced by the smart contract. Once created, an escrow can only transition through specific states based on who acts and when.

## State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────────┐  create  ┌──────────┐  release  ┌──────────┐
│          │─────────▶│          │──────────▶│          │
│  (none)  │          │ PENDING  │           │ RELEASED │
│          │          │   (0)    │           │   (1)    │
└──────────┘          └────┬─┬───┘           └──────────┘
                           │ │
                    refund │ │ dispute
                           │ │
                    ┌──────┘ └──────┐
                    ▼               ▼
              ┌──────────┐   ┌──────────┐
              │          │   │          │
              │ REFUNDED │   │ DISPUTED │
              │   (2)    │   │   (3)    │
              └──────────┘   └────┬─┬───┘
                    ▲             │ │
                    │    resolve  │ │  resolve
                    │   for buyer │ │  for seller
                    │             │ │
                    └─────────────┘ └──────────▶ RELEASED
```

## Status Codes

| Code | Name | Description |
|------|------|-------------|
| `0` | **Pending** | Escrow created, funds locked. Awaiting action. |
| `1` | **Released** | Funds sent to seller (minus fee to platform). Terminal. |
| `2` | **Refunded** | Full amount returned to buyer. Terminal. |
| `3` | **Disputed** | Frozen. Awaiting admin resolution or timeout recovery. |

> ⚠️ **Warning:** **Released** and **Refunded** are terminal states. No further actions can be taken on a completed escrow.

## Actions by State

### Pending → Released

**Who:** Buyer only

The buyer calls `release` to send funds to the seller:

- **Seller receives:** principal amount
- **Platform receives:** fee amount
- Works **even after the escrow has expired** — the buyer can always release

```clarity
(contract-call? .escrow-v5 release u1)
```

### Pending → Refunded

**Who:** Seller (anytime) or anyone (after expiry)

- **Seller refund**: The seller can refund anytime as a goodwill gesture
- **Expiry refund**: After `expires-at` block height, anyone can trigger a refund — useful for automation or third-party services

Full amount (principal + fee) is returned to the buyer.

```clarity
(contract-call? .escrow-v5 refund u1)
```

### Pending → Disputed

**Who:** Buyer or seller

Either party can raise a dispute at any time while the escrow is pending. Disputes also work after expiry.

- Sets status to `DISPUTED`
- Records `disputed-at` block height (used for timeout calculation)
- Freezes the escrow — no release or refund until resolved

```clarity
(contract-call? .escrow-v5 dispute u1)
```

### Disputed → Released (admin resolves for seller)

**Who:** Contract owner only

```clarity
(contract-call? .escrow-v5 resolve-dispute-for-seller u1)
```

Releases funds to seller + fee to platform, same as a normal release.

### Disputed → Refunded (admin resolves for buyer)

**Who:** Contract owner only

```clarity
(contract-call? .escrow-v5 resolve-dispute-for-buyer u1)
```

Full refund (principal + fee) to the buyer.

### Disputed → Refunded (timeout recovery)

**Who:** Buyer only, after `dispute-timeout` blocks have passed

If the admin doesn't resolve the dispute within the timeout period (~30 days), the buyer can self-recover:

```clarity
(contract-call? .escrow-v5 resolve-expired-dispute u1)
```

> ℹ️ **Info:** This ensures buyers are never permanently locked out of their funds, even if the admin is unresponsive.

## Authorization Matrix

| Action | Who Can Call | When |
|--------|-------------|------|
| `create-escrow` | Anyone | Anytime (unless paused) |
| `release` | Buyer | Pending (even if expired) |
| `refund` | Seller or anyone | Seller: anytime pending. Others: after expiry. |
| `dispute` | Buyer or seller | Pending |
| `resolve-dispute-for-buyer` | Owner | Disputed |
| `resolve-dispute-for-seller` | Owner | Disputed |
| `resolve-expired-dispute` | Buyer | Disputed + timeout elapsed |
| `extend-escrow` | Buyer | Pending, before expiry |

## Fee Distribution

When an escrow is **released** (including dispute resolution for seller):

```
Total Deposit = Principal Amount + Fee Amount

Fee Amount = Principal × (feeBPS / 10,000)

On release:
  → Seller receives: Principal Amount
  → Fee Recipient receives: Fee Amount
```

When an escrow is **refunded** (including dispute resolution for buyer):

```
On refund:
  → Buyer receives: Total Deposit (Principal + Fee)
  → No fee is charged
```

## Expiry Mechanics

- **Created at**: The block height when `create-escrow` is called
- **Expires at**: `created-at + duration` (in blocks)
- **After expiry**: Anyone can call `refund` to return funds to the buyer
- **Before expiry**: Buyer can call `extend-escrow` to push the deadline forward

```clarity
;; Extend by 960 blocks (~1 day)
(contract-call? .escrow-v5 extend-escrow u1 u960)
```

The new `expires-at` = current `expires-at` + additional blocks. Extensions cannot exceed the `MAX_DURATION` from the original creation time.
