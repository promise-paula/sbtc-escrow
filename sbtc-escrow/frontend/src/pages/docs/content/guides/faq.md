# FAQ

Frequently asked questions about the sBTC Escrow platform.

## General

**What is sBTC Escrow?**

A decentralized escrow service built on the Stacks blockchain. It allows two parties to safely exchange STX or sBTC tokens with built-in dispute resolution.

**Is this audited?**

The smart contract has been tested extensively with unit and integration tests. However, it has not undergone a formal third-party audit. Use at your own risk on mainnet.

**What blockchains are supported?**

Currently only the Stacks blockchain. The contract uses Clarity smart contracts and supports STX and sBTC (SIP-010) tokens.

**What wallets are supported?**

Any Stacks-compatible wallet that supports the Stacks Connect protocol, including:
- Leather Wallet
- Xverse Wallet

---

## Usage

**How do I create an escrow?**

1. Connect your wallet
2. Navigate to "Create Escrow"
3. Enter the recipient's address, amount, token type, expiry, and description
4. Confirm the transaction in your wallet

**How long does an escrow last?**

You set the expiry when creating the escrow, specified in Stacks blocks. At roughly 10 minutes per block:
- 144 blocks ≈ 1 day
- 1008 blocks ≈ 1 week
- 4320 blocks ≈ 1 month

**What fees are charged?**

A platform fee (default 1%) is deducted from the escrow amount when funds are released. The fee is configurable by the contract owner.

**Can I cancel an escrow?**

You cannot cancel a funded escrow before it expires. However:
- If unfunded, it will simply expire
- If funded and expired, the sender can request a refund
- If there's a dispute, the admin can resolve it

---

## Disputes

**How does dispute resolution work?**

Either the sender or recipient can raise a dispute on a funded escrow. Once disputed:
1. The funds are locked
2. The platform admin reviews the case
3. The admin resolves the dispute by releasing funds to the appropriate party

**Who resolves disputes?**

The contract owner (admin) resolves disputes. In a future version, this could be extended to a decentralized arbitration system.

**What are the possible dispute resolutions?**

| Resolution | Effect |
|-----------|--------|
| Release to recipient | Funds sent to recipient (minus fee) |
| Refund to sender | Funds returned to sender |

**Is there a time limit on disputes?**

Yes, the dispute timeout (configurable by admin) sets how long a dispute can remain open before it can be auto-resolved.

---

## Technical

**Why does my transaction take so long?**

Stacks blocks are produced approximately every 10 minutes (anchored to Bitcoin blocks). Your transaction will be confirmed in the next block.

**Why can't I see my escrow immediately?**

The Chainhook indexer processes blockchain events and writes them to Supabase. There may be a short delay (1-2 blocks) between the on-chain transaction and the data appearing in the UI.

**Can I interact with the contract directly?**

Yes. The contract is public on the Stacks blockchain. You can call any public function using:
- Stacks Explorer sandbox
- Stacks.js SDK
- The sBTC Escrow SDK (`sbtc-escrow-sdk`)

**What happens if the frontend goes down?**

Your funds are safe on the blockchain. You can interact with the contract directly using any Stacks wallet or the Stacks Explorer to release, refund, or dispute escrows.

**Is my data private?**

Blockchain transactions are public. The escrow details (sender, recipient, amount, status) are visible on-chain. The description field is also stored on-chain and in Supabase.

---

## Troubleshooting

**"Transaction failed" error**

Common causes:
- Insufficient STX/sBTC balance
- Post-condition failure (amount mismatch)
- Escrow already in a terminal state
- Network congestion

**"Wallet not connected" error**

1. Click "Connect Wallet" in the header
2. Approve the connection in your wallet extension
3. Make sure you're on the correct network (testnet vs mainnet)

**Escrow shows wrong status**

The UI reads from the Supabase index. If the indexer is behind:
1. Wait a few minutes for the indexer to catch up
2. Check the transaction on the Stacks Explorer for the actual on-chain status
3. Contact support if the issue persists
