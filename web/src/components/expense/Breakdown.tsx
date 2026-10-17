import { useTranslation } from 'react-i18next';
import { categoryLabel } from '@shared/utils/expenseCategory';
import type { ExpenseBreakdownRow } from '@/types/expense';
import styles from './Breakdown.module.css';

/**
 * Where the money went, biggest first — one chip per category with its amount,
 * each the width of its own label so a long Gujarati name wraps the row rather
 * than breaking the word.
 */
export default function Breakdown({ rows, money }: { rows: ExpenseBreakdownRow[]; money: (value: string) => string }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <ul className={styles.breakdown}>
      {rows.map((row) => (
        <li key={row.categoryId} className={styles.chip}>
          <span className={styles.name}>{categoryLabel(row, t)}</span>
          <span className={styles.amount}>{money(row.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
