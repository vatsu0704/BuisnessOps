import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { IoCreateOutline, IoDocumentTextOutline, IoPrintOutline, IoRemoveCircleOutline } from 'react-icons/io5';
import { useMonthCursor } from '@shared/hooks/useMonthCursor';
import { extractErrorMessage } from '@/api/client';
import { getStaffAttendance, markAttendance } from '@/api/attendance';
import { generateSalarySlip, getStaffMonthSummary, listStaffSalarySlips, printSalarySlip } from '@/api/payroll';
import { getStaffMember } from '@/api/staff';
import ButtonLink from '@/components/ui/ButtonLink';
import AttendanceStatusPicker from '@/components/staff/AttendanceStatusPicker';
import AttendanceStatusPill from '@/components/staff/AttendanceStatusPill';
import MonthSummaryStrip from '@/components/staff/MonthSummaryStrip';
import PunchTrace from '@/components/staff/PunchTrace';
import Card from '@/components/ui/Card';
import DateField from '@/components/ui/DateField';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import MonthCursor from '@/components/ui/MonthCursor';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { canOpenRoute, pathTo } from '@/routes/paths';
import { useAuthStore } from '@/store/authStore';
import { step } from '@/theme/motion';
import type { AttendanceRecord, AttendanceStatus, MonthSummary, SalarySlip, StaffMember } from '@/types/staffing';
import { dateKeyFromApi, daysInMonth, formatDate, monthKeyLabel, todayISO } from '@/utils/date';
import { formatAmount, formatAmountPrecise } from '@/utils/format';
import { hasCapability } from '@/utils/permissions';
import { parseOptionalNumber } from '@/utils/validation';
import styles from './StaffDetailPage.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One staff member — the app's Staff detail screen: who they are and their pay,
 * the month as payroll sees it, every day with when and where they punched,
 * marking a day by hand, a payslip for the month, and the payslips so far.
 *
 * The month cursor drives all of it, the day being marked included: it is held
 * inside the month on screen, so nobody writes into September while reading
 * March and then finds the day missing from the list they refreshed.
 */
