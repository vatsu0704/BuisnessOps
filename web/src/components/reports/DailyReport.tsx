import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoChevronDown, IoChevronUp } from 'react-icons/io5';
import { useMonthCursor } from '@shared/hooks/useMonthCursor';
import { costMetrics } from '@shared/utils/costMetrics';
import {
  ALL_BRANCHES,
  dailyChoices,
  dailyTotal,
  daysFor,
  listedDays,
  resolveChoice,
  type ReportDay,
} from '@shared/utils/dailyReport';
import { getBranchDaily } from '@/api/analytics';
import { extractErrorMessage } from '@/api/client';
import ChipGroup from '@/components/ui/ChipGroup';
import ErrorBanner from '@/components/ui/ErrorBanner';
import MonthCursor from '@/components/ui/MonthCursor';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import type { DailyReport as DailyReportData } from '@/types/analytics';
import { cx } from '@/utils/cx';
import { formatDate, monthKey, todayISO } from '@/utils/date';
import { formatAmount } from '@/utils/format';
import MetricGrid from './MetricGrid';
import card from './ReportCard.module.css';
import styles from './DailyReport.module.css';

/**
 * Reports, day by day — requirement 34's Per day, the app's `DailyReportSection`.
 *
 * One month at a time, each day with what came in, what it cost and what was
 * left. Variable and daily costs fall on the day they happened; rent and wages
 * are spread evenly over the month's days, so a day's profit is a fair one. The
 * month's own figures sit at the top, and they are the sum of the days below.
 *
 * The days are rows that open on a narrow window and one table on a wide one —
 * the same figures either way. Its data is read by this view alone, so it stays
 * local: fetched on mount, on a month change, on Refresh and when the tab
 * comes back into view.
 */
