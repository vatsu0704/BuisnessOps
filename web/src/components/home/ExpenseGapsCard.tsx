import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { IoCallOutline, IoCheckmarkCircleOutline, IoChevronForward, IoCubeOutline, IoStorefrontOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { getExpenseCompliance } from '@/api/expenses';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import type { ExpenseComplianceRow } from '@/types/expense';
import { cx } from '@/utils/cx';
import { formatAmount } from '@/utils/format';
import styles from './ExpenseGapsCard.module.css';

const MAX_ROWS = 6;

/**
 * "The person at the back office will call the branches that haven't logged
 * their daily expenses" — requirement 10's last line, the app's ExpenseGapsCard.
 * Gated on `expense:viewAllBranches` by Home.
 *
 * A list rather than a link: the action is a phone call, and the branch's name
 * is all it needs. A row opens that branch's figures, the second thing you want
 * when the answer is "we did log it". Each branch is asked about its own local
 * today by the server, which is why this is not worked out in the browser.
 */
export default function ExpenseGapsCard() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { branches } = useBranches();
  const defaultCurrency = useAuthStore((s) => s.business?.defaultCurrency ?? 'INR');

  const [rows, setRows] = useState<ExpenseComplianceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      setRows((await getExpenseCompliance(businessId)).branches);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId]);
  useRefreshOnFocus(load);

  if (!rows && !error) return null;

  const missing = rows?.filter((row) => !row.hasLogged) ?? [];
  const allLogged = !!rows && missing.length === 0;
  // On a day nobody needs calling, what each branch spent, so the card is still worth reading.
  const listed = (allLogged ? rows : missing).slice(0, MAX_ROWS);
  const currencyOf = (branchId: string) => branches.find((b) => b.id === branchId)?.currency ?? defaultCurrency;

  return (
    <section className={styles.card} aria-labelledby="home-expense-gaps-title">
      <div className={styles.head}>
        <span className={cx(styles.icon, allLogged && styles.iconCalm)} aria-hidden="true">
          {allLogged ? <IoCheckmarkCircleOutline size={18} /> : <IoCallOutline size={18} />}
        </span>
        <div className={styles.headText}>
          <h2 id="home-expense-gaps-title" className={styles.title}>
            {t('expenses.gapsTitle')}
          </h2>
          {rows ? (
            <p className={styles.subtitle}>
              {allLogged ? t('expenses.gapsAllDone') : t('expenses.gapsSubtitle', { count: missing.length })}
            </p>
          ) : null}
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {listed.length > 0 ? (
        <ul className={styles.list}>
          {listed.map((row) => {
            const Icon = row.branchKind === 'WAREHOUSE' ? IoCubeOutline : IoStorefrontOutline;
            return (
              <li key={row.branchId}>
                <Link to={`${pathTo('expenses')}?branch=${encodeURIComponent(row.branchId)}`} className={styles.row}>
                  <Icon size={15} className={styles.rowIcon} aria-hidden="true" />
                  <span className={styles.branchName}>{row.branchName}</span>
                  {allLogged ? (
                    <span className={styles.logged}>
                      {t('expenses.gapsLogged', { amount: formatAmount(Number(row.totalSpent), currencyOf(row.branchId)) })}
                    </span>
                  ) : (
                    <span className={styles.nothing}>{t('expenses.gapsNothing')}</span>
                  )}
                  <IoChevronForward size={14} className={styles.rowIcon} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!allLogged && missing.length > listed.length ? (
        <p className={styles.more}>+{missing.length - listed.length}</p>
      ) : null}
    </section>
  );
}
