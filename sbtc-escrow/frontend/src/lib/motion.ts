import type { Variants } from 'framer-motion';

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const dur = (ms: number) => (prefersReducedMotion ? 0 : ms / 1000);

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: dur(300), ease: 'easeOut' as const } },
  exit: { opacity: 0, y: 8, transition: { duration: dur(200) } },
};

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * dur(50), duration: dur(300), ease: 'easeOut' as const },
  }),
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * dur(100), duration: dur(400), ease: 'easeOut' as const },
  }),
};

export const pressVariants = {
  tap: { scale: prefersReducedMotion ? 1 : 0.97, transition: { duration: dur(100) } },
};
