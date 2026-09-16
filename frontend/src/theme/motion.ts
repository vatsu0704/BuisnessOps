export const duration = {
  quick: 150,
  base: 260,
  slow: 420,
};

export const spring = {
  gentle: { damping: 18, stiffness: 140, mass: 1 },
  snappy: { damping: 20, stiffness: 280, mass: 0.7 },
};

export const stagger = 70;

export function step(index: number, offset = 0): number {
  return offset + index * stagger;
}
