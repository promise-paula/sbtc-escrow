import { useEffect, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";

interface UseCountUpOptions {
  delay?: number;
  stiffness?: number;
  damping?: number;
}

export function useCountUp(target: number, options: UseCountUpOptions = {}) {
  const { delay = 200, stiffness = 50, damping = 20 } = options;
  const [display, setDisplay] = useState(0);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness, damping });

  useEffect(() => {
    const timeout = setTimeout(() => {
      motionValue.set(target);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, delay, motionValue]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (v) => {
      setDisplay(Math.round(v));
    });
    return unsubscribe;
  }, [spring]);

  return display;
}
