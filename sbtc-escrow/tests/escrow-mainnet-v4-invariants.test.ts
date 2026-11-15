// Invariant tests for escrow-mainnet-v4.
//
// Carries over every v3 invariant (I1-I15) unchanged, then adds the
// v4-specific properties for the expiry and dispute-timeout fixes:
//
//   I16  deliver() is rejected after expires-at
//   I17  dispute() after expiry only for escrows delivered on time
//   I18  dispute-timeout is snapshot per escrow at creation
//   I19  a seller can dispute only after marking delivery
//   I20  deadlines affected by a pause are pushed past it (with a grace)
//   I21  the contract cannot be its own fee recipient or a seller
//   I22  get-effective-deadlines matches the contract's own rules
//
// v3 invariants retained:
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

const CONTRACT = process.env.ESCROW_CONTRACT ?? "escrow-mainnet-v4";
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
const PAUSE_GRACE = 24; // v4

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
    // v4 field; absent on v3 (lets this suite also run against v3 for comparison)
    disputeTimeout: tuple["dispute-timeout"]
      ? Number(tuple["dispute-timeout"].value)
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

  it("anti-chaining: can re-pause exactly when the cooldown ends (v4: start + 3x duration + 2x grace)", () => {
    const duration = 100;
    simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(duration)], deployer);
    simnet.mineEmptyBlocks(3 * duration + 2 * PAUSE_GRACE - 1);
    expect(
      simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(duration)], deployer).result,
    ).toBeErr(Cl.uint(4003));
    simnet.mineEmptyBlocks(1);
    expect(
      simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(duration)], deployer).result,
    ).toBeOk(Cl.bool(true));
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

    // After the full cooldown from the original pause, re-pause works
    simnet.mineEmptyBlocks(3 * duration + 2 * PAUSE_GRACE);
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

// ─────────────────────────────────────────────────────────────────────
// v4 — expiry and dispute-timeout fixes
// ─────────────────────────────────────────────────────────────────────

const ERR_UNAUTHORIZED = 1001;
const ERR_ESCROW_EXPIRED = 2003;
const ERR_SELF_ESCROW = 2007;
const ERR_NOT_DELIVERED = 2016;
const REVIEW_PERIOD = 24;
const DURATION = 100; // createEscrow() default

// burn-block-height only moves with mineEmptyBlocks; calls share a burn block.
function toBurn(h: number) {
  const now = simnet.burnBlockHeight;
  if (h < now) throw new Error(`toBurn(${h}) is in the past (now ${now})`);
  if (h > now) simnet.mineEmptyBlocks(h - now);
  expect(simnet.burnBlockHeight).toBe(h);
}

function act(fn: string, id: number, sender: string) {
  return simnet.callPublicFn(CONTRACT, fn, [Cl.uint(id)], sender).result;
}

function pause(duration: number) {
  expect(
    simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(duration)], deployer).result,
  ).toBeOk(Cl.bool(true));
}

function expire() {
  simnet.mineEmptyBlocks(DURATION + 5);
}

function stxOf(addr: string): number {
  return Number(simnet.getAssetsMap().get("STX")?.get(addr) ?? 0n);
}

describe("I16 — deliver() is expiry-bound", () => {
  it("seller CAN deliver before expiry", () => {
    const id = createEscrow();
    const r = simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    expect(r.result).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.status).toBe(STATUS_DELIVERED);
  });

  it("seller CANNOT deliver after expiry; escrow stays PENDING", () => {
    const id = createEscrow();
    expire();
    const r = simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    expect(r.result).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));
    const e = getEscrow(id)!;
    expect(e.status).toBe(STATUS_PENDING);
    expect(e.deliveredAt).toBeNull();
  });
});

