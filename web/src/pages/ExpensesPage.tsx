import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { IoAddCircleOutline, IoReceiptOutline, IoTrashOutline } from 'react-icons/io5';
import { useMonthCursor } from '@shared/hooks/useMonthCursor';
import { categoryLabel } from '@shared/utils/expenseCategory';
import { extractErrorMessage } from '@/api/client';
import { deleteExpense, getExpenseDay, getExpenseMonth } from '@/api/expenses';
import { downloadDayEndWorkbook, printDayEndDocument } from '@/api/exports';
import ExportActions from '@/components/ExportActions';
import BranchPicker from '@/components/branches/BranchPicker';
import Breakdown from '@/components/expense/Breakdown';
import ButtonLink from '@/components/ui/ButtonLink';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import MonthCursor from '@/components/ui/MonthCursor';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import StatTile from '@/components/ui/StatTile';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useExportPreview } from '@/hooks/useExportPreview';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { refreshToday } from '@/store/todayStore';
import { step } from '@/theme/motion';
import type { Expense, ExpenseDaySummary, ExpenseMonthSummary } from '@/types/expense';
import { confirm } from '@/utils/confirm';
import { cx } from '@/utils/cx';
import { dateKeyFromApi, formatDate, formatTime } from '@/utils/date';
import { formatAmount } from '@/utils/format';
import { hasCapability } from '@/utils/permissions';
import styles from './ExpensesPage.module.css';

/**
 * A branch's spending — requirement 10, the app's Expenses screen.
 *
 * "How much did I spend today? And how much did I sell today?" is one question,
 * so the day card answers both and shows the gap between them. The month beside
 * it is the other half — the month's total, with the category breakdown that
 * makes "₹2,000 of milk" a thing you can look up — and the day-end export
 * (requirement 17) sits under it.
 *
 * Read by more people than write to it: `expense:view` opens this page, and
 * logging or removing an entry needs `expense:log`. The branch is in the address
 * (`?branch=`), so Home's expense card opens the branch it named.
 */
