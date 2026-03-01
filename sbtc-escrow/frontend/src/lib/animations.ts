import { type Variants } from "framer-motion";

// Page Transitions
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.25 } },
};

// Stagger Container
export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

// Stagger Child
export const staggerChild: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// Card Hover
export const cardHover: Variants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.015, y: -2, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// Button Press
export const buttonPress = {
  whileTap: { scale: 0.97 },
  whileHover: { scale: 1.02 },
  transition: { type: "spring", stiffness: 400, damping: 17 },
};

// Modal
export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, scale: 0.97, y: 5, transition: { duration: 0.15 } },
};

// Success Celebration
export const celebrationPop: Variants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 15, delay: 0.1 } },
};

// Fade In Up
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// Scale In
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
};

// Card Reveal (for escrow cards)
export const cardReveal: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// Stats Reveal
export const statsReveal: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};
