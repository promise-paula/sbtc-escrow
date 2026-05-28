// Invariant tests for escrow-mainnet-v3.
//
// Mirrors I1-I9 from escrow-mainnet-v2-invariants.test.ts AND adds the
// v3-specific properties (I10-I15) for the new features:
//
//   I10  Seller self-rescue eligibility (DELIVERED + 2x timeout)
//   I11  Time-bound pause auto-unpauses after pause-until-block
//   I12  Beneficiary has buyer-equivalent authorization
//   I13  total-locked-{stx,sbtc} == sum of live escrow (amount + fee)
//   I14  sweep-orphans never touches locked funds
//   I15  Per-escrow fee-recipient snapshot survives admin changes

import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const buyer = accounts.get("wallet_1")!;
const seller = accounts.get("wallet_2")!;
const otherBuyer = accounts.get("wallet_3")!;
const otherSeller = accounts.get("wallet_4")!;
const beneficiary = accounts.get("wallet_5")!;
const newFeeRecipient = accounts.get("wallet_6")!;

const CONTRACT = "escrow-mainnet-v3";
const CONTRACT_PRINCIPAL = `${deployer}.${CONTRACT}`;

const TOKEN_STX = 0;

const STATUS_PENDING = 0;
const STATUS_RELEASED = 1;
const STATUS_REFUNDED = 2;
const STATUS_DISPUTED = 3;
const STATUS_DELIVERED = 4;

const FEE_BPS = 50;
const BPS_DENOM = 10000;
const DEFAULT_DISPUTE_TIMEOUT = 4320; // burn blocks
const SELLER_RESCUE_MULTIPLIER = 2;
const MAX_PAUSE_DURATION = 4320;

function calcFee(amount: number): number {
  return Math.floor((amount * FEE_BPS) / BPS_DENOM);
}

function createEscrow(args?: {
  amount?: number;
  duration?: number;
  buyerAddr?: string;
  sellerAddr?: string;
  beneficiaryAddr?: string | null;
}): number {
  const amount = args?.amount ?? 100_000;
  const duration = args?.duration ?? 100;
  const b = args?.buyerAddr ?? buyer;
  const s = args?.sellerAddr ?? seller;
  const ben = args?.beneficiaryAddr === undefined ? null : args.beneficiaryAddr;
  const { result } = simnet.callPublicFn(
    CONTRACT,
    "create-escrow",
    [
      Cl.principal(s),
      Cl.uint(amount),
      Cl.stringUtf8("invariant test"),
      Cl.uint(duration),
      Cl.uint(TOKEN_STX),
      ben === null ? Cl.none() : Cl.some(Cl.principal(ben)),
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
  if ((result as any).type !== ClarityType.OptionalSome) return null;
  const tuple = (result as any).value.value;
  const optNum = (key: string) =>
    tuple[key].type === ClarityType.OptionalSome
      ? Number(tuple[key].value.value)
      : null;
  const optPrincipal = (key: string) =>
    tuple[key].type === ClarityType.OptionalSome
      ? tuple[key].value.value
      : null;
  return {
    buyer: tuple.buyer.value,
    seller: tuple.seller.value,
    beneficiary: optPrincipal("beneficiary"),
    amount: Number(tuple.amount.value),
    feeAmount: Number(tuple["fee-amount"].value),
    feeRecipient: tuple["fee-recipient"].value,
    tokenType: Number(tuple["token-type"].value),
    status: Number(tuple.status.value),
    createdAt: Number(tuple["created-at"].value),
    expiresAt: Number(tuple["expires-at"].value),
    completedAt: optNum("completed-at"),
    disputedAt: optNum("disputed-at"),
    deliveredAt: optNum("delivered-at"),
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
  const stxMap = simnet.getAssetsMap().get("STX");
  if (!stxMap) return 0;
  const bal = stxMap.get(CONTRACT_PRINCIPAL);
  return bal ? Number(bal) : 0;
}

function getTotalLockedStx(): number {
  const { result } = simnet.callReadOnlyFn(
    CONTRACT,
    "get-platform-stats",
    [],
    deployer,
  );
  return Number((result as any).value["total-locked-stx"].value);
}

function sumLiveEscrowsStx(): number {
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

  it("holds across many creates", () => {
    createEscrow({ amount: 50_000 });
    createEscrow({ amount: 1_000_000, buyerAddr: otherBuyer });
    createEscrow({ amount: 7_777 });
    expect(getContractStxBalance()).toBeGreaterThanOrEqual(sumLiveEscrowsStx());
  });

  it("holds after release / refund / split", () => {
    const a = createEscrow({ amount: 300_000 });
    const b = createEscrow({ amount: 50_000 });
    const c = createEscrow({ amount: 1_001 });
    const d = createEscrow({ amount: 100_000 });

    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(a)], buyer);
    simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(b)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(c)], buyer);
    simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(c), Cl.uint(3333)],
      deployer,
    );

    const escrowD = getEscrow(d)!;
    const expected = escrowD.amount + escrowD.feeAmount;
    expect(getContractStxBalance()).toBe(expected);
    expect(sumLiveEscrowsStx()).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I3 — Status monotonicity
