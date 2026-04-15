# EscrowClient

The `EscrowClient` is the main entry point for interacting with the sBTC Escrow contract.

## Constructor

```typescript
const client = new EscrowClient(options: EscrowClientOptions);
```

### Options

| Property | Type | Required | Description |
|----------|------|:--------:|-------------|
| `network` | `'testnet' \| 'mainnet'` | ✅ | Target Stacks network |
| `contractAddress` | `string` | ❌ | Override the default contract address |
| `contractName` | `string` | ❌ | Override the default contract name (default: `escrow-v5`) |
| `apiUrl` | `string` | ❌ | Override the Stacks API URL |

### Examples

```typescript
// Testnet (default contract address)
const client = new EscrowClient({ network: 'testnet' });

// Custom contract address
const client = new EscrowClient({
  network: 'testnet',
  contractAddress: 'ST1CUSTOM...',
  contractName: 'my-escrow',
});
```

## Helper Methods

### getExplorerTxUrl

Returns a Stacks Explorer URL for a transaction.

```typescript
const url = client.getExplorerTxUrl('0xabc123...');
// → 'https://explorer.hiro.so/txid/0xabc123...?chain=testnet'
```

### getExplorerAddressUrl

Returns a Stacks Explorer URL for an address.

```typescript
const url = client.getExplorerAddressUrl('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
```

## BroadcastResult

All write methods return a `BroadcastResult`:

```typescript
interface BroadcastResult {
  txid: string;
  error?: string;
}
```

### Usage Pattern

```typescript
const result = await client.createEscrow(params, signerOptions);

if (result.error) {
  console.error('Transaction failed:', result.error);
} else {
  console.log('Success! TX:', result.txid);
  console.log('Explorer:', client.getExplorerTxUrl(result.txid));
}
```

## Signer Options

Write methods require a `SignerOptions` object:

```typescript
interface SignerOptions {
  senderKey: string;   // Private key in hex format
  fee?: number;        // Optional: transaction fee in microSTX
  nonce?: number;      // Optional: explicit nonce
}
```

> ⚠️ **Warning:** The `senderKey` is a private key. Never expose it in client-side code. Use the SDK's write methods only in server-side or CLI environments.

For browser-based applications, use the [Frontend](/docs/frontend/wallet-integration) with Stacks Connect instead.
