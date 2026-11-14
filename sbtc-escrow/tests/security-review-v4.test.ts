// Independent security review of contracts/escrow-mainnet-v4.clar
// (contracts/escrow-v9.clar is byte-identical; run with ESCROW_CONTRACT=escrow-v9).
//
// Round 2: re-review after the author's fixes for F1, F2 and F3.
//
// Every test in this file PASSES when the behaviour it names is present.
//   F*  REGRESSION = a round-1 finding, now asserting the FIXED behaviour
//   F1b RESIDUAL   = accepted residual behaviour, documented
//   N*             = findings in the fixes themselves (proof-of-concept)
//   HELD-F*        = attacks on the fixes that held
//   INFO*          = informational observations (not bugs)
//   HELD*          = properties attacked and held (round 1, adjusted for the fixes)
//
// Clock facts relied on (probed in this simnet):
//   - simnet.callPublicFn / simnet.mineBlock advance the Stacks height only;
//     burn-block-height is unchanged, so several calls share one burn block,
//     like many Nakamoto Stacks blocks inside one Bitcoin block.
//   - simnet.mineEmptyBlocks(n) advances burn-block-height by exactly n.
//   - simnet.mineBlock([...]) executes the txs in order inside one block, which
//     models a miner ordering two parties' transactions in the same block.
//
// Run: npx vitest run tests/security-review-v4.test.ts

import { tx } from "@stacks/clarinet-sdk";
import { Cl, ClarityType, ClarityValue } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!; // owner + default fee-recipient
const buyer = accounts.get("wallet_1")!;
const seller = accounts.get("wallet_2")!;
const stranger = accounts.get("wallet_3")!;
const beneficiary = accounts.get("wallet_5")!;
const newOwner = accounts.get("wallet_6")!;
const feeSink = accounts.get("wallet_7")!;

const V4 = process.env.ESCROW_CONTRACT ?? "escrow-mainnet-v4";
const V3 = "escrow-mainnet-v3"; // live predecessor, used only for comparisons
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const contractPrincipal = (c: string) => `${deployer}.${c}`;

const STX = 0;
const SBTC_T = 1;
const PENDING = 0;
const RELEASED = 1;
const REFUNDED = 2;
const DISPUTED = 3;
const DELIVERED = 4;

const ERR = {
  UNAUTHORIZED: 1001,
  PAUSED: 1002,
  OWNERSHIP_PENDING: 1003,
  NOT_PENDING_OWNER: 1004,
  ALREADY_COMPLETED: 2002,
  EXPIRED: 2003,
  SELF_ESCROW: 2007,
  NOT_TIMED_OUT: 2008,
  NOT_DISPUTED: 2009,
  INVALID_EXTENSION: 2010,
  INVALID_TIMEOUT: 2011,
  INVALID_STATUS: 2015,
  NOT_DELIVERED: 2016,
  SWEEP_EXCEEDS_FREE: 4002,
  PAUSE_COOLDOWN: 4003,
};

const T_DEFAULT = 4320; // DEFAULT_DISPUTE_TIMEOUT
const T_MIN = 24; // MIN_DISPUTE_TIMEOUT
const T_MAX = 8640; // MAX_DISPUTE_TIMEOUT
const REVIEW = 24; // REVIEW_PERIOD
const MAX_DURATION = 52560;
const MAX_PAUSE = 4320;
const BPS = 10000;

// ─────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────

function call(fn: string, args: ClarityValue[], sender: string, contract = V4): ClarityValue {
  return simnet.callPublicFn(contract, fn, args, sender).result;
}

function ro(fn: string, args: ClarityValue[], contract = V4): ClarityValue {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
}

const id = (n: number) => [Cl.uint(n)];
const ok = Cl.bool(true);
const err = (code: number) => Cl.uint(code);
const isErr = (v: ClarityValue) => v.type === ClarityType.ResponseErr;

/** Mine empty burn blocks until burn-block-height == h (the next call runs at h). */
function toBurn(h: number) {
  const now = simnet.burnBlockHeight;
  if (h < now) throw new Error(`toBurn(${h}) is in the past (now ${now})`);
  if (h > now) simnet.mineEmptyBlocks(h - now);
  expect(simnet.burnBlockHeight).toBe(h);
}

/** Execute txs in order inside ONE Stacks block (same burn height). */
function sameBlock(...txs: any[]): ClarityValue[] {
  const before = simnet.burnBlockHeight;
  const res = simnet.mineBlock(txs);
  expect(simnet.burnBlockHeight).toBe(before);
  return res.map((r: any) => {
    if (r.status === "rejected") throw new Error(`tx rejected: ${r.error}`);
    return r.execution.result;
  });
}

function pause(duration: number, contract = V4) {
  expect(call("pause-contract", [Cl.uint(duration)], deployer, contract)).toBeOk(ok);
}

/** The recorded pause window [start, end) from get-pause-window. */
function pauseWindow(contract = V4) {
  const r: any = ro("get-pause-window", [], contract);
  return { start: Number(r.value.start.value), end: Number(r.value.end.value) };
}

function getEscrow(escrowId: number, contract = V4): any {
  const r: any = ro("get-escrow", id(escrowId), contract);
  if (r.type !== ClarityType.OptionalSome) return null;
  const t = r.value.value;
  const optNum = (k: string) => (t[k].type === ClarityType.OptionalSome ? Number(t[k].value.value) : null);
  return {
    amount: Number(t.amount.value),
    feeAmount: Number(t["fee-amount"].value),
    feeRecipient: t["fee-recipient"].value,
    tokenType: Number(t["token-type"].value),
    status: Number(t.status.value),
    createdAt: Number(t["created-at"].value),
    expiresAt: Number(t["expires-at"].value),
    deliveredAt: optNum("delivered-at"),
    disputedAt: optNum("disputed-at"),
    disputeTimeout: t["dispute-timeout"] ? Number(t["dispute-timeout"].value) : null,
  };
}

type Made = { id: number; amount: number; fee: number; createdAt: number; expiresAt: number; token: number };

function create(o: {
  contract?: string;
  amount?: number;
  duration?: number;
  token?: number;
  ben?: string | null;
  from?: string;
  to?: string;
} = {}): Made {
  const contract = o.contract ?? V4;
  const token = o.token ?? STX;
  const amount = o.amount ?? 1_000_000;
  const duration = o.duration ?? 100;
  const r = simnet.callPublicFn(
    contract,
    "create-escrow",
    [
      Cl.principal(o.to ?? seller),
      Cl.uint(amount),
      Cl.stringUtf8("security review"),
      Cl.uint(duration),
      Cl.uint(token),
      o.ben ? Cl.some(Cl.principal(o.ben)) : Cl.none(),
    ],
    o.from ?? buyer,
  );
  if (r.result.type !== ClarityType.ResponseOk) {
    throw new Error(`create-escrow failed: ${Cl.prettyPrint(r.result)}`);
  }
  const escrowId = Number((r.result as any).value.value);
  const e = getEscrow(escrowId, contract);
  return { id: escrowId, amount, fee: e.feeAmount, createdAt: e.createdAt, expiresAt: e.expiresAt, token };
}

function stxBal(p: string): number {
  return Number(simnet.getAssetsMap().get("STX")?.get(p) ?? 0n);
}

