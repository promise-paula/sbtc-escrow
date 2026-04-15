# Testing Guide

Comprehensive testing strategy covering smart contract unit tests, frontend tests, and testnet integration.

## Contract Tests (Clarinet)

Contract tests use Clarinet's simnet environment with Vitest.

### Running Tests

```bash
cd sbtc-escrow
npm test
```

### Test Structure

Tests are in `tests/escrow-v5.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";

describe("Escrow V5 Contract", () => {
  it("should create an escrow", () => {
    const result = simnet.callPublicFn(
      "escrow-v5",
      "create-escrow",
      [
        Cl.standardPrincipal(recipient),
        Cl.uint(1000000), // 1 STX
        Cl.uint(100),     // expires in 100 blocks
        Cl.stringUtf8("Test escrow"),
      ],
      sender
    );
    expect(result.result).toBeOk(Cl.uint(1));
  });
});
```

### Key Test Scenarios

| Scenario | What to Test |
|----------|-------------|
| Create escrow | Valid params, invalid amounts, self-escrow prevention |
| Fund escrow | Correct amount, wrong sender, already funded |
| Release funds | By sender only, correct recipient receives funds |
| Refund | After expiry, before expiry (should fail) |
| Dispute | By sender or recipient only, timing constraints |
| Resolve dispute | Admin only, valid resolutions |
| Fee calculation | Platform fee deducted correctly |
| Token types | STX and sBTC escrows work correctly |

### Test Accounts

Clarinet provides test accounts in simnet:

```typescript
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;  // sender
const wallet2 = accounts.get("wallet_2")!;  // recipient
```

---

## Frontend Tests

Frontend tests use Vitest with React Testing Library.

### Running

```bash
cd sbtc-escrow/frontend
npm test
```

### Test Files

Tests are in `frontend/src/test/`:

```
src/test/
  setup.ts                  # Test setup and mocks
  App.test.tsx              # App rendering tests
  components/               # Component tests
  hooks/                    # Hook tests
  utils/                    # Utility tests
```

### Example Component Test

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Dashboard from "@/pages/Dashboard";

describe("Dashboard", () => {
  it("renders stats cards", () => {
    render(<Dashboard />);
    expect(screen.getByText("Total Escrows")).toBeInTheDocument();
  });
});
```

---

## Testnet Testing

### Prerequisites

1. A Stacks testnet wallet with tSTX (get from faucet)
2. Contract deployed to testnet
3. Environment configured for testnet

### Testnet Faucet

Get free testnet STX:
- Visit the Stacks Explorer testnet faucet
- Enter your testnet address
- Wait for confirmation (~10 minutes)

### Manual Testing Checklist

**Wallet Connection**
- [ ] Connect wallet via Leather/Xverse
- [ ] Verify address displayed correctly
- [ ] Disconnect and reconnect

**Create Escrow**
- [ ] Create STX escrow with valid params
- [ ] Create sBTC escrow
- [ ] Verify escrow appears in "My Escrows"
- [ ] Check transaction confirmed on explorer

**Fund Escrow**
- [ ] Fund with exact amount
- [ ] Verify status changes to "funded"
- [ ] Check sender's balance decreased

**Complete Flow**
- [ ] Release funds to recipient
- [ ] Verify recipient receives funds (minus fee)
- [ ] Check status changes to "completed"

**Refund Flow**
- [ ] Wait for escrow to expire
- [ ] Request refund
- [ ] Verify sender receives funds back

**Dispute Flow**
- [ ] Raise a dispute on funded escrow
- [ ] Admin resolves dispute
- [ ] Verify funds distributed per resolution

### Testnet Scripts

```bash
# Run automated testnet tests
cd sbtc-escrow
npx ts-node scripts/test-testnet.ts

# Full integration test
npx ts-node scripts/test-testnet-full.ts
```

---

## CI/CD Testing

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hirosystems/clarinet-action@v1
      - run: npm test

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd frontend && npm ci && npm test
```
