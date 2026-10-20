import { useEffect, useRef, type CSSProperties } from 'react';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import BrandMark, { markHeight } from './BrandMark';
import Wordmark from './Wordmark';
import styles from './AnimatedLogo.module.css';

type Props = {
  /** The mark's width. The wordmark is sized from it. */
  size?: number;
  /** false shows the finished lockup with no draw-in. */
  autoplay?: boolean;
  /** Called once the whole sequence has finished, including the wordmark. */
  onFinish?: () => void;
  /** Drop the wordmark and show the mark alone. */
  markOnly?: boolean;
  className?: string;
};

/** The wordmark's size and the gap, as fractions of the mark's width. */
const NAME_SIZE = 0.295;
const NAME_GAP = 0.09;
/** The wordmark arrives behind the last streak, which leaves at step(3.5). */
const NAME_AT = step(6);
const NAME_MS = 320;

/**
 * The mark and the name, drawn in once.
 *
 * The one place the full lockup animates, so the preloader, the splash and
 * anything else that wants it stay in step. `BrandMark` is the mark's own
 * sequence; this adds the name and reports when the whole thing is done.
 *
 * ## onFinish is a timer, not an animation event
 *
 * `animationend` fires per element and the lockup has six of them, so the
 * caller would have to know which is last. The total is known here — the
 * wordmark's delay plus its duration — and a timer says it once. It also fires
 * when the animation is suppressed, which an `animationend` listener would not:
 * a reader who has asked for reduced motion must not be left on a splash that
 * never finishes.
 */
export default function AnimatedLogo({ size = 140, autoplay = true, onFinish, markOnly, className }: Props) {
  const done = useRef(onFinish);
  done.current = onFinish;

  useEffect(() => {
    if (!done.current) return;
    if (!autoplay) {
      done.current();
      return;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => done.current?.(), reduced ? 0 : NAME_AT + NAME_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay]);

  return (
    <div
      className={cx(styles.lockup, className)}
      style={{ gap: Math.round(size * NAME_GAP), '--name-at': `${NAME_AT}ms` } as CSSProperties}
    >
      <BrandMark width={size} animate={autoplay} />
      {markOnly ? null : (
        <Wordmark
          size={Math.round(size * NAME_SIZE)}
          align="center"
          className={autoplay ? styles.name : undefined}
        />
      )}
    </div>
  );
}

/** The lockup's full height, for a caller that has to reserve the space. */
export function lockupHeight(size: number, markOnly?: boolean): number {
  const name = markOnly ? 0 : Math.round(size * NAME_SIZE) * 1.15 + Math.round(size * NAME_GAP);
  return markHeight(size) + name;
}
