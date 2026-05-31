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
| --- | --- | --- |
| `0` | **Pending** | Escrow created, funds locked. Awaiting action. |
| `1` | **Released** | Funds sent to seller (minus fee to platform). Terminal. |
| `2` | **Refunded** | Full amount returned to buyer. Terminal. |
| `3` | **Disputed** | Frozen. Awaiting admin resolution, buyer timeout-recovery, or seller self-rescue. |
| `4` | **Delivered** *(v7+)* | Seller has signaled delivery on-chain. Starts a review window during which buyer cannot unilaterally refund without first raising a dispute. Resolves to Released on `release` or to Disputed on `dispute`. |

> ⚠️ **Warning:** **Released** and **Refunded** are terminal states. No further actions can be taken on a completed escrow.

## Actions by State

### Pending → Released

**Who:** Buyer, or beneficiary (v3+)

The buyer (or v3+ beneficiary acting on the buyer's behalf) calls `release` to send funds to the seller:

- **Seller receives:** principal amount
- **Platform receives:** fee amount
- Works **even after the escrow has expired** — release always honored from the buyer side

```clarity
(contract-call? .escrow-mainnet-v3 release u1)
```

### Pending → Delivered (v7+)

**Who:** Seller

Seller signals delivery on-chain, flipping status to DELIVERED and starting a review window. During this window the buyer cannot unilaterally `refund` — they must raise a dispute first. Protects sellers from buyers who try to refund after receiving the work.

```clarity
(contract-call? .escrow-mainnet-v3 deliver u1)
```

### Pending / Delivered → Refunded

**Who:** Seller (anytime), or buyer (after expiry, outside review window)

- **Seller refund**: seller voluntarily returns funds at any time
- **Buyer refund after expiry**: once `expires-at` is crossed AND the post-delivery review window (if any) has lapsed, the buyer can claim a refund
- On v3+, only these two parties can refund — there is no "anyone can refund after expiry" path

Full amount (principal + fee) returns to the buyer.

```clarity
(contract-call? .escrow-mainnet-v3 refund u1)
```

### Pending / Delivered → Disputed

**Who:** Buyer, seller, or beneficiary (v3+)

Any party can raise a dispute while the escrow is active. The dispute reason is recorded off-chain in Supabase.

- Sets status to `DISPUTED`
- Records `disputed-at` burn block height (v3+) or stacks block height (legacy)
- Freezes the escrow — no release / refund / deliver until resolved

```clarity
(contract-call? .escrow-mainnet-v3 dispute u1)
```

### Disputed → Released (admin resolves for seller)

**Who:** Contract owner

```clarity
(contract-call? .escrow-mainnet-v3 resolve-dispute-for-seller u1)
```

Releases full principal to seller + fee to platform.

### Disputed → Refunded (admin resolves for buyer)

**Who:** Contract owner

```clarity
(contract-call? .escrow-mainnet-v3 resolve-dispute-for-buyer u1)
```

Full refund (principal + fee) to the buyer.

### Disputed → Released (admin partial split, v7+)

**Who:** Contract owner

```clarity
;; 70% to buyer, 30% to seller. buyer-bps is 0..10000.
(contract-call? .escrow-mainnet-v3 resolve-dispute-split u1 u7000)
```

Fee is split pro-rata between sides. Final status is RELEASED (the escrow is considered settled regardless of payout direction).

### Disputed → Refunded (buyer timeout recovery)

**Who:** Buyer, after `dispute-timeout` burn blocks elapsed

If admin doesn't resolve within the timeout window (~30 days on mainnet), the buyer can self-recover:

```clarity
(contract-call? .escrow-mainnet-v3 resolve-expired-dispute u1)
```

### Disputed → Released (seller self-rescue, v3+)

**Who:** Seller, after `2 × dispute-timeout` burn blocks elapsed, AND escrow was DELIVERED before being disputed

If admin doesn't resolve a delivered-then-disputed escrow within 2× the timeout, the seller can claim the funds (proof on-chain that they delivered):

```clarity
(contract-call? .escrow-mainnet-v3 resolve-expired-dispute-for-seller u1)
```

> ℹ️ The seller self-rescue path requires `deliver()` was called first. Without it, the seller has no on-chain proof and the buyer-recovery path applies.

## Authorization Matrix

| Action | Who Can Call | When |
| --- | --- | --- |
| `create-escrow` | Anyone | Anytime (unless paused) |
| `deliver` *(v7+)* | Seller | Pending |
| `release` | Buyer or beneficiary *(v3+)* | Pending or Delivered (even if expired) |
| `refund` | Seller (anytime) or buyer (after expiry, outside review window) | Pending / Delivered |
| `dispute` | Buyer, seller, or beneficiary *(v3+)* | Pending or Delivered |
| `extend-escrow` | Buyer or beneficiary *(v3+)* | Pending, before expiry |
| `resolve-dispute-for-buyer` | Owner | Disputed |
| `resolve-dispute-for-seller` | Owner | Disputed |
| `resolve-dispute-split` *(v7+)* | Owner | Disputed |
| `resolve-expired-dispute` | Buyer | Disputed + dispute-timeout elapsed |
| `resolve-expired-dispute-for-seller` *(v3+)* | Seller | Disputed + 2× dispute-timeout elapsed, AND escrow was Delivered before being disputed |
| `sweep-orphans` *(v3+)* | Owner | Anytime; only sweeps `balance − total_locked` |

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

- **Created at**: The block height (burn block on v3+, Stacks block on legacy) when `create-escrow` mined
- **Expires at**: `created-at + duration` blocks
- **After expiry**: buyer (or beneficiary on v3+) can call `refund` to return funds to themselves. On legacy v6/v7, seller can also refund; on v3+ that path is gated by review-window checks.
- **Before expiry**: buyer (or beneficiary on v3+) can call `extend-escrow` to push the deadline forward

```clarity
;; Extend by 144 burn blocks (~24h on mainnet)
(contract-call? .escrow-mainnet-v3 extend-escrow u1 u144)
```

The new `expires-at` = current `expires-at` + additional blocks. Extensions cannot exceed `MAX_DURATION` total from original creation.

### Burn vs Stacks block timing

v3+ contracts anchor `created-at` / `expires-at` / `disputed-at` to **burn-block-height** (Bitcoin chain). Bitcoin's ~10 min/block cadence is stable via difficulty retarget every 2016 blocks. Legacy contracts anchored to `stacks-block-height`, which post-Nakamoto varies from 5s to 2min per block depending on signer behavior. A "30-day" v3 escrow expires reliably in 30 calendar days; a "30-day" legacy escrow could resolve anywhere from 10 to 60 days depending on the Stacks block rate during that window.
