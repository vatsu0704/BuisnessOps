import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/theme/motion';

/**
 * A number that counts from what is on screen to its new value, eased — the web
 * version of the app's `AnimatedCount`. Jumps straight there for anyone who has
 * asked for reduced motion.
 */
export function useCountUp(value: number, duration = 700): number {
  const [display, setDisplay] = useState(0);
  // What is on screen right now, so a count interrupted by a new value carries
  // on from where it was rather than jumping.
  const shown = useRef(0);

  useEffect(() => {
    const show = (n: number) => {
      shown.current = n;
      setDisplay(n);
    };

    if (prefersReducedMotion()) {
      show(value);
      return;
    }

    const start = performance.now();
    const origin = shown.current;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      show(Math.round(origin + (value - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display;
}
