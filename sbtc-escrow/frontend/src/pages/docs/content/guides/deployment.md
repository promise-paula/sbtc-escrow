# Deployment Guide

Step-by-step deployment for smart contracts, frontend, Supabase, and Chainhook indexer.

## Smart Contract Deployment

### Testnet

1. **Configure Testnet settings** in `settings/Testnet.toml`:

```toml
[network]
name = "testnet"
stacks_node_rpc_url = "https://api.testnet.hiro.so"

[accounts.deployer]
mnemonic = "<your-testnet-mnemonic>"
```

2. **Deploy the contract**:

```bash
cd sbtc-escrow
npx ts-node scripts/deploy-testnet.ts
```

3. **Verify deployment** on the Stacks Explorer.

### Mainnet

> **Warning:** Mainnet deployment is irreversible. Test thoroughly on testnet first.

1. Configure `settings/Mainnet.toml` with your mainnet deployer account
2. Ensure the deployer has sufficient STX for deployment fees
3. Deploy using the Clarinet deployment plan:

```bash
clarinet deployments apply -p deployments/default.mainnet-plan.yaml
```

---

## Frontend Deployment (Vercel)

The frontend is configured for Vercel deployment.

### Setup

1. **Connect your GitHub repo** to Vercel
2. **Configure build settings**:

| Setting | Value |
|---------|-------|
| Framework | Vite |
| Root Directory | `sbtc-escrow/frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

3. **Set environment variables** in Vercel dashboard:

```
VITE_STACKS_NETWORK=mainnet
VITE_CONTRACT_ADDRESS=SP...
VITE_CONTRACT_NAME=escrow-v5
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### SPA Routing

The `vercel.json` handles client-side routing:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Custom Domain

1. Add your domain in Vercel project settings
2. Configure DNS records as instructed
3. SSL is automatic

---

## Supabase Setup

### Create Project

1. Create a new project at [supabase.com](https://supabase.com)
2. Note the project URL and API keys

### Apply Migrations

```bash
# Link to your project
npx supabase link --project-ref your-project-ref

# Apply all migrations
npx supabase db push
```

### Deploy Edge Functions

```bash
# Deploy the chainhook webhook
npx supabase functions deploy chainhook-webhook

# Deploy the health check
npx supabase functions deploy indexer-health
```

### Set Function Secrets

```bash
npx supabase secrets set CHAINHOOK_SECRET=your-webhook-secret
```

---

## Chainhook Indexer

Chainhook watches the blockchain for escrow contract events and sends them to your Supabase Edge Function.

### Register Chainhook

```bash
npx ts-node scripts/register-chainhook.ts
```

This registers a predicate that watches for:
- Contract calls to escrow-v5
- Print events from the contract

### Chainhook Configuration

The registration script sends a predicate like:

```json
{
  "chain": "stacks",
  "networks": {
    "mainnet": {
      "if_this": {
        "scope": "contract_call",
        "contract_identifier": "SP.../escrow-v5"
      },
      "then_that": {
        "http_post": {
          "url": "https://your-project.supabase.co/functions/v1/chainhook-webhook",
          "authorization_header": "Bearer your-secret"
        }
      }
    }
  }
}
```

---

## Production Checklist

### Before Launch

- [ ] Contract deployed and verified on mainnet
- [ ] Frontend deployed with correct env vars
- [ ] Supabase migrations applied
- [ ] Edge Functions deployed
- [ ] Chainhook registered and receiving events
- [ ] RLS policies verified
- [ ] Custom domain configured with SSL
- [ ] Error monitoring set up

### Monitoring

- **Supabase Dashboard**: Monitor database, Edge Function logs, and Realtime connections
- **Vercel Analytics**: Track frontend performance and errors
- **Chainhook Health**: Use the `indexer-health` Edge Function to check indexer status

```bash
curl https://your-project.supabase.co/functions/v1/indexer-health
```

### Updating the Contract

Since Clarity contracts are immutable once deployed:

1. Deploy a new version (e.g., `escrow-v6`)
2. Update frontend env vars to point to the new contract
3. Update Chainhook predicate for the new contract
4. Keep the old contract indexed for historical data
