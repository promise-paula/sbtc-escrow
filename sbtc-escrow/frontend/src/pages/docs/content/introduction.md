# sBTC Escrow

**sBTC Escrow** is a trustless, non-custodial escrow protocol built on the [Stacks](https://www.stacks.co/) blockchain. It enables secure peer-to-peer payments using **STX** and **sBTC** (Bitcoin-backed) tokens, with on-chain dispute resolution, automatic expiry, and a 0.5% platform fee.

## Quick Links

- **[Quickstart](/docs/quickstart)** — Create your first escrow in under 5 minutes
- **[Smart Contract](/docs/contract/overview)** — Clarity contract reference and data structures
- **[TypeScript SDK](/docs/sdk/overview)** — Integrate escrow into your application
- **[Frontend App](/docs/frontend/overview)** — React + Stacks Connect application guide

## What Is This?

sBTC Escrow is a complete escrow infrastructure for the Stacks ecosystem:

- **Smart Contract** — A Clarity v4 contract deployed on Stacks that holds funds in escrow until release, refund, or dispute resolution.
- **TypeScript SDK** — A developer-friendly client for interacting with the contract from any Node.js or browser environment.
- **Frontend App** — A production-ready React application with wallet integration, realtime updates, and admin controls.
- **Indexer Backend** — Supabase-powered event indexing via Chainhook webhooks for fast queries and realtime subscriptions.

## Who Is This For?

| Audience | Use Case |
|----------|----------|
| **Freelancers** | Secure milestone-based payments for contract work |
| **OTC Traders** | Trustless peer-to-peer token trades |
| **DAOs & Grants** | Milestone-gated grant disbursements |
| **Service Providers** | Escrow deposits for services before delivery |
| **Developers** | Build escrow-powered dApps with the SDK |

## Key Features

**Dual-Token Support** — Native support for both **STX** (Stacks native token) and **sBTC** (SIP-010 Bitcoin-backed token). Create escrows in either token with appropriate min/max limits.

**Non-Custodial** — Funds are held by the smart contract, not a third party. The contract enforces all rules on-chain — no one can move funds outside the defined flows.

**Dispute Resolution** — Either party can raise a dispute. The contract owner resolves disputes, or buyers can self-recover funds after a configurable timeout period (default ~30 days).

**Automatic Expiry** — Escrows have a deadline. After expiry, anyone can trigger a refund to the buyer. Buyers can also extend the deadline before it passes.

**Contract-Caller Authorization** — All functions validate `contract-caller == tx-sender`, preventing phishing attacks through malicious intermediary contracts.

**Realtime Indexing** — Chainhook webhooks feed blockchain events into Supabase, enabling realtime frontend updates and fast querying without direct chain reads.

## Protocol Numbers

| Parameter | Value |
|-----------|-------|
| Platform Fee | 0.5% (50 BPS) |
| Max Fee | 5% (500 BPS) |
| STX Min/Max | 0.001 STX — 100M STX |
| sBTC Min/Max | 0.0001 BTC — 100 BTC |
| Max Duration | ~365 days (350,400 blocks) |
| Dispute Timeout | ~30 days (28,800 blocks) |
| Block Time | ~90 seconds (post-Nakamoto) |

## Networks

| Network | Contract | Status |
|---------|----------|--------|
| **Testnet** | `ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v5` | Live |
| **Mainnet** | TBD | Coming Soon |

## Architecture at a Glance

<div style="display:flex;flex-direction:column;gap:12px;font-family:ui-monospace,monospace;font-size:13px">
<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center">
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center"><strong>Frontend App</strong><br/><span style="opacity:0.7;font-size:12px">React / Vite</span></div>
<div style="color:#F7931A;font-weight:700">→</div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center"><strong>Stacks Connect</strong><br/><span style="opacity:0.7;font-size:12px">Wallet TX</span></div>
<div style="color:#F7931A;font-weight:700">→</div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center"><strong>Stacks Chain</strong><br/><span style="opacity:0.7;font-size:12px">Clarity V4</span></div>
</div>
<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
<div style="text-align:center;font-size:12px;opacity:0.7">▲ realtime</div>
<div style="text-align:center;font-size:12px;opacity:0.7">Chainhook ▼</div>
</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center">
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center"><strong>Supabase</strong><br/><span style="opacity:0.7;font-size:12px">Postgres</span></div>
<div style="color:#F7931A;font-weight:700">← POST ←</div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center"><strong>Edge Function</strong><br/><span style="opacity:0.7;font-size:12px">Indexer</span></div>
</div>
</div>
