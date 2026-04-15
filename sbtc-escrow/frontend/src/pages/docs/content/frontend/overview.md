# Frontend Overview

The sBTC Escrow frontend is a production-ready React application for creating and managing escrows through a web interface.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| **React 18** | UI framework |
| **React Router v6** | Client-side routing |
| **Vite** | Build tooling (SWC compiler) |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling |
| **Radix UI** | Accessible component primitives |
| **Framer Motion** | Animations |
| **Stacks Connect** | Wallet integration (Leather/Xverse) |
| **TanStack React Query** | Data fetching + caching |
| **Supabase JS** | Realtime subscriptions |
| **React Hook Form** | Form management |
| **Zod** | Schema validation |
| **Recharts** | Analytics charts |

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Marketing page with features, stats, CTA |
| `/dashboard` | Dashboard | Overview with recent escrows, stats cards |
| `/create` | CreateEscrow | Escrow creation form |
| `/escrows` | MyEscrows | List of user's escrows with filtering |
| `/escrow/:id` | EscrowDetail | Single escrow detail with actions |
| `/activity` | Activity | Transaction history feed |
| `/analytics` | Analytics | Charts and platform statistics |
| `/settings` | Settings | User preferences |
| `/admin` | AdminDashboard | Admin overview (guarded) |
| `/admin/disputes` | DisputeQueue | Dispute management (guarded) |
| `/admin/controls` | ContractControls | Contract settings (guarded) |
| `/docs/*` | Documentation | This documentation |

## Project Structure

<div style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.7;padding:16px;border:1px solid #d4d4d8;border-radius:8px;background:rgba(247,147,26,0.03);overflow-x:auto">
<code>frontend/src/</code><br/>
<span style="opacity:0.5">├─</span> <code>App.tsx</code> <span style="opacity:0.5">— Router + providers</span><br/>
<span style="opacity:0.5">├─</span> <code>main.tsx</code> <span style="opacity:0.5">— Entry point</span><br/>
<span style="opacity:0.5">├─</span> <code>index.css</code> <span style="opacity:0.5">— Global styles + CSS variables</span><br/>
<span style="opacity:0.5">├─</span> <strong>components/</strong><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>layout/</code> <span style="opacity:0.5">— AppLayout, Sidebar, Header, MobileNav</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>shared/</code> <span style="opacity:0.5">— Logo, StatusBadge, WalletButton</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> <code>ui/</code> <span style="opacity:0.5">— Radix primitives (shadcn/ui)</span><br/>
<span style="opacity:0.5">├─</span> <strong>contexts/</strong><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>ThemeContext.tsx</code> <span style="opacity:0.5">— Dark/light mode</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> <code>WalletContext.tsx</code> <span style="opacity:0.5">— Stacks wallet state</span><br/>
<span style="opacity:0.5">├─</span> <strong>hooks/</strong><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>use-escrow.ts</code> <span style="opacity:0.5">— Escrow data hooks</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>use-admin.ts</code> <span style="opacity:0.5">— Admin permission check</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> <code>use-block-height.ts</code> <span style="opacity:0.5">— Current block height</span><br/>
<span style="opacity:0.5">├─</span> <strong>lib/</strong><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>escrow-service.ts</code> <span style="opacity:0.5">— Contract interaction helpers</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>admin-service.ts</code> <span style="opacity:0.5">— Admin operations</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>post-conditions.ts</code> <span style="opacity:0.5">— Post-condition builders</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>stacks-config.ts</code> <span style="opacity:0.5">— Network configuration</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>supabase.ts</code> <span style="opacity:0.5">— Supabase client</span><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> <code>types.ts</code> <span style="opacity:0.5">— Shared type definitions</span><br/>
<span style="opacity:0.5">└─</span> <strong>pages/</strong><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>Landing.tsx</code><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>Dashboard.tsx</code><br/>
<span style="opacity:0.5">&nbsp;&nbsp;├─</span> <code>CreateEscrow.tsx</code><br/>
<span style="opacity:0.5">&nbsp;&nbsp;└─</span> …
</div>

## Next Steps

- [Setup](/docs/frontend/setup) — Install dependencies and run locally
- [Wallet Integration](/docs/frontend/wallet-integration) — How Stacks Connect works
- [Hooks](/docs/frontend/hooks) — Custom React hooks
- [Services](/docs/frontend/services) — Business logic layer