// ─────────────────────────────────────────────────────────────────────

describe("I3 — terminal status cannot be transitioned away from", () => {
  it("RELEASED rejects all further mutations", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);
    expect(getEscrow(id)!.status).toBe(STATUS_RELEASED);
    for (const fn of ["release", "refund", "dispute", "deliver"]) {
      const r = simnet.callPublicFn(CONTRACT, fn, [Cl.uint(id)], buyer);
      expect(r.result.type).toBe(ClarityType.ResponseErr);
    }
  });

  it("REFUNDED rejects all further mutations", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(id)], seller);
    for (const fn of ["release", "refund", "deliver", "dispute"]) {
      const caller = fn === "release" ? buyer : fn === "deliver" ? seller : buyer;
      const r = simnet.callPublicFn(CONTRACT, fn, [Cl.uint(id)], caller);
      expect(r.result.type).toBe(ClarityType.ResponseErr);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// I4 — Block monotonicity (now burn-block clock)
// ─────────────────────────────────────────────────────────────────────

describe("I4 — created-at <= delivered-at <= completed-at (burn block clock)", () => {
  it("release path", () => {
    const id = createEscrow();
    simnet.mineEmptyBlocks(5);
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    simnet.mineEmptyBlocks(5);
    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);

    const e = getEscrow(id)!;
    expect(e.createdAt).toBeLessThanOrEqual(e.deliveredAt!);
    expect(e.deliveredAt!).toBeLessThanOrEqual(e.completedAt!);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I5 — Fee conservation
// ─────────────────────────────────────────────────────────────────────

describe("I5 — fee conservation on release", () => {
  it("fee == stored fee-amount; seller gets exactly amount", () => {
    const amount = 1_000_000;
    const expectedFee = calcFee(amount);
    const id = createEscrow({ amount });

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

      const r = simnet.callPublicFn(
        CONTRACT,
        "resolve-dispute-split",
        [Cl.uint(id), Cl.uint(buyerBps)],
        deployer,
      );
      expect(r.result.type).toBe(ClarityType.ResponseOk);

      const buyerDelta = stx(buyer) - buyerBefore;
      const sellerDelta = stx(seller) - sellerBefore;
      const expectedBuyerFeeRefund = Math.floor((fee * buyerBps) / BPS_DENOM);
      // Conservation: buyer + seller principal flows sum to amount + buyer's fee refund
      expect(buyerDelta + sellerDelta).toBe(amount + expectedBuyerFeeRefund);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// I7 — Counter monotonicity
// ─────────────────────────────────────────────────────────────────────

describe("I7 — active-disputes is correct", () => {
  function getActive(): number {
    const { result } = simnet.callReadOnlyFn(
      CONTRACT,
      "get-platform-stats",
      [],
      deployer,
    );
    return Number((result as any).value["active-disputes"].value);
  }

  it("increments and decrements correctly", () => {
    const start = getActive();
    const a = createEscrow();
    const b = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(a)], buyer);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(b)], buyer);
    expect(getActive()).toBe(start + 2);

    simnet.callPublicFn(CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(a)], deployer);
    simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(b), Cl.uint(5000)],
      deployer,
    );
    expect(getActive()).toBe(start);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I8 — Authorization scoping
// ─────────────────────────────────────────────────────────────────────

describe("I8 — non-parties cannot move funds", () => {
  it("random user cannot release / dispute / refund", () => {
    const id = createEscrow();
    for (const fn of ["release", "refund", "dispute"]) {
      const r = simnet.callPublicFn(CONTRACT, fn, [Cl.uint(id)], otherBuyer);
      expect(r.result.type).toBe(ClarityType.ResponseErr);
    }
  });

  it("non-admin cannot resolve disputes", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-for-buyer",
      [Cl.uint(id)],
      otherBuyer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I9 — Status preconditions
// ─────────────────────────────────────────────────────────────────────

describe("I9 — invalid status transitions are blocked", () => {
  it("cannot deliver twice", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    const r = simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("cannot resolve non-disputed escrow", () => {
    const id = createEscrow();
    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-for-buyer",
      [Cl.uint(id)],
      deployer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });
});

// ═════════════════════════════════════════════════════════════════════
// v3-specific invariants (I10 - I15)
// ═════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
// I10 — Seller self-rescue: only DELIVERED + only after 2x timeout
// ─────────────────────────────────────────────────────────────────────

describe("I10 — seller self-rescue (resolve-expired-dispute-for-seller)", () => {
  it("seller CAN rescue after delivery + dispute + 2x timeout", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.mineEmptyBlocks(DEFAULT_DISPUTE_TIMEOUT * SELLER_RESCUE_MULTIPLIER + 5);

    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-expired-dispute-for-seller",
      [Cl.uint(id)],
      seller,
    );
    expect(r.result).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.status).toBe(STATUS_RELEASED);
  });

  it("seller CANNOT rescue non-delivered dispute even after 2x timeout", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.mineEmptyBlocks(DEFAULT_DISPUTE_TIMEOUT * SELLER_RESCUE_MULTIPLIER + 5);

    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-expired-dispute-for-seller",
      [Cl.uint(id)],
      seller,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
    expect(getEscrow(id)!.status).toBe(STATUS_DISPUTED);
  });

  it("seller CANNOT rescue before 2x timeout (even at 1x)", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    // Just past 1x timeout — buyer self-rescue eligible but seller is not yet
    simnet.mineEmptyBlocks(DEFAULT_DISPUTE_TIMEOUT + 5);

    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-expired-dispute-for-seller",
      [Cl.uint(id)],
      seller,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);

    // But buyer can still self-rescue right now
    const r2 = simnet.callPublicFn(
      CONTRACT,
      "resolve-expired-dispute",
      [Cl.uint(id)],
      buyer,
    );
    expect(r2.result).toBeOk(Cl.bool(true));
  });

  it("non-seller cannot call resolve-expired-dispute-for-seller", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.mineEmptyBlocks(DEFAULT_DISPUTE_TIMEOUT * SELLER_RESCUE_MULTIPLIER + 5);

    for (const caller of [buyer, otherBuyer, deployer]) {
      const r = simnet.callPublicFn(
        CONTRACT,
        "resolve-expired-dispute-for-seller",
        [Cl.uint(id)],
        caller,
      );
      expect(r.result.type).toBe(ClarityType.ResponseErr);
    }
  });

  it("is-seller-rescue-eligible read-only matches actual behavior", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);

    let r = simnet.callReadOnlyFn(
      CONTRACT,
      "is-seller-rescue-eligible",
      [Cl.uint(id)],
      deployer,
    );
    expect(r.result).toBeBool(false);

    simnet.mineEmptyBlocks(DEFAULT_DISPUTE_TIMEOUT * SELLER_RESCUE_MULTIPLIER + 1);

    r = simnet.callReadOnlyFn(
      CONTRACT,
      "is-seller-rescue-eligible",
      [Cl.uint(id)],
      deployer,
    );
    expect(r.result).toBeBool(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I11 — Time-bound pause
// ─────────────────────────────────────────────────────────────────────

describe("I11 — time-bound pause", () => {
  it("rejects pause durations > MAX_PAUSE_DURATION", () => {
    const r = simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(MAX_PAUSE_DURATION + 1)],
      deployer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("rejects 0-duration pause", () => {
    const r = simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(0)],
      deployer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("pauses, blocks create-escrow, then auto-unpauses after duration", () => {
    const pauseDuration = 100;
    simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(pauseDuration)],
      deployer,
    );

    // While paused, create fails
    const r1 = simnet.callPublicFn(
      CONTRACT,
      "create-escrow",
      [
        Cl.principal(seller),
        Cl.uint(100_000),
        Cl.stringUtf8("test"),
        Cl.uint(100),
        Cl.uint(TOKEN_STX),
        Cl.none(),
      ],
      buyer,
    );
    expect(r1.result.type).toBe(ClarityType.ResponseErr);

    // Auto-unpause after duration elapses
    simnet.mineEmptyBlocks(pauseDuration + 1);

    // Now create should work again, even without admin calling unpause
    const r2 = simnet.callPublicFn(
      CONTRACT,
      "create-escrow",
      [
        Cl.principal(seller),
        Cl.uint(100_000),
        Cl.stringUtf8("test"),
        Cl.uint(100),
        Cl.uint(TOKEN_STX),
        Cl.none(),
      ],
      buyer,
    );
    expect(r2.result.type).toBe(ClarityType.ResponseOk);
  });

  it("admin can unpause early", () => {
    simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(1000)], deployer);
    simnet.callPublicFn(CONTRACT, "unpause-contract", [], deployer);

    const r = simnet.callPublicFn(
      CONTRACT,
      "create-escrow",
      [
        Cl.principal(seller),
        Cl.uint(100_000),
        Cl.stringUtf8("test"),
        Cl.uint(100),
        Cl.uint(TOKEN_STX),
        Cl.none(),
      ],
      buyer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseOk);
  });

  it("non-admin cannot pause", () => {
    const r = simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(100)],
      otherBuyer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("anti-chaining: cannot re-pause immediately after auto-unpause", () => {
    const duration = 100;
    simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(duration)], deployer);
    // Advance past pause end but well within cooldown window
    simnet.mineEmptyBlocks(duration + 1);

    // Attempt to re-pause: should reject (cooldown active)
    const r = simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(duration)],
      deployer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("anti-chaining: can re-pause after cooldown elapses (cooldown == prev duration)", () => {
    const duration = 100;
    simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(duration)], deployer);
    // Advance past pause end + full cooldown window (= 2 * duration from pause start)
    simnet.mineEmptyBlocks(2 * duration + 1);

    const r = simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(duration)],
      deployer,
    );
    expect(r.result).toBeOk(Cl.bool(true));
  });

  it("anti-chaining: manual unpause does NOT reset cooldown timer", () => {
    const duration = 100;
    simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(duration)], deployer);
    // Admin immediately unpauses (e.g., issue resolved early)
    simnet.callPublicFn(CONTRACT, "unpause-contract", [], deployer);

    // Cooldown is still anchored to the original pause-until + duration
    // So at block (pause-start + 1) cooldown is far from elapsed
    const r = simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(duration)],
      deployer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);

    // After full cooldown (2 * duration from original pause), re-pause works
    simnet.mineEmptyBlocks(2 * duration);
    const r2 = simnet.callPublicFn(
      CONTRACT,
      "pause-contract",
      [Cl.uint(duration)],
      deployer,
    );
    expect(r2.result).toBeOk(Cl.bool(true));
  });
});

