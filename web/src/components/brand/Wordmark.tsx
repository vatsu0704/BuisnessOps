import type { CSSProperties } from 'react';
import { APP_NAME, APP_NAME_PARTS } from '@/constants/brand';
import { cx } from '@/utils/cx';
import styles from './Wordmark.module.css';

type Props = {
  size: number;
  align?: 'left' | 'center';
  className?: string;
};

/**
 * The name set the way the logo sets it: "Kitna" in navy, "pay" in coral.
 * The two words wrap independently, so a header too narrow for the whole
 * name stacks "pay" under "Kitna" rather than clipping or shrinking it. A
 * screen reader hears it as one word, and as "KitnaPay" — the drawn mark
 * keeps the logo's lowercase p, prose does not.
 */
export default function Wordmark({ size, align = 'left', className }: Props) {
  const [first, second] = APP_NAME_PARTS;
  const type: CSSProperties = {
    fontSize: size,
    lineHeight: `${Math.round(size * 1.15)}px`,
    letterSpacing: `${-size * 0.018}px`,
  };

  return (
    <span className={cx(styles.wordmark, align === 'center' && styles.centred, className)} style={type}>
      <span className="visually-hidden">{APP_NAME}</span>
      <span className={styles.ink} aria-hidden="true">
        {first}
      </span>
      <span className={styles.blue} aria-hidden="true">
        {second}
      </span>
    </span>
  );
}
