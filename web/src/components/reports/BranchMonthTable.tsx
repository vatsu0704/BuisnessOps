import { useTranslation } from 'react-i18next';
import type { BranchMonthlyRow } from '@/types/analytics';
import { cx } from '@/utils/cx';
import { monthKeyShortLabel } from '@/utils/date';
import { formatAmount } from '@/utils/format';
import { netIn } from './ranking';
import cardStyles from './ReportCard.module.css';
import styles from './BranchMonthTable.module.css';

/**
 * Requirement 15's branch × month grid, as the matrix it asks for — on a window
 * wide enough to hold one. The app turns it into one card per branch because
 * twelve rupee columns do not fit a phone; a desktop has the room, and reading
 * across a row is what a person comparing branches does. The cards below it stay,
 * with each month's breakdown.
 *
 * Net profit only, in the ranking the cards use, with the month in focus marked.
 * A month heading is a button that puts that month in focus. Below the width the
 * page decides, it is not shown; the table scrolls sideways inside its card, never
 * the page.
 */
export default function BranchMonthTable({
  rows,
  months,
  focusMonth,
  onSelectMonth,
}: {
  rows: BranchMonthlyRow[];
  months: string[];
  focusMonth: string;
  onSelectMonth: (month: string) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;

  return (
    <section className={cx(cardStyles.card, styles.card)} aria-labelledby="branch-month-title">
      <h2 id="branch-month-title" className={cardStyles.sectionTitle}>
        {t('web.reports.tableTitle')}
      </h2>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.branchHead}>
                {t('web.reports.branchColumn')}
              </th>
              {months.map((month) => (
                <th key={month} scope="col" className={cx(styles.num, month === focusMonth && styles.focus)}>
                  <button
                    type="button"
                    className={styles.monthButton}
                    aria-pressed={month === focusMonth}
                    onClick={() => onSelectMonth(month)}
                  >
                    {monthKeyShortLabel(month, t)}
                  </button>
                </th>
              ))}
              <th scope="col" className={cx(styles.num, styles.total)}>
                {t('web.reports.totalColumn')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.branchId}>
                <th scope="row" className={styles.branch}>
                  <span className={styles.branchName}>{row.branchName}</span>
                  {row.isCostCentre ? <span className={styles.costCentre}>{t('reports.costCentre')}</span> : null}
                </th>
                {months.map((month) => {
                  const value = netIn(row, month);
                  return (
                    <td key={month} className={cx(styles.num, month === focusMonth && styles.focus, value < 0 && styles.loss)}>
                      {formatAmount(value, row.currency)}
                    </td>
                  );
                })}
                <td className={cx(styles.num, styles.total, Number(row.total.netProfit) < 0 && styles.loss)}>
                  {formatAmount(Number(row.total.netProfit), row.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
