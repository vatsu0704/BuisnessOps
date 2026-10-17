import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IoLayersOutline, IoRefresh } from 'react-icons/io5';
import { downloadMonthEndWorkbook, printMonthEndDocument } from '@/api/exports';
import ExportActions from '@/components/ExportActions';
import AttentionSection from '@/components/reports/AttentionSection';
import BranchMonthTable from '@/components/reports/BranchMonthTable';
import BranchProfitCard from '@/components/reports/BranchProfitCard';
import CrossBusinessSection from '@/components/reports/CrossBusinessSection';
import DailyReport from '@/components/reports/DailyReport';
import MonthStrip from '@/components/reports/MonthStrip';
import NetProfitCard from '@/components/reports/NetProfitCard';
import { rankBranches } from '@/components/reports/ranking';
import ChipGroup from '@/components/ui/ChipGroup';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Spinner from '@/components/ui/Spinner';
import { RANGE_OPTIONS, useBranchAnalytics, useCrossBusinessAnalytics, type RangeMonths } from '@/hooks/useBranchAnalytics';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useExportPreview } from '@/hooks/useExportPreview';
import { roleHas } from '@/permissions';
import { canOpenRoute, pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import { cx } from '@/utils/cx';
import { monthKeyLabel } from '@/utils/date';
import styles from './ReportsPage.module.css';

type Scope = 'business' | 'all';
type View = 'day' | 'month';

/**
 * Requirements 13, 15 and 34 — the app's Reports screen: Per month (every
 * branch, month by month, with total profit, and the month-end export of
 * requirement 17) and Per day (one month, day by day, with fixed costs spread
 * over its days).
 *
 * The same pieces as the app — the range, the scope for an account in more than
 * one business, the month strip, the business's total profit, the branches that
 * fell, one card per branch — plus, on a window wide enough to hold it, the
 * branch × month table requirement 15 describes.
 */
export default function ReportsPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { report, isLoading, error, monthsBack, setMonthsBack, refresh, range } = useBranchAnalytics();

  const [view, setView] = useState<View>('month');
  // Refresh asks the Per day view to fetch again; it holds its own data.
  const [dayRefreshKey, setDayRefreshKey] = useState(0);

  // Which month every card shows; the latest in the window until one is chosen.
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('business');

  // The scope appears only when there is something to compare: one business has
  // no "across businesses" view, it has this one.
  const user = useAuthStore((s) => s.user);
  const readableBusinessCount = useMemo(
    () =>
      (user?.memberships ?? []).filter(
        (membership) => membership.status === 'ACTIVE' && roleHas(membership.role, 'analytics:viewBusiness')
      ).length,
    [user]
  );
  const showAll = scope === 'all' && readableBusinessCount > 1;
  const cross = useCrossBusinessAnalytics(range, showAll);

  const months = report?.months ?? [];
  const month = focusMonth && months.includes(focusMonth) ? focusMonth : (months[months.length - 1] ?? '');
  const ranked = useMemo(() => rankBranches(report?.branches ?? [], month), [report, month]);
  const businessCell = report?.business?.months.find((cell) => cell.month === month);

  // One business's export: "all businesses" spans tenants and an export belongs to one.
  const exportPreview = useExportPreview('MONTH', { month }, !showAll && !!month);

  const refreshing = isLoading && !!report;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <button
            type="button"
            className={styles.refresh}
            onClick={() => {
              if (view === 'day') {
                setDayRefreshKey((key) => key + 1);
                return;
              }
              void refresh();
              if (showAll) void cross.refresh();
            }}
            disabled={view === 'month' && refreshing}
            aria-label={t('web.home.refresh')}
            title={t('web.home.refresh')}
          >
            <IoRefresh size={18} className={cx(refreshing && styles.spinning)} aria-hidden="true" />
          </button>
        }
      />

      <Enter delay={step(1)} className={styles.controls}>
        <ChipGroup<View>
          name="reports-view"
          label={t('web.reports.view')}
          hideLabel
          options={[
            { value: 'day', label: t('reports.perDay') },
            { value: 'month', label: t('reports.perMonth') },
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'month' ? (
          <ChipGroup
            name="reports-range"
            label={t('web.reports.range')}
            hideLabel
            options={RANGE_OPTIONS.map((option) => ({
              value: String(option),
              label: t('reports.rangeMonths', { count: option }),
            }))}
            value={String(monthsBack)}
            onChange={(value) => setMonthsBack(Number(value) as RangeMonths)}
          />
        ) : null}
        {view === 'month' && readableBusinessCount > 1 ? (
          <ChipGroup<Scope>
            name="reports-scope"
            label={t('web.reports.scope')}
            hideLabel
            options={[
              { value: 'business', label: t('reports.scopeThisBusiness') },
              { value: 'all', label: t('reports.scopeAllBusinesses') },
            ]}
            value={scope}
            onChange={setScope}
          />
        ) : null}
        {/* What Variable, Fixed and Daily hold — and, for an owner, where to change it. */}
        {canOpenRoute(membership, 'expenseCategories') ? (
          <Link to={pathTo('expenseCategories')} className={styles.costLink}>
            <IoLayersOutline size={16} aria-hidden="true" />
            <span>{t('reports.howCostsAreGrouped')}</span>
          </Link>
        ) : null}
      </Enter>

      {view === 'day' ? (
        <Enter delay={step(2)}>
          <DailyReport refreshKey={dayRefreshKey} />
        </Enter>
      ) : showAll ? (
        <Enter delay={step(2)}>
          <CrossBusinessSection cross={cross.cross} isLoading={cross.isLoading} error={cross.error} />
        </Enter>
      ) : (
        <>
          {months.length > 0 ? (
            <Enter delay={step(2)}>
              <MonthStrip months={months} selected={month} onSelect={setFocusMonth} label={t('web.reports.month')} />
            </Enter>
          ) : null}

          {/* Beside the figures, not instead of them: a failed refresh does not
              empty a page that was reading correctly a moment ago. */}
          {error ? <ErrorBanner message={error} /> : null}

          {isLoading && !report ? (
            <div className={styles.loading}>
              <Spinner size={24} />
            </div>
          ) : null}

          {report && (businessCell || report.branches.length > 0) ? (
            <div className={styles.summary}>
              {report.business && businessCell ? (
                <Enter delay={step(3)}>
                  <NetProfitCard
                    cell={businessCell}
                    currency={report.currency}
                    mixedCurrency={report.mixedCurrency}
                  />
                </Enter>
              ) : null}
              <div className={styles.column}>
                {report.branches.length > 0 ? (
                  <Enter delay={step(4)}>
                    <AttentionSection rows={report.branches} />
                  </Enter>
                ) : null}
                {month && businessId ? (
                  <Enter delay={step(4)}>
                    <ExportActions
                      report={exportPreview.report}
                      periodLabel={monthKeyLabel(month, t)}
                      onExportWorkbook={() => downloadMonthEndWorkbook(businessId, { month })}
                      onExportDocument={() => printMonthEndDocument(businessId, { month })}
                    />
                  </Enter>
                ) : null}
              </div>
            </div>
          ) : null}

          {report && report.branches.length === 0 && !isLoading ? (
            <p className={styles.empty}>{t('reports.noBranches')}</p>
          ) : null}

          {report && month ? (
            <Enter delay={step(5)}>
              <BranchMonthTable rows={ranked} months={months} focusMonth={month} onSelectMonth={setFocusMonth} />
            </Enter>
          ) : null}

          {ranked.length > 0 ? (
            <div className={styles.cards}>
              {ranked.map((row, index) => (
                // Capped stagger: forty branches must not mean a three-second wait for the last card.
                <Enter key={row.branchId} delay={step(Math.min(5 + index, 8))}>
                  <BranchProfitCard row={row} month={month} onSelectMonth={setFocusMonth} />
                </Enter>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
