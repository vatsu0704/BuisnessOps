import { useCountUp } from '@/hooks/useCountUp';
import styles from './StatTile.module.css';

type Props = {
  label: string;
  value: number;
  caption?: string;
  /** A colour for the figure, e.g. var(--color-success). */
  accent?: string;
  formatValue?: (value: number) => string;
};

/**
 * One number in a row of them. The figure sits at the bottom of the tile, so a
 * label that wraps to two lines — sooner in Hindi, Gujarati and Marathi — does
 * not push its number below its neighbours'.
 */
export default function StatTile({ label, value, caption, accent, formatValue }: Props) {
  const shown = useCountUp(value);
  return (
    <div className={styles.tile}>
      <p className={styles.label}>{label}</p>
      <div>
        {/* The count-up is decoration; a screen reader hears the real figure once. */}
        <p className={styles.value} style={accent ? { color: accent } : undefined} aria-hidden="true">
          {formatValue ? formatValue(shown) : shown}
        </p>
        <p className="visually-hidden">{formatValue ? formatValue(value) : value}</p>
        {caption ? <p className={styles.caption}>{caption}</p> : null}
      </div>
    </div>
  );
}
