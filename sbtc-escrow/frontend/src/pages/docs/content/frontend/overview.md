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

```
frontend/src/
├── App.tsx                 # Router + providers
├── main.tsx                # Entry point
├── index.css               # Global styles + CSS variables
├── components/
│   ├── layout/             # AppLayout, Sidebar, Header, MobileNav
│   ├── shared/             # Reusable: Logo, StatusBadge, WalletButton
│   └── ui/                 # Radix-based primitives (shadcn/ui)
├── contexts/
│   ├── ThemeContext.tsx     # Dark/light mode
│   └── WalletContext.tsx    # Stacks wallet state
├── hooks/
│   ├── use-escrow.ts       # Escrow data hooks
│   ├── use-admin.ts        # Admin permission check
│   ├── use-block-height.ts # Current block height
│   └── ...
├── lib/
│   ├── escrow-service.ts   # Contract interaction helpers
│   ├── admin-service.ts    # Admin operations
│   ├── post-conditions.ts  # Stacks post-condition builders
│   ├── stacks-config.ts    # Network configuration
│   ├── supabase.ts         # Supabase client
│   └── types.ts            # Shared type definitions
└── pages/
    ├── Landing.tsx
    ├── Dashboard.tsx
    ├── CreateEscrow.tsx
    └── ...
```

## Next Steps

- [Setup](/docs/frontend/setup) — Install dependencies and run locally
- [Wallet Integration](/docs/frontend/wallet-integration) — How Stacks Connect works
- [Hooks](/docs/frontend/hooks) — Custom React hooks
- [Services](/docs/frontend/services) — Business logic layer
