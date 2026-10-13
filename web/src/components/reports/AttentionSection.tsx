import { useTranslation } from 'react-i18next';
import { IoCheckmarkCircleOutline } from 'react-icons/io5';
import type { BranchMonthlyRow } from '@/types/analytics';
import { formatAmount } from '@/utils/format';
import { decliningBranches } from './ranking';
import TrendPill from './TrendPill';
import cardStyles from './ReportCard.module.css';
import styles from './AttentionSection.module.css';

/**
 * "Where more effort is needed" — requirement 15. The branches that fell are
 * lifted out and put first, worst first; when none did, one line says so, so
 * "is anything wrong?" is answered without scrolling.
 */
export default function AttentionSection({ rows }: { rows: BranchMonthlyRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  const declining = decliningBranches(rows);

  return (
    <section className={cardStyles.card} aria-labelledby="attention-title">
      <h2 id="attention-title" className={cardStyles.sectionTitle}>
        {t('reports.needsAttention')}
      </h2>
      {declining.length === 0 ? (
        <p className={styles.steady}>
          <IoCheckmarkCircleOutline size={17} aria-hidden="true" />
          <span>{t('reports.allSteady')}</span>
        </p>
      ) : (
        <>
          <p className={styles.hint}>{t('reports.needsAttentionHint', { count: declining.length })}</p>
          <ul className={styles.list}>
            {declining.map((row) => (
              <li key={row.branchId} className={styles.row}>
                <div className={cardStyles.nameBlock}>
                  <p className={styles.name}>{row.branchName}</p>
                  <p className={styles.amount}>{formatAmount(Number(row.total.netProfit), row.currency)}</p>
                </div>
                <TrendPill trend={row.trend} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
