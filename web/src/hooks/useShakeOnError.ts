import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/theme/motion';

/**
 * Shake the returned element once each time a *new* error appears — the app's
 * sign-in shake. The same error shown twice does not shake twice.
 */
export function useShakeOnError<T extends HTMLElement>(error: string | null | undefined) {
  const ref = useRef<T>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const current = error ?? null;
    if (current && current !== last.current && ref.current && !prefersReducedMotion()) {
      ref.current.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-8px)' },
          { transform: 'translateX(8px)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 225, easing: 'linear' }
      );
    }
    last.current = current;
  }, [error]);

  return ref;
}
