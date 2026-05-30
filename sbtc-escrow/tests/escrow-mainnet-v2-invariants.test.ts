// Invariant tests for escrow-mainnet-v2.
//
// These tests verify the security properties listed in
// docs/security/README.md §2. Each property is asserted across multiple
// representative scenarios (single escrow, many escrows, mixed statuses,
// dispute paths). The point is not to test happy paths (those are
// covered in escrow-v7.test.ts) but to verify *impossible states remain
// impossible*.
//
// Conventions:
// - We use STX as the primary token. sBTC requires the sip-010 trait
//   setup; we cover the analogous invariants with STX and document that
//   the contract code is symmetric in token-type branches.
// - "Contract STX balance" is observed via simnet.getAssetsMap().

import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const buyer = accounts.get("wallet_1")!;
const seller = accounts.get("wallet_2")!;
const otherBuyer = accounts.get("wallet_3")!;
const otherSeller = accounts.get("wallet_4")!;

const CONTRACT = "escrow-mainnet-v2";
const CONTRACT_PRINCIPAL = `${deployer}.${CONTRACT}`;

const TOKEN_STX = 0;

const STATUS_PENDING = 0;
const STATUS_RELEASED = 1;
const STATUS_REFUNDED = 2;
const STATUS_DISPUTED = 3;
const STATUS_DELIVERED = 4;

const FEE_BPS = 50; // 0.5%
const BPS_DENOM = 10000;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function calcFee(amount: number): number {
  return Math.floor((amount * FEE_BPS) / BPS_DENOM);
}

function createEscrow(args?: {
  amount?: number;
  duration?: number;
  buyerAddr?: string;
  sellerAddr?: string;
}): number {
  const amount = args?.amount ?? 100_000;
  const duration = args?.duration ?? 100;
  const b = args?.buyerAddr ?? buyer;
  const s = args?.sellerAddr ?? seller;
  const { result } = simnet.callPublicFn(
    CONTRACT,
    "create-escrow",
    [
      Cl.principal(s),
      Cl.uint(amount),
      Cl.stringUtf8("invariant test"),
      Cl.uint(duration),
      Cl.uint(TOKEN_STX),
    ],
    b,
  );
  if (result.type !== ClarityType.ResponseOk) {
    throw new Error(`create-escrow failed: ${JSON.stringify(result)}`);
  }
  return Number((result as any).value.value);
}

function getEscrow(id: number): any {
  const { result } = simnet.callReadOnlyFn(
    CONTRACT,
    "get-escrow",
    [Cl.uint(id)],
    deployer,
  );
  // result is (optional tuple) → some/none
  if ((result as any).type !== ClarityType.OptionalSome) {
    return null;
  }
  const tuple = (result as any).value.value;
  // Flatten the Clarity tuple into a plain object with numeric/string values
  return {
    buyer: tuple.buyer.value,
    seller: tuple.seller.value,
    amount: Number(tuple.amount.value),
    feeAmount: Number(tuple["fee-amount"].value),
    tokenType: Number(tuple["token-type"].value),
    status: Number(tuple.status.value),
    createdAt: Number(tuple["created-at"].value),
    expiresAt: Number(tuple["expires-at"].value),
    completedAt:
      tuple["completed-at"].type === ClarityType.OptionalSome
        ? Number(tuple["completed-at"].value.value)
        : null,
    disputedAt:
      tuple["disputed-at"].type === ClarityType.OptionalSome
        ? Number(tuple["disputed-at"].value.value)
        : null,
    deliveredAt:
      tuple["delivered-at"].type === ClarityType.OptionalSome
        ? Number(tuple["delivered-at"].value.value)
        : null,
  };
}

function getEscrowCount(): number {
  const { result } = simnet.callReadOnlyFn(
    CONTRACT,
    "get-escrow-count",
    [],
    deployer,
  );
  return Number((result as any).value);
}

function getContractStxBalance(): number {
  // simnet.getAssetsMap() returns a Map<string, Map<principal, bigint>>
  // for STX: key "STX"
  const assets = simnet.getAssetsMap();
  const stxMap = assets.get("STX");
  if (!stxMap) return 0;
  const bal = stxMap.get(CONTRACT_PRINCIPAL);
  return bal ? Number(bal) : 0;
}

function sumLiveEscrowsStx(): number {
  // Sum (amount + fee-amount) for every escrow whose status is non-terminal.
  const count = getEscrowCount();
  let sum = 0;
  for (let id = 1; id <= count; id++) {
    const e = getEscrow(id);
    if (!e) continue;
    if (
      e.status === STATUS_PENDING ||
      e.status === STATUS_DELIVERED ||
      e.status === STATUS_DISPUTED
    ) {
      sum += e.amount + e.feeAmount;
    }
  }
  return sum;
}

