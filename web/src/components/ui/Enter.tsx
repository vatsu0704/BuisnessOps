import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/utils/cx';

type Props = {
  children: ReactNode;
  /** ms before it starts — use `step(n)` for a stagger. */
  delay?: number;
  /** px it rises from; negative drops in from above. */
  distance?: number;
  /** Starting scale, settling to 1. Leave at 1 for the usual fade-and-rise. */
  scaleFrom?: number;
  as?: 'div' | 'section' | 'header' | 'aside' | 'li';
  className?: string;
  style?: CSSProperties;
};

/**
 * The app's `AnimatedEntrance`: fade and rise into place after a delay. Pure
 * CSS (the `.enter` keyframes in global.css), so it costs no JavaScript per
 * frame and honours reduced motion by itself.
 *
 * The animation fills backwards only, so once it has played the element holds
 * no transform and no stacking context — a popover inside it layers normally.
 */
export default function Enter({ children, delay = 0, distance = 18, scaleFrom = 1, as = 'div', className, style }: Props) {
  const Tag = as;
  return (
    <Tag
      className={cx('enter', className)}
      style={
        {
          '--enter-delay': `${delay}ms`,
          '--enter-distance': `${distance}px`,
          '--enter-scale': scaleFrom,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  );
}
