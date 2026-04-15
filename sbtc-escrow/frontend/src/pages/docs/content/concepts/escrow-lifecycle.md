# Escrow Lifecycle

Every escrow follows a deterministic state machine enforced by the smart contract. Once created, an escrow can only transition through specific states based on who acts and when.

## State Machine

<div style="display:flex;flex-direction:column;gap:10px;font-family:ui-monospace,monospace;font-size:13px;max-width:100%;overflow-x:auto">

<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center">
<div style="border:1px dashed #d4d4d8;border-radius:6px;padding:6px 14px;text-align:center;opacity:0.6">(none)</div>
<div style="color:#F7931A;font-weight:700;font-size:12px">— create →</div>
<div style="border:2px solid #F7931A;border-radius:6px;padding:8px 16px;text-align:center;background:rgba(247,147,26,0.08)"><strong>PENDING</strong><br/><span style="opacity:0.6;font-size:12px">status: 0</span></div>
</div>

<div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;font-size:12px;opacity:0.7">
<span>↓ release</span>
<span>↓ refund (after expiry)</span>
<span>↓ dispute</span>
</div>

<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
<div style="border:1px solid #22c55e;border-radius:6px;padding:8px 16px;text-align:center;background:rgba(34,197,94,0.06)"><strong>RELEASED</strong><br/><span style="opacity:0.6;font-size:12px">status: 1 (terminal)</span></div>
<div style="border:1px solid #3b82f6;border-radius:6px;padding:8px 16px;text-align:center;background:rgba(59,130,246,0.06)"><strong>REFUNDED</strong><br/><span style="opacity:0.6;font-size:12px">status: 2 (terminal)</span></div>
<div style="border:1px solid #ef4444;border-radius:6px;padding:8px 16px;text-align:center;background:rgba(239,68,68,0.06)"><strong>DISPUTED</strong><br/><span style="opacity:0.6;font-size:12px">status: 3</span></div>
</div>

<div style="text-align:center;font-size:12px;opacity:0.7">↓ admin resolves dispute</div>

<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
<div style="border:1px solid #22c55e;border-radius:6px;padding:6px 14px;text-align:center;font-size:12px">→ RELEASED <span style="opacity:0.6">(for seller)</span></div>
<div style="border:1px solid #3b82f6;border-radius:6px;padding:6px 14px;text-align:center;font-size:12px">→ REFUNDED <span style="opacity:0.6">(for buyer)</span></div>
</div>

</div>

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
