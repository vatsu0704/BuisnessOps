import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { IoDocumentTextOutline, IoTimeOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { previewPayrollRun, runPayroll } from '@/api/payroll';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import StatTile from '@/components/ui/StatTile';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId } from '@/hooks/useBusinessId';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { PayrollRunResult } from '@/types/staffing';
import { monthLabel } from '@/utils/date';
import { formatAmountPrecise } from '@/utils/format';
import styles from './PayrollRunPage.module.css';

/**
 * Every eligible payslip for a month in one go — the app's Payroll run screen.
 * The month is in the address (`/payroll/2026/10`) and the branch in its query,
 * as the Staff page opens it.
 *
 * Preview and run answer in the same shape, so one view shows both and the
 * figures approved are the figures paid. Whoever was skipped is listed with the
 * reason, which the server sends as a code and this page puts into words.
 */
export default function PayrollRunPage() {
  const { t } = useTranslation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const businessId = useBusinessId();
  const { branches } = useBranches();

  const month = Number(params.month);
  const year = Number(params.year);
  const valid = Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year > 2000;
  const branchId = searchParams.get('branch') ?? undefined;
  const branchName = branches.find((b) => b.id === branchId)?.name;

  const [preview, setPreview] = useState<PayrollRunResult | null>(null);
  const [result, setResult] = useState<PayrollRunResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = valid ? monthLabel(month, year, t) : '';
  const shown = result ?? preview;
  const backTo = branchId ? `${pathTo('staff')}?branch=${encodeURIComponent(branchId)}` : pathTo('staff');

  const load = useCallback(async () => {
    if (!businessId || !valid) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setPreview(await previewPayrollRun(businessId, { month, year, branchId }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, valid, month, year, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRun() {
    if (!businessId) return;
    setIsRunning(true);
    setError(null);
    try {
      setResult(await runPayroll(businessId, { month, year, branchId }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsRunning(false);
    }
  }

  const money = (value: string | number) => formatAmountPrecise(value, shown?.totals.currency ?? 'INR');

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('payrollRun.title')}
        subtitle={[label, branchName].filter(Boolean).join(' · ')}
        backTo={backTo}
      />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {isLoading ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : shown ? (
        <>
          {shown.monthInProgress ? (
            <Enter delay={step(1)}>
              <p className={styles.notice}>
                <IoTimeOutline size={16} aria-hidden="true" />
                <span>{t('payrollRun.monthInProgress')}</span>
              </p>
            </Enter>
          ) : null}

          <Enter delay={step(2)}>
            <div className={styles.totals}>
              <StatTile label={t('payrollRun.totalGross')} value={Number(shown.totals.grossPay)} formatValue={money} />
              <StatTile
                label={t('payrollRun.totalDeductions')}
                value={Number(shown.totals.deductions)}
                formatValue={money}
              />
              <StatTile
                label={t('payrollRun.totalNet')}
                value={Number(shown.totals.netPay)}
                accent="var(--color-primary)"
                formatValue={money}
              />
            </div>
          </Enter>

          <div className={styles.layout}>
            <Enter delay={step(3)}>
              <Card
                title={
                  result ? t('payrollRun.done', { count: result.generated }) : t('payrollRun.ready', { count: shown.ready })
                }
              >
                {shown.slips.length === 0 ? (
                  <p className={styles.empty}>{t('payrollRun.nothingToRun')}</p>
                ) : (
                  <ul className={styles.list}>
                    {shown.slips.map((slip) => (
                      <li key={slip.staffMemberId} className={styles.row}>
                        <div className={styles.rowText}>
                          <p className={styles.name}>{slip.name ?? slip.staffMember?.name}</p>
                          <p className={styles.meta}>
                            {formatAmountPrecise(slip.grossPay, slip.currency)} −{' '}
                            {formatAmountPrecise(slip.deductions, slip.currency)}
                          </p>
                        </div>
                        <span className={styles.net}>{formatAmountPrecise(slip.netPay, slip.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Enter>

            {shown.skipped.length > 0 ? (
              <Enter delay={step(4)}>
                <Card title={t('payrollRun.skipped', { count: shown.skipped.length })}>
                  <ul className={styles.list}>
                    {shown.skipped.map((skip) => (
                      <li key={skip.staffMemberId} className={styles.row}>
                        <p className={styles.rowText}>{skip.name}</p>
                        {/* The server sends a machine code; the words are ours. */}
                        <Pill label={t(`payrollRun.reason.${skip.reason}`)} tone="muted" />
                      </li>
                    ))}
                  </ul>
                </Card>
              </Enter>
            ) : null}
          </div>

          {!result && shown.ready > 0 ? (
            <Enter delay={step(5)} className={styles.submit}>
              <PrimaryButton
                block
                title={isRunning ? t('payrollRun.running') : t('payrollRun.run', { count: shown.ready })}
                icon={IoDocumentTextOutline}
                loading={isRunning}
                onClick={() => void handleRun()}
              />
            </Enter>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