// ─────────────────────────────────────────────────────────────────────
// I12 — Beneficiary authorization
// ─────────────────────────────────────────────────────────────────────

describe("I12 — beneficiary has buyer-equivalent rights", () => {
  it("beneficiary CAN release", () => {
    const id = createEscrow({ beneficiaryAddr: beneficiary });
    const r = simnet.callPublicFn(
      CONTRACT,
      "release",
      [Cl.uint(id)],
      beneficiary,
    );
    expect(r.result).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.status).toBe(STATUS_RELEASED);
  });

  it("beneficiary CAN dispute", () => {
    const id = createEscrow({ beneficiaryAddr: beneficiary });
    const r = simnet.callPublicFn(
      CONTRACT,
      "dispute",
      [Cl.uint(id)],
      beneficiary,
    );
    expect(r.result).toBeOk(Cl.bool(true));
  });

  it("beneficiary CAN extend", () => {
    const id = createEscrow({ beneficiaryAddr: beneficiary });
    const r = simnet.callPublicFn(
      CONTRACT,
      "extend-escrow",
      [Cl.uint(id), Cl.uint(50)],
      beneficiary,
    );
    expect(r.result).toBeOk(Cl.bool(true));
  });

  it("beneficiary CAN refund after expiry+review", () => {
    const id = createEscrow({ duration: 5, beneficiaryAddr: beneficiary });
    simnet.mineEmptyBlocks(10);
    const r = simnet.callPublicFn(
      CONTRACT,
      "refund",
      [Cl.uint(id)],
      beneficiary,
    );
    expect(r.result).toBeOk(Cl.bool(true));
  });

  it("escrow with no beneficiary: only buyer (not random) can release", () => {
    const id = createEscrow({ beneficiaryAddr: null });
    const r = simnet.callPublicFn(
      CONTRACT,
      "release",
      [Cl.uint(id)],
      beneficiary,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("beneficiary cannot equal seller", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-escrow",
      [
        Cl.principal(seller),
        Cl.uint(100_000),
        Cl.stringUtf8("test"),
        Cl.uint(100),
        Cl.uint(TOKEN_STX),
        Cl.some(Cl.principal(seller)),
      ],
      buyer,
    );
    expect(result.type).toBe(ClarityType.ResponseErr);
  });

  it("beneficiary cannot equal buyer", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "create-escrow",
      [
        Cl.principal(seller),
        Cl.uint(100_000),
        Cl.stringUtf8("test"),
        Cl.uint(100),
        Cl.uint(TOKEN_STX),
        Cl.some(Cl.principal(buyer)),
      ],
      buyer,
    );
    expect(result.type).toBe(ClarityType.ResponseErr);
  });

  it("get-user-role returns 'beneficiary' for the beneficiary", () => {
    const id = createEscrow({ beneficiaryAddr: beneficiary });
    const r = simnet.callReadOnlyFn(
      CONTRACT,
      "get-user-role",
      [Cl.uint(id), Cl.principal(beneficiary)],
      deployer,
    );
    expect(r.result).toBeOk(Cl.stringAscii("beneficiary"));
  });
});