describe("I17 — dispute() after expiry only for on-time deliveries", () => {
  it("seller CANNOT dispute an expired, undelivered escrow", () => {
    const id = createEscrow();
    expire();
    const r = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], seller);
    expect(r.result).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));
    expect(getEscrow(id)!.status).toBe(STATUS_PENDING);
  });

  it("buyer CANNOT dispute an expired, undelivered escrow (refund is the path)", () => {
    const id = createEscrow();
    expire();
    const r = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    expect(r.result).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));
  });

  it("reported scenario: seller's post-expiry dispute fails and the buyer refunds at once", () => {
    const amount = 100_000;
    const id = createEscrow({ amount });
    expire();
    const buyerBefore = stxOf(buyer);

    // Seller tries to front-run the refund with dispute()
    const d = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], seller);
    expect(d.result).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));

    // Buyer's refund goes through immediately, for amount + fee
    const r = simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(id)], buyer);
    expect(r.result).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.status).toBe(STATUS_REFUNDED);
    expect(stxOf(buyer) - buyerBefore).toBe(amount + calcFee(amount));
  });

  it("reported scenario: late deliver() then dispute() is no longer possible", () => {
    const id = createEscrow();
    expire();
    expect(
      simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller).result,
    ).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));
    expect(
      simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], seller).result,
    ).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));
    expect(
      simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(id)], buyer).result,
    ).toBeOk(Cl.bool(true));
  });

  it("seller who delivered on time CAN still dispute after expiry", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    expire();
    const r = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], seller);
    expect(r.result).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.status).toBe(STATUS_DISPUTED);
  });

  it("before expiry: buyer CAN dispute; seller only after marking delivery", () => {
    const a = createEscrow();
    expect(act("dispute", a, buyer)).toBeOk(Cl.bool(true));
    const b = createEscrow();
    expect(act("dispute", b, seller)).toBeErr(Cl.uint(ERR_NOT_DELIVERED));
    expect(act("deliver", b, seller)).toBeOk(Cl.bool(true));
    expect(act("dispute", b, seller)).toBeOk(Cl.bool(true));
  });
});

describe("I18 — dispute-timeout is snapshot per escrow", () => {
  it("escrow records the timeout in force at creation", () => {
    const id = createEscrow();
    expect(getEscrow(id)!.disputeTimeout).toBe(DEFAULT_DISPUTE_TIMEOUT);
  });

  it("raising the timeout mid-flight does NOT delay the buyer's self-rescue", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.callPublicFn(CONTRACT, "set-dispute-timeout", [Cl.uint(8640)], deployer);
    simnet.mineEmptyBlocks(DEFAULT_DISPUTE_TIMEOUT + 5);

    const r = simnet.callPublicFn(CONTRACT, "resolve-expired-dispute", [Cl.uint(id)], buyer);
    expect(r.result).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.status).toBe(STATUS_REFUNDED);
  });

  it("lowering the timeout mid-flight does NOT bring the seller rescue forward", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.callPublicFn(CONTRACT, "set-dispute-timeout", [Cl.uint(24)], deployer);
    simnet.mineEmptyBlocks(24 * SELLER_RESCUE_MULTIPLIER + 5);

    const r = simnet.callPublicFn(
      CONTRACT,
      "resolve-expired-dispute-for-seller",
      [Cl.uint(id)],
      seller,
    );
    expect(r.result.type).toBe(ClarityType.ResponseErr);
    expect(getEscrow(id)!.status).toBe(STATUS_DISPUTED);
  });

  it("is-dispute-timed-out follows the snapshot, not the global value", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    simnet.callPublicFn(CONTRACT, "set-dispute-timeout", [Cl.uint(24)], deployer);
    simnet.mineEmptyBlocks(30);
    const early = simnet.callReadOnlyFn(CONTRACT, "is-dispute-timed-out", [Cl.uint(id)], deployer);
    expect(early.result).toBeBool(false);
    simnet.mineEmptyBlocks(DEFAULT_DISPUTE_TIMEOUT);
    const late = simnet.callReadOnlyFn(CONTRACT, "is-dispute-timed-out", [Cl.uint(id)], deployer);
    expect(late.result).toBeBool(true);
  });

  it("escrows created after a change use the new timeout", () => {
    simnet.callPublicFn(CONTRACT, "set-dispute-timeout", [Cl.uint(8640)], deployer);
    const id = createEscrow();
    expect(getEscrow(id)!.disputeTimeout).toBe(8640);
  });
});

// ─────────────────────────────────────────────────────────────────────
// v4 — fixes from the independent review
// ─────────────────────────────────────────────────────────────────────