function sbtcBal(p: string): number {
  const r: any = simnet.callReadOnlyFn(SBTC, "get-balance", [Cl.principal(p)], deployer).result;
  return Number(r.value.value);
}

const bal = (token: number, p: string) => (token === STX ? stxBal(p) : sbtcBal(p));

function donate(token: number, amount: number, to: string) {
  if (token === STX) {
    simnet.transferSTX(amount, to, stranger);
  } else {
    const r = simnet.callPublicFn(
      SBTC,
      "transfer",
      [Cl.uint(amount), Cl.principal(stranger), Cl.principal(to), Cl.none()],
      stranger,
    ).result;
    expect(r).toBeOk(ok);
  }
}

function locked(token: number, contract = V4): number {
  const r: any = ro("get-platform-stats", [], contract);
  return Number(r.value[token === STX ? "total-locked-stx" : "total-locked-sbtc"].value);
}

function sumLive(token: number, contract = V4): number {
  const n = Number((ro("get-escrow-count", [], contract) as any).value);
  let s = 0;
  for (let i = 1; i <= n; i++) {
    const e = getEscrow(i, contract);
    if (!e || e.tokenType !== token) continue;
    if (e.status === PENDING || e.status === DELIVERED || e.status === DISPUTED) s += e.amount + e.feeAmount;
  }
  return s;
}

// ═════════════════════════════════════════════════════════════════════
// F1 [Medium, FIXED] seller lock-out without a delivery claim
// ═════════════════════════════════════════════════════════════════════

describe("F1 [Medium, FIXED] a seller who has not marked delivery can no longer freeze the buyer's refund", () => {
  it("F1a REGRESSION: a seller without a delivery claim cannot dispute at creation or at expires-at (u2016) and the buyer refunds at E+1; v3 is still exposed", () => {
    const v4e = create({ contract: V4, duration: 10 });
    const v3e = create({ contract: V3, duration: 10 });
    const E = v4e.expiresAt;
    expect(v3e.expiresAt).toBe(E);

    expect(call("dispute", id(v4e.id), seller, V4)).toBeErr(err(ERR.NOT_DELIVERED));
    toBurn(E);
    expect(call("dispute", id(v4e.id), seller, V4)).toBeErr(err(ERR.NOT_DELIVERED));
    expect(getEscrow(v4e.id).status).toBe(PENDING);
    expect(call("dispute", id(v3e.id), seller, V3)).toBeOk(ok); // v3 unchanged

    toBurn(E + 1);
    const b0 = stxBal(buyer);
    expect(call("refund", id(v4e.id), buyer, V4)).toBeOk(ok);
    expect(stxBal(buyer) - b0).toBe(v4e.amount + v4e.fee);
    expect(call("refund", id(v3e.id), buyer, V3)).toBeErr(err(ERR.ALREADY_COMPLETED));
  });

  it("F1 REGRESSION (authority matrix): buyer and beneficiary may still dispute an undelivered escrow before expiry; the seller only after marking delivery; after expiry nobody may dispute an undelivered escrow (expiry check runs first: u2003)", () => {
    const a = create({ duration: 10, ben: beneficiary });
    const b = create({ duration: 10, ben: beneficiary });
    const c = create({ duration: 10, ben: beneficiary });
    const d = create({ duration: 10, ben: beneficiary });

    expect(call("dispute", id(a.id), buyer)).toBeOk(ok);
    expect(call("dispute", id(b.id), beneficiary)).toBeOk(ok);
    expect(call("dispute", id(c.id), stranger)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("dispute", id(c.id), seller)).toBeErr(err(ERR.NOT_DELIVERED));
    expect(call("deliver", id(c.id), seller)).toBeOk(ok);
    expect(call("dispute", id(c.id), seller)).toBeOk(ok);

    toBurn(d.expiresAt + 1);
    for (const who of [buyer, beneficiary, seller]) {
      expect(call("dispute", id(d.id), who)).toBeErr(err(ERR.EXPIRED));
    }
  });

  it("F1b RESIDUAL (accepted by design): a seller who flags deliver() at creation and never performs can still front-run the buyer's refund with dispute() once the refund opens, and can take the payment at 2T+1 via seller self-rescue", () => {
    const T = T_DEFAULT;
    const e = create({ duration: 100 });
    // Seller flags delivery in the creation block. Nothing is actually delivered.
    expect(call("deliver", id(e.id), seller)).toBeOk(ok);

    // Expiry passed and the review window (created-at + 24) is long over: refund is open...
    const E = e.expiresAt;
    toBurn(E + 1);
    // ...but the seller's dispute is ordered first in the same block (mempool front-run).
    const [d, r] = sameBlock(
      tx.callPublicFn(V4, "dispute", id(e.id), seller),
      tx.callPublicFn(V4, "refund", id(e.id), buyer),
    );
    expect(d).toBeOk(ok);
    expect(r).toBeErr(err(ERR.ALREADY_COMPLETED));
    const X = E + 1; // disputed-at

    // The buyer is frozen until X+T+1. If they miss (X+T, X+2T], the seller claims.
    toBurn(X + 2 * T);
    expect(call("resolve-expired-dispute-for-seller", id(e.id), seller)).toBeErr(err(ERR.NOT_TIMED_OUT));
    toBurn(X + 2 * T + 1);
    const before = stxBal(seller);
    expect(call("resolve-expired-dispute-for-seller", id(e.id), seller)).toBeOk(ok);
    expect(stxBal(seller) - before).toBe(e.amount);
    expect(getEscrow(e.id).status).toBe(RELEASED);
  });
});

// ═════════════════════════════════════════════════════════════════════
// F2 [Medium, FIXED] deadlines inside a pause are pushed out by its length
// ═════════════════════════════════════════════════════════════════════

