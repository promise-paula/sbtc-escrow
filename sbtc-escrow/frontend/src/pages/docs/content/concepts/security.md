# Security

sBTC Escrow is designed with security-first principles. This page covers the on-chain guarantees, off-chain protections, and known limitations.

## On-Chain Security

### Contract-Caller Authorization

Every public function verifies that `contract-caller == tx-sender`:

```clarity
(asserts! (is-eq contract-caller tx-sender) ERR_UNAUTHORIZED)
```

This prevents **phishing attacks** where a malicious contract calls escrow functions on behalf of the user. Users must interact with the contract directly.

### Post-Conditions

All token transfers use Stacks post-conditions to guarantee the exact amount transferred:

- **STX**: `stx-postcondition` ensures exact microSTX amounts
- **sBTC**: `ft-postcondition` ensures exact satoshi amounts

If the actual transfer differs from the post-condition, the entire transaction is reverted.

### Role-Based Access Control

| Role | Permissions |
| --- | --- |
| **Buyer** | Create, release, dispute, extend, resolve-expired-dispute |
| **Seller** | Refund, dispute, deliver *(v7+)*, resolve-expired-dispute-for-seller *(v3+)* |
| **Beneficiary** *(v3+)* | Release, dispute, extend (same rights as buyer) |
| **Owner** | Resolve disputes, partial split *(v7+)*, pause/unpause, sweep-orphans *(v3+)*, set fees, transfer ownership |
| **Anyone** | Read-only queries |

### Pause Mechanism

The contract owner can pause normal contract operations in case of emergency:

```clarity
;; v3+: pause-contract requires a duration (in burn blocks). Contract
;; auto-unpauses after that window AND blocks re-pause for an equal
;; cooldown (anti-chaining safeguard found in v3 audit).
(contract-call? .escrow-mainnet-v3 pause-contract u144)  ;; ~24h mainnet

;; Legacy v6 / escrow-mainnet: no-arg, indefinite pause.
(contract-call? .escrow-v6 set-paused true)
```

> ⚠️ **Important blast radius on v3+**: pause blocks `create-escrow`, `deliver`, `release`, `refund`, `dispute`, and `extend-escrow` at the contract level. Admin dispute resolutions and seller self-rescue (for previously-delivered escrows past timeout) still work — these are the escape hatches that ensure funds are never permanently locked.
>
> ℹ️ Manual unpause lifts the pause early but does NOT reset the cooldown. Re-pause is rejected until `2 × duration` blocks have elapsed since the original pause.

### Two-Step Ownership Transfer

Ownership transfer uses a two-step process to prevent accidental transfers:

1. Current owner calls `set-pending-owner` with the new owner's address
2. New owner calls `confirm-owner` to accept ownership

If the wrong address is specified in step 1, the transfer can be cancelled before step 2.

## Off-Chain Security

### Row Level Security (RLS)

Supabase tables use RLS policies:

- **Public read**: Anyone can query escrow data
- **Service-role write**: Only the authenticated Edge Function can insert/update records
- No user can directly modify the database

### Webhook Authentication

The Chainhook webhook validates:

1. **Authorization header** — Bearer token matches the configured secret
2. **Event structure** — Validates payload schema before processing
3. **Idempotency** — Uses `ON CONFLICT` upserts to prevent duplicate entries

### Frontend Wallet Safety

- **No private keys** — The frontend never handles private keys. All signing happens in the wallet extension.
- **Post-conditions displayed** — Users see exactly what will be transferred before confirming.
- **Testnet detection** — Warning banner when operating on testnet.

## Best Practices

### For Users

1. **Verify the seller address** — Double-check the recipient before creating an escrow
2. **Review post-conditions** — Always review what your wallet shows before confirming
3. **Set reasonable durations** — Don't set excessively long durations unless necessary
4. **Dispute promptly** — If there's an issue, raise a dispute before the escrow expires

### For Developers

1. **Use post-conditions** — Always include proper post-conditions when building transactions
2. **Validate on-chain** — Don't trust Supabase data as authoritative; verify on-chain for critical operations
3. **Handle errors** — Map contract error codes to user-friendly messages
4. **Test on simnet first** — Use Clarinet's simnet before deploying to testnet

### For Admins

1. **Monitor disputes** — Resolve disputes promptly within the timeout window
2. **Set reasonable fees** — Keep fees competitive (default 0.5% is recommended)
3. **Emergency pause** — Use the pause function if a vulnerability is discovered
4. **Secure ownership** — Use a hardware wallet or multisig for the contract owner address

## Known Limitations

1. **Single admin** — Only one contract owner can resolve disputes. No multisig support in the contract itself (use a multisig wallet instead).
2. **No mid-flight milestones** — An escrow is a single locked amount. Use multiple escrows for milestone-based payments. v7+ `resolve-dispute-split` allows partial payouts *only via admin arbitration* on disputed escrows — not as a normal release path.
3. **Stacks-block timing on legacy contracts** — `escrow-v6` and `escrow-mainnet` use `stacks-block-height` for deadlines. Post-Nakamoto Stacks block time varies (5s to 2min), so "30-day" legacy escrows can resolve anywhere from ~10 to ~60 calendar days. v3+ contracts (`escrow-mainnet-v3`, `escrow-v8`) fix this by anchoring to burn-block-height (~10 min/block mainnet, stable via Bitcoin difficulty retarget).
4. **No on-chain metadata** — Escrow descriptions are stored on-chain but limited to 256 UTF-8 characters. Dispute reasons live off-chain in Supabase.
5. **sBTC dependency** — sBTC escrows depend on the sBTC token contract being deployed and functional on the network.
6. **Indexer is a dependency for UX, not for funds** — The Supabase indexer makes the frontend fast and provides notifications, but it's purely derived state. If the indexer goes offline, the contract still holds funds correctly; only the dashboard / notifications degrade. All on-chain actions remain functional via the wallet directly or the SDK.

## v3 audit history

Four self-audit passes on the v3 contract before mainnet deploy:

- **Pass 1**: lifecycle invariants, role authorization, fee math
- **Pass 2**: cross-token edge cases (STX vs sBTC accounting separation)
- **Pass 3**: time-anchor consistency (burn vs Stacks block confusion)
- **Pass 4**: pause / cooldown / sweep-orphans interactions — caught the indefinite-pause griefing vector that led to the time-bound pause + cooldown design

Full audit notes: see `docs/security/README.md` in the source repo.

Invariant test suite: 50+ assertions in `tests/escrow-mainnet-v3-invariants.test.ts`, covering all six v3 features end-to-end on simnet with deterministic block-jump scenarios.
