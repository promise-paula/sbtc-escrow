import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const buyer = accounts.get("wallet_1")!;
const seller = accounts.get("wallet_2")!;
const randomUser = accounts.get("wallet_3")!;
const newOwner = accounts.get("wallet_4")!;

const CONTRACT = "escrow-v4";
const SBTC_CONTRACT = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcDeployer = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";

// Token types
const TOKEN_STX = 0;
const TOKEN_SBTC = 1;

// Error codes
const ERR_UNAUTHORIZED = 1001;
const ERR_CONTRACT_PAUSED = 1002;
const ERR_OWNERSHIP_PENDING = 1003;
const ERR_NOT_PENDING_OWNER = 1004;
const ERR_ESCROW_NOT_FOUND = 2001;
const ERR_ESCROW_ALREADY_COMPLETED = 2002;
const ERR_INVALID_AMOUNT = 2005;
const ERR_INVALID_DURATION = 2006;
const ERR_SELF_ESCROW = 2007;
const ERR_DISPUTE_NOT_TIMED_OUT = 2008;
const ERR_NOT_DISPUTED = 2009;
const ERR_INVALID_EXTENSION = 2010;
const ERR_INVALID_TOKEN = 2012;

// Status codes
const STATUS_PENDING = 0;
const STATUS_RELEASED = 1;
const STATUS_REFUNDED = 2;
const STATUS_DISPUTED = 3;

// Platform configuration
const DISPUTE_TIMEOUT = 28800;

// Helper: create an STX escrow and return escrow-id
function createStxEscrow(amount = 100000, duration = 100) {
  const { result } = simnet.callPublicFn(
    CONTRACT,
    "create-escrow",
    [
      Cl.principal(seller),
      Cl.uint(amount),
      Cl.stringUtf8("STX payment"),
      Cl.uint(duration),
      Cl.uint(TOKEN_STX),
    ],
    buyer
  );
  return result;
}

// Helper: create an sBTC escrow and return escrow-id
function createSbtcEscrow(amount = 100000, duration = 100) {
  const { result } = simnet.callPublicFn(
    CONTRACT,
    "create-escrow",
    [
      Cl.principal(seller),
      Cl.uint(amount),
      Cl.stringUtf8("sBTC payment"),
      Cl.uint(duration),
      Cl.uint(TOKEN_SBTC),
    ],
    buyer
  );
  return result;
}

