# sBTC Escrow

Bitcoin-native escrow on Stacks. Two parties lock STX or sBTC into a Clarity smart contract; funds release when both sides agree, get refunded on expiry, or get split by an admin/arbiter on dispute. **0.5% flat fee**, non-custodial, time-bounded.

Live on mainnet: [sbtcescrow.com](https://sbtcescrow.com) · Source: this repo · SDK: [`sbtc-escrow-sdk`](../sbtc-escrow-sdk) (npm package, sibling directory)

## Contracts

| Network | Contract | Status |
| --- | --- | --- |
| Mainnet | `SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v3` | Active (v3 features) |
| Mainnet | `SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v2` | Legacy (read/act on existing escrows) |
| Testnet | `ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v8` | Active (v3-equivalent) |
| Testnet | `ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v7` | Legacy |

v3 features over v2: burn-block-anchored expiry (Bitcoin-block timing, not Stacks-block), optional beneficiary delegation (third party with buyer-equivalent rights), seller self-rescue after 2× dispute timeout, time-bounded admin pause with anti-chaining cooldown, sweep-orphans for misdirected funds, per-escrow fee-recipient snapshot, partial dispute resolution (split payout).

## Repository layout

```text
sbtc-escrow/
├── contracts/                          # Clarity contracts (v6, v7, v8 testnet · mainnet-v2, mainnet-v3)
├── tests/                              # Vitest invariant suite (50+ assertions per contract version)
├── deployments/                        # Clarinet deploy plans (simnet, testnet, mainnet)
├── frontend/                           # Vite + React app (sbtcescrow.com)
├── supabase/                           # Edge functions + DB migrations
│   └── functions/chainhook-webhook/    # Indexes contract events into Postgres
├── scripts/                            # Hiro chainhook registration, ops helpers
└── docs/                               # Engineering docs (security audits, deploy playbooks)

../sbtc-escrow-sdk/                     # TypeScript SDK (separate npm package)
```

## Tech stack

| Layer | Stack |
| --- | --- |
| Smart contract | Clarity 4, Clarinet 3.x |
| Frontend | React 18, Vite 5, TypeScript, Tailwind, shadcn/ui |
| Wallet integration | `@stacks/connect` 8.x, `@stacks/transactions` 7.x |
| Backend | Supabase (Postgres 15 + Edge Functions on Deno) |
| Indexer | Hiro Chainhooks v2 → Supabase Edge Function → Postgres |
| Tests | Vitest with `vitest-environment-clarinet` |
| SDK | TypeScript, published as `sbtc-escrow-sdk` |

## Quick start (developer)

### Run the frontend against mainnet

```bash
cd frontend
cp .env.example .env.local
# edit .env.local: set VITE_STACKS_NETWORK=mainnet (or leave testnet for safety)
npm install
npm run dev
# → http://localhost:8080
```

### Run the contract tests

```bash
npm install                                   # root deps
npm test                                      # runs Vitest invariant suite
# Specific contract:
npx vitest run tests/escrow-mainnet-v3-invariants.test.ts
```

### Deploy a contract locally (simnet) for development

```bash
clarinet console                              # interactive REPL with all contracts loaded
clarinet check                                # static analysis
```

### Deploy to testnet

```bash
clarinet deployments generate --testnet --low-cost
# Edit the plan to remove any contracts you don't want re-deployed
clarinet deployments apply -p deployments/default.testnet-plan.yaml
```

### Deploy to mainnet

See [docs/v3-deploy-playbook.md](docs/v3-deploy-playbook.md) for the step-by-step. Short version:

```bash
clarinet deployments generate --mainnet --low-cost
clarinet deployments apply -p deployments/default.mainnet-plan.yaml
```

## SDK

The TypeScript SDK lives in the sibling repo [`sbtc-escrow-sdk`](../sbtc-escrow-sdk). Install it in your own project:

```bash
npm install sbtc-escrow-sdk
```

Minimal usage:

```ts
import { EscrowClient } from 'sbtc-escrow-sdk';

const client = new EscrowClient({
  network: 'mainnet',
  contractAddress: 'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA',
  contractName: 'escrow-mainnet-v3',
});

// Read
const escrow = await client.getEscrow(1);

// Write (returns wallet-signed tx options for @stacks/connect)
const tx = await client.createEscrow({
  seller: 'SP…',
  amount: 100_000_000n,             // 100 STX in micro-STX
  duration: 4320,                   // ~30 days in burn blocks
  description: 'Logo design',
  tokenType: 'STX',
});
```

Full API: see [in-app docs](https://sbtcescrow.com/docs/sdk/overview) or the SDK repo's README.

## Indexer

Hiro Chainhooks listen for `contract_log` events on the escrow contracts and POST them to a Supabase Edge Function (`chainhook-webhook`). The function:

1. Authenticates via shared `CHAINHOOK_AUTH_TOKEN` (Hiro's consumer secret pattern)
2. Parses Clarity event payloads into typed records
3. Resolves burn-block heights for v3+ events (six payload-field paths + fallback to Hiro tx API)
4. Upserts to `escrows` and `escrow_events` tables, idempotent on duplicate deliveries
5. Handles chain reorgs via the `rollback` event branch

Webhook source: [`supabase/functions/chainhook-webhook/index.ts`](supabase/functions/chainhook-webhook/index.ts).

## Architecture

```text
Buyer wallet ──┐
               ├── tx ──▶  Stacks chain ──▶  escrow-mainnet-v3.clar
Seller wallet ─┘                                    │
                                                    │ emits contract_log events
                                                    ▼
                                            Hiro Chainhook (predicate)
                                                    │
                                                    │ POST + Bearer auth
                                                    ▼
                                            Supabase Edge Function
                                                    │
                                                    │ INSERT / UPDATE
                                                    ▼
                                            Postgres (escrows, escrow_events)
                                                    │
                                                    │ realtime + REST
                                                    ▼
                                            Frontend (sbtcescrow.com)
```

The frontend reads from Postgres (fast, no node load) but writes to the chain directly via wallet. Postgres is purely a derived index — the contract is always the source of truth.

## Security

- Three-pass self-audit + v3 fourth pass: see [docs/security/README.md](docs/security/README.md)
- 50+ invariant tests per contract version: [`tests/escrow-mainnet-v3-invariants.test.ts`](tests/escrow-mainnet-v3-invariants.test.ts)
- Non-custodial: funds only move on signed buyer/seller/beneficiary action or admin dispute resolution
- Time-bounded admin pause prevents indefinite-pause griefing (cooldown = 2× pause duration)
- Locked-balance accounting prevents `sweep-orphans` from touching active escrows

## Contributing

This is a grant-funded project under the Stacks Foundation. PRs welcome for:

- Additional invariant tests
- SDK ergonomics improvements
- Translations / i18n
- Bug reports with reproduction steps

See [docs/v3-deploy-playbook.md](docs/v3-deploy-playbook.md) for the deploy ops flow before opening contract changes.

## Links

- Live site: [sbtcescrow.com](https://sbtcescrow.com)
- SDK on npm: `sbtc-escrow-sdk`
- Mainnet contract: [Explorer](https://explorer.hiro.so/txid/SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v3)
- Stacks docs: [docs.stacks.co](https://docs.stacks.co)
- sBTC docs: [docs.stacks.co/concepts/sbtc](https://docs.stacks.co/concepts/sbtc)

## License

MIT
