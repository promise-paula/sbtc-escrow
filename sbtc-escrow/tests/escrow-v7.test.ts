import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

// Focused delta tests for escrow-v7 vs escrow-v6.
// Covers the new behavior only; the broader admin / create / release /
// dispute-resolution surface is already exercised in escrow-v6.test.ts and
// is structurally unchanged here.

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const buyer = accounts.get("wallet_1")!;
const seller = accounts.get("wallet_2")!;
const randomUser = accounts.get("wallet_3")!;

const CONTRACT = "escrow-v7";

const TOKEN_STX = 0;

const ERR_UNAUTHORIZED = 1001;
const ERR_ESCROW_NOT_FOUND = 2001;
const ERR_ESCROW_ALREADY_COMPLETED = 2002;
const ERR_NOT_DISPUTED = 2009;
const ERR_INVALID_BPS = 2013;
const ERR_INVALID_STATUS = 2015;

const STATUS_PENDING = 0;
const STATUS_RELEASED = 1;
const STATUS_REFUNDED = 2;
const STATUS_DISPUTED = 3;
const STATUS_DELIVERED = 4;

const REVIEW_PERIOD = 144;

function createEscrow(amount = 100_000, duration = 100) {
  const { result } = simnet.callPublicFn(
    CONTRACT,
    "create-escrow",
    [
      Cl.principal(seller),
      Cl.uint(amount),
      Cl.stringUtf8("test payment"),
      Cl.uint(duration),
      Cl.uint(TOKEN_STX),
    ],
    buyer,
  );
  // Expect ok-uint, return the id
  if (result.type !== ClarityType.ResponseOk) throw new Error("create-escrow failed");
  const okValue = (result as any).value;
  return Number(okValue.value);
}

function getStatus(escrowId: number): number {
  const { result } = simnet.callReadOnlyFn(
    CONTRACT,
    "get-status",
    [Cl.uint(escrowId)],
    deployer,
  );
  if (result.type !== ClarityType.ResponseOk) throw new Error("get-status not ok");
  return Number((result as any).value.value);
}

describe("escrow-v7 — deliver() and review period", () => {
  it("seller can call deliver() from PENDING", () => {
    const id = createEscrow();
    const { result } = simnet.callPublicFn(
      CONTRACT, "deliver", [Cl.uint(id)], seller,
    );
    expect(result).toBeOk(Cl.bool(true));
    expect(getStatus(id)).toBe(STATUS_DELIVERED);
  });

  it("non-seller cannot call deliver()", () => {
    const id = createEscrow();
    const { result: buyerTry } = simnet.callPublicFn(
      CONTRACT, "deliver", [Cl.uint(id)], buyer,
    );
    expect(buyerTry).toBeErr(Cl.uint(ERR_UNAUTHORIZED));

    const { result: randomTry } = simnet.callPublicFn(
      CONTRACT, "deliver", [Cl.uint(id)], randomUser,
    );
    expect(randomTry).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
  });

  it("cannot deliver() twice / from non-PENDING status", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    const { result } = simnet.callPublicFn(
      CONTRACT, "deliver", [Cl.uint(id)], seller,
    );
    expect(result).toBeErr(Cl.uint(ERR_INVALID_STATUS));
  });

  it("is-in-review-period reflects the active window", () => {
    const id = createEscrow();
    // Before delivery: not in review
    let r = simnet.callReadOnlyFn(
      CONTRACT, "is-in-review-period", [Cl.uint(id)], deployer,
    );
    expect(r.result).toBeBool(false);

    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);

    r = simnet.callReadOnlyFn(
      CONTRACT, "is-in-review-period", [Cl.uint(id)], deployer,
    );
    expect(r.result).toBeBool(true);

    // Advance past review window
    simnet.mineEmptyBlocks(REVIEW_PERIOD + 1);
    r = simnet.callReadOnlyFn(
      CONTRACT, "is-in-review-period", [Cl.uint(id)], deployer,
    );
    expect(r.result).toBeBool(false);
  });
});

describe("escrow-v7 — refund() post-delivery semantics (the critical fix)", () => {
  it("buyer CANNOT refund after expires-at if seller delivered and review window still active", () => {
    // Short duration so we can let expires-at pass quickly
    const duration = 10;
    const id = createEscrow(100_000, duration);

    // Seller delivers immediately (within original duration)
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);

    // Expire the escrow but stay inside the review window
    simnet.mineEmptyBlocks(duration + 5);
    // We are past expires-at, but well inside REVIEW_PERIOD blocks from delivered-at.

    const { result } = simnet.callPublicFn(
      CONTRACT, "refund", [Cl.uint(id)], buyer,
    );
    expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    // Status unchanged
    expect(getStatus(id)).toBe(STATUS_DELIVERED);
  });

  it("seller can still raise dispute() during the review window after delivery", () => {
    const duration = 10;
    const id = createEscrow(100_000, duration);

    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    // Buyer is stalling; expiry hits but we're inside review window
    simnet.mineEmptyBlocks(duration + 5);

    const { result } = simnet.callPublicFn(
      CONTRACT, "dispute", [Cl.uint(id)], seller,
    );
    expect(result).toBeOk(Cl.bool(true));
    expect(getStatus(id)).toBe(STATUS_DISPUTED);
  });

  it("buyer CAN refund after expires-at AND after review window elapses", () => {
    const duration = 10;
    const id = createEscrow(100_000, duration);

    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);
    // Pass expires-at AND the full review window
    simnet.mineEmptyBlocks(duration + REVIEW_PERIOD + 5);

    const { result } = simnet.callPublicFn(
      CONTRACT, "refund", [Cl.uint(id)], buyer,
    );
    expect(result).toBeOk(Cl.bool(true));
    expect(getStatus(id)).toBe(STATUS_REFUNDED);
  });

  it("seller can voluntarily refund from DELIVERED at any time", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);

    // Inside review window, seller calls refund
    const { result } = simnet.callPublicFn(
      CONTRACT, "refund", [Cl.uint(id)], seller,
    );
    expect(result).toBeOk(Cl.bool(true));
    expect(getStatus(id)).toBe(STATUS_REFUNDED);
  });

  it("buyer can release from DELIVERED (happy path)", () => {
    const id = createEscrow();
    simnet.callPublicFn(CONTRACT, "deliver", [Cl.uint(id)], seller);

    const { result } = simnet.callPublicFn(
      CONTRACT, "release", [Cl.uint(id)], buyer,
    );
    expect(result).toBeOk(Cl.bool(true));
    expect(getStatus(id)).toBe(STATUS_RELEASED);
  });
});

