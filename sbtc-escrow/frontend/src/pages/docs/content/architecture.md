# Architecture

sBTC Escrow is a multi-layer system with on-chain smart contracts at the core, an off-chain indexer for fast queries, and a React frontend for user interaction.

## System Diagram

<div style="display:flex;flex-direction:column;gap:12px;font-family:ui-monospace,monospace;font-size:13px;line-height:1.4;max-width:100%;overflow-x:auto">

<div style="border:2px solid #F7931A;border-radius:8px;padding:16px;background:rgba(247,147,26,0.05)">
<div style="text-align:center;font-weight:700;color:#F7931A;margin-bottom:12px">USER LAYER</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center;min-width:120px"><strong>Frontend</strong><br/><span style="opacity:0.7;font-size:12px">React App</span></div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center;min-width:120px"><strong>SDK Client</strong><br/><span style="opacity:0.7;font-size:12px">Node.js</span></div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center;min-width:120px"><strong>Direct Calls</strong><br/><span style="opacity:0.7;font-size:12px">Clarinet</span></div>
</div>
</div>

<div style="text-align:center;color:#F7931A;font-size:20px">▼ &nbsp; ▼ &nbsp; ▼</div>

<div style="border:2px solid #F7931A;border-radius:8px;padding:16px;background:rgba(247,147,26,0.05)">
<div style="text-align:center;font-weight:700;color:#F7931A;margin-bottom:12px">STACKS BLOCKCHAIN</div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:12px;margin-bottom:10px">
<div style="text-align:center;font-weight:600;margin-bottom:10px">escrow-v5.clar</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:10px">
<div style="border:1px solid #d4d4d8;border-radius:4px;padding:6px 10px;text-align:center;font-size:12px">Create Escrow</div>
<div style="border:1px solid #d4d4d8;border-radius:4px;padding:6px 10px;text-align:center;font-size:12px">Release Funds</div>
<div style="border:1px solid #d4d4d8;border-radius:4px;padding:6px 10px;text-align:center;font-size:12px">Refund Funds</div>
<div style="border:1px solid #d4d4d8;border-radius:4px;padding:6px 10px;text-align:center;font-size:12px">Dispute + Resolve</div>
</div>
<div style="font-size:12px;opacity:0.7;text-align:center">Data: escrows map · user-stats map · platform-stats</div>
</div>
<div style="text-align:center;font-size:12px;opacity:0.7">events (prints) ▼</div>
</div>

<div style="text-align:center;color:#F7931A;font-size:20px">▼</div>

<div style="border:2px solid #F7931A;border-radius:8px;padding:16px;background:rgba(247,147,26,0.05)">
<div style="text-align:center;font-weight:700;color:#F7931A;margin-bottom:12px">INDEXER LAYER</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;margin-bottom:12px">
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center"><strong>Chainhook</strong><br/><span style="opacity:0.7;font-size:12px">Observer</span></div>
<div style="color:#F7931A;font-weight:700">→ POST →</div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:8px 14px;text-align:center"><strong>Edge Function</strong><br/><span style="opacity:0.7;font-size:12px">chainhook-webhook</span></div>
</div>
<div style="text-align:center;color:#F7931A;font-size:16px;margin-bottom:8px">▼</div>
<div style="border:1px solid #d4d4d8;border-radius:6px;padding:12px;max-width:280px;margin:0 auto">
<div style="font-weight:600;text-align:center;margin-bottom:6px">Supabase PostgreSQL</div>
<div style="font-size:12px;opacity:0.7">• escrows table<br/>• escrow_events table<br/>• platform_config table<br/>• RLS + Realtime enabled</div>
</div>
</div>

</div>

## Components

### Smart Contract (`escrow-v5.clar`)

The on-chain Clarity v4 contract is the source of truth. It:

- **Holds funds** — STX and sBTC are transferred into the contract on escrow creation
- **Enforces rules** — Only authorized parties can release, refund, or dispute
- **Tracks state** — Escrow records, user stats, and platform stats stored in contract maps
- **Emits events** — `print` statements emit structured events consumed by Chainhook

> ℹ️ **Info:** The contract uses `contract-caller` authorization — all public functions verify that `contract-caller == tx-sender`, preventing phishing through malicious intermediary contracts.

### TypeScript SDK (`sbtc-escrow-sdk`)

A developer-friendly wrapper around the Stacks blockchain API:

- **Read-only calls** via `callReadOnlyFunction` — no wallet or signing needed
- **Write transactions** via `makeContractCall` + `broadcastTransaction` — requires a private key
- **Network-aware** — auto-configures contract addresses and API URLs based on `'testnet'` or `'mainnet'`
- **Post-conditions** — Automatically builds STX/FT post-conditions for transaction safety

### Frontend App (`frontend/`)

A React SPA deployed on Vercel:

| Technology           | Purpose                             |
| -------------------- | ----------------------------------- |
| React 18 + Router v6 | UI framework and routing            |
| Stacks Connect       | Wallet integration (Leather/Xverse) |
| TanStack React Query | Data fetching + caching             |
| Supabase JS          | Realtime subscriptions              |
| Radix UI             | Accessible component primitives     |
| Tailwind CSS         | Styling                             |
| Framer Motion        | Animations                          |
| Vite                 | Build tooling                       |

