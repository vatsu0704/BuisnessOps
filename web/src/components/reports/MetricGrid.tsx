import { cx } from '@/utils/cx';
import styles from './MetricGrid.module.css';

export type Metric = {
  label: string;
  value: string;
  /** A second line under the figure — "3 orders", "not settled". */
  caption?: string;
  tone?: 'default' | 'cost' | 'good';
};

/**
 * The figures behind a net profit, in a grid that wraps — two across on a phone,
 * more on a wide card. A fifth figure added later starts a new row instead of
 * squeezing the four already there (the app's `MetricGrid`).
 */
export default function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className={styles.grid}>
      {metrics.map((metric) => (
        <div key={metric.label} className={styles.cell}>
          <dt className={styles.label}>{metric.label}</dt>
          <dd className={cx(styles.value, metric.tone === 'cost' && styles.cost, metric.tone === 'good' && styles.good)}>
            {metric.value}
          </dd>
          {metric.caption ? <dd className={styles.caption}>{metric.caption}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
