// Launch-promotion config.
//
// IMPORTANT — the displayed fee is driven by the LIVE on-chain platform fee, not
// by this flag. The promo UI (announcement bar, pricing badge) only appears when
// BOTH `isPromoActive()` is true AND the contract's actual fee is 0. So the page
// can never claim "0%" while the contract still charges 0.5%.
//
// To run the promo:
//   1. Admin sets the on-chain platform fee to 0 (Contract Controls → Fee).
//   2. Keep `active: true` here with the end date you're advertising.
// To end it:
//   - Admin sets the on-chain fee back to 50 (0.5%). The promo UI reverts
//     automatically. (Letting `endDate` pass, or setting `active: false`,
//     also hides the promo framing regardless of the on-chain fee.)
export const LAUNCH_PROMO = {
  active: true,
  endDate: '2026-09-30',
  endDateDisplay: 'September 30, 2026',
} as const;

/** True while the promo window is open (flag on AND end date not passed). */
export const isPromoActive = (): boolean =>
  LAUNCH_PROMO.active && new Date() < new Date(`${LAUNCH_PROMO.endDate}T23:59:59`);
