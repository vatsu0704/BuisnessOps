import { useId, type ReactNode } from 'react';
import { cx } from '@/utils/cx';
import styles from './Card.module.css';

type Props = {
  /** The small uppercase heading the app puts on every section card. */
  title?: string;
  /** Something at the right end of the heading — "See all", "Add branch". */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A white section card with an optional heading, labelled for screen readers by it. */
export default function Card({ title, action, children, className }: Props) {
  const headingId = useId();
  return (
    <section className={cx(styles.card, className)} aria-labelledby={title ? headingId : undefined}>
      {title || action ? (
        <div className={styles.head}>
          {title ? (
            <h2 id={headingId} className={styles.title}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Label on the left, value on the right — the app's settings `Row`, as a definition list. */
export function DetailRows({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className={styles.rows}>
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <dt className={styles.rowLabel}>{row.label}</dt>
          <dd className={styles.rowValue}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
