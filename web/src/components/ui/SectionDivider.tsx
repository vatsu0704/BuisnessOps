import { cx } from '@/utils/cx';
import styles from './SectionDivider.module.css';

/** A rule with a small uppercase label in the middle of it. */
export default function SectionDivider({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cx(styles.row, className)} role="separator" aria-label={label}>
      <span className={styles.line} />
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <span className={styles.line} />
    </div>
  );
}