export default function ExpensesPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  // `branches`, not `tradingBranches`: a warehouse has costs even though it has no till.
  const { branches } = useBranches();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();
  const [searchParams, setSearchParams] = useSearchParams();

  const canLog = hasCapability(membership, 'expense:log');
  const canExport = hasCapability(membership, 'export:dayEnd');

  const requested = searchParams.get('branch');
  const branchId = branches.find((b) => b.id === requested)?.id ?? branches[0]?.id ?? null;

  const [day, setDay] = useState<ExpenseDaySummary | null>(null);
  const [monthSummary, setMonthSummary] = useState<ExpenseMonthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Only the latest request's answer is shown: switching branch quickly must
  // never leave one branch's figures under another's name.
  const latest = useRef(0);

  const exportPreview = useExportPreview('DAY', { branchId: branchId ?? undefined }, canExport && !!branchId);

  const load = useCallback(async () => {
    if (!businessId || !branchId) return;
    const request = ++latest.current;
    setError(null);
    try {
      const [dayData, monthData] = await Promise.all([
        getExpenseDay(businessId, branchId),
        getExpenseMonth(businessId, branchId, month, year),
      ]);
      if (request !== latest.current) return;
      setDay(dayData);
      setMonthSummary(monthData);
    } catch (err) {
      // A failed refresh keeps what was on the page and says why beside it.
      if (request === latest.current) setError(extractErrorMessage(err));
    } finally {
      if (request === latest.current) setIsLoading(false);
    }
  }, [businessId, branchId, month, year]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefreshOnFocus(load, { onMount: false });

  const shownDay = day && day.branchId === branchId ? day : null;
  const shownMonth =
    monthSummary && monthSummary.branchId === branchId && monthSummary.month === month && monthSummary.year === year
      ? monthSummary
      : null;
  const currency = shownDay?.currency ?? shownMonth?.currency ?? 'INR';
  const money = useMemo(() => (value: string | number) => formatAmount(Number(value), currency), [currency]);

  async function handleRemove(expense: Expense) {
    if (!businessId) return;
    const ok = await confirm({
      title: t('expenses.deleteTitle'),
      body: t('expenses.deleteBody', { amount: money(expense.amount), category: categoryLabel(expense.category, t) }),
      confirmLabel: t('expenses.delete'),
      cancelLabel: t('expenses.cancel'),
    });
    if (!ok) return;
    setRemovingId(expense.id);
    try {
      await deleteExpense(businessId, expense.id);
      await load();
      void refreshToday();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  }

  const addTo = branchId ? `${pathTo('addExpense')}?branch=${encodeURIComponent(branchId)}` : pathTo('addExpense');
  const difference = Number(shownDay?.difference ?? 0);

  return (
    <div className={styles.page}>
      <PageHeader title={t('expenses.title')} subtitle={t('expenses.subtitle')} />

      {branches.length > 1 ? (
        <Enter delay={step(1)}>
          <BranchPicker
            name="expenses-branch"
            legend={t('expenses.branch')}
            hideLegend
            branches={branches}
            value={branchId}
            onChange={(id) => setSearchParams({ branch: id }, { replace: true })}
          />
        </Enter>
      ) : null}

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {isLoading && !shownDay ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.column}>
            <Enter delay={step(2)}>
              <Card title={t('expenses.todaySection')}>
                {/* Two figures, then the gap between them as its own line: it is
                    the conclusion drawn from the two, and needs room for its sign. */}
                <div className={styles.stats}>
                  <StatTile
                    label={t('expenses.spent')}
                    value={Number(shownDay?.totalSpent ?? 0)}
                    accent="var(--color-warning)"
                    formatValue={money}
                  />
                  <StatTile
                    label={t('expenses.sold')}
                    value={Number(shownDay?.totalSold ?? 0)}
                    accent="var(--color-success)"
                    formatValue={money}
                  />
                </div>
                <div className={styles.difference}>
                  <span className={styles.differenceLabel}>{t('expenses.difference')}</span>
                  <span className={cx(styles.differenceValue, difference < 0 && styles.negative)}>{money(difference)}</span>
                </div>
                <Breakdown rows={shownDay?.breakdown ?? []} money={money} />
                {canLog ? (
                  <div className={styles.add}>
                    <ButtonLink to={addTo} title={t('expenses.logExpense')} icon={IoAddCircleOutline} />
                  </div>
                ) : null}
              </Card>
            </Enter>

            <Enter delay={step(3)}>
              <Card title={t('expenses.entrySection')}>
                {!shownDay?.expenses.length ? (
                  <div className={styles.empty}>
                    <IoReceiptOutline size={22} aria-hidden="true" />
                    <p className={styles.emptyTitle}>{t('expenses.noneToday')}</p>
                    {canLog ? <p className={styles.emptyBody}>{t('expenses.noneTodayHint')}</p> : null}
                  </div>
                ) : (
                  <ul className={styles.entries}>
                    {shownDay.expenses.map((expense) => (
                      <li key={expense.id} className={styles.entry}>
                        <div className={styles.entryText}>
                          <p className={styles.entryCategory}>{categoryLabel(expense.category, t)}</p>
                          {expense.note ? <p className={styles.entryNote}>{expense.note}</p> : null}
                          <p className={styles.entryMeta}>
                            {formatTime(expense.createdAt, t)}
                            {expense.recordedByMembership?.user?.name
                              ? ` · ${t('expenses.by', { name: expense.recordedByMembership.user.name })}`
                              : ''}
                          </p>
                        </div>
                        <span className={styles.entryAmount}>{money(expense.amount)}</span>
                        {canLog ? (
                          <button
                            type="button"
                            className={styles.remove}
                            onClick={() => void handleRemove(expense)}
                            disabled={removingId === expense.id}
                            aria-label={`${t('expenses.delete')}: ${categoryLabel(expense.category, t)}`}
                            title={t('expenses.delete')}
                          >
                            <IoTrashOutline size={16} aria-hidden="true" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Enter>
          </div>

          <div className={styles.column}>
            <Enter delay={step(4)}>
              <Card title={t('expenses.monthSection')}>
                <MonthCursor label={label} onPrev={goPrev} onNext={goNext} canGoNext={canGoNext} />
                {!shownMonth?.expenseCount ? (
                  <p className={styles.monthEmpty}>{t('expenses.monthEmpty')}</p>
                ) : (
                  <>
                    <p className={styles.monthTotal}>
                      {t('expenses.monthTotal', { count: shownMonth.expenseCount, amount: money(shownMonth.totalSpent) })}
                    </p>
                    <Breakdown rows={shownMonth.breakdown} money={money} />
                    <h3 className={styles.subTitle}>{t('expenses.breakdownSection')}</h3>
                    <ul className={styles.days}>
                      {shownMonth.days.map((entry) => (
                        <li key={entry.date} className={styles.dayRow}>
                          <span className={styles.dayDate}>{formatDate(dateKeyFromApi(entry.date), t)}</span>
                          <span className={styles.dayAmount}>{money(entry.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </Enter>

            {/* Requirement 17's day-end export: today, at the branch being looked at. */}
            {canExport && branchId && businessId ? (
              <Enter delay={step(5)}>
                <ExportActions
                  report={exportPreview.report}
                  periodLabel={t('expenses.todaySection')}
                  onExportWorkbook={() => downloadDayEndWorkbook(businessId, { branchId })}
                  onExportDocument={() => printDayEndDocument(businessId, { branchId })}
                />
              </Enter>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