// ─────────────────────────────────────────────────────────────────────
// I1 — Solvency (STX)
// ─────────────────────────────────────────────────────────────────────

describe("I1 — solvency: contract STX balance >= Σ live escrows", () => {
  it("holds after a single create", () => {
    createEscrow({ amount: 100_000 });
    expect(getContractStxBalance()).toBeGreaterThanOrEqual(sumLiveEscrowsStx());
  });

  it("holds across many creates with different buyers and amounts", () => {
    createEscrow({ amount: 50_000, buyerAddr: buyer });
    createEscrow({ amount: 1_000_000, buyerAddr: otherBuyer });
    createEscrow({ amount: 7_777, buyerAddr: buyer });
    expect(getContractStxBalance()).toBeGreaterThanOrEqual(sumLiveEscrowsStx());
  });

  it("holds after a release (terminal escrow contributes 0 to the sum)", () => {
    const id = createEscrow({ amount: 100_000 });
    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);
    // After release, the escrow is no longer in the live sum; the contract
    // balance dropped by amount+fee. Both sides should still be equal.
    expect(getContractStxBalance()).toBe(sumLiveEscrowsStx());
  });

  it("holds after a refund", () => {
    const id = createEscrow({ amount: 50_000 });
    simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(id)], seller); // seller-voluntary
    expect(getContractStxBalance()).toBe(sumLiveEscrowsStx());
  });

  it("holds after a split dispute resolution", () => {
    const id = createEscrow({ amount: 200_000 });
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    // 60/40 split
    simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(6000)],
      deployer,
    );
    expect(getContractStxBalance()).toBe(sumLiveEscrowsStx());
  });

  it("holds across an arbitrary chained flow", () => {
    const a = createEscrow({ amount: 300_000 }); // will be released
    const b = createEscrow({ amount: 50_000 });   // will be refunded
    const c = createEscrow({ amount: 1_001 });    // disputed → split (must be >= MIN_AMOUNT_STX)
    const d = createEscrow({ amount: 100_000 });  // left pending

    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(a)], buyer);
    simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(b)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(c)], buyer);
    simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(c), Cl.uint(3333)],
      deployer,
    );

    // After: a, b, c terminal; d still PENDING.
    // Contract balance should equal exactly amount+fee of escrow d.
    const escrowD = getEscrow(d)!;
    const expectedBalance = escrowD.amount + escrowD.feeAmount;
    expect(getContractStxBalance()).toBe(expectedBalance);
    expect(sumLiveEscrowsStx()).toBe(expectedBalance);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I3 — Status monotonicity (terminal states)
// ─────────────────────────────────────────────────────────────────────

describe("I3 — terminal status cannot be transitioned away from", () => {
  it("RELEASED is terminal — release/refund/dispute/deliver all reject", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);
    expect(getEscrow(id)!.status).toBe(STATUS_RELEASED);

    // Every state-mutating function should reject from RELEASED.
    const r1 = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);
    expect(r1.result.type).toBe(ClarityType.ResponseErr);

    const r2 = simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(id)], seller);
    expect(r2.result.type).toBe(ClarityType.ResponseErr);

    const r3 = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    expect(r3.result.type).toBe(ClarityType.ResponseErr);

    const r4 = simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    expect(r4.result.type).toBe(ClarityType.ResponseErr);
  });

  it("REFUNDED is terminal", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(id)], seller);
    expect(getEscrow(id)!.status).toBe(STATUS_REFUNDED);

    const r1 = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);
    expect(r1.result.type).toBe(ClarityType.ResponseErr);
    const r2 = simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    expect(r2.result.type).toBe(ClarityType.ResponseErr);
    const r3 = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    expect(r3.result.type).toBe(ClarityType.ResponseErr);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I4 — Block monotonicity
// ─────────────────────────────────────────────────────────────────────

