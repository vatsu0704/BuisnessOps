/**
 * Motion values JavaScript needs, mirroring frontend/src/theme/motion.ts. The
 * CSS side of the same tokens lives in styles/tokens.css.
 */
export const duration = {
  quick: 150,
  base: 260,
  slow: 420,
};

export const stagger = 70;

/** The delay for the `index`th item of a staggered entrance. */
export function step(index: number, offset = 0): number {
  return offset + index * stagger;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
