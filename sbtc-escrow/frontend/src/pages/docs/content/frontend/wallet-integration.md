# Wallet Integration

The frontend uses [Stacks Connect](https://docs.hiro.so/stacks-connect) for wallet integration, supporting both Leather and Xverse wallets.

## WalletContext

The `WalletContext` provides wallet state throughout the app:

```typescript
interface WalletContextType {
  connected: boolean;
  address: string | null;
  network: StacksNetwork;
  connect: () => void;
  disconnect: () => void;
}
```

### Usage

```typescript
import { useWallet } from "@/contexts/WalletContext";

function MyComponent() {
  const { connected, address, connect, disconnect } = useWallet();

  if (!connected) {
    return <button onClick={connect}>Connect Wallet</button>;
  }

  return (
    <div>
      <p>Connected: {address}</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}
```

## Connecting a Wallet

The `connect` function opens the Stacks Connect modal:

```typescript
import { showConnect } from "@stacks/connect";

showConnect({
  appDetails: {
    name: "sBTC Escrow",
    icon: "/favicon.svg",
  },
  onFinish: () => {
    // Wallet connected - state updated via userSession
  },
  userSession,
});
```

## Making Transactions

Contract calls use `openContractCall` from Stacks Connect:

```typescript
import { openContractCall } from "@stacks/connect";
import { Pc } from "@stacks/transactions";

// Example: Release an escrow
openContractCall({
  contractAddress: "ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N",
  contractName: "escrow-v5",
  functionName: "release",
  functionArgs: [uintCV(escrowId)],
  postConditions: [
    // Post-conditions ensure exact amounts
  ],
  onFinish: (data) => {
    console.log("TX submitted:", data.txId);
  },
  onCancel: () => {
    console.log("User cancelled");
  },
});
```

## Post-Conditions

The `post-conditions.ts` module builds appropriate post-conditions for each operation:

```typescript
import { buildCreatePostConditions } from "@/lib/post-conditions";

// For STX escrow creation
const postConditions = buildCreatePostConditions({
  sender: address,
  amount: totalDeposit,
  tokenType: "stx",
});
```

Post-conditions are displayed in the wallet UI and protect users from unexpected transfers.

## ThemeContext

The `ThemeContext` manages dark/light mode:

```typescript
import { useTheme } from "@/contexts/ThemeContext";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}
```

Theme is persisted in `localStorage` and respects `prefers-color-scheme`.
