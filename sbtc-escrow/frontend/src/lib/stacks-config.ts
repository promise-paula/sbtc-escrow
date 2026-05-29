// Network & contract configuration — all environment-driven for mainnet safety
export const STACKS_NETWORK = (import.meta.env.VITE_STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet';
export const STACKS_API_URL = import.meta.env.VITE_STACKS_API_URL ||
  (STACKS_NETWORK === 'mainnet' ? 'https://api.mainnet.hiro.so' : 'https://api.testnet.hiro.so');

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N';
// Default targets the latest active contract on each network. Override with
// VITE_CONTRACT_NAME if you need to create new escrows on a legacy version
// (legacy escrows are still readable / actionable via the multi-version
// dispatch in escrow-service.ts — only NEW creates respect this default).
export const CONTRACT_NAME = import.meta.env.VITE_CONTRACT_NAME || 'escrow-v8';
export const CONTRACT_PRINCIPAL = `${CONTRACT_ADDRESS}.${CONTRACT_NAME}` as `${string}.${string}`;

export const SBTC_CONTRACT = (import.meta.env.VITE_SBTC_CONTRACT ||
  (STACKS_NETWORK === 'mainnet'
    ? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'  // mainnet sBTC
    : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token')) as `${string}.${string}`;  // testnet sBTC

// ── Mainnet build safety ───────────────────────────────────────────
// A misconfigured CI could ship a "mainnet" build that silently falls back to
// testnet defaults (a tx pointing at the wrong contract is the worst-case
// silent failure). Hard-fail at module load if the address prefix doesn't
// match the configured network.
if (STACKS_NETWORK === 'mainnet') {
  if (!import.meta.env.VITE_CONTRACT_ADDRESS) {
    throw new Error(
      'sBTC Escrow misconfigured: VITE_CONTRACT_ADDRESS must be set explicitly for mainnet builds. ' +
        'See README for the deployed mainnet address.',
    );
  }
  if (!CONTRACT_ADDRESS.startsWith('SP') && !CONTRACT_ADDRESS.startsWith('SM')) {
    throw new Error(
      `sBTC Escrow misconfigured: VITE_STACKS_NETWORK=mainnet but VITE_CONTRACT_ADDRESS="${CONTRACT_ADDRESS}" is not a mainnet address (must start with SP or SM).`,
    );
  }
  if (!import.meta.env.VITE_CONTRACT_NAME) {
    throw new Error(
      'sBTC Escrow misconfigured: VITE_CONTRACT_NAME must be set explicitly for mainnet builds. ' +
        'Without it, the build silently falls back to the testnet default ("escrow-v7"), which does not exist on mainnet.',
    );
  }
  if (CONTRACT_NAME.startsWith('escrow-v')) {
    throw new Error(
      `sBTC Escrow misconfigured: VITE_STACKS_NETWORK=mainnet but VITE_CONTRACT_NAME="${CONTRACT_NAME}" looks like a testnet contract name. Expected the mainnet name (e.g. "escrow-mainnet-v2").`,
    );
  }
}

// Post-Nakamoto: Stacks blocks target ~5s but actual rate varies.
// useBlockRate() provides a live estimate — this is the conservative fallback
// used when the API is unavailable (pre-Nakamoto = ~10 min, current observed ~1.5 min).
export const DEFAULT_MINUTES_PER_BLOCK = 1.5;
export const DEFAULT_DISPUTE_TIMEOUT = 28_800; // ~30 days at 960 blocks/day (post-Nakamoto)
export const MAX_DISPUTE_TIMEOUT = 57_600; // ~60 days at 960 blocks/day (post-Nakamoto)
export const MIN_DISPUTE_TIMEOUT = 1;
export const MAX_FEE_BPS = 500; // 5%

// ── Duration bounds: TWO clocks ────────────────────────────────────────
// v2/v7 contracts use stacks-block-height (variable rate, post-Nakamoto).
// v3+ contracts use burn-block-height (Bitcoin chain, ~10 min/block, stable).
// Use the `_BURN` constants when targeting a v3+ contract.

// Stacks-block math (legacy v2/v7)
export const MIN_DURATION_BLOCKS = 4; // ~5 min at target rate
export const MAX_DURATION_BLOCKS = 350_400; // ~365 days at 960 blocks/day

// Burn-block math (v3+)
export const MIN_DURATION_BURN_BLOCKS = 1; // ~10 min minimum (matches contract MIN_DURATION u1)
export const MAX_DURATION_BURN_BLOCKS = 52_560; // ~365 days (matches contract MAX_DURATION u52560)
export const BURN_BLOCK_MINUTES = 10; // Bitcoin produces ~144 blocks/day = 10 min/block average

/**
 * Convert a wall-clock duration (in minutes) to a block count for the given
 * contract's clock. For v3+ contracts uses burn-block math (1 block ≈ 10 min,
 * stable). For v2/v7 contracts uses the live stacks-block rate.
 */
export function durationToBlocks(
  contractId: string,
  minutes: number,
  liveMinutesPerStacksBlock: number,
): number {
  if (usesBurnBlockClock(contractId)) {
    return Math.max(MIN_DURATION_BURN_BLOCKS, Math.round(minutes / BURN_BLOCK_MINUTES));
  }
  return Math.max(1, Math.round(minutes / liveMinutesPerStacksBlock));
}

/**
 * The duration cap for the given contract's clock, in blocks. Use this when
 * filtering UI presets or validating user input.
 */
export function maxDurationBlocks(contractId: string): number {
  return usesBurnBlockClock(contractId) ? MAX_DURATION_BURN_BLOCKS : MAX_DURATION_BLOCKS;
}

/**
 * The minutes-per-block to use for "expires in X" displays for this contract.
 * On v3+ contracts this is a stable constant (Bitcoin block target). On
 * legacy contracts it's the live observed Stacks block rate.
 */
export function effectiveMinutesPerBlock(
  contractId: string,
  liveMinutesPerStacksBlock: number,
): number {
  return usesBurnBlockClock(contractId)
    ? BURN_BLOCK_MINUTES
    : liveMinutesPerStacksBlock;
}

// Below this, an admin is almost certainly making a mistake — surface a
// confirmation in the UI before letting them set a dispute window of less
// than ~3.5 hours on production.
export const SAFE_MIN_DISPUTE_TIMEOUT = 144;

// Per-token amount bounds (from V5 contract constants)
export const MIN_AMOUNT_STX = 1_000; // 0.001 STX
export const MAX_AMOUNT_STX = 100_000_000_000_000; // 100M STX
export const MIN_AMOUNT_SBTC = 10_000; // 0.0001 BTC
export const MAX_AMOUNT_SBTC = 10_000_000_000; // 100 BTC

export const EXPLORER_BASE = 'https://explorer.hiro.so';

// Project repository — single source of truth so org/repo changes are one edit.
export const REPO_URL = 'https://github.com/promise-paula/sbtc-escrow';

// ── Contract capability registry ─────────────────────────────────────
//
// Some features only exist on specific contract versions. v7+ adds on-chain
// `deliver()` (STATUS_DELIVERED + review window) and `resolve-dispute-split`.
// v6 / `escrow-mainnet` predate both. v3 / `escrow-mainnet-v3` adds the
// burn-block clock, beneficiary parameter, time-bound pause, sweep-orphans,
// and seller self-rescue. Hard-coding capabilities by contract id avoids
// brittle name-pattern matching and forces an explicit add when a new
// deployment ships.
const V7_PLUS_CONTRACTS: ReadonlySet<string> = new Set([
  'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v7',
  'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v8',
  'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v2',
  'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v3',
]);

// V3+ contracts: burn-block expiry, beneficiary delegation, per-escrow
// fee-recipient snapshot, sweep-orphans, seller self-rescue, time-bound
// pause with anti-chaining cooldown. All v3+ contracts also satisfy
// V7_PLUS (they're feature supersets).
//
// Testnet v3-equivalent is named `escrow-v8` to keep the testnet vN /
// mainnet-vN naming lanes parallel. Mainnet v3 is added here when it
// deploys.
const V3_PLUS_CONTRACTS: ReadonlySet<string> = new Set([
  'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v8',
  'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v3',
]);

/**
 * True iff the contract exposes the v7+ `deliver()` function and
 * STATUS_DELIVERED. Use this to gate the "Mark as Delivered" on-chain call,
 * the review-period UI, and split-resolution affordances.
 */
export function supportsOnChainDelivery(contractId: string): boolean {
  return V7_PLUS_CONTRACTS.has(contractId);
}

/**
 * True iff the contract uses the v3+ feature set: burn-block clock,
 * beneficiary delegation, per-escrow fee-recipient snapshot, sweep-orphans,
 * seller self-rescue. Use this to gate the "Add beneficiary" UI on Create,
 * the seller's self-rescue affordance, and burn-block-based time displays.
 */
export function supportsV3Features(contractId: string): boolean {
  return V3_PLUS_CONTRACTS.has(contractId);
}

/**
 * True if this contract uses burn-block-height for its time anchors
 * (vs stacks-block-height). Used by frontend time-conversion helpers so
 * "30 days" actually translates to 30 days regardless of Stacks block rate.
 */
export function usesBurnBlockClock(contractId: string): boolean {
  return V3_PLUS_CONTRACTS.has(contractId);
}