describe("F2 [Medium, FIXED] a pause now delays deadlines instead of letting them pass", () => {
  it("F2a REGRESSION: a pause over expires-at pushes the deadline by the pause length; the seller can still deliver after it lifts and the buyer's refund opens exactly one block after the pushed deadline", () => {
    const a = create({ duration: 100 }); // seller delivers late in the pushed window
    const b = create({ duration: 100 }); // buyer waits for refund
    const c = create({ duration: 100 }); // buyer extends after the pause
    const E = a.expiresAt;

    toBurn(E - 10);
    pause(20); // window [E-10, E+10): E is pushed to E+20
    toBurn(E - 5);
    expect(call("deliver", id(a.id), seller)).toBeErr(err(ERR.PAUSED));

    toBurn(E + 10); // pause lifted
    expect(ro("is-paused", [])).toBeBool(false);
    expect(ro("is-expired", id(b.id))).toBeBool(false);
    expect(call("refund", id(b.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));

    toBurn(E + 20); // last block of the pushed deadline
    expect(call("deliver", id(a.id), seller)).toBeOk(ok);
    expect(call("extend-escrow", [Cl.uint(c.id), Cl.uint(1)], buyer)).toBeOk(ok);
    expect(getEscrow(c.id).expiresAt).toBe(E + 21); // built on the pushed deadline
    expect(call("refund", id(b.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));

    toBurn(E + 21);
    expect(ro("is-expired", id(b.id))).toBeBool(true);
    expect(call("deliver", id(b.id), seller)).toBeErr(err(ERR.EXPIRED));
    const b0 = stxBal(buyer);
    expect(call("refund", id(b.id), buyer)).toBeOk(ok);
    expect(stxBal(buyer) - b0).toBe(b.amount + b.fee);
  });

  it("F2a REGRESSION (scale): one max-length emergency pause gives every pending escrow expiring inside it its remaining time back; an escrow expiring on the first operational block is not pushed", () => {
    const C = simnet.burnBlockHeight;
    const P = C + 40;
    const durations = [50, 2000, 4300, 40 + MAX_PAUSE - 1];
    const forSeller = durations.map((duration) => create({ duration }));
    const forBuyer = durations.map((duration) => create({ duration }));
    const atEnd = create({ duration: 40 + MAX_PAUSE }); // deadline == window end
    const atEndTwin = create({ duration: 40 + MAX_PAUSE });

    toBurn(P);
    pause(MAX_PAUSE);
    toBurn(P + MAX_PAUSE); // first operational block
    expect(call("deliver", id(atEnd.id), seller)).toBeOk(ok);
    toBurn(P + MAX_PAUSE + 1);
    expect(call("refund", id(atEndTwin.id), buyer)).toBeOk(ok);

    for (let i = 0; i < durations.length; i++) {
      const pushed = forSeller[i].expiresAt + MAX_PAUSE;
      toBurn(pushed);
      expect(call("deliver", id(forSeller[i].id), seller)).toBeOk(ok);
      expect(call("refund", id(forBuyer[i].id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
      toBurn(pushed + 1);
      expect(call("refund", id(forBuyer[i].id), buyer)).toBeOk(ok);
    }
  });

  it("F2b REGRESSION: a pause that swallows the post-delivery review window pushes the review deadline too; the on-time seller gets its exclusive dispute window back (no same-block race) and the buyer's refund opens only after it", () => {
    const a = create({ duration: 100 });
    const b = create({ duration: 100 });
    const E = a.expiresAt;

    toBurn(E - 2);
    for (const e of [a, b]) expect(call("deliver", id(e.id), seller)).toBeOk(ok); // review to E+22
    toBurn(E - 1);
    pause(100); // window [E-1, E+99): expiry -> E+100, review -> E+122

    toBurn(E + 99); // first operational block
    expect(ro("is-in-review-period", id(a.id))).toBeBool(true);
    const [refA, dispA] = sameBlock(
      tx.callPublicFn(V4, "refund", id(a.id), buyer),
      tx.callPublicFn(V4, "dispute", id(a.id), seller),
    );
    expect(refA).toBeErr(err(ERR.UNAUTHORIZED)); // refund not open: no race
    expect(dispA).toBeOk(ok);

    toBurn(E + 122); // last block of the pushed review window (24 blocks, as before the pause)
    expect(ro("is-in-review-period", id(b.id))).toBeBool(true);
    expect(call("refund", id(b.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    toBurn(E + 123);
    expect(ro("is-in-review-period", id(b.id))).toBeBool(false);
    expect(call("refund", id(b.id), buyer)).toBeOk(ok);
  });
});

describe("HELD-F2 attacks on the pause-adjusted deadlines", () => {
  it("HELD-F2a: a pause cannot revive an escrow whose deadline passed before the pause began", () => {
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    const E = a.expiresAt;
    toBurn(E + 1);
    pause(MAX_PAUSE); // window starts one block after E
    toBurn(E + 1 + MAX_PAUSE);
    expect(ro("is-expired", id(a.id))).toBeBool(true);
    expect(call("deliver", id(a.id), seller)).toBeErr(err(ERR.EXPIRED));
    expect(call("dispute", id(a.id), buyer)).toBeErr(err(ERR.EXPIRED));
    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(10)], buyer)).toBeErr(err(ERR.EXPIRED));
    expect(call("refund", id(b.id), buyer)).toBeOk(ok);
  });

  it("HELD-F2b: a pause landing inside the deadline block E: a deliver ordered before it succeeds, one after it fails with u1002, and the deadline moves to E+d so the late seller gets one full block after the pause; buyer refunds at E+d+1", () => {
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    const c = create({ duration: 10 });
    const E = a.expiresAt;
    const d = 30;
    toBurn(E);
    const [d1, pz, d2] = sameBlock(
      tx.callPublicFn(V4, "deliver", id(a.id), seller),
      tx.callPublicFn(V4, "pause-contract", [Cl.uint(d)], deployer),
      tx.callPublicFn(V4, "deliver", id(b.id), seller),
    );
    expect(d1).toBeOk(ok);
    expect(pz).toBeOk(ok);
    expect(d2).toBeErr(err(ERR.PAUSED));

    toBurn(E + d); // first operational block == pushed deadline
    expect(call("refund", id(c.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("deliver", id(b.id), seller)).toBeOk(ok);
    toBurn(E + d + 1);
    expect(call("refund", id(c.id), buyer)).toBeOk(ok);
  });

  it("HELD-F2c: unpause with no pause ever recorded is a no-op on the window and moves no deadline", () => {
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    expect(call("unpause-contract", [], deployer)).toBeOk(ok);
    expect(pauseWindow()).toEqual({ start: 0, end: 0 });
    toBurn(a.expiresAt);
    expect(call("deliver", id(a.id), seller)).toBeOk(ok);
    toBurn(a.expiresAt + 1);
    expect(call("refund", id(b.id), buyer)).toBeOk(ok);
  });

  it("HELD-F2d: unpause after the pause auto-lifted does not trim the window; the pushed deadline stays pushed", () => {
    const a = create({ duration: 20 });
    const b = create({ duration: 20 });
    const E = a.expiresAt;
    const d = 10;
    const P = E - 5;
    toBurn(P);
    pause(d); // window [E-5, E+5): E pushed to E+10
    toBurn(E + 7); // auto-lifted at E+5
    expect(call("unpause-contract", [], deployer)).toBeOk(ok);
    expect(pauseWindow()).toEqual({ start: P, end: P + d });
    toBurn(E + d);
    expect(call("deliver", id(a.id), seller)).toBeOk(ok);
    expect(call("refund", id(b.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    toBurn(E + d + 1);
    expect(call("refund", id(b.id), buyer)).toBeOk(ok);
  });

  it("HELD-F2e: pause and unpause in the same burn block record an empty window; a deadline in that block is not pushed, and only a seller who acts after the unpause in that block keeps the right", () => {
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    const c = create({ duration: 10 });
    const E = a.expiresAt;
    toBurn(E);
    const [p, dlB, u, dlA] = sameBlock(
      tx.callPublicFn(V4, "pause-contract", [Cl.uint(100)], deployer),
      tx.callPublicFn(V4, "deliver", id(b.id), seller),
      tx.callPublicFn(V4, "unpause-contract", [], deployer),
      tx.callPublicFn(V4, "deliver", id(a.id), seller),
    );
    expect(p).toBeOk(ok);
    expect(dlB).toBeErr(err(ERR.PAUSED));
    expect(u).toBeOk(ok);
    expect(dlA).toBeOk(ok);
    expect(pauseWindow()).toEqual({ start: E, end: E });
    toBurn(E + 1);
    expect(call("deliver", id(b.id), seller)).toBeErr(err(ERR.EXPIRED));
    expect(call("refund", id(c.id), buyer)).toBeOk(ok);
  });

  it("HELD-F2f: an early unpause pushes deadlines inside the trimmed window by exactly the blocks paused (U-P) and makes nothing expire at the unpause block", () => {
    const a = create({ duration: 100 });
    const b = create({ duration: 100 });
    const c = create({ duration: 100 });
    const E = a.expiresAt;
    const P = E - 10;
    const U = E + 5;
    toBurn(P);
    pause(100); // planned [E-10, E+90)
    toBurn(U);
    expect(call("unpause-contract", [], deployer)).toBeOk(ok); // actual [E-10, E+5): push 15
    expect(pauseWindow()).toEqual({ start: P, end: U });
    expect(ro("is-expired", id(a.id))).toBeBool(false);

    toBurn(E + (U - P)); // pushed deadline E+15
    expect(call("deliver", id(a.id), seller)).toBeOk(ok);
    expect(call("refund", id(b.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    toBurn(E + (U - P) + 1);
    expect(call("deliver", id(c.id), seller)).toBeErr(err(ERR.EXPIRED));
    expect(call("refund", id(b.id), buyer)).toBeOk(ok);
  });

  it("HELD-F2g: extend-escrow after a pause builds on the pushed deadline, stays capped at MAX_DURATION from now (exact cap ok, +1 rejected) and does not underflow on the last effective block", () => {
    const a = create({ duration: 100 });
    const b = create({ duration: 100 });
    const E = a.expiresAt;
    const d = 50;
    toBurn(E - 10);
    pause(d); // window [E-10, E+40): E pushed to E+50

    toBurn(E + 40); // first operational block, 10 blocks left
    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(MAX_DURATION - 10 + 1)], buyer)).toBeErr(err(ERR.INVALID_EXTENSION));
    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(MAX_DURATION - 10)], buyer)).toBeOk(ok);
    expect(getEscrow(a.id).expiresAt).toBe(E + d + MAX_DURATION - 10);

    toBurn(E + d); // b's last effective block, 0 blocks left
    expect(call("extend-escrow", [Cl.uint(b.id), Cl.uint(MAX_DURATION + 1)], buyer)).toBeErr(err(ERR.INVALID_EXTENSION));
    expect(call("extend-escrow", [Cl.uint(b.id), Cl.uint(MAX_DURATION)], buyer)).toBeOk(ok);
    expect(getEscrow(b.id).expiresAt).toBe(E + d + MAX_DURATION);
  });
});

// ═════════════════════════════════════════════════════════════════════
// N1 [Low] new in the F2 fix: pushed deadlines end where the cooldown ends
// ═════════════════════════════════════════════════════════════════════

describe("N1 [Low] a pushed deadline can end exactly at pause-cooldown-until, so a second pause can follow before the buyer may refund", () => {
  it("N1 PoC: deadline in the last block of a max pause is pushed to cooldown-1; the owner re-pauses in the very block the refund opens (ordered first) and holds it until E+2*MAX_PAUSE+1, where v3 under the same first pause refunded at E+1; the second pause does not push the deadline again", () => {
    const d = MAX_PAUSE;
    const a = create({ contract: V4, duration: d + 10 });
    const v3e = create({ contract: V3, duration: d + 10 });
    const E = a.expiresAt;
    const P1 = E - (d - 1); // E is the LAST block of [P1, P1+d)
    toBurn(P1);
    pause(d, V4);
    pause(d, V3);

    // v3: refund right after the pause lifts, with d blocks before any re-pause.
    toBurn(E + 1);
    expect(call("refund", id(v3e.id), buyer, V3)).toBeOk(ok);

    // v4: E pushed to E+d; the refund opens at E+d+1 == pause-cooldown-until.
    toBurn(E + d);
    expect(call("refund", id(a.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    const cfg: any = ro("get-config", []);
    expect(Number(cfg.value["pause-cooldown-until"].value)).toBe(E + d + 1);

    toBurn(E + d + 1);
    const [pz, rf] = sameBlock(
      tx.callPublicFn(V4, "pause-contract", [Cl.uint(d)], deployer),
      tx.callPublicFn(V4, "refund", id(a.id), buyer),
    );
    expect(pz).toBeOk(ok);
    expect(rf).toBeErr(err(ERR.PAUSED));
    expect(ro("is-expired", id(a.id))).toBeBool(true); // single window: no second push

    toBurn(E + 2 * d);
    expect(call("refund", id(a.id), buyer)).toBeErr(err(ERR.PAUSED));
    toBurn(E + 2 * d + 1);
    expect(call("refund", id(a.id), buyer)).toBeOk(ok);
  });
});

// ═════════════════════════════════════════════════════════════════════
// N2 [Low] residual of the F2 fix: compensation stops at the actual end
// ═════════════════════════════════════════════════════════════════════

describe("N2 [Low] only deadlines inside the window actually paused are pushed; an early unpause can retract a displayed push", () => {
  it("N2 PoC: during a max pause the recorded window covers the seller's deadline (it reads as pushed by MAX_PAUSE); the owner unpauses in exactly that deadline block, the window is trimmed, the push disappears and the seller keeps only the rest of that burn block", () => {
    const inside = create({ duration: 200 });
    const target = create({ duration: 250 });
    const twin = create({ duration: 250 });
    const E1 = inside.expiresAt;
    const E2 = target.expiresAt;
    const P = E1 - 10;

    toBurn(P);
    pause(MAX_PAUSE);
    expect(pauseWindow()).toEqual({ start: P, end: P + MAX_PAUSE }); // E2 inside: shown as E2+4320

    toBurn(E2);
    expect(call("deliver", id(target.id), seller)).toBeErr(err(ERR.PAUSED));
    const [u, late] = sameBlock(
      tx.callPublicFn(V4, "unpause-contract", [], deployer),
      tx.callPublicFn(V4, "deliver", id(target.id), seller), // only a seller reacting in this burn block
    );
    expect(u).toBeOk(ok);
    expect(late).toBeOk(ok);
    expect(pauseWindow()).toEqual({ start: P, end: E2 }); // E2 no longer inside

    toBurn(E2 + 1);
    expect(call("deliver", id(twin.id), seller)).toBeErr(err(ERR.EXPIRED));
    expect(call("refund", id(twin.id), buyer)).toBeOk(ok);
    expect(call("deliver", id(inside.id), seller)).toBeOk(ok); // E1 inside: pushed by E2-P
  });
});

// ═════════════════════════════════════════════════════════════════════
// F3 [Low, FIXED] the contract cannot be its own fee recipient or a seller
// ═════════════════════════════════════════════════════════════════════

describe("F3 [Low, FIXED] contract as fee-recipient or seller is rejected", () => {
  it("F3 REGRESSION: set-fee-recipient rejects the contract (u1001), create-escrow rejects it as seller (u2007) for STX and sBTC, and any other principal (even another contract) still receives fees normally", () => {
    const self = contractPrincipal(V4);
    expect(call("set-fee-recipient", [Cl.principal(self)], deployer)).toBeErr(err(ERR.UNAUTHORIZED));
    for (const token of [STX, SBTC_T]) {
      const r = simnet.callPublicFn(
        V4,
        "create-escrow",
        [Cl.principal(self), Cl.uint(1_000_000), Cl.stringUtf8("x"), Cl.uint(10), Cl.uint(token), Cl.none()],
        buyer,
      ).result;
      expect(r).toBeErr(err(ERR.SELF_ESCROW));
    }

    const otherContract = contractPrincipal(V3);
    expect(call("set-fee-recipient", [Cl.principal(otherContract)], deployer)).toBeOk(ok);
    const e = create();
    expect(getEscrow(e.id).feeRecipient).toBe(otherContract);
    const s0 = stxBal(seller);
    const f0 = stxBal(otherContract);
    expect(call("release", id(e.id), buyer)).toBeOk(ok);
    expect(stxBal(seller) - s0).toBe(e.amount);
    expect(stxBal(otherContract) - f0).toBe(e.fee);
  });
});

// ═════════════════════════════════════════════════════════════════════
// INFO — observations that are not bugs but matter for users / frontends
// ═════════════════════════════════════════════════════════════════════

describe("INFO observations", () => {
  it("INFO-1: an on-time seller loses to the buyer's 1x self-rescue whenever the admin is idle for T, whether the seller disputed protectively or the buyer front-ran deliver() with dispute() (which also closes the seller's 2x path)", () => {
    const T = T_DEFAULT;
    // (a) seller delivered, buyer stalls, seller disputes at E to stop a refund
    const a = create({ duration: 100 });
    expect(call("deliver", id(a.id), seller)).toBeOk(ok);
    // (b) buyer front-runs the seller's deliver() with dispute() in the same block
    const b = create({ duration: 100 });
    const [bd, bdel] = sameBlock(
      tx.callPublicFn(V4, "dispute", id(b.id), buyer),
      tx.callPublicFn(V4, "deliver", id(b.id), seller),
    );
    expect(bd).toBeOk(ok);
    expect(bdel).toBeErr(err(ERR.INVALID_STATUS));
    const Xb = simnet.burnBlockHeight;

    const E = a.expiresAt;
    toBurn(E);
    expect(call("dispute", id(a.id), seller)).toBeOk(ok);
    const Xa = E;

    toBurn(Xb + T + 1);
    expect(call("resolve-expired-dispute", id(b.id), buyer)).toBeOk(ok); // buyer wins b
    expect(call("resolve-expired-dispute-for-seller", id(b.id), seller).type).toBe(ClarityType.ResponseErr);
    toBurn(Xa + T + 1);
    expect(call("resolve-expired-dispute", id(a.id), buyer)).toBeOk(ok); // buyer wins a
    expect(getEscrow(a.id).status).toBe(REFUNDED);
  });

  it("INFO-2: beneficiary is fully buyer-equivalent: it can push the buyer's refund out by up to MAX_DURATION per extend, and release to the seller after expiry on an undelivered escrow; a refund it triggers pays the buyer, never the beneficiary", () => {
    const a = create({ duration: 10, ben: beneficiary });
    const b = create({ duration: 10, ben: beneficiary });
    const c = create({ duration: 10, ben: beneficiary });
    const E = a.expiresAt;

    toBurn(E);
    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(MAX_DURATION)], beneficiary)).toBeOk(ok);
    toBurn(E + 1);
    expect(call("refund", id(a.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED)); // next chance: E+52561

    const s0 = stxBal(seller);
    expect(call("release", id(b.id), beneficiary)).toBeOk(ok); // expired, never delivered
    expect(stxBal(seller) - s0).toBe(b.amount);

    const b0 = stxBal(buyer);
    const ben0 = stxBal(beneficiary);
    expect(call("refund", id(c.id), beneficiary)).toBeOk(ok);
    expect(stxBal(buyer) - b0).toBe(c.amount + c.fee);
    expect(stxBal(beneficiary)).toBe(ben0);
  });

  it("INFO-3: once DISPUTED neither party can concede (buyer cannot release, seller cannot refund); only the owner or the timeouts end it", () => {
    const e = create();
    expect(call("deliver", id(e.id), seller)).toBeOk(ok); // F1 fix: seller disputes need a delivery claim
    expect(call("dispute", id(e.id), seller)).toBeOk(ok);
    expect(call("release", id(e.id), buyer)).toBeErr(err(ERR.ALREADY_COMPLETED));
    expect(call("refund", id(e.id), seller)).toBeErr(err(ERR.ALREADY_COMPLETED));
  });

  it("INFO-4: read-only is-dispute-timed-out / is-in-review-period / is-expired ignore status and keep reporting true after the escrow is settled; get-contract-balance always reports free-sbtc u0", () => {
    expect(call("set-dispute-timeout", [Cl.uint(T_MIN)], deployer)).toBeOk(ok);
    const a = create({ duration: 10 });
    expect(call("dispute", id(a.id), buyer)).toBeOk(ok);
    expect(call("resolve-dispute-for-buyer", id(a.id), deployer)).toBeOk(ok);
    const b = create({ duration: 10 });
    expect(call("deliver", id(b.id), seller)).toBeOk(ok);
    expect(call("release", id(b.id), buyer)).toBeOk(ok);
    expect(ro("is-in-review-period", id(b.id))).toBeBool(true); // RELEASED, still "in review"

    toBurn(a.createdAt + T_MIN + 1);
    expect(getEscrow(a.id).status).toBe(REFUNDED);
    expect(ro("is-dispute-timed-out", id(a.id))).toBeBool(true); // settled, still "timed out"
    expect(ro("is-expired", id(b.id))).toBeBool(true); // RELEASED, still "expired"

    donate(SBTC_T, 12_345, contractPrincipal(V4));
    const cb: any = ro("get-contract-balance", []);
    expect(Number(cb.value["free-sbtc"].value)).toBe(0);
    expect(sbtcBal(contractPrincipal(V4)) - locked(SBTC_T)).toBe(12_345);
  });

  it("INFO-5 (carried over, doc 8.4 not fixed): after the snapshot timeout the owner can still pre-empt the buyer's self-rescue in the same block and pay the seller of a never-delivered escrow", () => {
    expect(call("set-dispute-timeout", [Cl.uint(T_MIN)], deployer)).toBeOk(ok);
    const e = create({ duration: 10 });
    expect(call("dispute", id(e.id), buyer)).toBeOk(ok);
    toBurn(simnet.burnBlockHeight + T_MIN + 1);
    expect(ro("is-dispute-timed-out", id(e.id))).toBeBool(true);
    const [adminRes, buyerRescue] = sameBlock(
      tx.callPublicFn(V4, "resolve-dispute-for-seller", id(e.id), deployer),
      tx.callPublicFn(V4, "resolve-expired-dispute", id(e.id), buyer),
    );
    expect(adminRes).toBeOk(ok);
    expect(buyerRescue).toBeErr(err(ERR.NOT_DISPUTED));
    expect(getEscrow(e.id).status).toBe(RELEASED);
  });
});

// ═════════════════════════════════════════════════════════════════════
// HELD — attacked and held
// ═════════════════════════════════════════════════════════════════════

describe("HELD boundary semantics (expired == burn-block-height > pause-adjusted expires-at)", () => {
  it("HELD-1: at expires-at deliver, buyer/beneficiary dispute, seller dispute after its delivery, release and extend succeed while buyer refund fails (and an undelivered seller dispute fails u2016); at expires-at+1 deliver/dispute/extend fail with ERR_ESCROW_EXPIRED and buyer refund succeeds: no gap, no overlap", () => {
    const atE = Array.from({ length: 7 }, () => create({ duration: 10, ben: beneficiary }));
    const atE1 = Array.from({ length: 7 }, () => create({ duration: 10, ben: beneficiary }));
    const E = atE[0].expiresAt;
    for (const e of [...atE, ...atE1]) expect(e.expiresAt).toBe(E);

    toBurn(E);
    expect(ro("is-expired", id(atE[0].id))).toBeBool(false);
    expect(call("deliver", id(atE[0].id), seller)).toBeOk(ok);
    expect(call("dispute", id(atE[0].id), seller)).toBeOk(ok); // after its own delivery
    expect(call("dispute", id(atE[1].id), seller)).toBeErr(err(ERR.NOT_DELIVERED)); // F1 fix
    expect(call("dispute", id(atE[2].id), buyer)).toBeOk(ok);
    expect(call("dispute", id(atE[3].id), beneficiary)).toBeOk(ok);
    expect(call("refund", id(atE[4].id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("release", id(atE[5].id), buyer)).toBeOk(ok);
    expect(call("extend-escrow", [Cl.uint(atE[6].id), Cl.uint(1)], buyer)).toBeOk(ok);

    toBurn(E + 1);
    expect(ro("is-expired", id(atE1[0].id))).toBeBool(true);
    expect(call("deliver", id(atE1[0].id), seller)).toBeErr(err(ERR.EXPIRED));
    expect(call("dispute", id(atE1[1].id), seller)).toBeErr(err(ERR.EXPIRED));
    expect(call("dispute", id(atE1[2].id), buyer)).toBeErr(err(ERR.EXPIRED));
    expect(call("dispute", id(atE1[3].id), beneficiary)).toBeErr(err(ERR.EXPIRED));
    expect(call("refund", id(atE1[4].id), buyer)).toBeOk(ok);
    expect(call("release", id(atE1[5].id), buyer)).toBeOk(ok);
    expect(call("extend-escrow", [Cl.uint(atE1[6].id), Cl.uint(1)], buyer)).toBeErr(err(ERR.EXPIRED));
    // the escrow whose refund failed at E refunds fine at E+1
    expect(call("refund", id(atE[4].id), buyer)).toBeOk(ok);
  });

  it("HELD-2: a delivery in the last block (E) keeps the buyer's refund closed through E+24 and opens it at E+25; the seller can dispute anywhere in [E, E+24]", () => {
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    const E = a.expiresAt;
    toBurn(E);
    expect(call("deliver", id(a.id), seller)).toBeOk(ok);
    expect(call("deliver", id(b.id), seller)).toBeOk(ok);
    toBurn(E + 1);
    expect(call("refund", id(a.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    toBurn(E + REVIEW);
    expect(call("refund", id(a.id), buyer)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("dispute", id(b.id), seller)).toBeOk(ok);
    toBurn(E + REVIEW + 1);
    expect(call("refund", id(a.id), buyer)).toBeOk(ok);
  });

  it("HELD-3: after expiry, on a never-delivered escrow, no call by seller, beneficiary or stranger can stop the buyer's refund (the v3 same-block front-run now fails)", () => {
    const e = create({ duration: 10, ben: beneficiary });
    toBurn(e.expiresAt + 1);
    for (const who of [seller, beneficiary, stranger]) {
      expect(isErr(call("deliver", id(e.id), who))).toBe(true);
      expect(isErr(call("dispute", id(e.id), who))).toBe(true);
      expect(isErr(call("extend-escrow", [Cl.uint(e.id), Cl.uint(100)], who))).toBe(true);
      expect(isErr(call("resolve-expired-dispute", id(e.id), who))).toBe(true);
      expect(isErr(call("resolve-expired-dispute-for-seller", id(e.id), who))).toBe(true);
    }
    expect(getEscrow(e.id).status).toBe(PENDING);
    const [d, r] = sameBlock(
      tx.callPublicFn(V4, "dispute", id(e.id), seller),
      tx.callPublicFn(V4, "refund", id(e.id), buyer),
    );
    expect(d).toBeErr(err(ERR.EXPIRED));
    expect(r).toBeOk(ok);
  });
});

describe("HELD extend-escrow", () => {
  it("HELD-4: extend is buyer/beneficiary-only, PENDING-only, allowed at E and rejected at E+1, capped at MAX_DURATION from now; it can lengthen the seller's on-time window but never reopen an expired one", () => {
    const a = create({ duration: 10, ben: beneficiary });
    const b = create({ duration: 10 });
    const c = create({ duration: 10 });
    const d = create({ duration: 10 });
    const E = a.expiresAt;

    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(5)], seller)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(5)], stranger)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("deliver", id(c.id), seller)).toBeOk(ok);
    expect(call("extend-escrow", [Cl.uint(c.id), Cl.uint(5)], buyer)).toBeErr(err(ERR.ALREADY_COMPLETED));
    expect(call("dispute", id(d.id), buyer)).toBeOk(ok);
    expect(call("extend-escrow", [Cl.uint(d.id), Cl.uint(5)], buyer)).toBeErr(err(ERR.ALREADY_COMPLETED));

    toBurn(E);
    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(MAX_DURATION + 1)], buyer)).toBeErr(err(ERR.INVALID_EXTENSION));
    expect(call("extend-escrow", [Cl.uint(a.id), Cl.uint(5)], beneficiary)).toBeOk(ok);
    expect(getEscrow(a.id).expiresAt).toBe(E + 5);

    toBurn(E + 1);
    expect(call("extend-escrow", [Cl.uint(b.id), Cl.uint(5)], buyer)).toBeErr(err(ERR.EXPIRED));
    expect(call("deliver", id(b.id), seller)).toBeErr(err(ERR.EXPIRED));
    expect(call("deliver", id(a.id), seller)).toBeOk(ok); // a was extended on time
  });
});

describe("HELD dispute-timeout snapshot", () => {
  it("HELD-5: snapshot T=8640 survives a later set to 24: buyer path opens exactly at disputed-at+8641, seller path exactly at disputed-at+17281; read-only helpers agree", () => {
    expect(call("set-dispute-timeout", [Cl.uint(T_MAX)], deployer)).toBeOk(ok);
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    for (const e of [a, b]) {
      expect(call("deliver", id(e.id), seller)).toBeOk(ok);
      expect(call("dispute", id(e.id), buyer)).toBeOk(ok);
    }
    const X = simnet.burnBlockHeight;
    expect(call("set-dispute-timeout", [Cl.uint(T_MIN)], deployer)).toBeOk(ok);
    expect(getEscrow(a.id).disputeTimeout).toBe(T_MAX);
    expect(Number((ro("get-config", []) as any).value["dispute-timeout"].value)).toBe(T_MIN);

    toBurn(X + T_MAX);
    expect(ro("is-dispute-timed-out", id(a.id))).toBeBool(false);
    expect(call("resolve-expired-dispute", id(a.id), buyer)).toBeErr(err(ERR.NOT_TIMED_OUT));
    toBurn(X + T_MAX + 1);
    expect(ro("is-dispute-timed-out", id(a.id))).toBeBool(true);
    expect(call("resolve-expired-dispute", id(a.id), buyer)).toBeOk(ok);
    expect(call("resolve-expired-dispute-for-seller", id(b.id), seller)).toBeErr(err(ERR.NOT_TIMED_OUT));

    toBurn(X + 2 * T_MAX);
    expect(ro("is-seller-rescue-eligible", id(b.id))).toBeBool(false);
    expect(call("resolve-expired-dispute-for-seller", id(b.id), seller)).toBeErr(err(ERR.NOT_TIMED_OUT));
    toBurn(X + 2 * T_MAX + 1);
    expect(ro("is-seller-rescue-eligible", id(b.id))).toBeBool(true);
    expect(call("resolve-expired-dispute-for-seller", id(b.id), seller)).toBeOk(ok);
  });

  it("HELD-6: snapshot T=24 (the floor) survives a later set to 8640: buyer path at disputed-at+25, seller path at disputed-at+49 (a buyer can unwind a delivered escrow ~4h after disputing if the owner is idle)", () => {
    expect(call("set-dispute-timeout", [Cl.uint(T_MIN)], deployer)).toBeOk(ok);
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    for (const e of [a, b]) {
      expect(call("deliver", id(e.id), seller)).toBeOk(ok);
      expect(call("dispute", id(e.id), buyer)).toBeOk(ok);
    }
    const X = simnet.burnBlockHeight;
    expect(call("set-dispute-timeout", [Cl.uint(T_MAX)], deployer)).toBeOk(ok);
    toBurn(X + T_MIN);
    expect(call("resolve-expired-dispute", id(a.id), buyer)).toBeErr(err(ERR.NOT_TIMED_OUT));
    toBurn(X + T_MIN + 1);
    expect(call("resolve-expired-dispute", id(a.id), buyer)).toBeOk(ok);
    toBurn(X + 2 * T_MIN);
    expect(call("resolve-expired-dispute-for-seller", id(b.id), seller)).toBeErr(err(ERR.NOT_TIMED_OUT));
    toBurn(X + 2 * T_MIN + 1);
    expect(call("resolve-expired-dispute-for-seller", id(b.id), seller)).toBeOk(ok);
  });

  it("HELD-7: set-dispute-timeout is owner-only and bounded to [24, 8640]", () => {
    expect(call("set-dispute-timeout", [Cl.uint(T_MIN - 1)], deployer)).toBeErr(err(ERR.INVALID_TIMEOUT));
    expect(call("set-dispute-timeout", [Cl.uint(T_MAX + 1)], deployer)).toBeErr(err(ERR.INVALID_TIMEOUT));
    expect(call("set-dispute-timeout", [Cl.uint(100)], stranger)).toBeErr(err(ERR.UNAUTHORIZED));
  });
});

describe("HELD pause bypass for disputes", () => {
  it("HELD-8: while paused, buyer self-rescue, seller self-rescue and owner resolution all still work", () => {
    expect(call("set-dispute-timeout", [Cl.uint(T_MIN)], deployer)).toBeOk(ok);
    const a = create({ duration: 10 });
    const b = create({ duration: 10 });
    const c = create({ duration: 10 });
    for (const e of [a, b]) expect(call("deliver", id(e.id), seller)).toBeOk(ok);
    for (const e of [a, b, c]) expect(call("dispute", id(e.id), buyer)).toBeOk(ok);
    const X = simnet.burnBlockHeight;
    toBurn(X + 1);
    expect(call("pause-contract", [Cl.uint(MAX_PAUSE)], deployer)).toBeOk(ok);
    toBurn(X + T_MIN + 1);
    expect(ro("is-paused", [])).toBeBool(true);
    expect(call("resolve-expired-dispute", id(a.id), buyer)).toBeOk(ok);
    toBurn(X + 2 * T_MIN + 1);
    expect(call("resolve-expired-dispute-for-seller", id(b.id), seller)).toBeOk(ok);
    expect(call("resolve-dispute-for-buyer", id(c.id), deployer)).toBeOk(ok);
  });
});

describe("HELD funds safety and accounting", () => {
  for (const token of [STX, SBTC_T]) {
    const name = token === STX ? "STX" : "sBTC";
    it(`HELD-9 (${name}): every exit path keeps total-locked == sum of live (amount+fee) and balance == locked + orphans; each payout conserves amount+fee; sweep takes exactly the orphans and not 1 unit more`, () => {
      const C = contractPrincipal(V4);
      expect(call("set-dispute-timeout", [Cl.uint(T_MIN)], deployer)).toBeOk(ok);
      const orphans = token === STX ? 777_777 : 55_555;
      donate(token, orphans, C);
      const amounts =
        token === STX
          ? [1_001, 99_999, 123_457, 1_000_003, 7_777, 55_555, 31_337, 500_001]
          : [10_001, 99_999, 123_457, 1_000_003, 17_777, 55_555, 31_337, 500_001];
      const es = amounts.map((amount) => create({ token, amount, duration: 10 }));
      // a live escrow of the OTHER token must be untouched throughout
      const other = create({ token: token === STX ? SBTC_T : STX, amount: 1_000_000, duration: 10 });

      const check = () => {
        for (const t of [STX, SBTC_T]) expect(locked(t)).toBe(sumLive(t));
        expect(bal(token, C)).toBe(locked(token) + orphans);
      };
      const exit = (e: Made, fn: () => void) => {
        const b0 = bal(token, buyer), s0 = bal(token, seller), f0 = bal(token, deployer), c0 = bal(token, C);
        fn();
        const db = bal(token, buyer) - b0, ds = bal(token, seller) - s0, df = bal(token, deployer) - f0;
        expect(db + ds + df).toBe(e.amount + e.fee);
        expect(c0 - bal(token, C)).toBe(e.amount + e.fee);
        check();
        return { db, ds, df };
      };
      check();

      // 1. release
      let d = exit(es[0], () => expect(call("release", id(es[0].id), buyer)).toBeOk(ok));
      expect([d.ds, d.df]).toEqual([es[0].amount, es[0].fee]);
      // 2. seller voluntary refund of a DELIVERED escrow
      expect(call("deliver", id(es[1].id), seller)).toBeOk(ok);
      d = exit(es[1], () => expect(call("refund", id(es[1].id), seller)).toBeOk(ok));
      expect(d.db).toBe(es[1].amount + es[1].fee);
      // 3. resolve-dispute-for-buyer
      expect(call("dispute", id(es[2].id), buyer)).toBeOk(ok);
      d = exit(es[2], () => expect(call("resolve-dispute-for-buyer", id(es[2].id), deployer)).toBeOk(ok));
      expect(d.db).toBe(es[2].amount + es[2].fee);
      // 4. resolve-dispute-for-seller (seller disputes after its delivery claim, per the F1 fix)
      expect(call("deliver", id(es[3].id), seller)).toBeOk(ok);
      expect(call("dispute", id(es[3].id), seller)).toBeOk(ok);
      d = exit(es[3], () => expect(call("resolve-dispute-for-seller", id(es[3].id), deployer)).toBeOk(ok));
      expect([d.ds, d.df]).toEqual([es[3].amount, es[3].fee]);
      // 5. split at an awkward ratio: rounding favours seller (principal) and fee-recipient (fee)
      const bps = 3333;
      expect(call("dispute", id(es[4].id), buyer)).toBeOk(ok);
      d = exit(es[4], () => expect(call("resolve-dispute-split", [Cl.uint(es[4].id), Cl.uint(bps)], deployer)).toBeOk(ok));
      const bp = Math.floor((es[4].amount * bps) / BPS), bf = Math.floor((es[4].fee * bps) / BPS);
      expect([d.db, d.ds, d.df]).toEqual([bp + bf, es[4].amount - bp, es[4].fee - bf]);
      // 6 + 7. expired-dispute paths (buyer 1x, seller 2x) on the snapshot timeout
      for (const e of [es[5], es[6]]) {
        expect(call("deliver", id(e.id), seller)).toBeOk(ok);
        expect(call("dispute", id(e.id), buyer)).toBeOk(ok);
      }
      const X = simnet.burnBlockHeight;
      toBurn(X + T_MIN + 1);
      d = exit(es[5], () => expect(call("resolve-expired-dispute", id(es[5].id), buyer)).toBeOk(ok));
      expect(d.db).toBe(es[5].amount + es[5].fee);
      toBurn(X + 2 * T_MIN + 1);
      d = exit(es[6], () => expect(call("resolve-expired-dispute-for-seller", id(es[6].id), seller)).toBeOk(ok));
      expect([d.ds, d.df]).toEqual([es[6].amount, es[6].fee]);
      // 8. buyer refund after expiry
      d = exit(es[7], () => expect(call("refund", id(es[7].id), buyer)).toBeOk(ok));
      expect(d.db).toBe(es[7].amount + es[7].fee);

      expect(locked(token)).toBe(0);
      expect(locked(token === STX ? SBTC_T : STX)).toBe(other.amount + other.fee);

      // sweep: exactly the orphans, never one unit of principal
      expect(call("sweep-orphans", [Cl.uint(token), Cl.uint(orphans + 1)], deployer)).toBeErr(err(ERR.SWEEP_EXCEEDS_FREE));
      expect(call("sweep-orphans", [Cl.uint(token), Cl.uint(orphans)], stranger)).toBeErr(err(ERR.UNAUTHORIZED));
      const f0 = bal(token, deployer);
      expect(call("sweep-orphans", [Cl.uint(token), Cl.uint(orphans)], deployer)).toBeOk(ok);
      expect(bal(token, deployer) - f0).toBe(orphans);
      expect(bal(token, C)).toBe(0);
      // the other token's escrow principal is still fully covered and not sweepable
      const otherToken = token === STX ? SBTC_T : STX;
      expect(bal(otherToken, C)).toBe(other.amount + other.fee);
      expect(call("sweep-orphans", [Cl.uint(otherToken), Cl.uint(1)], deployer)).toBeErr(err(ERR.SWEEP_EXCEEDS_FREE));
    });
  }

  it("HELD-10: per-escrow fee and fee-recipient are fixed at creation: later set-platform-fee(500) / set-fee-recipient change nothing for an in-flight split, whose rounding residue goes to the snapshot recipient", () => {
    const e = create({ amount: 1_000_003 });
    expect(e.fee).toBe(Math.floor((1_000_003 * 50) / BPS)); // 5000
    expect(call("set-platform-fee", [Cl.uint(500)], deployer)).toBeOk(ok);
    expect(call("set-fee-recipient", [Cl.principal(feeSink)], deployer)).toBeOk(ok);
    expect(call("dispute", id(e.id), buyer)).toBeOk(ok);
    const d0 = stxBal(deployer), k0 = stxBal(feeSink), b0 = stxBal(buyer), s0 = stxBal(seller);
    expect(call("resolve-dispute-split", [Cl.uint(e.id), Cl.uint(1)], deployer)).toBeOk(ok);
    const bp = Math.floor((e.amount * 1) / BPS), bf = Math.floor((e.fee * 1) / BPS);
    expect(stxBal(buyer) - b0).toBe(bp + bf);
    expect(stxBal(seller) - s0).toBe(e.amount - bp);
    expect(stxBal(deployer) - d0).toBe(e.fee - bf); // snapshot recipient
    expect(stxBal(feeSink) - k0).toBe(0); // new global recipient gets nothing
  });

  it("HELD-11: the owner has no path to principal of an undisputed escrow (no resolve, dispute, release or refund) for STX or sBTC", () => {
    for (const token of [STX, SBTC_T]) {
      const e = create({ token });
      for (const fn of ["resolve-dispute-for-buyer", "resolve-dispute-for-seller"]) {
        expect(call(fn, id(e.id), deployer)).toBeErr(err(ERR.NOT_DISPUTED));
      }
      expect(call("resolve-dispute-split", [Cl.uint(e.id), Cl.uint(0)], deployer)).toBeErr(err(ERR.NOT_DISPUTED));
      for (const fn of ["dispute", "release", "refund"]) {
        expect(call(fn, id(e.id), deployer)).toBeErr(err(ERR.UNAUTHORIZED));
      }
      expect(call("sweep-orphans", [Cl.uint(token), Cl.uint(1)], deployer)).toBeErr(err(ERR.SWEEP_EXCEEDS_FREE));
      expect(getEscrow(e.id).status).toBe(PENDING);
    }
  });
});

describe("HELD ownership", () => {
  it("HELD-12: two-step ownership: nominee has no power before accept, strangers cannot accept, nominations can be overwritten, old owner loses power after accept", () => {
    expect(call("transfer-ownership", [Cl.principal(newOwner)], stranger)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("transfer-ownership", [Cl.principal(deployer)], deployer)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("accept-ownership", [], newOwner)).toBeErr(err(ERR.OWNERSHIP_PENDING));

    expect(call("transfer-ownership", [Cl.principal(newOwner)], deployer)).toBeOk(ok);
    expect(call("pause-contract", [Cl.uint(10)], newOwner)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("accept-ownership", [], stranger)).toBeErr(err(ERR.NOT_PENDING_OWNER));

    // overwrite the nomination, then restore it
    expect(call("transfer-ownership", [Cl.principal(stranger)], deployer)).toBeOk(ok);
    expect(call("accept-ownership", [], newOwner)).toBeErr(err(ERR.NOT_PENDING_OWNER));
    expect(call("transfer-ownership", [Cl.principal(newOwner)], deployer)).toBeOk(ok);
    expect(call("accept-ownership", [], newOwner)).toBeOk(ok);
    expect(call("accept-ownership", [], newOwner)).toBeErr(err(ERR.OWNERSHIP_PENDING));

    expect(call("pause-contract", [Cl.uint(10)], deployer)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("set-fee-recipient", [Cl.principal(feeSink)], deployer)).toBeErr(err(ERR.UNAUTHORIZED));
    expect(call("pause-contract", [Cl.uint(10)], newOwner)).toBeOk(ok);
    const cfg: any = ro("get-config", []);
    expect(cfg.value.owner.value).toBe(newOwner);
    expect(cfg.value["fee-recipient"].value).toBe(deployer); // not moved by ownership transfer
  });
});
