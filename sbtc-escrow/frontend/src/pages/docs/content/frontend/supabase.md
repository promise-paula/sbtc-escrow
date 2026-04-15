# Supabase Integration

The sBTC Escrow platform uses Supabase as its off-chain data layer for indexing blockchain events, real-time updates, and analytics.

## Architecture

```
Stacks Blockchain → Chainhook → Edge Function → Supabase DB → Frontend
```

1. **Chainhook** monitors the escrow contract for events
2. **chainhook-webhook** Edge Function receives events and writes to Supabase
3. **Frontend** reads indexed data from Supabase for fast queries
4. **Realtime** subscriptions push updates to connected clients

---

## Database Schema

### escrows table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `bigint` | On-chain escrow ID (primary key) |
| `sender` | `text` | Sender's Stacks address |
| `recipient` | `text` | Recipient's Stacks address |
| `amount` | `bigint` | Amount in micro-units |
| `token_type` | `text` | `STX` or `sBTC` |
| `status` | `text` | Current escrow status |
| `created_at_block` | `bigint` | Block height when created |
| `expires_at_block` | `bigint` | Block height when escrow expires |
| `funded_at_block` | `bigint` | Block height when funded |
| `completed_at_block` | `bigint` | Block height when completed |
| `description` | `text` | Optional escrow description |
| `tx_id` | `text` | Transaction ID |
| `updated_at` | `timestamptz` | Last update timestamp |

### escrow_events table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Event ID |
| `escrow_id` | `bigint` | Related escrow ID |
| `event_type` | `text` | Event type (created, funded, completed, etc.) |
| `block_height` | `bigint` | Block where event occurred |
| `tx_id` | `text` | Transaction ID |
| `data` | `jsonb` | Additional event data |
| `created_at` | `timestamptz` | Timestamp |

---

## Row Level Security (RLS)

All tables have RLS enabled. Policies:

- **Public read**: Anyone can read escrow data (it's on-chain anyway)
- **Service role write**: Only the service role (used by Edge Functions) can insert/update
- **No direct client writes**: The frontend never writes directly to the database

```sql
-- Example RLS policy
CREATE POLICY "Public read access"
  ON escrows FOR SELECT
  USING (true);

CREATE POLICY "Service role insert"
  ON escrows FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
```

---

## Edge Functions

### chainhook-webhook

Receives webhook events from Chainhook and processes them:

```typescript
// supabase/functions/chainhook-webhook/index.ts
Deno.serve(async (req) => {
  const payload = await req.json();

  // Validate webhook signature
  // Parse Chainhook event
  // Upsert escrow data
  // Insert event record

  return new Response("OK");
});
```

### indexer-health

Health check endpoint for monitoring the indexer:

```typescript
// Returns indexer status, last processed block, lag, etc.
GET /functions/v1/indexer-health
```

---

## Realtime Subscriptions

The frontend subscribes to real-time changes via Supabase Realtime:

```typescript
// In use-escrow-realtime.ts
const channel = supabase
  .channel("escrow-changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "escrows" },
    (payload) => {
      // Invalidate React Query cache
      queryClient.invalidateQueries({ queryKey: ["escrows"] });
    }
  )
  .subscribe();
```

---

## Migrations

Migrations are in `supabase/migrations/` and applied in order:

| Migration | Purpose |
|-----------|---------|
| `20260411191616_escrow-indexer-schema.sql` | Initial schema |
| `20260412000000_add-token-type.sql` | Add sBTC token support |
| `20260413120000_production-hardening.sql` | Add indexes, RLS, constraints |
| `20260414000000_update-dispute-timeout-default.sql` | Update timeout defaults |
| `20260414120000_clear-v4-data.sql` | Clean v4 data for v5 migration |

### Running Migrations

```bash
# Apply all pending migrations
npx supabase db push

# Create a new migration
npx supabase migration new my_migration_name

# Reset database (destructive)
npx supabase db reset
```

---

## Environment Variables

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> **Warning:** Never expose the service role key in the frontend. It should only be used in Edge Functions.
