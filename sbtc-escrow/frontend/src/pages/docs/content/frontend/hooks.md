# Hooks

Custom React hooks for data fetching and state management.

## use-escrow

Primary hook for escrow data, powered by TanStack React Query.

```typescript
import { useEscrow, useEscrows, useUserEscrows } from "@/hooks/use-escrow";

// Single escrow
const { data: escrow, isLoading } = useEscrow(escrowId);

// All escrows (paginated from Supabase)
const { data: escrows } = useEscrows({ status: "pending", limit: 20 });

// User's escrows
const { data: myEscrows } = useUserEscrows(address);
```

---

## use-block-height

Fetches the current Stacks block height. Used for expiry calculations.

```typescript
import { useBlockHeight } from "@/hooks/use-block-height";

const { blockHeight, isLoading } = useBlockHeight();

// Check if escrow is expired
const isExpired = blockHeight > escrow.expiresAt;
```

---

## use-block-rate

Estimates the current block production rate for time calculations.

```typescript
import { useBlockRate } from "@/hooks/use-block-rate";

const { blocksPerHour, secondsPerBlock } = useBlockRate();

// Convert blocks to time
const remainingBlocks = escrow.expiresAt - blockHeight;
const remainingSeconds = remainingBlocks * secondsPerBlock;
```

---

## use-admin

Checks if the connected wallet is the contract owner.

```typescript
import { useAdmin } from "@/hooks/use-admin";

const { isAdmin, isLoading } = useAdmin();

if (isAdmin) {
  // Show admin controls
}
```

---

## use-stx-price

Fetches the current STX/USD price for display purposes.

```typescript
import { useStxPrice } from "@/hooks/use-stx-price";

const { price, isLoading } = useStxPrice();
// price = 1.25 (USD)
```

---

## use-settings

Manages user preferences stored in localStorage.

```typescript
import { useSettings } from "@/hooks/use-settings";

const { settings, updateSettings } = useSettings();
```

---

## use-escrow-realtime

Subscribes to realtime escrow updates via Supabase.

```typescript
import { useEscrowRealtime } from "@/hooks/use-escrow-realtime";

// Automatically invalidates React Query cache on updates
useEscrowRealtime();
```

This hook sets up a Supabase Realtime subscription on the `escrows` table. When a row is inserted or updated, it invalidates the relevant React Query keys, causing automatic re-fetching.

---

## use-dispute-count

Returns the count of active disputes (for admin badge).

```typescript
import { useDisputeCount } from "@/hooks/use-dispute-count";

const { count } = useDisputeCount();
```

---

## use-mobile

Detects mobile viewport for responsive behavior.

```typescript
import { useIsMobile } from "@/hooks/use-mobile";

const isMobile = useIsMobile();
```