describe("sBTC Escrow V4 — Dual Token Contract Tests", () => {

  it("ensures simnet is well initialised", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  // ============================================================================
  // ADMIN FUNCTIONS (same as V3, token-agnostic)
  // ============================================================================

  describe("Admin Functions", () => {
    describe("pause-contract / unpause-contract", () => {
      it("allows owner to pause contract", () => {
        const { result } = simnet.callPublicFn(CONTRACT, "pause-contract", [], deployer);
        expect(result).toBeOk(Cl.bool(true));
        const paused = simnet.callReadOnlyFn(CONTRACT, "is-paused", [], deployer);
        expect(paused.result).toBeBool(true);
      });

      it("allows owner to unpause contract", () => {
        simnet.callPublicFn(CONTRACT, "pause-contract", [], deployer);
        const { result } = simnet.callPublicFn(CONTRACT, "unpause-contract", [], deployer);
        expect(result).toBeOk(Cl.bool(true));
        const paused = simnet.callReadOnlyFn(CONTRACT, "is-paused", [], deployer);
        expect(paused.result).toBeBool(false);
      });

      it("prevents non-owner from pausing", () => {
        const { result } = simnet.callPublicFn(CONTRACT, "pause-contract", [], randomUser);
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });
    });

    describe("ownership transfer", () => {
      it("allows owner to initiate ownership transfer", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "transfer-ownership", [Cl.principal(newOwner)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });

      it("allows pending owner to accept ownership", () => {
        simnet.callPublicFn(CONTRACT, "transfer-ownership", [Cl.principal(newOwner)], deployer);
        const { result } = simnet.callPublicFn(CONTRACT, "accept-ownership", [], newOwner);
        expect(result).toBeOk(Cl.bool(true));
      });

      it("prevents non-pending owner from accepting", () => {
        simnet.callPublicFn(CONTRACT, "transfer-ownership", [Cl.principal(newOwner)], deployer);
        const { result } = simnet.callPublicFn(CONTRACT, "accept-ownership", [], randomUser);
        expect(result).toBeErr(Cl.uint(ERR_NOT_PENDING_OWNER));
      });
    });

    describe("set-fee-recipient", () => {
      it("allows owner to update fee recipient", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-fee-recipient", [Cl.principal(newOwner)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });

      it("prevents non-owner from updating", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-fee-recipient", [Cl.principal(newOwner)], randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });
    });

    describe("set-platform-fee", () => {
      it("allows owner to update platform fee", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-platform-fee", [Cl.uint(100)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });

      it("prevents fee above 5%", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-platform-fee", [Cl.uint(600)], deployer
        );
        expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
      });
    });

    describe("set-dispute-timeout", () => {
      it("admin can update dispute timeout", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-dispute-timeout", [Cl.uint(10)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });

      it("non-owner cannot update dispute timeout", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-dispute-timeout", [Cl.uint(10)], buyer
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });

      it("rejects timeout below minimum (0)", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-dispute-timeout", [Cl.uint(0)], deployer
        );
        expect(result).toBeErr(Cl.uint(2011));
      });

      it("rejects timeout above maximum (57600)", () => {
        const { result } = simnet.callPublicFn(
          CONTRACT, "set-dispute-timeout", [Cl.uint(57601)], deployer
        );
        expect(result).toBeErr(Cl.uint(2011));
      });
    });
  });

  // ============================================================================
  // CREATE ESCROW — STX
  // ============================================================================

  describe("create-escrow (STX)", () => {
    it("allows buyer to create an STX escrow", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Payment for services"),
          Cl.uint(100),
          Cl.uint(TOKEN_STX),
        ],
        buyer
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("increments escrow count correctly", () => {
      createStxEscrow();
      createStxEscrow(200000);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-escrow-count", [], buyer);
      expect(result).toBeUint(2);
    });

    it("fails with amount below STX minimum", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "create-escrow",
        [Cl.principal(seller), Cl.uint(100), Cl.stringUtf8("Test"), Cl.uint(100), Cl.uint(TOKEN_STX)],
        buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });

    it("fails with zero duration", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "create-escrow",
        [Cl.principal(seller), Cl.uint(100000), Cl.stringUtf8("Test"), Cl.uint(0), Cl.uint(TOKEN_STX)],
        buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_DURATION));
    });

    it("fails when buyer and seller are the same", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "create-escrow",
        [Cl.principal(buyer), Cl.uint(100000), Cl.stringUtf8("Test"), Cl.uint(100), Cl.uint(TOKEN_STX)],
        buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_SELF_ESCROW));
    });

    it("fails when contract is paused", () => {
      simnet.callPublicFn(CONTRACT, "pause-contract", [], deployer);
      const { result } = simnet.callPublicFn(
        CONTRACT, "create-escrow",
        [Cl.principal(seller), Cl.uint(100000), Cl.stringUtf8("Test"), Cl.uint(100), Cl.uint(TOKEN_STX)],
        buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_CONTRACT_PAUSED));
    });

    it("fails with invalid token type", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "create-escrow",
        [Cl.principal(seller), Cl.uint(100000), Cl.stringUtf8("Test"), Cl.uint(100), Cl.uint(99)],
        buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_TOKEN));
    });
  });

  // ============================================================================
  // CREATE ESCROW — sBTC
  // ============================================================================

  describe("create-escrow (sBTC)", () => {
    it("allows buyer to create an sBTC escrow", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT,
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("sBTC Payment for services"),
          Cl.uint(100),
          Cl.uint(TOKEN_SBTC),
        ],
        buyer
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("stores correct token-type in escrow record", () => {
      createSbtcEscrow(100000);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-escrow", [Cl.uint(1)], buyer);
      expect(result.type).toBe(ClarityType.OptionalSome);
      const escrow = (result as any).value.value;
      expect(escrow["token-type"]).toBeUint(TOKEN_SBTC);
    });

    it("fails with amount below sBTC minimum", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT, "create-escrow",
        [Cl.principal(seller), Cl.uint(100), Cl.stringUtf8("Test"), Cl.uint(100), Cl.uint(TOKEN_SBTC)],
        buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });
  });

  // ============================================================================
  // RELEASE — STX
  // ============================================================================

  describe("release (STX)", () => {
    it("allows buyer to release STX funds to seller", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      expect(result).toBeOk(Cl.bool(true));
      const status = simnet.callReadOnlyFn(CONTRACT, "get-status", [Cl.uint(1)], buyer);
      expect(status.result).toBeOk(Cl.uint(STATUS_RELEASED));
    });

    it("fails when non-buyer tries to release", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], randomUser);
      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("fails on non-existent escrow", () => {
      const { result } = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(999)], buyer);
      expect(result).toBeErr(Cl.uint(ERR_ESCROW_NOT_FOUND));
    });

    it("fails when escrow already completed", () => {
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      const { result } = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });

    it("allows buyer to release even after expiry", () => {
      createStxEscrow(100000, 2);
      simnet.mineEmptyBlocks(5);
      const { result } = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  // ============================================================================
  // RELEASE — sBTC
  // ============================================================================

  describe("release (sBTC)", () => {
    it("allows buyer to release sBTC funds to seller", () => {
      createSbtcEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      expect(result).toBeOk(Cl.bool(true));
      const status = simnet.callReadOnlyFn(CONTRACT, "get-status", [Cl.uint(1)], buyer);
      expect(status.result).toBeOk(Cl.uint(STATUS_RELEASED));
    });

    it("fails when non-buyer tries to release sBTC escrow", () => {
      createSbtcEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], randomUser);
      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });
  });

  // ============================================================================
  // REFUND — STX
  // ============================================================================

  describe("refund (STX)", () => {
    it("allows seller to refund STX to buyer", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(1)], seller);
      expect(result).toBeOk(Cl.bool(true));
      const status = simnet.callReadOnlyFn(CONTRACT, "get-status", [Cl.uint(1)], buyer);
      expect(status.result).toBeOk(Cl.uint(STATUS_REFUNDED));
    });

    it("fails when non-seller tries to refund before expiry", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(1)], randomUser);
      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("fails when escrow already completed", () => {
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      const { result } = simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(1)], seller);
      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });
  });

  // ============================================================================
  // REFUND — sBTC
  // ============================================================================

  describe("refund (sBTC)", () => {
    it("allows seller to refund sBTC to buyer", () => {
      createSbtcEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(1)], seller);
      expect(result).toBeOk(Cl.bool(true));
      const status = simnet.callReadOnlyFn(CONTRACT, "get-status", [Cl.uint(1)], buyer);
      expect(status.result).toBeOk(Cl.uint(STATUS_REFUNDED));
    });

    it("allows anyone to refund sBTC after expiry", () => {
      createSbtcEscrow(100000, 2);
      simnet.mineEmptyBlocks(5);
      const { result } = simnet.callPublicFn(CONTRACT, "refund", [Cl.uint(1)], randomUser);
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  // ============================================================================
  // DISPUTE — both tokens
  // ============================================================================

  describe("dispute", () => {
    it("allows buyer to dispute STX escrow", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
      expect(result).toBeOk(Cl.bool(true));
      const status = simnet.callReadOnlyFn(CONTRACT, "get-status", [Cl.uint(1)], buyer);
      expect(status.result).toBeOk(Cl.uint(STATUS_DISPUTED));
    });

    it("allows seller to dispute sBTC escrow", () => {
      createSbtcEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], seller);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("fails when non-party tries to dispute", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], randomUser);
      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("fails when escrow already completed", () => {
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      const { result } = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });

    it("fails when contract is paused", () => {
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "pause-contract", [], deployer);
      const { result } = simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
      expect(result).toBeErr(Cl.uint(ERR_CONTRACT_PAUSED));
    });

    it("records disputed-at timestamp", () => {
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
      const { result } = simnet.callReadOnlyFn(CONTRACT, "get-escrow", [Cl.uint(1)], buyer);
      expect(result.type).toBe(ClarityType.OptionalSome);
      const escrow = (result as any).value.value;
      expect(escrow["disputed-at"].type).toBe(ClarityType.OptionalSome);
    });
  });

  // ============================================================================
  // EXTEND ESCROW
  // ============================================================================

  describe("extend-escrow", () => {
    it("allows buyer to extend escrow expiry", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(
        CONTRACT, "extend-escrow", [Cl.uint(1), Cl.uint(50)], buyer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("fails when non-buyer tries to extend", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(
        CONTRACT, "extend-escrow", [Cl.uint(1), Cl.uint(50)], seller
      );
      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("fails with zero extension", () => {
      createStxEscrow();
      const { result } = simnet.callPublicFn(
        CONTRACT, "extend-escrow", [Cl.uint(1), Cl.uint(0)], buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_EXTENSION));
    });

    it("fails on already completed escrow", () => {
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "release", [Cl.uint(1)], buyer);
      const { result } = simnet.callPublicFn(
        CONTRACT, "extend-escrow", [Cl.uint(1), Cl.uint(50)], buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });

    it("fails when contract is paused", () => {
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "pause-contract", [], deployer);
      const { result } = simnet.callPublicFn(
        CONTRACT, "extend-escrow", [Cl.uint(1), Cl.uint(50)], buyer
      );
      expect(result).toBeErr(Cl.uint(ERR_CONTRACT_PAUSED));
    });
  });

  // ============================================================================
  // DISPUTE RESOLUTION — STX
  // ============================================================================

  describe("Dispute Resolution (STX)", () => {
    describe("resolve-dispute-for-buyer", () => {
      it("allows owner to resolve disputed STX escrow for buyer", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(1)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });

      it("prevents non-owner from resolving dispute", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(1)], randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });

      it("fails on non-disputed escrow", () => {
        createStxEscrow();
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(1)], deployer
        );
        expect(result).toBeErr(Cl.uint(ERR_NOT_DISPUTED));
      });
    });

    describe("resolve-dispute-for-seller", () => {
      it("allows owner to resolve disputed STX escrow for seller", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-seller", [Cl.uint(1)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });

      it("prevents non-owner from resolving for seller", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-seller", [Cl.uint(1)], randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });

      it("fails on non-disputed escrow", () => {
        createStxEscrow();
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-seller", [Cl.uint(1)], deployer
        );
        expect(result).toBeErr(Cl.uint(ERR_NOT_DISPUTED));
      });
    });

    describe("resolve-expired-dispute (STX)", () => {
      it("allows buyer to resolve STX dispute after timeout", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        simnet.mineEmptyBlocks(DISPUTE_TIMEOUT + 1);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-expired-dispute", [Cl.uint(1)], buyer
        );
        expect(result).toBeOk(Cl.bool(true));
        const status = simnet.callReadOnlyFn(CONTRACT, "get-status", [Cl.uint(1)], buyer);
        expect(status.result).toBeOk(Cl.uint(STATUS_REFUNDED));
      });

      it("fails before timeout expires", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-expired-dispute", [Cl.uint(1)], buyer
        );
        expect(result).toBeErr(Cl.uint(ERR_DISPUTE_NOT_TIMED_OUT));
      });

      it("fails when non-buyer tries to resolve", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        simnet.mineEmptyBlocks(DISPUTE_TIMEOUT + 1);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-expired-dispute", [Cl.uint(1)], seller
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });
    });
  });

  // ============================================================================
  // DISPUTE RESOLUTION — sBTC
  // ============================================================================

  describe("Dispute Resolution (sBTC)", () => {
    describe("resolve-dispute-for-buyer (sBTC)", () => {
      it("allows owner to resolve disputed sBTC escrow for buyer", () => {
        createSbtcEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(1)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });
    });

    describe("resolve-dispute-for-seller (sBTC)", () => {
      it("allows owner to resolve disputed sBTC escrow for seller", () => {
        createSbtcEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-dispute-for-seller", [Cl.uint(1)], deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });
    });

    describe("resolve-expired-dispute (sBTC)", () => {
      it("allows buyer to resolve sBTC dispute after timeout", () => {
        createSbtcEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        simnet.mineEmptyBlocks(DISPUTE_TIMEOUT + 1);
        const { result } = simnet.callPublicFn(
          CONTRACT, "resolve-expired-dispute", [Cl.uint(1)], buyer
        );
        expect(result).toBeOk(Cl.bool(true));
      });
    });
  });

  // ============================================================================
  // ACTIVE DISPUTES TRACKING
  // ============================================================================

  describe("active-disputes tracking", () => {
    it("increments on dispute and decrements on resolution", () => {
      createStxEscrow(100000);
      createSbtcEscrow(100000);
      simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
      simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(2)], buyer);

      let stats = simnet.callReadOnlyFn(CONTRACT, "get-platform-stats", [], deployer);
      let statsVal = (stats.result as any).value;
      expect(statsVal["active-disputes"]).toBeUint(2);

      simnet.callPublicFn(CONTRACT, "resolve-dispute-for-buyer", [Cl.uint(1)], deployer);
      stats = simnet.callReadOnlyFn(CONTRACT, "get-platform-stats", [], deployer);
      statsVal = (stats.result as any).value;
      expect(statsVal["active-disputes"]).toBeUint(1);
    });
  });

  // ============================================================================
  // READ-ONLY FUNCTIONS
  // ============================================================================

  describe("Read-Only Functions", () => {
    describe("get-escrow", () => {
      it("returns escrow details with token-type", () => {
        createStxEscrow();
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-escrow", [Cl.uint(1)], buyer);
        expect(result.type).toBe(ClarityType.OptionalSome);
        const escrow = (result as any).value.value;
        expect(escrow["token-type"]).toBeUint(TOKEN_STX);
      });

      it("returns none for non-existent escrow", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-escrow", [Cl.uint(999)], buyer);
        expect(result).toBeNone();
      });
    });

    describe("get-user-role", () => {
      it("correctly identifies buyer", () => {
        createStxEscrow();
        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "get-user-role", [Cl.uint(1), Cl.principal(buyer)], buyer
        );
        expect(result).toBeOk(Cl.stringAscii("buyer"));
      });

      it("correctly identifies seller", () => {
        createStxEscrow();
        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "get-user-role", [Cl.uint(1), Cl.principal(seller)], buyer
        );
        expect(result).toBeOk(Cl.stringAscii("seller"));
      });

      it("returns none for non-party", () => {
        createStxEscrow();
        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "get-user-role", [Cl.uint(1), Cl.principal(randomUser)], buyer
        );
        expect(result).toBeOk(Cl.stringAscii("none"));
      });
    });

    describe("get-platform-stats", () => {
      it("returns per-token volume stats", () => {
        createStxEscrow(100000);
        createSbtcEscrow(200000);

        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-platform-stats", [], buyer);
        expect(result.type).toBe(ClarityType.Tuple);
        const stats = (result as any).value;
        expect(stats["total-escrows"]).toBeUint(2);
        expect(stats["total-volume-stx"]).toBeUint(100000);
        expect(stats["total-volume-sbtc"]).toBeUint(200000);
      });
    });

    describe("get-config", () => {
      it("returns contract configuration with per-token bounds", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-config", [], buyer);
        expect(result.type).toBe(ClarityType.Tuple);
        const config = (result as any).value;
        expect(config["dispute-timeout"]).toBeUint(DISPUTE_TIMEOUT);
        expect(config["min-amount-stx"]).toBeUint(1000);
        expect(config["min-amount-sbtc"]).toBeUint(10000);
      });
    });

    describe("calculate-escrow-fee", () => {
      it("calculates 0.5% fee correctly", () => {
        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "calculate-escrow-fee", [Cl.uint(1000000)], buyer
        );
        expect(result).toBeUint(5000);
      });
    });

    describe("get-user-stats", () => {
      it("returns default stats for new user", () => {
        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "get-user-stats", [Cl.principal(randomUser)], buyer
        );
        expect(result.type).toBe(ClarityType.Tuple);
      });

      it("tracks per-token user stats after escrow operations", () => {
        createStxEscrow(100000);
        createSbtcEscrow(200000);

        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "get-user-stats", [Cl.principal(buyer)], buyer
        );
        const stats = (result as any).value;
        expect(stats["escrows-created"]).toBeUint(2);
      });
    });

    describe("is-dispute-timed-out", () => {
      it("returns false for non-disputed escrow", () => {
        createStxEscrow();
        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "is-dispute-timed-out", [Cl.uint(1)], buyer
        );
        expect(result).toBeBool(false);
      });

      it("returns true after timeout blocks pass", () => {
        createStxEscrow();
        simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);
        simnet.mineEmptyBlocks(DISPUTE_TIMEOUT + 1);
        const { result } = simnet.callReadOnlyFn(
          CONTRACT, "is-dispute-timed-out", [Cl.uint(1)], buyer
        );
        expect(result).toBeBool(true);
      });
    });
  });

  // ============================================================================
  // CONFIGURABLE DISPUTE TIMEOUT
  // ============================================================================

  describe("resolve-expired-dispute respects updated timeout", () => {
    it("works with short timeout", () => {
      simnet.callPublicFn(CONTRACT, "set-dispute-timeout", [Cl.uint(5)], deployer);
      createStxEscrow();
      simnet.callPublicFn(CONTRACT, "dispute", [Cl.uint(1)], buyer);

      simnet.mineEmptyBlocks(3);
      const { result: tooEarly } = simnet.callPublicFn(
        CONTRACT, "resolve-expired-dispute", [Cl.uint(1)], buyer
      );
      expect(tooEarly).toBeErr(Cl.uint(ERR_DISPUTE_NOT_TIMED_OUT));

      simnet.mineEmptyBlocks(5);
      const { result: resolved } = simnet.callPublicFn(
        CONTRACT, "resolve-expired-dispute", [Cl.uint(1)], buyer
      );
      expect(resolved).toBeOk(Cl.bool(true));
    });
  });
});
