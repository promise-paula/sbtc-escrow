# Changelog

All notable changes to `sbtc-escrow-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-05-31

First release supporting the v3 escrow contracts (`escrow-mainnet-v3` on
mainnet, `escrow-v8` on testnet). Previous versions targeted v6/v7 contracts.

### Added

- **`supportsV3Features(contractId)`** capability registry — runtime check
  used to gate v3-only methods. Returns `true` for `escrow-mainnet-v3` and
  `escrow-v8`, `false` for older contracts.
- **Beneficiary delegation** on `createEscrow()`: optional `beneficiary`
  principal with buyer-equivalent rights (release / refund / dispute / extend).
- **`resolveExpiredDisputeForSeller(escrowId, opts)`** — seller self-rescue
  after 2× dispute-timeout on a previously-delivered escrow. Read-only check
  `isSellerRescueEligible(escrowId)` exposes the gate for UI use.
- **`sweepOrphans(tokenType, amount, opts)`** — admin recovery of misdirected
  funds (transfers that landed at the contract principal outside any escrow).
  Locked-balance accounting prevents touching active escrows.
- **`pauseContract(opts, durationBlocks)`** — v3 pause now requires an
  explicit duration in burn blocks. Auto-unpauses after the window AND blocks
  re-pause for an equal anti-chaining cooldown. Legacy contracts retain the
  no-arg signature.
- **`getPauseCooldownUntil()`** read-only — returns the burn-block at which
  re-pause becomes possible. Used by admin UIs to prevent `u4003` failures.
- **`resolveDisputeSplit(escrowId, buyerBps, opts)`** wired into v3 path
  (was already in 0.2.1 for v7+; now consistently dispatched per contract).
- New error codes mapped: `u1001`, `u2002–u2017`, `u3001–u3002`, `u4001–u4003`.
  See in-app docs at `/docs/reference/error-codes` for the full table.

### Changed

- **Default contract** on `EscrowClient` now resolves to `escrow-mainnet-v3`
  (mainnet) and `escrow-v8` (testnet). Construct with an explicit
  `contractName` to target a legacy version.
- **`durationBlocks` semantic** on v3+ contracts: now interpreted as burn
  blocks (~10 min/block mainnet, ~4 min/block testnet). On legacy v6/v7
  it remains Stacks blocks. Caller-side: pass `4320` for "30 days mainnet"
  on v3, vs `350400` on legacy.
- **Type docstrings** updated to reflect v3+ as the current default and v7+
  as legacy. `DELIVERED` status (u4) note now mentions v7+ contracts.

### Fixed

- `Escrow.expiresAt` rendering edge case where a freshly-created v3 escrow
  with one elapsed burn block would compute as "29.99 days" and floor-round
  to 29. The display layer now ceil-rounds for ≥7 day windows.

### Migration from 0.2.x

If you were targeting `escrow-mainnet-v2`:

```ts
// 0.2.x — explicitly target the legacy contract you already use
const client = new EscrowClient({
  network: 'mainnet',
  contractName: 'escrow-mainnet-v2',
});

// 0.3.0 — same code keeps working, you just no longer get the v3 default
// To use v3 features, omit contractName or set it to v3:
const v3 = new EscrowClient({ network: 'mainnet' });  // → escrow-mainnet-v3
```

Existing v2 escrows remain readable + actionable via the SDK — the client
auto-dispatches by `contractId` per escrow. New `create-escrow` calls go to
whatever contract the client is configured for.

## [0.2.1] - 2026-04-14

- v7+ contract support: `deliver()`, `isInReviewPeriod()`,
  `resolveDisputeSplit()`.
- Default contract: `escrow-v7` (testnet), `escrow-mainnet` (mainnet).

## [0.1.x - 0.2.0]

Initial releases targeting v6 contracts. STX + sBTC support, basic
read/write surface, admin operations.

[0.3.0]: https://github.com/promise-paula/sbtc-escrow/releases/tag/sdk-v0.3.0
[0.2.1]: https://github.com/promise-paula/sbtc-escrow/releases/tag/sdk-v0.2.1