describe("I19 — a seller can dispute only after marking delivery", () => {
  it("seller CANNOT dispute an undelivered escrow before expiry; it stays PENDING", () => {
    const id = createEscrow();
    expect(act("dispute", id, seller)).toBeErr(Cl.uint(ERR_NOT_DELIVERED));
    expect(getEscrow(id)!.status).toBe(STATUS_PENDING);
  });

  it("seller cannot freeze the refund by disputing on the expiry block itself", () => {
    const amount = 100_000;
    const id = createEscrow({ amount });
    const E = getEscrow(id)!.expiresAt;
    toBurn(E);
    expect(act("dispute", id, seller)).toBeErr(Cl.uint(ERR_NOT_DELIVERED));
    toBurn(E + 1);
    const before = stxOf(buyer);
    expect(act("refund", id, buyer)).toBeOk(Cl.bool(true));
    expect(stxOf(buyer) - before).toBe(amount + calcFee(amount));
  });

  it("a seller who marked delivery CAN dispute on the expiry block", () => {
    const id = createEscrow();
    expect(act("deliver", id, seller)).toBeOk(Cl.bool(true));
    toBurn(getEscrow(id)!.expiresAt);
    expect(act("dispute", id, seller)).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.status).toBe(STATUS_DISPUTED);
  });
});