describe("escrow-v7 — refund() authorization tightened", () => {
  it("randomUser cannot refund after expiry (was allowed in v6)", () => {
    const duration = 10;
    const id = createEscrow(100_000, duration);
    simnet.mineEmptyBlocks(duration + 5);

    const { result } = simnet.callPublicFn(
      CONTRACT, "refund", [Cl.uint(id)], randomUser,
    );
    expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
  });

  it("buyer can refund after expiry from PENDING (no delivery)", () => {
    const duration = 10;
    const id = createEscrow(100_000, duration);
    simnet.mineEmptyBlocks(duration + 5);

    const { result } = simnet.callPublicFn(
      CONTRACT, "refund", [Cl.uint(id)], buyer,
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("buyer cannot refund before expiry from PENDING", () => {
    const id = createEscrow(100_000, 1000);
    const { result } = simnet.callPublicFn(
      CONTRACT, "refund", [Cl.uint(id)], buyer,
    );
    expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
  });
});

describe("escrow-v7 — resolve-dispute-split", () => {
  function disputed(amount = 100_000) {
    const id = createEscrow(amount, 100);
    simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(id)], buyer);
    return id;
  }

  it("rejects buyer-bps > 10000", () => {
    const id = disputed();
    const { result } = simnet.callPublicFn(
      CONTRACT, "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(10001)],
      deployer,
    );
    expect(result).toBeErr(Cl.uint(ERR_INVALID_BPS));
  });

  it("non-owner cannot resolve a split", () => {
    const id = disputed();
    const { result } = simnet.callPublicFn(
      CONTRACT, "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(5000)],
      randomUser,
    );
    expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
  });

  it("requires STATUS_DISPUTED", () => {
    const id = createEscrow(); // still PENDING
    const { result } = simnet.callPublicFn(
      CONTRACT, "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(5000)],
      deployer,
    );
    expect(result).toBeErr(Cl.uint(ERR_NOT_DISPUTED));
  });

  it("50/50 split pays out half to each, half fee to platform", () => {
    const amount = 100_000;
    const id = disputed(amount);

    const buyerBalBefore = simnet.getAssetsMap().get("STX")?.get(buyer) ?? 0n;
    const sellerBalBefore = simnet.getAssetsMap().get("STX")?.get(seller) ?? 0n;
    const deployerBalBefore = simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n;

    const { result } = simnet.callPublicFn(
      CONTRACT, "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(5000)],
      deployer,
    );
    expect(result).toBeOk(Cl.bool(true));

    const buyerBalAfter = simnet.getAssetsMap().get("STX")?.get(buyer) ?? 0n;
    const sellerBalAfter = simnet.getAssetsMap().get("STX")?.get(seller) ?? 0n;
    const deployerBalAfter = simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n;

    // fee = 0.5% of 100_000 = 500
    // buyer half of principal = 50_000, buyer half of fee = 250
    // seller half of principal = 50_000
    // platform half of fee = 250
    expect(buyerBalAfter - buyerBalBefore).toBe(50_250n);
    expect(sellerBalAfter - sellerBalBefore).toBe(50_000n);
    expect(deployerBalAfter - deployerBalBefore).toBe(250n);

    expect(getStatus(id)).toBe(STATUS_RELEASED);
  });

  it("100% to buyer matches resolve-dispute-for-buyer accounting", () => {
    const amount = 100_000;
    const id = disputed(amount);

    const buyerBalBefore = simnet.getAssetsMap().get("STX")?.get(buyer) ?? 0n;
    const deployerBalBefore = simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n;

    simnet.callPublicFn(
      CONTRACT, "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(10000)],
      deployer,
    );

    const buyerBalAfter = simnet.getAssetsMap().get("STX")?.get(buyer) ?? 0n;
    const deployerBalAfter = simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n;

    // Buyer gets full amount + full fee = 100_500
    expect(buyerBalAfter - buyerBalBefore).toBe(100_500n);
    expect(deployerBalAfter - deployerBalBefore).toBe(0n);
  });

  it("0% to buyer matches resolve-dispute-for-seller accounting", () => {
    const amount = 100_000;
    const id = disputed(amount);

    const sellerBalBefore = simnet.getAssetsMap().get("STX")?.get(seller) ?? 0n;
    const deployerBalBefore = simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n;

    simnet.callPublicFn(
      CONTRACT, "resolve-dispute-split",
      [Cl.uint(id), Cl.uint(0)],
      deployer,
    );

    const sellerBalAfter = simnet.getAssetsMap().get("STX")?.get(seller) ?? 0n;
    const deployerBalAfter = simnet.getAssetsMap().get("STX")?.get(deployer) ?? 0n;

    // Seller gets full principal, platform gets full fee
    expect(sellerBalAfter - sellerBalBefore).toBe(100_000n);
    expect(deployerBalAfter - deployerBalBefore).toBe(500n);
  });
});