export default function StaffDetailPage() {
  const { staffMemberId = '' } = useParams();
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const currency = useAuthStore((s) => s.business?.defaultCurrency) ?? 'INR';
  const { branches } = useBranches();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();
  const canManagePayroll = hasCapability(membership, 'payroll:run');
  const canMark = hasCapability(membership, 'attendance:markOthers');

  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [markDate, setMarkDate] = useState(todayISO);
  // Unset rather than ABSENT: a destructive default one click from Save is how
  // someone gets marked absent by accident.
  const [markStatus, setMarkStatus] = useState<AttendanceStatus | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [deductions, setDeductions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const latest = useRef(0);

  const monthKey = `${year}-${pad(month)}`;

  const load = useCallback(async () => {
    if (!businessId || !staffMemberId) return;
    const request = ++latest.current;
    try {
      const [member, attendance, salarySlips, monthSummary] = await Promise.all([
        getStaffMember(businessId, staffMemberId),
        getStaffAttendance(businessId, staffMemberId, month, year),
        listStaffSalarySlips(businessId, staffMemberId),
        getStaffMonthSummary(businessId, staffMemberId, month, year),
      ]);
      if (request !== latest.current) return;
      setStaffMember(member);
      setRecords(attendance);
      setSlips(salarySlips);
      setSummary(monthSummary);
      setLoadedMonth(`${year}-${pad(month)}`);
      setError(null);
    } catch (err) {
      if (request === latest.current) setError(extractErrorMessage(err));
    }
  }, [businessId, staffMemberId, month, year]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefreshOnFocus(load, { onMount: false });

  // Held inside the visible month: today when it falls inside, else the 1st.
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${pad(daysInMonth(month, year))}`;
  const today = todayISO();
  const markMax = monthEnd < today ? monthEnd : today;
  useEffect(() => {
    setMarkDate((current) =>
      current >= monthStart && current <= monthEnd
        ? current
        : today >= monthStart && today <= monthEnd
          ? today
          : monthStart
    );
  }, [monthStart, monthEnd, today]);

  async function handleMark(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !markStatus) return;
    setIsMarking(true);
    setError(null);
    try {
      await markAttendance(businessId, staffMemberId, { date: markDate, status: markStatus });
      setMarkStatus(null);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsMarking(false);
    }
  }

  const deductionsParsed = parseOptionalNumber(deductions);
  const deductionsInvalid = deductionsParsed === null;
  const canGenerate = !!staffMember?.baseSalary && !deductionsInvalid && !isGenerating && canManagePayroll;

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !canGenerate) return;
    setIsGenerating(true);
    setError(null);
    try {
      await generateSalarySlip(businessId, staffMemberId, { month, year, deductions: deductionsParsed ?? undefined });
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handlePrint(slip: SalarySlip) {
    if (!businessId) return;
    setPrintingId(slip.id);
    setError(null);
    try {
      await printSalarySlip(businessId, slip);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPrintingId(null);
    }
  }

  const branchName = staffMember ? (branches.find((b) => b.id === staffMember.branchId)?.name ?? staffMember.branchId) : '';
  const monthShown = loadedMonth === monthKey;

  return (
    <div className={styles.page}>
      <PageHeader
        title={staffMember?.name ?? t('staffDetail.title')}
        backTo={pathTo('staff')}
        actions={
          staffMember && canOpenRoute(membership, 'editStaff') ? (
            <ButtonLink
              to={pathTo('editStaff', { staffMemberId })}
              title={t('staffDetail.edit')}
              icon={IoCreateOutline}
              variant="secondary"
            />
          ) : undefined
        }
      />

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {!staffMember ? (
        error ? null : (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        )
      ) : (
        <div className={styles.layout}>
          <div className={styles.column}>
            <Enter delay={step(1)}>
              <Card>
                <div className={styles.identity}>
                  <div className={styles.identityText}>
                    <p className={styles.meta}>{staffMember.role}</p>
                    <p className={styles.meta}>{branchName}</p>
                  </div>
                  {staffMember.status === 'INACTIVE' ? <Pill label={t('editStaff.inactive')} tone="muted" /> : null}
                </div>
                {staffMember.baseSalary ? (
                  <p className={styles.salary}>
                    {t('staffDetail.baseSalary', { amount: formatAmount(Number(staffMember.baseSalary), currency) })}
                  </p>
                ) : (
                  <p className={styles.warn}>{t('staffDetail.noSalary')}</p>
                )}
              </Card>
            </Enter>

            <Enter delay={step(2)}>
              <MonthCursor label={label} onPrev={goPrev} onNext={goNext} canGoNext={canGoNext} />
            </Enter>

            {summary && monthShown ? (
              <Enter delay={step(3)}>
                <Card title={t('monthSummary.title')}>
                  <MonthSummaryStrip summary={summary} />
                </Card>
              </Enter>
            ) : null}

            <Enter delay={step(4)}>
              <Card>
                {!monthShown ? (
                  <div className={styles.loading}>
                    <Spinner size={20} />
                  </div>
                ) : records.length === 0 ? (
                  <p className={styles.empty}>{t('attendance.noHistory')}</p>
                ) : (
                  <ul className={styles.days}>
                    {records.map((record) => (
                      <li key={record.id} className={styles.day}>
                        <div className={styles.dayHead}>
                          <span className={styles.dayDate}>{formatDate(dateKeyFromApi(record.date), t)}</span>
                          <AttendanceStatusPill status={record.status} />
                        </div>
                        <PunchTrace record={record} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Enter>
          </div>

          <div className={styles.column}>
            {canMark ? (
              <Enter delay={step(5)}>
                <Card title={t('staffDetail.markSection')}>
                  <form onSubmit={handleMark} noValidate>
                    <DateField
                      label={t('staffDetail.date')}
                      value={markDate}
                      onChange={setMarkDate}
                      min={monthStart}
                      max={markMax}
                    />
                    <AttendanceStatusPicker
                      name="staff-mark"
                      label={t('staffDetail.status')}
                      value={markStatus}
                      onChange={setMarkStatus}
                    />
                    <PrimaryButton
                      type="submit"
                      block
                      className={styles.formButton}
                      title={t('staffDetail.markSubmit')}
                      loading={isMarking}
                      disabled={!markStatus || !markDate}
                    />
                  </form>
                </Card>
              </Enter>
            ) : null}

            {canManagePayroll ? (
              <Enter delay={step(6)}>
                <Card title={t('staffDetail.payrollSection', { month: label })}>
                  <form onSubmit={handleGenerate} noValidate>
                    {!staffMember.baseSalary ? <p className={styles.warnBlock}>{t('staffDetail.noSalaryHint')}</p> : null}
                    <FormInput
                      label={t('staffDetail.deductions')}
                      hint={t('addStaff.optional')}
                      icon={IoRemoveCircleOutline}
                      inputMode="decimal"
                      autoComplete="off"
                      value={deductions}
                      onChange={(e) => setDeductions(e.target.value)}
                      error={deductionsInvalid ? t('staffDetail.invalidNumber') : null}
                    />
                    <PrimaryButton
                      type="submit"
                      block
                      title={t('staffDetail.generateSlip')}
                      icon={IoDocumentTextOutline}
                      loading={isGenerating}
                      disabled={!canGenerate}
                    />
                  </form>
                </Card>
              </Enter>
            ) : null}

            {slips.length > 0 ? (
              <Enter delay={step(6)}>
                <Card title={t('staffDetail.pastSlips')}>
                  <ul className={styles.slips}>
                    {slips.map((slip) => (
                      <li key={slip.id} className={styles.slip}>
                        <div className={styles.slipText}>
                          <div className={styles.slipHead}>
                            <span className={styles.dayDate}>{monthKeyLabel(slip.monthYear, t)}</span>
                            <Pill
                              label={slip.status === 'FINALIZED' ? t('staffDetail.finalized') : t('staffDetail.draft')}
                              tone={slip.status === 'FINALIZED' ? 'brand' : 'muted'}
                            />
                          </div>
                          <p className={styles.meta}>{formatAmountPrecise(slip.netPay, slip.currency)}</p>
                        </div>
                        <button
                          type="button"
                          className={styles.printButton}
                          onClick={() => void handlePrint(slip)}
                          disabled={printingId === slip.id}
                          aria-label={`${t('web.staff.printPayslip')}: ${monthKeyLabel(slip.monthYear, t)}`}
                          title={t('web.staff.printPayslip')}
                        >
                          {printingId === slip.id ? <Spinner size={14} /> : <IoPrintOutline size={16} aria-hidden="true" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Enter>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