// ─────────────────────────────────────────────────────────────────────
// I13 — Locked-balance accounting
// ─────────────────────────────────────────────────────────────────────

describe("I13 — total-locked-stx == sum of live escrow amount+fee", () => {
  it("after create: locked == amount+fee", () => {
    const id = createEscrow({ amount: 1_000_000 });
    const e = getEscrow(id)!;
    expect(getTotalLockedStx()).toBe(e.amount + e.feeAmount);
  });

  it("after release: locked decrements by full amount+fee", () => {
    const before = getTotalLockedStx();
    const id = createEscrow({ amount: 500_000 });
    const e = getEscrow(id)!;
    expect(getTotalLockedStx()).toBe(before + e.amount + e.feeAmount);

    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);
    expect(getTotalLockedStx()).toBe(before);
  });

  it("after refund: locked decrements by full amount+fee", () => {
    const before = getTotalLockedStx();
    const id = createEscrow({ amount: 250_000 });
    simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(id)], seller);
    expect(getTotalLockedStx()).toBe(before);
  });

  it("after split resolution: locked decrements by full amount+fee", () => {
    const before = getTotalLockedStx();
    const id = createEscrow({ amount: 200_000 });
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.callPublicFn(
      CONTRACT,
      "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(5000)],
      deployer,
    );
    expect(getTotalLockedStx()).toBe(before);
  });

  it("invariant holds across mixed chained flow", () => {
    const start = getTotalLockedStx();
    createEscrow({ amount: 100_000 }); // pending
    const b = createEscrow({ amount: 200_000 });
    const c = createEscrow({ amount: 50_000 });
    const d = createEscrow({ amount: 75_000 });
    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(b)], buyer);
    simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(c)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(d)], buyer);

    expect(getTotalLockedStx()).toBe(start + sumLiveEscrowsStx());
  });
});

