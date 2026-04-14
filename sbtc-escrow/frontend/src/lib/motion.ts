import type { Variants, Transition } from 'framer-motion';

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const dur = (ms: number) => (prefersReducedMotion ? 0 : ms / 1000);

/* ── Easings ─────────────────────────────────────────────────── */
const easeOutQuart = [0.25, 1, 0.5, 1] as const;

/* ── Page transitions ────────────────────────────────────────── */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: dur(300), ease: easeOutQuart } },
  exit: { opacity: 0, y: 8, transition: { duration: dur(200) } },
};

/* ── Staggered entrances ─────────────────────────────────────── */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * dur(50), duration: dur(300), ease: easeOutQuart },
  }),
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * dur(100), duration: dur(400), ease: easeOutQuart },
  }),
};

/* ── Interaction feedback ────────────────────────────────────── */
export const pressVariants = {
  tap: { scale: prefersReducedMotion ? 1 : 0.97, transition: { duration: dur(100) } },
};

export const hoverGrow = {
  hover: { scale: prefersReducedMotion ? 1 : 1.02, transition: { duration: dur(150) } },
};

/* ── Conditional element enter/exit ──────────────────────────── */
export const fadeInOut: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: dur(200) } },
  exit: { opacity: 0, transition: { duration: dur(150) } },
};

export const slideDown: Variants = {
  initial: { opacity: 0, height: 0, overflow: 'hidden' as const },
  animate: { opacity: 1, height: 'auto', overflow: 'hidden' as const, transition: { duration: dur(300), ease: easeOutQuart } },
  exit: { opacity: 0, height: 0, overflow: 'hidden' as const, transition: { duration: dur(200) } },
};

/* ── Success / Error ─────────────────────────────────────────── */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1, transition: { duration: dur(400), ease: easeOutQuart } },
  exit: { opacity: 0, scale: 0.8, transition: { duration: dur(200) } },
};

export const shake: Variants = {
  initial: { x: 0 },
  animate: {
    x: prefersReducedMotion ? 0 : [0, -6, 6, -4, 4, 0],
    transition: { duration: dur(400) },
  },
};

/* ── Scroll reveals (whileInView) ────────────────────────────── */
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: dur(500), ease: easeOutQuart },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: dur(100) },
  },
};

/* ── Layout list transitions ─────────────────────────────────── */
export const layoutTransition: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
  mass: 0.8,
};
