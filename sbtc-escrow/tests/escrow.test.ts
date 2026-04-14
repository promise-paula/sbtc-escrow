import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const buyer = accounts.get("wallet_1")!;
const seller = accounts.get("wallet_2")!;
const randomUser = accounts.get("wallet_3")!;
const newOwner = accounts.get("wallet_4")!;

// Error codes
const ERR_UNAUTHORIZED = 1001;
const ERR_CONTRACT_PAUSED = 1002;
const ERR_OWNERSHIP_PENDING = 1003;
const ERR_NOT_PENDING_OWNER = 1004;
const ERR_ESCROW_NOT_FOUND = 2001;
const ERR_ESCROW_ALREADY_COMPLETED = 2002;
const ERR_ESCROW_EXPIRED = 2003;
const ERR_INVALID_AMOUNT = 2005;
const ERR_INVALID_DURATION = 2006;
const ERR_SELF_ESCROW = 2007;
const ERR_DISPUTE_NOT_TIMED_OUT = 2008;
const ERR_NOT_DISPUTED = 2009;
const ERR_INVALID_EXTENSION = 2010;

// Status codes
const STATUS_PENDING = 0;
const STATUS_RELEASED = 1;
const STATUS_REFUNDED = 2;
const STATUS_DISPUTED = 3;

// Platform configuration
const MIN_AMOUNT = 1000;
const PLATFORM_FEE_BPS = 50; // 0.5%
const DISPUTE_TIMEOUT = 4320; // ~30 days in blocks

