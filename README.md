# sBTC Escrow

Trustless payment escrow for Bitcoin on the Stacks blockchain. Lock funds in a
smart contract, release them when both sides agree, and recover them safely
when something goes wrong — without trusting an intermediary with your money.

[![npm version](https://img.shields.io/npm/v/sbtc-escrow-sdk.svg)](https://www.npmjs.com/package/sbtc-escrow-sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](sbtc-escrow-sdk/LICENSE)
[![Stacks](https://img.shields.io/badge/Stacks-mainnet-orange.svg)](https://explorer.hiro.so/txid/SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet)

---

## What this is

A complete escrow system for the Stacks ecosystem, supporting both **STX** (native)
and **sBTC** (SIP-010 fungible-token wrapped Bitcoin). Built for retail-scale
peer-to-peer transactions: freelancers, marketplaces, P2P trades, and small
businesses that want a non-custodial alternative to platforms like Escrow.com.

**The platform fee is 0.5%.** No hidden costs, no chargebacks, no custody.

## Live deployments

| Network     | Contract                                                                                                                                                 | App                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Mainnet** | [`SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet`](https://explorer.hiro.so/txid/SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet)     | `https://sbtc-escrow.vercel.app`         |
| **Testnet** | [`ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v6`](https://explorer.hiro.so/txid/ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v6?chain=testnet) | `https://sbtc-escrow-testnet.vercel.app` |

## Repository layout

```text
.
├── sbtc-escrow/              Smart contract + frontend monorepo
│   ├── contracts/            Clarity source — escrow-v6.clar (testnet), escrow-mainnet.clar
│   ├── tests/                Vitest contract test suite (~75 tests)
│   ├── deployments/          Clarinet deployment plans (simnet, testnet, mainnet)
│   ├── settings/             Per-network config
│   ├── frontend/             React + Vite app (the dApp itself)
│   ├── supabase/             Schema migrations + chainhook-webhook + indexer-health edge functions
│   ├── scripts/              Operations — register-chainhook, deploy-testnet, etc.
│   └── docs/                 Markdown docs served by the in-app /docs page
│
└── sbtc-escrow-sdk/          TypeScript SDK published to npm as `sbtc-escrow-sdk`
    ├── src/                  Client + types
    ├── dist/                 Built CJS + ESM + .d.ts (regenerated, gitignored)
    └── README.md             SDK-specific docs
```

## How the pieces fit together

```text
                       ┌──────────────────────────┐
                       │   User's wallet (Leather │
                       │   / Xverse) signs tx     │
                       └────────────┬─────────────┘
                                    │ stx_callContract via @stacks/connect
                                    ▼
┌──────────────────┐   read-only    ┌──────────────────────────────┐
│ Frontend (React) │ ──────────────▶│  escrow contract on Stacks   │
│  Vite + RQ       │ ◀── via SDK ── │  - STX + sBTC escrows        │
└────────┬─────────┘                │  - dispute timeouts          │
         │ realtime subscribe       │  - emits print events        │
         ▼                          └────────────┬─────────────────┘
┌────────────────────┐                           │ contract_log
│ Supabase (Postgres │◀─ service-role write ─┐   ▼
│ + Realtime)        │                       │ ┌───────────────────┐
│  escrows           │                       └─│ Edge function:    │◀── HTTP POST
│  escrow_events     │                         │ chainhook-webhook │   from Hiro
│  platform_config   │                         └───────────────────┘     ▲
└────────────────────┘                                                   │
                                                  ┌──────────────────────┴──┐
                                                  │ Hiro Chainhooks v2      │
                                                  │ predicate: contract_log │
                                                  │ on the escrow contract  │
                                                  └─────────────────────────┘
```

The contract is the source of truth. Hiro Chainhooks watches it and forwards
every print event to a Supabase edge function, which mirrors state into a
Postgres schema. The frontend reads from Supabase (fast, query-friendly) and
writes via wallet-signed transactions on Stacks. The SDK wraps the same
contract calls for backend / CLI integrations.

## Quick start

### Use the SDK

```bash
npm install sbtc-escrow-sdk @stacks/transactions @stacks/network
```

```typescript
import { EscrowClient, TokenType } from 'sbtc-escrow-sdk';

const client = new EscrowClient({ network: 'mainnet' });

// Read
const escrow = await client.getEscrow(1);
const stats = await client.getPlatformStats();

// Write (requires a private key — server-side / CLI use only)
const result = await client.createEscrow(
  {
    seller: 'SP...',
    amount: 100_000,                  // 0.001 BTC in sats
    description: 'Freelance work',
    durationBlocks: 1440,             // ~36 hours at 1.5 min/block
    tokenType: TokenType.SBTC,
  },
  { senderKey: process.env.SIGNER_KEY! },
);
```

For browser apps, use [`@stacks/connect`](https://docs.hiro.so/stacks/connect)
directly — see how the frontend does it in [`sbtc-escrow/frontend/src/lib/escrow-service.ts`](sbtc-escrow/frontend/src/lib/escrow-service.ts).

Full SDK reference: [sbtc-escrow-sdk/README.md](sbtc-escrow-sdk/README.md)

### Run the frontend locally

```bash
cd sbtc-escrow/frontend
npm install
cp .env.example .env       # then fill in Supabase URL + anon key
npm run dev                # serves on http://localhost:8080
```

The default config points at the testnet contract and a testnet Supabase
project. To run against mainnet locally, set the env vars from
[`sbtc-escrow/frontend/.env.example`](sbtc-escrow/frontend/.env.example).

### Run the contract test suite

```bash
cd sbtc-escrow
npm install
npm test                   # runs the v6 vitest suite (~75 tests)
```

### Deploy / re-deploy the contract

Uses [Clarinet](https://github.com/hirosystems/clarinet). The deployment plans
live in `sbtc-escrow/deployments/`. See `sbtc-escrow/docs/` for the full
runbook.

## Documentation

- **In-app docs** — visit `/docs` on either deployment for an integrator-facing
  reference (smart contract API, SDK, frontend integration, FAQ).
- **In-app onboarding** — `/how-it-works` is the plain-language guide for
  first-time non-crypto users.
- **SDK API** — [sbtc-escrow-sdk/README.md](sbtc-escrow-sdk/README.md)

## Security

This contract holds funds. Read this before using it for non-trivial amounts.

### What's in place

- `contract-caller`-based authorization (phishing-resistant; not `tx-sender`).
- Two-step admin ownership transfer.
- Buyer self-recovery after a dispute timeout — no admin lockout possible.
- Pause is a true emergency stop; admin can't move escrowed funds.
- CEI ordering on every fund-transfer function (state update before transfer).
- `MIN_DISPUTE_TIMEOUT = 144` blocks (~3.5 hours) on the active contracts —
  prevents an admin from setting a window short enough to bypass arbiter review.
- 0.5% platform fee, hard-capped at 5% by the contract.
- Per-token amount bounds enforced on-chain.
- Frontend hard-fails at module load if a "mainnet" build's contract address
  doesn't have an `SP/SM` prefix — silent testnet/mainnet mix-ups can't ship.

### Reporting a vulnerability

Open a GitHub issue on this repo for low-severity items. For anything
exploitable, contact the maintainer privately first — see the SDK's
[`package.json`](sbtc-escrow-sdk/package.json) for the contact email.

## Tech stack

- **Smart contract:** Clarity 4 (post-Nakamoto)
- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui + framer-motion + TanStack Query
- **Wallet:** [`@stacks/connect`](https://docs.hiro.so/stacks/connect) (Leather, Xverse)
- **Indexer:** [Hiro Chainhooks v2](https://docs.hiro.so/stacks/chainhook) → Supabase Edge Function → Postgres
- **Database / realtime:** [Supabase](https://supabase.com)
- **SDK:** TypeScript, built with [tsup](https://tsup.egoist.dev), CJS + ESM
- **Hosting:** Frontend on [Vercel](https://vercel.com); contract on Stacks; indexer on Supabase

## License

MIT — see [LICENSE](sbtc-escrow-sdk/LICENSE) in the SDK directory; the same
applies to the rest of the repo unless otherwise noted.

## Acknowledgements

Built with support from the Stacks Endowment. sBTC infrastructure provided by
[Hiro](https://www.hiro.so). Wallet integrations through
[Leather](https://leather.io) and [Xverse](https://www.xverse.app).