// pause-adjusted(D) for the last window [S, P):
//   D in [S, P)          -> max(D + (P - S), P + PAUSE_GRACE)
//   D in [P, P + GRACE)  -> P + PAUSE_GRACE
//   otherwise            -> D
describe("I20 — deadlines affected by a pause are pushed past it", () => {
  it("a pause over expires-at: the seller can act after it lifts; the buyer waits", () => {
    const a = createEscrow({ duration: 200 });
    const b = createEscrow({ duration: 200 });
    const E = getEscrow(a)!.expiresAt;
    expect(getEscrow(b)!.expiresAt).toBe(E);
    toBurn(E - 10);
    pause(100); // window [E-10, E+90): E -> max(E+100, E+90+24) = E+114

    toBurn(E + 90); // pause has lifted
    expect(act("refund", b, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    toBurn(E + 114); // last block of the pushed deadline
    expect(act("deliver", a, seller)).toBeOk(Cl.bool(true));
    expect(act("refund", b, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));

    toBurn(E + 115);
    expect(act("deliver", b, seller)).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));
    expect(act("refund", b, buyer)).toBeOk(Cl.bool(true));
  });

  it("when the lost time exceeds the grace, the push is the full pause length", () => {
    const a = createEscrow({ duration: 400 });
    const b = createEscrow({ duration: 400 });
    const E = getEscrow(a)!.expiresAt;
    toBurn(E - 250);
    pause(300); // window [E-250, E+50): E -> E+300 (> E+50+24)
    toBurn(E + 300);
    expect(act("deliver", a, seller)).toBeOk(Cl.bool(true));
    expect(act("refund", b, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    toBurn(E + 301);
    expect(act("refund", b, buyer)).toBeOk(Cl.bool(true));
  });

  it("the buyer cannot collapse the pushed deadline with a tiny extension", () => {
    const id = createEscrow();
    const E = getEscrow(id)!.expiresAt;
    toBurn(E - 10);
    pause(20); // window [E-10, E+10): E -> max(E+20, E+34) = E+34
    toBurn(E + 10);
    expect(
      simnet.callPublicFn(CONTRACT, "extend-escrow", [Cl.uint(id), Cl.uint(1)], buyer).result,
    ).toBeOk(Cl.bool(true));
    expect(getEscrow(id)!.expiresAt).toBe(E + 10 + PAUSE_GRACE + 1);
    expect(act("refund", id, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    expect(act("deliver", id, seller)).toBeOk(Cl.bool(true));
  });

  it("deadlines before or after the pause window are unaffected", () => {
    const early = createEscrow({ duration: 50 });
    const late = createEscrow({ duration: 100 });
    const Ee = getEscrow(early)!.expiresAt;
    const El = getEscrow(late)!.expiresAt;
    toBurn(Ee + 5);
    pause(20); // window [Ee+5, Ee+25), grace to Ee+49; El = Ee+50 is after it
    expect(El).toBeGreaterThanOrEqual(Ee + 25 + PAUSE_GRACE);

    toBurn(Ee + 25);
    expect(act("refund", early, buyer)).toBeOk(Cl.bool(true));
    toBurn(El);
    expect(act("refund", late, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    toBurn(El + 1);
    expect(act("refund", late, buyer)).toBeOk(Cl.bool(true));
  });

  it("an early unpause pushes deadlines by the time actually paused", () => {
    const a = createEscrow();
    const b = createEscrow();
    const E = getEscrow(a)!.expiresAt;
    toBurn(E - 10);
    pause(100); // planned window [E-10, E+90)
    toBurn(E + 5);
    expect(
      simnet.callPublicFn(CONTRACT, "unpause-contract", [], deployer).result,
    ).toBeOk(Cl.bool(true)); // actual window [E-10, E+5): E -> max(E+15, E+29)

    toBurn(E + 5 + PAUSE_GRACE);
    expect(act("deliver", a, seller)).toBeOk(Cl.bool(true));
    expect(act("refund", b, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    toBurn(E + 5 + PAUSE_GRACE + 1);
    expect(act("refund", b, buyer)).toBeOk(Cl.bool(true));
  });

  it("an unpause shortly before the deadline still leaves the grace period", () => {
    const a = createEscrow();
    const b = createEscrow();
    const E = getEscrow(a)!.expiresAt;
    toBurn(E - 10);
    pause(100);
    toBurn(E - 5);
    simnet.callPublicFn(CONTRACT, "unpause-contract", [], deployer);
    // window [E-10, E-5): E is within the grace after it -> E-5+24 = E+19
    toBurn(E - 5 + PAUSE_GRACE);
    expect(act("deliver", a, seller)).toBeOk(Cl.bool(true));
    expect(act("refund", b, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    toBurn(E - 5 + PAUSE_GRACE + 1);
    expect(act("deliver", b, seller)).toBeErr(Cl.uint(ERR_ESCROW_EXPIRED));
    expect(act("refund", b, buyer)).toBeOk(Cl.bool(true));
  });

  it("N2 regression: an unpause in the deadline's own block still leaves the grace period", () => {
    const a = createEscrow({ duration: 200 });
    const b = createEscrow({ duration: 200 });
    const D = getEscrow(a)!.expiresAt;
    toBurn(D - 60);
    pause(MAX_PAUSE_DURATION);
    toBurn(D);
    simnet.callPublicFn(CONTRACT, "unpause-contract", [], deployer);
    // window trimmed to [D-60, D); D is in the grace after it -> D+24
    toBurn(D + PAUSE_GRACE);
    expect(act("deliver", a, seller)).toBeOk(Cl.bool(true));
    expect(act("refund", b, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    toBurn(D + PAUSE_GRACE + 1);
    expect(act("refund", b, buyer)).toBeOk(Cl.bool(true));
  });

  it("N1 regression: a deadline pushed by a max pause opens before the next pause is allowed", () => {
    const id = createEscrow({ duration: 5000 });
    const E = getEscrow(id)!.expiresAt;
    const d = MAX_PAUSE_DURATION;
    const S = E - (d - 1); // E is the last block of the window [S, S+d)
    toBurn(S);
    pause(d); // E -> E+d; cooldown ends S + 3d + 2*grace
    toBurn(E + d + 1); // the buyer's refund opens
    expect(
      simnet.callPublicFn(CONTRACT, "pause-contract", [Cl.uint(d)], deployer).result,
    ).toBeErr(Cl.uint(4003));
    const before = stxOf(buyer);
    expect(act("refund", id, buyer)).toBeOk(Cl.bool(true));
    expect(stxOf(buyer)).toBeGreaterThan(before);
  });

  it("a pause over the review window keeps the seller's dispute window", () => {
    const a = createEscrow();
    const b = createEscrow();
    const E = getEscrow(a)!.expiresAt;
    toBurn(E - 2);
    expect(act("deliver", a, seller)).toBeOk(Cl.bool(true));
    expect(act("deliver", b, seller)).toBeOk(Cl.bool(true));
    // review deadline E+22; pause window [E-1, E+99), grace to E+123:
    // expiry E -> max(E+100, E+123), review E+22 -> max(E+122, E+123)
    toBurn(E - 1);
    pause(100);

    toBurn(E + 101); // expired, but still inside the pushed review window
    expect(
      simnet.callReadOnlyFn(CONTRACT, "is-in-review-period", [Cl.uint(a)], deployer).result,
    ).toBeBool(true);
    expect(act("refund", a, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    expect(act("dispute", a, seller)).toBeOk(Cl.bool(true));

    toBurn(E + 99 + PAUSE_GRACE);
    expect(act("refund", b, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    toBurn(E + 99 + PAUSE_GRACE + 1);
    expect(act("refund", b, buyer)).toBeOk(Cl.bool(true));
  });

  it("get-pause-window reports the recorded window, trimmed by an early unpause", () => {
    const P = simnet.burnBlockHeight;
    pause(20);
    expect(
      simnet.callReadOnlyFn(CONTRACT, "get-pause-window", [], deployer).result,
    ).toBeTuple({ start: Cl.uint(P), end: Cl.uint(P + 20), grace: Cl.uint(PAUSE_GRACE) });
    toBurn(P + 5);
    simnet.callPublicFn(CONTRACT, "unpause-contract", [], deployer);
    expect(
      simnet.callReadOnlyFn(CONTRACT, "get-pause-window", [], deployer).result,
    ).toBeTuple({ start: Cl.uint(P), end: Cl.uint(P + 5), grace: Cl.uint(PAUSE_GRACE) });
  });
});

describe("I21 — the contract cannot be its own fee recipient or a seller", () => {
  it("set-fee-recipient rejects the contract; new escrows keep the old recipient", () => {
    const r = simnet.callPublicFn(
      CONTRACT,
      "set-fee-recipient",
      [Cl.principal(CONTRACT_PRINCIPAL)],
      deployer,
    );
    expect(r.result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    const id = createEscrow();
    expect(getEscrow(id)!.feeRecipient).toBe(deployer);
  });

  it("create-escrow rejects the contract as seller", () => {
    const r = simnet.callPublicFn(
      CONTRACT,
      "create-escrow",
      [
        Cl.principal(CONTRACT_PRINCIPAL),
        Cl.uint(100_000),
        Cl.stringUtf8("invariant test"),
        Cl.uint(DURATION),
        Cl.uint(TOKEN_STX),
        Cl.none(),
      ],
      buyer,
    );
    expect(r.result).toBeErr(Cl.uint(ERR_SELF_ESCROW));
  });
});

describe("I22 — get-effective-deadlines matches the contract's own rules", () => {
  const effective = (id: number) =>
    simnet.callReadOnlyFn(CONTRACT, "get-effective-deadlines", [Cl.uint(id)], deployer).result;
  const readOnly = (fn: string, id: number) =>
    simnet.callReadOnlyFn(CONTRACT, fn, [Cl.uint(id)], deployer).result;

  it("unknown escrow returns none", () => {
    expect(effective(999)).toBeNone();
  });

  it("without a pause: the stored deadline, and review-ends-at only after delivery", () => {
    const id = createEscrow();
    const E = getEscrow(id)!.expiresAt;
    expect(effective(id)).toBeSome(
      Cl.tuple({ "expires-at": Cl.uint(E), "review-ends-at": Cl.none() }),
    );
    expect(act("deliver", id, seller)).toBeOk(Cl.bool(true));
    const da = getEscrow(id)!.deliveredAt!;
    expect(effective(id)).toBeSome(
      Cl.tuple({
        "expires-at": Cl.uint(E),
        "review-ends-at": Cl.some(Cl.uint(da + REVIEW_PERIOD)),
      }),
    );
  });

  it("after a pause: reports the pushed deadlines, and the contract switches exactly there", () => {
    const id = createEscrow();
    const E = getEscrow(id)!.expiresAt;
    toBurn(E - 2);
    expect(act("deliver", id, seller)).toBeOk(Cl.bool(true)); // review to E+22
    toBurn(E - 1);
    pause(100); // window [E-1, E+99): both deadlines -> E+99+grace
    const pushed = E + 99 + PAUSE_GRACE;
    expect(effective(id)).toBeSome(
      Cl.tuple({ "expires-at": Cl.uint(pushed), "review-ends-at": Cl.some(Cl.uint(pushed)) }),
    );

    toBurn(pushed);
    expect(readOnly("is-expired", id)).toBeBool(false);
    expect(readOnly("is-in-review-period", id)).toBeBool(true);
    expect(act("refund", id, buyer)).toBeErr(Cl.uint(ERR_UNAUTHORIZED));

    toBurn(pushed + 1);
    expect(readOnly("is-expired", id)).toBeBool(true);
    expect(readOnly("is-in-review-period", id)).toBeBool(false);
    expect(act("refund", id, buyer)).toBeOk(Cl.bool(true));
  });
});