describe("sBTC Escrow V3 Contract Tests", () => {
  
  it("ensures simnet is well initialised", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  // ============================================================================
  // ADMIN FUNCTIONS
  // ============================================================================
  
  describe("Admin Functions", () => {
    
    describe("pause-contract / unpause-contract", () => {
      it("allows owner to pause contract", () => {
        const { result } = simnet.callPublicFn(
          "escrow",
          "pause-contract",
          [],
          deployer
        );
        expect(result).toBeOk(Cl.bool(true));
        
        // Verify contract is paused
        const pausedResult = simnet.callReadOnlyFn(
          "escrow",
          "is-paused",
          [],
          deployer
        );
        expect(pausedResult.result).toBeBool(true);
      });
      
      it("allows owner to unpause contract", () => {
        // First pause
        simnet.callPublicFn("escrow", "pause-contract", [], deployer);
        
        // Then unpause
        const { result } = simnet.callPublicFn(
          "escrow",
          "unpause-contract",
          [],
          deployer
        );
        expect(result).toBeOk(Cl.bool(true));
        
        // Verify contract is unpaused
        const pausedResult = simnet.callReadOnlyFn(
          "escrow",
          "is-paused",
          [],
          deployer
        );
        expect(pausedResult.result).toBeBool(false);
      });
      
      it("prevents non-owner from pausing", () => {
        const { result } = simnet.callPublicFn(
          "escrow",
          "pause-contract",
          [],
          randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });
    });
    
    describe("ownership transfer", () => {
      it("allows owner to initiate ownership transfer", () => {
        const { result } = simnet.callPublicFn(
          "escrow",
          "transfer-ownership",
          [Cl.principal(newOwner)],
          deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });
      
      it("allows pending owner to accept ownership", () => {
        // Initiate transfer
        simnet.callPublicFn(
          "escrow",
          "transfer-ownership",
          [Cl.principal(newOwner)],
          deployer
        );
        
        // Accept ownership
        const { result } = simnet.callPublicFn(
          "escrow",
          "accept-ownership",
          [],
          newOwner
        );
        expect(result).toBeOk(Cl.bool(true));
      });
      
      it("prevents non-pending owner from accepting", () => {
        // Initiate transfer to newOwner
        simnet.callPublicFn(
          "escrow",
          "transfer-ownership",
          [Cl.principal(newOwner)],
          deployer
        );
        
        // Random user tries to accept
        const { result } = simnet.callPublicFn(
          "escrow",
          "accept-ownership",
          [],
          randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_NOT_PENDING_OWNER));
      });
    });
    
    describe("set-fee-recipient", () => {
      it("allows owner to update fee recipient", () => {
        const { result } = simnet.callPublicFn(
          "escrow",
          "set-fee-recipient",
          [Cl.principal(newOwner)],
          deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });
      
      it("prevents non-owner from updating fee recipient", () => {
        const { result } = simnet.callPublicFn(
          "escrow",
          "set-fee-recipient",
          [Cl.principal(newOwner)],
          randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });
    });
    
    describe("set-platform-fee", () => {
      it("allows owner to update platform fee", () => {
        const { result } = simnet.callPublicFn(
          "escrow",
          "set-platform-fee",
          [Cl.uint(100)], // 1%
          deployer
        );
        expect(result).toBeOk(Cl.bool(true));
      });
      
      it("prevents fee above 5%", () => {
        const { result } = simnet.callPublicFn(
          "escrow",
          "set-platform-fee",
          [Cl.uint(600)], // 6% - should fail
          deployer
        );
        expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
      });
    });
  });

  // ============================================================================
  // ESCROW FUNCTIONS
  // ============================================================================
  
  describe("create-escrow", () => {
    
    it("allows buyer to create an escrow", () => {
      const amount = 100000; // 100k microSTX
      
      const { result } = simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(amount),
          Cl.stringUtf8("Payment for services"),
          Cl.uint(100), // 100 blocks duration
        ],
        buyer
      );
      
      expect(result).toBeOk(Cl.uint(1)); // First escrow ID is 1
    });

    it("increments escrow count correctly", () => {
      // Create first escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Payment 1"),
          Cl.uint(100),
        ],
        buyer
      );

      // Create second escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(200000),
          Cl.stringUtf8("Payment 2"),
          Cl.uint(100),
        ],
        buyer
      );

      const { result } = simnet.callReadOnlyFn(
        "escrow",
        "get-escrow-count",
        [],
        buyer
      );

      expect(result).toBeUint(2);
    });

    it("fails with amount below minimum", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100), // Below MIN_AMOUNT (1000)
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_INVALID_AMOUNT));
    });
    
    it("fails with zero duration", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(0), // Zero duration
        ],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_INVALID_DURATION));
    });
    
    it("fails when buyer and seller are the same", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(buyer), // Same as sender
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_SELF_ESCROW));
    });
    
    it("fails when contract is paused", () => {
      // Pause contract
      simnet.callPublicFn("escrow", "pause-contract", [], deployer);
      
      const { result } = simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_CONTRACT_PAUSED));
    });
  });

  describe("release", () => {
    
    it("allows buyer to release funds to seller", () => {
      // Create escrow first
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test payment"),
          Cl.uint(100),
        ],
        buyer
      );

      // Release funds
      const { result } = simnet.callPublicFn(
        "escrow",
        "release",
        [Cl.uint(1)],
        buyer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status changed to RELEASED
      const statusResult = simnet.callReadOnlyFn(
        "escrow",
        "get-status",
        [Cl.uint(1)],
        buyer
      );

      expect(statusResult.result).toBeOk(Cl.uint(STATUS_RELEASED));
    });

    it("fails when non-buyer tries to release", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      // Random user tries to release
      const { result } = simnet.callPublicFn(
        "escrow",
        "release",
        [Cl.uint(1)],
        randomUser
      );

      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("fails on non-existent escrow", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "release",
        [Cl.uint(999)],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_ESCROW_NOT_FOUND));
    });
    
    it("fails when escrow already completed", () => {
      // Create and release escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );
      
      simnet.callPublicFn("escrow", "release", [Cl.uint(1)], buyer);
      
      // Try to release again
      const { result } = simnet.callPublicFn(
        "escrow",
        "release",
        [Cl.uint(1)],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });
  });

  describe("refund", () => {
    
    it("allows seller to refund buyer", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      // Seller refunds
      const { result } = simnet.callPublicFn(
        "escrow",
        "refund",
        [Cl.uint(1)],
        seller
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status is REFUNDED
      const statusResult = simnet.callReadOnlyFn(
        "escrow",
        "get-status",
        [Cl.uint(1)],
        seller
      );

      expect(statusResult.result).toBeOk(Cl.uint(STATUS_REFUNDED));
    });

    it("fails when non-seller tries to refund before expiry", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      // Random user tries to refund
      const { result } = simnet.callPublicFn(
        "escrow",
        "refund",
        [Cl.uint(1)],
        randomUser
      );

      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });
    
    it("fails when escrow already completed", () => {
      // Create and release escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );
      
      simnet.callPublicFn("escrow", "release", [Cl.uint(1)], buyer);
      
      // Try to refund
      const { result } = simnet.callPublicFn(
        "escrow",
        "refund",
        [Cl.uint(1)],
        seller
      );

      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });
  });

  describe("dispute", () => {
    
    it("allows buyer to dispute escrow", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      const { result } = simnet.callPublicFn(
        "escrow",
        "dispute",
        [Cl.uint(1)],
        buyer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status is DISPUTED
      const statusResult = simnet.callReadOnlyFn(
        "escrow",
        "get-status",
        [Cl.uint(1)],
        buyer
      );

      expect(statusResult.result).toBeOk(Cl.uint(STATUS_DISPUTED));
    });

    it("allows seller to dispute escrow", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      const { result } = simnet.callPublicFn(
        "escrow",
        "dispute",
        [Cl.uint(1)],
        seller
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("fails when non-party tries to dispute", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      // Random user tries to dispute
      const { result } = simnet.callPublicFn(
        "escrow",
        "dispute",
        [Cl.uint(1)],
        randomUser
      );

      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });
    
    it("fails when escrow already completed", () => {
      // Create and release escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );
      
      simnet.callPublicFn("escrow", "release", [Cl.uint(1)], buyer);
      
      // Try to dispute
      const { result } = simnet.callPublicFn(
        "escrow",
        "dispute",
        [Cl.uint(1)],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });

    it("fails when contract is paused", () => {
      // Create escrow first (before pausing)
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      // Pause contract
      simnet.callPublicFn("escrow", "pause-contract", [], deployer);

      // Try to dispute while paused
      const { result } = simnet.callPublicFn(
        "escrow",
        "dispute",
        [Cl.uint(1)],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_CONTRACT_PAUSED));
    });

    it("records disputed-at timestamp", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      // Dispute
      simnet.callPublicFn("escrow", "dispute", [Cl.uint(1)], buyer);

      // Verify disputed-at is set
      const { result } = simnet.callReadOnlyFn(
        "escrow",
        "get-escrow",
        [Cl.uint(1)],
        buyer
      );

      expect(result.type).toBe(ClarityType.OptionalSome);
      // The disputed-at field should be some (not none)
      const escrowTuple = (result as any).value;
      expect(escrowTuple.value["disputed-at"].type).toBe(ClarityType.OptionalSome);
    });
  });

  // ============================================================================
  // EXTEND ESCROW TESTS
  // ============================================================================

  describe("extend-escrow", () => {
    it("allows buyer to extend escrow expiry", () => {
      // Create escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      // Extend by 50 blocks
      const { result } = simnet.callPublicFn(
        "escrow",
        "extend-escrow",
        [Cl.uint(1), Cl.uint(50)],
        buyer
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("fails when non-buyer tries to extend", () => {
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      const { result } = simnet.callPublicFn(
        "escrow",
        "extend-escrow",
        [Cl.uint(1), Cl.uint(50)],
        seller
      );

      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("fails with zero extension", () => {
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      const { result } = simnet.callPublicFn(
        "escrow",
        "extend-escrow",
        [Cl.uint(1), Cl.uint(0)],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_INVALID_EXTENSION));
    });

    it("fails on already completed escrow", () => {
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );
      simnet.callPublicFn("escrow", "release", [Cl.uint(1)], buyer);

      const { result } = simnet.callPublicFn(
        "escrow",
        "extend-escrow",
        [Cl.uint(1), Cl.uint(50)],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_ESCROW_ALREADY_COMPLETED));
    });

    it("fails when contract is paused", () => {
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );
      simnet.callPublicFn("escrow", "pause-contract", [], deployer);

      const { result } = simnet.callPublicFn(
        "escrow",
        "extend-escrow",
        [Cl.uint(1), Cl.uint(50)],
        buyer
      );

      expect(result).toBeErr(Cl.uint(ERR_CONTRACT_PAUSED));
    });
  });

  // ============================================================================
  // BUYER RELEASE AFTER EXPIRY
  // ============================================================================

  describe("release after expiry", () => {
    it("allows buyer to release even after escrow expires", () => {
      // Create escrow with short duration (2 blocks)
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(2),
        ],
        buyer
      );

      // Mine blocks to pass expiry
      simnet.mineEmptyBlocks(5);

      // Buyer should still be able to release (V3 removes expiry check on release)
      const { result } = simnet.callPublicFn(
        "escrow",
        "release",
        [Cl.uint(1)],
        buyer
      );

      expect(result).toBeOk(Cl.bool(true));
    });
  });

  // ============================================================================
  // READ-ONLY FUNCTIONS
  // ============================================================================
  
  describe("Read-Only Functions", () => {
    
    describe("get-escrow", () => {
      it("returns escrow details", () => {
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test payment"),
            Cl.uint(100),
          ],
          buyer
        );

        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-escrow",
          [Cl.uint(1)],
          buyer
        );

        expect(result.type).toBe(ClarityType.OptionalSome);
      });

      it("returns none for non-existent escrow", () => {
        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-escrow",
          [Cl.uint(999)],
          buyer
        );

        expect(result).toBeNone();
      });
    });

    describe("escrow-exists", () => {
      it("returns true for existing escrow", () => {
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );

        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "escrow-exists",
          [Cl.uint(1)],
          buyer
        );

        expect(result).toBeBool(true);
      });

      it("returns false for non-existent escrow", () => {
        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "escrow-exists",
          [Cl.uint(999)],
          buyer
        );

        expect(result).toBeBool(false);
      });
    });

    describe("get-user-role", () => {
      it("correctly identifies buyer", () => {
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );

        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-user-role",
          [Cl.uint(1), Cl.principal(buyer)],
          buyer
        );

        expect(result).toBeOk(Cl.stringAscii("buyer"));
      });

      it("correctly identifies seller", () => {
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );

        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-user-role",
          [Cl.uint(1), Cl.principal(seller)],
          buyer
        );

        expect(result).toBeOk(Cl.stringAscii("seller"));
      });

      it("returns none for non-party", () => {
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );

        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-user-role",
          [Cl.uint(1), Cl.principal(randomUser)],
          buyer
        );

        expect(result).toBeOk(Cl.stringAscii("none"));
      });
    });
    
    describe("get-platform-stats", () => {
      it("returns correct platform statistics", () => {
        // Create and release an escrow
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        
        simnet.callPublicFn("escrow", "release", [Cl.uint(1)], buyer);

        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-platform-stats",
          [],
          buyer
        );

        expect(result.type).toBe(ClarityType.Tuple);
      });
    });
    
    describe("get-config", () => {
      it("returns contract configuration", () => {
        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-config",
          [],
          buyer
        );

        expect(result.type).toBe(ClarityType.Tuple);
      });
    });
    
    describe("calculate-escrow-fee", () => {
      it("calculates 0.5% fee correctly", () => {
        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "calculate-escrow-fee",
          [Cl.uint(1000000)], // 1M microSTX
          buyer
        );

        // 0.5% of 1M = 5000
        expect(result).toBeUint(5000);
      });
    });
    
    describe("get-user-stats", () => {
      it("returns default stats for new user", () => {
        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-user-stats",
          [Cl.principal(randomUser)],
          buyer
        );

        expect(result.type).toBe(ClarityType.Tuple);
      });
      
      it("tracks user stats after creating escrow", () => {
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );

        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-user-stats",
          [Cl.principal(buyer)],
          buyer
        );

        expect(result.type).toBe(ClarityType.Tuple);
      });
    });
  });

  // ============================================================================
  // DISPUTE RESOLUTION TESTS
  // ============================================================================
  
  describe("Dispute Resolution Functions", () => {
    
    describe("resolve-dispute-for-buyer", () => {
      it("allows owner to resolve disputed escrow for buyer", () => {
        // Create escrow
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Dispute resolution test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        
        // Dispute it
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);
        
        // Resolve for buyer (as owner)
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-buyer",
          [Cl.uint(escrowId)],
          deployer
        );
        expect(result).toBeOk(Cl.bool(true));
        
        // Verify escrow still exists and was processed
        const escrowResult = simnet.callReadOnlyFn(
          "escrow",
          "get-escrow",
          [Cl.uint(escrowId)],
          deployer
        );
        expect(escrowResult.result.type).toBe(ClarityType.OptionalSome);
      });
      
      it("prevents non-owner from resolving dispute", () => {
        // Create and dispute escrow
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);
        
        // Try to resolve as non-owner
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-buyer",
          [Cl.uint(escrowId)],
          randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });
      
      it("fails on non-disputed escrow", () => {
        // Create escrow (pending, not disputed)
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        
        // Try to resolve (should fail - not disputed)
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-buyer",
          [Cl.uint(escrowId)],
          deployer
        );
        expect(result).toBeErr(Cl.uint(ERR_NOT_DISPUTED));
      });
    });
    
    describe("resolve-dispute-for-seller", () => {
      it("allows owner to resolve disputed escrow for seller", () => {
        // Create escrow
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Dispute resolution test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        
        // Dispute it
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);
        
        // Resolve for seller (as owner)
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-seller",
          [Cl.uint(escrowId)],
          deployer
        );
        expect(result).toBeOk(Cl.bool(true));
        
        // Verify escrow still exists and was processed
        const escrowResult = simnet.callReadOnlyFn(
          "escrow",
          "get-escrow",
          [Cl.uint(escrowId)],
          deployer
        );
        expect(escrowResult.result.type).toBe(ClarityType.OptionalSome);
      });
      
      it("prevents non-owner from resolving dispute for seller", () => {
        // Create and dispute escrow
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);
        
        // Try to resolve as non-owner
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-seller",
          [Cl.uint(escrowId)],
          randomUser
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });
      
      it("updates seller stats after resolution", () => {
        // Create and dispute escrow
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);
        
        // Resolve for seller
        simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-seller",
          [Cl.uint(escrowId)],
          deployer
        );
        
        // Check seller stats were updated
        const { result } = simnet.callReadOnlyFn(
          "escrow",
          "get-user-stats",
          [Cl.principal(seller)],
          deployer
        );
        expect(result.type).toBe(ClarityType.Tuple);
      });

      it("fails on non-disputed escrow for seller", () => {
        // Create escrow (pending, not disputed)
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;

        // Try to resolve (should fail - not disputed)
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-seller",
          [Cl.uint(escrowId)],
          deployer
        );
        expect(result).toBeErr(Cl.uint(ERR_NOT_DISPUTED));
      });
    });

    describe("resolve-expired-dispute", () => {
      it("allows buyer to resolve dispute after timeout", () => {
        // Create escrow
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Timeout test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;

        // Dispute it
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);

        // Mine blocks past DISPUTE_TIMEOUT
        simnet.mineEmptyBlocks(DISPUTE_TIMEOUT + 1);

        // Buyer resolves expired dispute
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-expired-dispute",
          [Cl.uint(escrowId)],
          buyer
        );
        expect(result).toBeOk(Cl.bool(true));

        // Verify status is REFUNDED
        const statusResult = simnet.callReadOnlyFn(
          "escrow",
          "get-status",
          [Cl.uint(escrowId)],
          buyer
        );
        expect(statusResult.result).toBeOk(Cl.uint(STATUS_REFUNDED));
      });

      it("fails before timeout expires", () => {
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);

        // Try to resolve immediately (should fail - timeout not reached)
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-expired-dispute",
          [Cl.uint(escrowId)],
          buyer
        );
        expect(result).toBeErr(Cl.uint(ERR_DISPUTE_NOT_TIMED_OUT));
      });

      it("fails when non-buyer tries to resolve", () => {
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(escrowId)], buyer);
        simnet.mineEmptyBlocks(DISPUTE_TIMEOUT + 1);

        // Seller tries to resolve (should fail - only buyer)
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-expired-dispute",
          [Cl.uint(escrowId)],
          seller
        );
        expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
      });

      it("fails on non-disputed escrow", () => {
        const createResult = simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Test"),
            Cl.uint(100),
          ],
          buyer
        );
        const escrowId = (createResult.result as any).value.value;

        // Try to resolve (not disputed)
        const { result } = simnet.callPublicFn(
          "escrow",
          "resolve-expired-dispute",
          [Cl.uint(escrowId)],
          buyer
        );
        expect(result).toBeErr(Cl.uint(ERR_NOT_DISPUTED));
      });
    });

    describe("active-disputes tracking", () => {
      it("increments on dispute and decrements on resolution", () => {
        // Create two escrows
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(100000),
            Cl.stringUtf8("Dispute 1"),
            Cl.uint(100),
          ],
          buyer
        );
        simnet.callPublicFn(
          "escrow",
          "create-escrow",
          [
            Cl.principal(seller),
            Cl.uint(200000),
            Cl.stringUtf8("Dispute 2"),
            Cl.uint(100),
          ],
          buyer
        );

        // Dispute both
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(1)], buyer);
        simnet.callPublicFn("escrow", "dispute", [Cl.uint(2)], buyer);

        // Check active-disputes is 2
        let statsResult = simnet.callReadOnlyFn(
          "escrow",
          "get-platform-stats",
          [],
          deployer
        );
        let stats = (statsResult.result as any).value;
        expect(stats["active-disputes"]).toBeUint(2);

        // Resolve one dispute
        simnet.callPublicFn(
          "escrow",
          "resolve-dispute-for-buyer",
          [Cl.uint(1)],
          deployer
        );

        // Check active-disputes decremented to 1
        statsResult = simnet.callReadOnlyFn(
          "escrow",
          "get-platform-stats",
          [],
          deployer
        );
        stats = (statsResult.result as any).value;
        expect(stats["active-disputes"]).toBeUint(1);
      });
    });
  });

  // ============================================================================
  // IS-DISPUTE-TIMED-OUT READ-ONLY
  // ============================================================================

  describe("is-dispute-timed-out", () => {
    it("returns false for non-disputed escrow", () => {
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );

      const { result } = simnet.callReadOnlyFn(
        "escrow",
        "is-dispute-timed-out",
        [Cl.uint(1)],
        buyer
      );
      expect(result).toBeBool(false);
    });

    it("returns false for recently disputed escrow", () => {
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );
      simnet.callPublicFn("escrow", "dispute", [Cl.uint(1)], buyer);

      const { result } = simnet.callReadOnlyFn(
        "escrow",
        "is-dispute-timed-out",
        [Cl.uint(1)],
        buyer
      );
      expect(result).toBeBool(false);
    });

    it("returns true after timeout blocks pass", () => {
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Test"),
          Cl.uint(100),
        ],
        buyer
      );
      simnet.callPublicFn("escrow", "dispute", [Cl.uint(1)], buyer);
      simnet.mineEmptyBlocks(DISPUTE_TIMEOUT + 1);

      const { result } = simnet.callReadOnlyFn(
        "escrow",
        "is-dispute-timed-out",
        [Cl.uint(1)],
        buyer
      );
      expect(result).toBeBool(true);
    });

    it("returns false for non-existent escrow", () => {
      const { result } = simnet.callReadOnlyFn(
        "escrow",
        "is-dispute-timed-out",
        [Cl.uint(999)],
        buyer
      );
      expect(result).toBeBool(false);
    });
  });

  // ============================================================================
  // GET-CONFIG WITH DISPUTE-TIMEOUT
  // ============================================================================

  describe("get-config includes dispute-timeout", () => {
    it("returns config with dispute-timeout field", () => {
      const { result } = simnet.callReadOnlyFn(
        "escrow",
        "get-config",
        [],
        buyer
      );

      expect(result.type).toBe(ClarityType.Tuple);
      const config = (result as any).value;
      expect(config["dispute-timeout"]).toBeUint(DISPUTE_TIMEOUT);
    });
  });

  // ============================================================================
  // SET-DISPUTE-TIMEOUT (Admin configurable)
  // ============================================================================

  describe("set-dispute-timeout", () => {
    it("admin can update dispute timeout", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "set-dispute-timeout",
        [Cl.uint(10)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Verify config reflects new value
      const { result: configResult } = simnet.callReadOnlyFn(
        "escrow",
        "get-config",
        [],
        deployer
      );
      const config = (configResult as any).value;
      expect(config["dispute-timeout"]).toBeUint(10);
    });

    it("non-owner cannot update dispute timeout", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "set-dispute-timeout",
        [Cl.uint(10)],
        buyer
      );
      expect(result).toBeErr(Cl.uint(1001));
    });

    it("rejects timeout below minimum (0)", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "set-dispute-timeout",
        [Cl.uint(0)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(2011));
    });

    it("rejects timeout above maximum (8640)", () => {
      const { result } = simnet.callPublicFn(
        "escrow",
        "set-dispute-timeout",
        [Cl.uint(8641)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(2011));
    });

    it("accepts boundary values (1 and 8640)", () => {
      const { result: minResult } = simnet.callPublicFn(
        "escrow",
        "set-dispute-timeout",
        [Cl.uint(1)],
        deployer
      );
      expect(minResult).toBeOk(Cl.bool(true));

      const { result: maxResult } = simnet.callPublicFn(
        "escrow",
        "set-dispute-timeout",
        [Cl.uint(8640)],
        deployer
      );
      expect(maxResult).toBeOk(Cl.bool(true));
    });

    it("resolve-expired-dispute respects updated timeout", () => {
      // Set timeout to 5 blocks for quick testing
      simnet.callPublicFn(
        "escrow",
        "set-dispute-timeout",
        [Cl.uint(5)],
        deployer
      );

      // Create and dispute an escrow
      simnet.callPublicFn(
        "escrow",
        "create-escrow",
        [
          Cl.principal(seller),
          Cl.uint(100000),
          Cl.stringUtf8("Quick timeout test"),
          Cl.uint(100),
        ],
        buyer
      );
      simnet.callPublicFn("escrow", "dispute", [Cl.uint(1)], buyer);

      // Not enough blocks yet — should fail
      simnet.mineEmptyBlocks(3);
      const { result: tooEarly } = simnet.callPublicFn(
        "escrow",
        "resolve-expired-dispute",
        [Cl.uint(1)],
        buyer
      );
      expect(tooEarly).toBeErr(Cl.uint(2008));

      // Mine past the 5-block timeout — should succeed
      simnet.mineEmptyBlocks(5);
      const { result: resolved } = simnet.callPublicFn(
        "escrow",
        "resolve-expired-dispute",
        [Cl.uint(1)],
        buyer
      );
      expect(resolved).toBeOk(Cl.bool(true));
    });
  });
});
