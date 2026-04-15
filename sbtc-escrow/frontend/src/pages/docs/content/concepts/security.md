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
|------|-------------|
| **Buyer** | Create, release, dispute, extend, resolve-expired-dispute |
| **Seller** | Refund, dispute |
| **Owner** | Resolve disputes, pause/unpause, set fees, transfer ownership |
| **Anyone** | Refund expired escrows, read-only queries |

### Pause Mechanism

The contract owner can pause all new escrow creation in case of emergency:

```clarity
(contract-call? .escrow-v5 set-paused true)
```

> ℹ️ **Info:** Pausing only blocks `create-escrow`. Existing escrows can still be released, refunded, and disputed. This ensures funds are never locked by a pause.

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
2. **No partial releases** — Funds are released all-or-nothing. No milestone splits within a single escrow.
3. **Block time variability** — Block times are approximately 90 seconds but can vary. Duration calculations are approximate.
4. **No on-chain metadata** — Escrow descriptions are stored on-chain but limited to 256 UTF-8 characters.
5. **sBTC dependency** — sBTC escrows depend on the sBTC token contract being deployed and functional on the network.
