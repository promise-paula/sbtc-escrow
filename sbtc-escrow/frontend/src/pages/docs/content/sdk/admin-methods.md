# Admin Methods

Admin methods are restricted to the contract owner for platform management.

## resolveDisputeForBuyer

Resolve a dispute in the buyer's favor.

```typescript
const result = await client.resolveDisputeForBuyer(5, {
  senderKey: 'owner-private-key',
});
```

---

## resolveDisputeForSeller

Resolve a dispute in the seller's favor.

```typescript
const result = await client.resolveDisputeForSeller(5, {
  senderKey: 'owner-private-key',
});
```

---

## setPaused

Pause or unpause new escrow creation.

```typescript
// Pause
await client.setPaused(true, { senderKey: 'owner-key' });

// Unpause
await client.setPaused(false, { senderKey: 'owner-key' });
```

---

## setFeeBps

Update the platform fee rate.

```typescript
// Set to 1% (100 BPS)
await client.setFeeBps(100, { senderKey: 'owner-key' });
```

> ⚠️ **Warning:** Cannot exceed 500 BPS (5%).

---

## setFeeRecipient

Update the fee recipient address.

```typescript
await client.setFeeRecipient('ST_NEW_FEE_ADDRESS', {
  senderKey: 'owner-key',
});
```

---

## setDisputeTimeout

Update the dispute timeout period.

```typescript
// Set to ~60 days
await client.setDisputeTimeout(57600, { senderKey: 'owner-key' });
```

---

## setPendingOwner

Initiate ownership transfer (step 1 of 2).

```typescript
await client.setPendingOwner('ST_NEW_OWNER', {
  senderKey: 'current-owner-key',
});
```

---

## confirmOwner

Accept ownership transfer (step 2 of 2).

```typescript
await client.confirmOwner({
  senderKey: 'new-owner-key',
});
```
