// Network & contract configuration — all environment-driven for mainnet safety
export const STACKS_NETWORK = (import.meta.env.VITE_STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet';
export const STACKS_API_URL = import.meta.env.VITE_STACKS_API_URL ||
  (STACKS_NETWORK === 'mainnet' ? 'https://api.mainnet.hiro.so' : 'https://api.testnet.hiro.so');

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || 'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N';
export const CONTRACT_NAME = import.meta.env.VITE_CONTRACT_NAME || 'escrow-v7';
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
export const MIN_DURATION_BLOCKS = 4; // ~5 min at post-Nakamoto block times (enough for tx confirmation)
export const MAX_DURATION_BLOCKS = 350_400; // ~365 days at 960 blocks/day (post-Nakamoto)

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
// v6 / `escrow-mainnet` predate both. Hard-coding capabilities by contract id
// avoids brittle name-pattern matching and forces an explicit add when a new
// deployment ships.
//
// When a new v7+ contract is deployed (e.g. v7-equivalent on mainnet), add
// its full principal here.
const V7_PLUS_CONTRACTS: ReadonlySet<string> = new Set([
  'ST1HK6H018TMMZ1BZPS1QMJZE9WPA7B93T8ZHV94N.escrow-v7',
  'SP1HK6H018TMMZ1BZPS1QMJZE9WPA7B93TA2BMTGA.escrow-mainnet-v2',
]);

/**
 * True iff the contract exposes the v7+ `deliver()` function and
 * STATUS_DELIVERED. Use this to gate the "Mark as Delivered" on-chain call,
 * the review-period UI, and split-resolution affordances.
 */
export function supportsOnChainDelivery(contractId: string): boolean {
  return V7_PLUS_CONTRACTS.has(contractId);
}
