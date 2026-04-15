# Frontend Setup

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9 (or yarn/pnpm)
- A Stacks wallet extension (Leather or Xverse)

## Installation

```bash
# Clone the repo
git clone https://github.com/promise-paula/sbtc-escrow.git
cd sbtc-escrow/frontend

# Install dependencies
npm install
```

## Environment Variables

Create a `.env` file in the `frontend/` directory:

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Stacks Network
VITE_STACKS_NETWORK=testnet

# Contract Address
VITE_CONTRACT_ADDRESS=ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N
VITE_CONTRACT_NAME=escrow-v5
```

> ⚠️ **Warning:** Never commit `.env` files with real keys. The anon key is public, but still keep it in env vars for flexibility.

## Development Server

```bash
npm run dev
```

The app runs at `http://localhost:8080` by default.

## Build for Production

```bash
npm run build
```

Output is in `dist/`. Preview locally:

```bash
npm run preview
```

## Vercel Deployment

The project includes a `vercel.json` for SPA routing:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

Deploy by connecting the `frontend/` directory to Vercel and setting the environment variables in the Vercel dashboard.

## Path Aliases

The project uses `@/` as a path alias to `src/`:

```typescript
import { Button } from "@/components/ui/button";
import { useEscrow } from "@/hooks/use-escrow";
```

Configured in both `tsconfig.json` and `vite.config.ts`.