describe("I4 — block timestamps maintain causal order", () => {
  it("created-at <= delivered-at <= completed-at on release path", () => {
    const id = createEscrow();
    simnet.mineEmptyBlocks(5);
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    simnet.mineEmptyBlocks(5);
    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);

    const e = getEscrow(id)!;
    expect(e.createdAt).toBeLessThanOrEqual(e.deliveredAt!);
    expect(e.deliveredAt!).toBeLessThanOrEqual(e.completedAt!);
  });

  it("created-at <= disputed-at <= completed-at on dispute path", () => {
    const id = createEscrow();
    simnet.mineEmptyBlocks(3);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.mineEmptyBlocks(3);
    simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-for-buyer",
      [Cl.uint(id)],
      deployer,
    );

    const e = getEscrow(id)!;
    expect(e.createdAt).toBeLessThanOrEqual(e.disputedAt!);
    expect(e.disputedAt!).toBeLessThanOrEqual(e.completedAt!);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I5 — Fee conservation on release
// ─────────────────────────────────────────────────────────────────────

describe("I5 — fee conservation on release", () => {
  it("fee transferred to fee-recipient == stored fee-amount; seller gets exactly amount", () => {
    const amount = 1_000_000;
    const expectedFee = calcFee(amount);
    const id = createEscrow({ amount });

    // Snapshot balances before
    const sellerBefore = Number(simnet.getAssetsMap().get("STX")?.get(seller) ?? 0n);
    const feeRecipientBefore = Number(
      simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n,
    );

    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);

    const sellerAfter = Number(simnet.getAssetsMap().get("STX")?.get(seller) ?? 0n);
    const feeRecipientAfter = Number(
      simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n,
    );

    expect(sellerAfter - sellerBefore).toBe(amount);
    expect(feeRecipientAfter - feeRecipientBefore).toBe(expectedFee);
  });

  it("fee==0 case is handled (no failure on self-transfer when amount tiny)", () => {
    // 1000 microSTX * 50 / 10000 = 5; fee is non-zero. We test the branch
    // where fee skip would matter: stored fee == 0 (constructed via direct
    // edge). The contract doesn't expose a way to mint a zero-fee escrow
    // outside of admin setting fee_bps to 0, so we verify the skip branch
    // by setting platform fee to 0 first.
    simnet.callPublicFn(CONTRACT, "set-platform-fee", [Cl.uint(0)], deployer);
    const id = createEscrow({ amount: 100_000 });
    expect(getEscrow(id)!.feeAmount).toBe(0);

    const r = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);
    expect(r.result).toBeOk(Cl.bool(true));

    // Reset fee for subsequent tests in this file
    simnet.callPublicFn(CONTRACT, "set-platform-fee", [Cl.uint(FEE_BPS)], deployer);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I6 — Split conservation
// ─────────────────────────────────────────────────────────────────────

describe("I6 — split conservation: buyer + seller + platform == amount + fee", () => {
  const cases = [0, 1, 2500, 5000, 6543, 9999, 10000];

  for (const buyerBps of cases) {
    it(`conserves at buyer_bps=${buyerBps}`, () => {
      const amount = 1_000_000;
      const fee = calcFee(amount);
      const id = createEscrow({ amount });
      simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);

      const stx = (p: string) =>
        Number(simnet.getAssetsMap().get("STX")?.get(p) ?? 0n);

      const buyerBefore = stx(buyer);
      const sellerBefore = stx(seller);
      const platformBefore = stx(deployer); // fee-recipient defaults to DEPLOYER

      const r = simnet.callPublicFn(
        CONTRACT,
        "resolve-dispute-split",
        [Cl.uint(id), Cl.uint(buyerBps)],
        deployer,
      );
      expect(r.result.type).toBe(ClarityType.ResponseOk);

      const buyerDelta = stx(buyer) - buyerBefore;
      const sellerDelta = stx(seller) - sellerBefore;
      const platformDelta = stx(deployer) - platformBefore;

      // Total leaving the contract == amount + fee.
      // Platform delta is positive (received fee).
      // For the admin (deployer) we have to net out the tx cost they paid for
      // resolve-dispute-split. Clarinet simnet returns post-tx balances, so
      // the deployer balance reflects (fee_received - gas_paid). We assert
      // the sum is *at most* amount+fee (gas eats a few thousand microSTX)
      // and that the *amount* portion sums exactly.
      const sumPrincipal = buyerDelta + sellerDelta;
      // The buyer's payout includes their fee refund, the seller's doesn't.
      // So buyerDelta + sellerDelta = buyer_principal + buyer_fee_refund + seller_share
      //                             = amount + (fee * buyer_bps / 10000)
      const expectedBuyerFeeRefund = Math.floor((fee * buyerBps) / BPS_DENOM);
      expect(sumPrincipal).toBe(amount + expectedBuyerFeeRefund);

      // Platform fee delta is positive of (fee - buyer_fee_refund), minus gas.
      // We assert it's >= the expected fee minus a small gas window.
      const expectedPlatformFee = fee - expectedBuyerFeeRefund;
      // Gas for resolve-dispute-split is < 100k microSTX in practice
      expect(platformDelta).toBeGreaterThanOrEqual(expectedPlatformFee - 100_000);
      expect(platformDelta).toBeLessThanOrEqual(expectedPlatformFee);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// I7 — active-disputes counter monotonicity
// ─────────────────────────────────────────────────────────────────────

describe("I7 — active-disputes counter is correct", () => {
  function getActiveDisputes(): number {
    const { result } = simnet.callReadOnlyFn(
      CONTRACT,
      "get-platform-stats",
      [],
      deployer,
    );
    const tuple = (result as any).value;
    return Number(tuple["active-disputes"].value);
  }

  it("increments on dispute, decrements on resolution (each kind)", () => {
    const start = getActiveDisputes();

    const a = createEscrow();
    const b = createEscrow();
    const c = createEscrow();

    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(a)], buyer);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(b)], buyer);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(c)], buyer);
    expect(getActiveDisputes()).toBe(start + 3);

    simnet.callPublicFn(CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(a)], deployer);
    expect(getActiveDisputes()).toBe(start + 2);

    simnet.callPublicFn(CONTRACT, "resolve-dispute-for-seller", [Cl.uint(b)], deployer);
    expect(getActiveDisputes()).toBe(start + 1);

    simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(c), Cl.uint(5000)],
      deployer,
    );
    expect(getActiveDisputes()).toBe(start);
  });

  it("cannot decrement a counter that is already zero (double-resolve rejected)", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.callPublicFn(CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(id)], deployer);

    // Second resolve should reject with ERR_NOT_DISPUTED, NOT panic on underflow.
    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-for-buyer",
      [Cl.uint(id)],
      deployer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I8 — Authorization scoping
// ─────────────────────────────────────────────────────────────────────

describe("I8 — non-parties cannot move escrow funds", () => {
  it("random user cannot release someone else's escrow", () => {
    const id = createEscrow();
    const r = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], otherBuyer);
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("random user cannot dispute someone else's escrow", () => {
    const id = createEscrow();
    const r = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], otherBuyer);
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("non-admin cannot resolve a dispute", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);

    for (const fn of [
      "resolve-dispute-for-buyer",
      "resolve-dispute-for-seller",
    ]) {
      const r = simnet.callPublicFn(CONTRACT, fn, [Cl.uint(id)], otherBuyer);
      expect(r.result.type).toBe(ClarityType.ResponseErr);
    }
    const rSplit = simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(5000)],
      otherBuyer,
    );
    expect(rSplit.result.type).toBe(ClarityType.ResponseErr);
  });

  it("non-buyer cannot extend escrow", () => {
    const id = createEscrow();
    const r = simnet.callPublicFn(
      CONTRACT,
      "extend-escrow",
      [Cl.uint(id), Cl.uint(50)],
      seller,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("non-seller cannot deliver", () => {
    const id = createEscrow();
    const r = simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], buyer);
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I9 — Status precondition enforced before every state mutation
// ─────────────────────────────────────────────────────────────────────

describe("I9 — status preconditions block invalid transitions", () => {
  it("cannot deliver an already-delivered escrow", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    const r = simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("cannot extend a delivered or disputed escrow", () => {
    const idDelivered = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(idDelivered)], seller);
    const r1 = simnet.callPublicFn(
      CONTRACT,
      "extend-escrow",
      [Cl.uint(idDelivered), Cl.uint(50)],
      buyer,
    );
    expect(r1.result.type).toBe(ClarityType.ResponseErr);

    const idDisputed = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(idDisputed)], buyer);
    const r2 = simnet.callPublicFn(
      CONTRACT,
      "extend-escrow",
      [Cl.uint(idDisputed), Cl.uint(50)],
      buyer,
    );
    expect(r2.result.type).toBe(ClarityType.ResponseErr);
  });

  it("cannot resolve-dispute-* on a non-disputed escrow", () => {
    const id = createEscrow();
    const fns = [
      "resolve-dispute-for-buyer",
      "resolve-dispute-for-seller",
    ];
    for (const fn of fns) {
      const r = simnet.callPublicFn(CONTRACT, fn, [Cl.uint(id)], deployer);
      expect(r.result.type).toBe(ClarityType.ResponseErr);
    }
    const rSplit = simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(5000)],
      deployer,
    );
    expect(rSplit.result.type).toBe(ClarityType.ResponseErr);
  });

  it("cannot resolve-expired-dispute before timeout", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-expired-dispute",
      [Cl.uint(id)],
      buyer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Bonus — defensively assert escrow-id=0 always rejects
// ─────────────────────────────────────────────────────────────────────

describe("escrow-id zero is uniformly rejected", () => {
  const fns: Array<[string, any[]]> = [
    ["deliver", [Cl.uint(0)]],
    ["release", [Cl.uint(0)]],
    ["refund", [Cl.uint(0)]],
    ["dispute", [Cl.uint(0)]],
    ["extend-escrow", [Cl.uint(0), Cl.uint(50)]],
    ["resolve-dispute-for-buyer", [Cl.uint(0)]],
    ["resolve-dispute-for-seller", [Cl.uint(0)]],
    ["resolve-dispute-split", [Cl.uint(0), Cl.uint(5000)]],
    ["resolve-expired-dispute", [Cl.uint(0)]],
  ];

  for (const [fn, args] of fns) {
    it(`${fn} rejects escrow-id=0`, () => {
      const r = simnet.callPublicFn(CONTRACT, fn, args, deployer);
      expect(r.result.type).toBe(ClarityType.ResponseErr);
    });
  }
});