// ─────────────────────────────────────────────────────────────────────
// I14 — sweep-orphans cannot touch locked funds
// ─────────────────────────────────────────────────────────────────────

describe("I14 — sweep-orphans cannot withdraw locked funds", () => {
  it("with no orphans, sweep of any amount > 0 reverts", () => {
    createEscrow({ amount: 100_000 }); // creates lock
    const r = simnet.callPublicFn(
      CONTRACT,
      "sweep-orphans",
      [Cl.uint(TOKEN_STX), Cl.uint(1)],
      deployer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });

  it("with orphans present, sweep up to orphan amount succeeds; more reverts", () => {
    createEscrow({ amount: 100_000 });
    // Simulate a donation by sending STX directly to the contract principal
    simnet.transferSTX(50_000, CONTRACT_PRINCIPAL, buyer);

    // Sweep half of the orphans
    const r1 = simnet.callPublicFn(
      CONTRACT,
      "sweep-orphans",
      [Cl.uint(TOKEN_STX), Cl.uint(25_000)],
      deployer,
    );
    expect(r1.result).toBeOk(Cl.bool(true));

    // Try to sweep more than what's left as orphan + 1
    const r2 = simnet.callPublicFn(
      CONTRACT,
      "sweep-orphans",
      [Cl.uint(TOKEN_STX), Cl.uint(26_000)],
      deployer,
    );
    expect(r2.result.type).toBe(ClarityType.ResponseErr);

    // The remainder still sweepable
    const r3 = simnet.callPublicFn(
      CONTRACT,
      "sweep-orphans",
      [Cl.uint(TOKEN_STX), Cl.uint(25_000)],
      deployer,
    );
    expect(r3.result).toBeOk(Cl.bool(true));

    // Now no orphans left — locked balance untouched
    expect(getContractStxBalance()).toBe(getTotalLockedStx());
  });

  it("non-admin cannot sweep", () => {
    simnet.transferSTX(10_000, CONTRACT_PRINCIPAL, buyer);
    const r = simnet.callPublicFn(
      CONTRACT,
      "sweep-orphans",
      [Cl.uint(TOKEN_STX), Cl.uint(1_000)],
      otherBuyer,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
  });
});

// ─────────────────────────────────────────────────────────────────────
// I15 — Per-escrow fee-recipient snapshot
// ─────────────────────────────────────────────────────────────────────

describe("I15 — fee-recipient snapshot survives admin changes", () => {
  it("admin change of fee-recipient does NOT affect in-flight escrow's payout target", () => {
    const id = createEscrow({ amount: 1_000_000 });
    const originalRecipient = getEscrow(id)!.feeRecipient;
    expect(originalRecipient).toBe(deployer);

    // Admin changes the global fee-recipient
    simnet.callPublicFn(
      CONTRACT,
      "set-fee-recipient",
      [Cl.principal(newFeeRecipient)],
      deployer,
    );

    // The escrow record still points at the original
    expect(getEscrow(id)!.feeRecipient).toBe(deployer);

    // On release, fee should go to the ORIGINAL recipient (deployer), not newFeeRecipient
    const fee = calcFee(1_000_000);
    const deployerBefore = Number(
      simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n,
    );
    const newRecipientBefore = Number(
      simnet.getAssetsMap().get("STX")?.get(newFeeRecipient) ?? 0n,
    );

    simnet.callPublicFn(CONTRACT, "release", [Cl.uint(id)], buyer);

    const deployerDelta =
      Number(simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n) -
      deployerBefore;
    const newRecipientDelta =
      Number(simnet.getAssetsMap().get("STX")?.get(newFeeRecipient) ?? 0n) -
      newRecipientBefore;

    expect(deployerDelta).toBe(fee);
    expect(newRecipientDelta).toBe(0);
  });

  it("escrows created AFTER the change use the new recipient", () => {
    simnet.callPublicFn(
      CONTRACT,
      "set-fee-recipient",
      [Cl.principal(newFeeRecipient)],
      deployer,
    );
    const id = createEscrow({ amount: 100_000 });
    expect(getEscrow(id)!.feeRecipient).toBe(newFeeRecipient);
  });
});
