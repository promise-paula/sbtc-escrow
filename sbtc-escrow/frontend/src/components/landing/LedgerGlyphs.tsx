import React from 'react';

/**
 * Custom glyph set for the landing page's ledger identity — replaces the
 * stock lucide icons in Features and Who-it's-for, which were the last
 * template tell on the page. One shared grammar: 24×24 grid, 1.5px round
 * stroke, geometric construction, drawn from the vocabulary of ledgers and
 * financial documents (seals, balances, ruled timelines, signature rows,
 * receipts) rather than generic app iconography.
 *
 * API mirrors lucide (className passthrough, currentColor) so they drop into
 * the existing `icon:` slots unchanged.
 */

type GlyphProps = React.SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Notarial seal with a check — settlement certified by the contract. */
export function GlyphSeal(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="7" />
      {/* rosette ticks */}
      <path d="M12 2.2v1.6M12 20.2v1.6M2.2 12h1.6M20.2 12h1.6M5.1 5.1l1.1 1.1M17.8 17.8l1.1 1.1M18.9 5.1l-1.1 1.1M6.2 17.8l-1.1 1.1" />
      <path d="M9.2 12.2l1.9 1.9 3.7-4.2" />
    </Glyph>
  );
}

/** Balance — beam, two hanging pans, weighted post. */
export function GlyphBalance(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="4.6" r="1.1" />
      <path d="M5.5 6.8h13" />
      <path d="M6.5 6.8v2.4M17.5 6.8v2.4" />
      <path d="M3.8 9.2a2.7 2.7 0 0 0 5.4 0" />
      <path d="M14.8 9.2a2.7 2.7 0 0 0 5.4 0" />
      <path d="M12 6.8V19" />
      <path d="M8.8 19.4h6.4" />
    </Glyph>
  );
}

/** Clock hand inside a return arc — funds come back after expiry. */
export function GlyphReturn(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M19.8 12A7.8 7.8 0 1 1 17 6" />
      <path d="M17.6 2.8L17 6l3.2.6" />
      <path d="M12 8.4V12l2.6 1.6" />
    </Glyph>
  );
}

/** Ruled timeline with the deadline tick pushed forward. */
export function GlyphExtend(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 12h14.5" />
      <path d="M6 10.4v3.2M10 10.4v3.2M14 10.4v3.2" />
      <path d="M18 9.2L21 12l-3 2.8" />
    </Glyph>
  );
}

/** Pulse drawn across a ledger line — state read live off the chain. */
export function GlyphPulse(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 13.4h3.4l2.1-5.8 3.6 9 2-4.6h4.4" />
      <circle cx="20.8" cy="12" r="1" />
    </Glyph>
  );
}

/** Three signature rows, each sealed — buyer, seller, beneficiary. */
export function GlyphParties(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="5.2" cy="6.5" r="1.4" />
      <circle cx="5.2" cy="12" r="1.4" />
      <circle cx="5.2" cy="17.5" r="1.4" />
      <path d="M9.4 6.5H20M9.4 12H20M9.4 17.5h6.8" />
    </Glyph>
  );
}

/** Milestone steps climbing to a settled endpoint. */
export function GlyphMilestones(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 18.5h4.6v-6h4.8v-6h5.8" />
      <circle cx="20" cy="6.5" r="1.6" />
    </Glyph>
  );
}

/** Two counterparties, value crossing in both directions. */
export function GlyphSwap(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="5.4" cy="6.4" r="2.1" />
      <path d="M9.6 6.4h9.6" />
      <path d="M16.8 3.9l2.4 2.5-2.4 2.5" />
      <circle cx="18.6" cy="17.6" r="2.1" />
      <path d="M14.4 17.6H4.8" />
      <path d="M7.2 15.1l-2.4 2.5 2.4 2.5" />
    </Glyph>
  );
}

/** Treasury portico — grants issued from a common fund. */
export function GlyphTreasury(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 8.6L12 4l8 4.6" />
      <path d="M4.6 11h14.8" />
      <path d="M6.8 11v6.6M12 11v6.6M17.2 11v6.6" />
      <path d="M4 20.2h16" />
    </Glyph>
  );
}

/** Settlement receipt — ruled lines, serrated tear. */
export function GlyphReceipt(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M6.5 3.2h11v17l-2.2-1.6-2.2 1.6-2.2-1.6-2.2 1.6-2.2-1.6z" />
      <path d="M9.5 8h5M9.5 11.5h3.4" />
    </Glyph>
  );
}