export default function DailyReport({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { month, year, label, goPrev, goNext, canGoNext, isCurrentMonth } = useMonthCursor();
  const key = monthKey(month, year);

  const [report, setReport] = useState<DailyReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(ALL_BRANCHES);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setReport(await getBranchDaily(businessId, { month: key }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, key]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useRefreshOnFocus(load, { onMount: false });

  // Only the month asked for: a slow answer for the month before never shows under this one.
  const shown = report && report.month === key ? report : null;
  const choices = useMemo(() => dailyChoices(shown), [shown]);
  const choice = resolveChoice(shown, selected);
  const days = useMemo(() => daysFor(shown, choice), [shown, choice]);
  const listed = listedDays(days, isCurrentMonth ? todayISO() : null);
  const total = useMemo(() => dailyTotal(days), [days]);

  const currency = shown?.currency ?? 'INR';
  const nameOf = (id: string) =>
    id === ALL_BRANCHES
      ? t('reports.allBranches')
      : (shown?.branches.find((row) => row.branchId === id)?.branchName ?? '');
  const rawMaterialKey =
    choice === ALL_BRANCHES ? 'reports.variableIncludesVendors' : 'reports.variableIncludesMaterial';
  const money = (value: number | string) => formatAmount(Number(value), currency);
  const splitOf = (day: ReportDay) =>
    costMetrics(day, { t, currency, rawMaterial: day.rawMaterial, rawMaterialKey, wages: 0, fixedShared: true });

  return (
    <div className={styles.wrap}>
      <MonthCursor label={label} onPrev={goPrev} onNext={goNext} canGoNext={canGoNext} />

      {choices.length > 1 ? (
        // Wrapping chips: any number of branches, and a name in Gujarati runs long.
        <ChipGroup
          name="reports-day-branch"
          label={t('web.reports.branchColumn')}
          hideLabel
          options={choices.map((id) => ({ value: id, label: nameOf(id) }))}
          value={choice}
          onChange={setSelected}
        />
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}
      {isLoading && !shown ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : null}

      {shown ? (
        <section className={card.card} aria-labelledby="day-total-label">
          <p className={card.caption}>{label}</p>
          <h2 id="day-total-label" className={cx(card.sectionTitle, card.titleGap)}>
            {t('reports.totalProfit')}
          </h2>
          <p className={cx(card.hero, total.profit < 0 && card.loss)}>{money(total.profit)}</p>
          <MetricGrid
            metrics={[
              {
                label: t('reports.totalBusiness'),
                value: money(total.business),
                caption: t('reports.saleCount', { count: total.saleCount }),
              },
              ...costMetrics(total, { t, currency, rawMaterial: total.rawMaterial, rawMaterialKey, wages: 0 }),
            ]}
          />
          <p className={card.note}>{t('reports.fixedSpreadNote')}</p>
        </section>
      ) : null}

      {listed.length > 0 ? (
        <>
          <ul className={styles.rows}>
            {listed.map((day) => {
              const open = openDay === day.day;
              return (
                <li key={day.day} className={cx(styles.dayRow, open && styles.dayRowOpen)}>
                  <button
                    type="button"
                    className={styles.dayButton}
                    aria-expanded={open}
                    onClick={() => setOpenDay(open ? null : day.day)}
                  >
                    <span className={styles.dayHead}>
                      <span className={styles.dayLabel}>{formatDate(day.day, t)}</span>
                      {open ? (
                        <IoChevronUp size={16} aria-hidden="true" />
                      ) : (
                        <IoChevronDown size={16} aria-hidden="true" />
                      )}
                    </span>
                    {/* Three figures that each grow: they wrap onto a second line
                        in Gujarati at 320px rather than squeezing. */}
                    <span className={styles.figures}>
                      <Figure label={t('reports.dayBusiness')} value={money(day.business)} />
                      <Figure label={t('reports.dayCost')} value={money(day.totalCost)} tone="cost" />
                      <Figure
                        label={t('reports.dayProfit')}
                        value={money(day.profit)}
                        tone={day.profit < 0 ? 'loss' : 'good'}
                      />
                    </span>
                  </button>
                  {open ? <MetricGrid metrics={splitOf(day)} /> : null}
                </li>
              );
            })}
          </ul>

          <section className={cx(card.card, styles.tableCard)} aria-labelledby="day-table-title">
            <h2 id="day-table-title" className={card.sectionTitle}>
              {t('web.reports.dayTableTitle')}
            </h2>
            <div className={styles.scroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.dayHeadCell}>
                      {t('web.reports.dayColumn')}
                    </th>
                    <th scope="col">{t('reports.totalBusiness')}</th>
                    <th scope="col">{t('reports.variableExpenses')}</th>
                    <th scope="col">
                      {t('reports.fixedExpenses')}
                      <span className={styles.headNote}>{t('reports.fixedShared')}</span>
                    </th>
                    <th scope="col">{t('reports.dailyExpenses')}</th>
                    <th scope="col">{t('reports.totalCost')}</th>
                    <th scope="col">{t('reports.totalProfit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((day) => (
                    <tr key={day.day}>
                      <th scope="row" className={styles.dayCell}>
                        {formatDate(day.day, t)}
                      </th>
                      <td>{money(day.business)}</td>
                      <td className={styles.cost}>{money(day.variableExpenses)}</td>
                      <td className={styles.cost}>{money(day.fixedExpenses)}</td>
                      <td className={styles.cost}>{money(day.dailyExpenses)}</td>
                      <td className={styles.cost}>{money(day.totalCost)}</td>
                      <td className={cx(styles.profit, day.profit < 0 ? styles.loss : styles.good)}>
                        {money(day.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {shown && listed.length === 0 ? <p className={styles.empty}>{t('reports.dayNothingYet')}</p> : null}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'cost' | 'good' | 'loss' }) {
  return (
    <span className={styles.figure}>
      <span className={styles.figureLabel}>{label}</span>
      <span
        className={cx(
          styles.figureValue,
          tone === 'cost' && styles.cost,
          tone === 'good' && styles.good,
          tone === 'loss' && styles.loss
        )}
      >
        {value}
      </span>
    </span>
  );
}