### Supabase Backend

Off-chain indexing layer for fast queries:

- **Edge Functions** — `chainhook-webhook` processes blockchain events and upserts into Postgres
- **PostgreSQL** — Indexed tables for escrows, events, and platform config
- **Row Level Security** — Public read, service-role-only write
- **Realtime** — Postgres changes broadcast to connected clients via WebSocket

### Chainhook

[Chainhook](https://docs.hiro.so/chainhook) is a Stacks event observer that:

1. Monitors the `escrow-v5` contract for transaction events
2. Extracts `print` event data from contract calls
3. POSTs structured JSON to the Supabase edge function
4. The edge function parses events and writes to the database

This enables the frontend to display data without polling the blockchain directly.

## Data Flow

### Creating an Escrow

<div style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.8;padding:16px;border:1px solid #d4d4d8;border-radius:8px;background:rgba(247,147,26,0.03);overflow-x:auto">
<strong>User</strong> → <strong>Wallet</strong> → <strong>Stacks Node</strong> → <code>escrow-v5.create-escrow()</code><br/>
&nbsp;&nbsp;&nbsp;&nbsp;├── STX/sBTC transferred to contract<br/>
&nbsp;&nbsp;&nbsp;&nbsp;├── Escrow record written to map<br/>
&nbsp;&nbsp;&nbsp;&nbsp;├── User stats updated<br/>
&nbsp;&nbsp;&nbsp;&nbsp;└── Event printed<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
&nbsp;&nbsp;&nbsp;&nbsp;<strong>Chainhook</strong> detects event<br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
&nbsp;&nbsp;&nbsp;&nbsp;<strong>Edge Function</strong> → <strong>Supabase</strong><br/>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↓<br/>
&nbsp;&nbsp;&nbsp;&nbsp;<strong>Frontend</strong> receives realtime update
</div>

### Reading Escrow Data

<div style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.8;padding:16px;border:1px solid #d4d4d8;border-radius:8px;background:rgba(247,147,26,0.03);overflow-x:auto">
<strong>Frontend</strong><br/>
&nbsp;&nbsp;├── <strong>Supabase</strong> (fast, indexed) → list views, search, events<br/>
&nbsp;&nbsp;└── <strong>Stacks API</strong> (read-only calls) → authoritative on-chain state
</div>

> 📝 **Note:** The frontend uses Supabase for list views and event feeds (fast, supports filtering and pagination), but falls back to direct read-only contract calls for authoritative data when needed (e.g., checking if a dispute is timed out).

## Directory Structure

<div style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.7;padding:16px;border:1px solid #d4d4d8;border-radius:8px;background:rgba(247,147,26,0.03);overflow-x:auto">
<code>sbtc-escrow/</code><br/>
<span style="opacity:0.5">├─</span> <strong>contracts/</strong> <span style="opacity:0.5">— Clarity smart contracts</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>escrow-v5.clar</code> <span style="opacity:0.5">— Primary V4 dual-token contract</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> <code>escrow.clar</code> <span style="opacity:0.5">— Legacy V3 STX-only contract</span><br/>
<span style="opacity:0.5">├─</span> <strong>tests/</strong> <span style="opacity:0.5">— Clarinet + Vitest contract tests</span><br/>
<span style="opacity:0.5">├─</span> <strong>scripts/</strong> <span style="opacity:0.5">— Deployment and testnet scripts</span><br/>
<span style="opacity:0.5">├─</span> <strong>settings/</strong> <span style="opacity:0.5">— Clarinet network configs</span><br/>
<span style="opacity:0.5">├─</span> <strong>deployments/</strong> <span style="opacity:0.5">— Deployment plans (simnet/testnet)</span><br/>
<span style="opacity:0.5">├─</span> <strong>frontend/</strong> <span style="opacity:0.5">— React frontend application</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> <strong>src/</strong><br/>
<span style="opacity:0.5">&nbsp;&nbsp;&nbsp;&nbsp;├─</span> <code>pages/</code> <span style="opacity:0.5">— Route pages</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;&nbsp;&nbsp;├─</span> <code>components/</code> <span style="opacity:0.5">— UI components</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;&nbsp;&nbsp;├─</span> <code>hooks/</code> <span style="opacity:0.5">— React hooks</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;&nbsp;&nbsp;├─</span> <code>contexts/</code> <span style="opacity:0.5">— Wallet + Theme providers</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;&nbsp;&nbsp;└─</span> <code>lib/</code> <span style="opacity:0.5">— Services, types, utilities</span><br/>
<span style="opacity:0.5">├─</span> <strong>supabase/</strong> <span style="opacity:0.5">— Supabase backend</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>functions/</code> <span style="opacity:0.5">— Edge functions (webhooks)</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> <code>migrations/</code> <span style="opacity:0.5">— Database schema migrations</span><br/>
<span style="opacity:0.5">└─</span> <code>Clarinet.toml</code> <span style="opacity:0.5">— Clarinet project config</span>
</div>
