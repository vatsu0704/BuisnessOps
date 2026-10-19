import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import {
  IoChevronForward,
  IoCubeOutline,
  IoFingerPrintOutline,
  IoPersonAddOutline,
  IoPersonOutline,
  IoPlayCircleOutline,
  IoPrintOutline,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { useMonthCursor } from '@shared/hooks/useMonthCursor';
import { extractErrorMessage } from '@/api/client';
import { getDailyRoster, markAttendance } from '@/api/attendance';
import { listSalarySlips, listStaffSalarySlips, printSalarySlip } from '@/api/payroll';
import { listStaffMembers } from '@/api/staff';
import BranchPicker from '@/components/branches/BranchPicker';
import AttendanceStatusPicker from '@/components/staff/AttendanceStatusPicker';
import AttendanceStatusPill from '@/components/staff/AttendanceStatusPill';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import InfoCard from '@/components/ui/InfoCard';
import MonthCursor from '@/components/ui/MonthCursor';
import PageHeader from '@/components/ui/PageHeader';
import Pill from '@/components/ui/Pill';
import Spinner from '@/components/ui/Spinner';
import StatTile from '@/components/ui/StatTile';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { useMyStaffMember } from '@/hooks/useMyStaffMember';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { AttendanceStatus, DailyRoster, SalarySlip, StaffMember } from '@/types/staffing';
import { cx } from '@/utils/cx';
import { monthKeyLabel, todayISO } from '@/utils/date';
import { formatAmountPrecise } from '@/utils/format';
import { hasCapability } from '@/utils/permissions';
import styles from './StaffPage.module.css';

/**
 * The Staff page — the app's Staff tab, one page for two kinds of reader.
 *
 * Whoever may add staff (`staff:create`) sees today's roster for a branch, with a
 * quick mark on each row, the staff list, and — with `payroll:run` — the month's
 * payslips and the way into a payroll run. Everyone else sees their own
 * attendance and payslips, or a sentence saying they are not on the staff here.
 * The server enforces the same split, so the wrong view would only get refusals.
 *
 * The branch is in the address (`?branch=`), as on Expenses and the counter.
 */
export default function StaffPage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { branches } = useBranches();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();
  const { staffMember: me, isStaff, isLoading: isResolvingMe, refresh: refreshMe } = useMyStaffMember();
  const [searchParams, setSearchParams] = useSearchParams();

  const isManager = hasCapability(membership, 'staff:create');
  const canRunPayroll = hasCapability(membership, 'payroll:run');
  const canViewRoster = hasCapability(membership, 'attendance:viewRoster');

  const requested = searchParams.get('branch');
  const branchId = branches.find((b) => b.id === requested)?.id ?? branches[0]?.id ?? null;
  const monthYear = `${year}-${String(month).padStart(2, '0')}`;
  const myStaffId = me?.id ?? null;

  const [roster, setRoster] = useState<DailyRoster | null>(null);
  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request's answer is shown: a quick branch switch must never
  // leave one branch's roster under another's name.
  const latest = useRef(0);

  const load = useCallback(async () => {
    // Somebody who is not a manager has nothing to load until they are known to be staff.
    if (!businessId || (!isManager && !myStaffId)) return;
    const request = ++latest.current;
    try {
      if (isManager) {
        const [staffList, slipList, rosterData] = await Promise.all([
          listStaffMembers(businessId),
          canRunPayroll ? listSalarySlips(businessId, { monthYear }) : Promise.resolve([]),
          canViewRoster && branchId ? getDailyRoster(businessId, branchId, todayISO()) : Promise.resolve(null),
        ]);
        if (request !== latest.current) return;
        setStaff(staffList);
        setSlips(slipList);
        setRoster(rosterData);
        setRosterFor(branchId);
      } else if (myStaffId) {
        const mine = await listStaffSalarySlips(businessId, myStaffId);
        if (request !== latest.current) return;
        setSlips(mine);
      }
      setError(null);
    } catch (err) {
      // A failed refresh keeps what was on the page and says why beside it.
      if (request === latest.current) setError(extractErrorMessage(err));
    } finally {
      if (request === latest.current) setHasLoaded(true);
    }
  }, [businessId, isManager, canRunPayroll, canViewRoster, monthYear, branchId, myStaffId]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefreshOnFocus(
    () => {
      void refreshMe();
      return load();
    },
    { onMount: false }
  );

  async function handleQuickMark(staffMemberId: string, status: AttendanceStatus) {
    if (!businessId) return;
    setSavingId(staffMemberId);
    setError(null);
    try {
      // Correcting today from the roster directly, rather than from the person's page.
      await markAttendance(businessId, staffMemberId, { date: todayISO(), status });
      setMarkingId(null);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingId(null);
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

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '';
  const shownRoster = roster && rosterFor === branchId ? roster : null;

  function slipRow(slip: SalarySlip, title: string) {
    return (
      <li key={slip.id} className={styles.row}>
        <div className={styles.rowText}>
          <p className={styles.name}>{title}</p>
          <p className={styles.meta}>{formatAmountPrecise(slip.netPay, slip.currency)}</p>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => void handlePrint(slip)}
          disabled={printingId === slip.id}
          aria-label={`${t('web.staff.printPayslip')}: ${title}`}
          title={t('web.staff.printPayslip')}
        >
          {printingId === slip.id ? <Spinner size={14} /> : <IoPrintOutline size={16} aria-hidden="true" />}
        </button>
      </li>
    );
  }

  const header = <PageHeader title={t('staffHub.title')} />;

  if (!isManager) {
    return (
      <div className={styles.page}>
        {header}
        {error ? <ErrorBanner key={error} message={error} /> : null}
        {isResolvingMe ? (
          <div className={styles.loading}>
            <Spinner size={24} />
          </div>
        ) : !isStaff ? (
          <Enter delay={step(1)}>
            <Card>
              <div className={styles.notice}>
                <IoPersonOutline size={22} aria-hidden="true" />
                <p>{t('staffHub.notStaff')}</p>
              </div>
            </Card>
          </Enter>
        ) : (
          <div className={styles.narrow}>
            <Enter delay={step(1)}>
              <InfoCard
                icon={IoFingerPrintOutline}
                title={t('staffHub.mySection')}
                subtitle={t('settings.attendanceSubtitle')}
                to={pathTo('attendance')}
              />
            </Enter>
            <Enter delay={step(2)}>
              <Card title={t('staffHub.mySlips')}>
                {!hasLoaded ? (
                  <div className={styles.loading}>
                    <Spinner size={20} />
                  </div>
                ) : slips.length === 0 ? (
                  <p className={styles.empty}>{t('staffHub.noSlips')}</p>
                ) : (
                  <ul className={styles.list}>{slips.map((slip) => slipRow(slip, monthKeyLabel(slip.monthYear, t)))}</ul>
                )}
              </Card>
            </Enter>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {header}

      {branches.length > 1 ? (
        <Enter delay={step(1)}>
          <BranchPicker
            name="staff-branch"
            legend={t('expenses.branch')}
            hideLegend
            branches={branches}
            value={branchId}
            onChange={(id) => setSearchParams({ branch: id }, { replace: true })}
            icon={(branch) => (branch.kind === 'WAREHOUSE' ? IoCubeOutline : IoStorefrontOutline)}
          />
        </Enter>
      ) : null}

      {error ? <ErrorBanner key={error} message={error} /> : null}

      {!hasLoaded ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.column}>
            {shownRoster ? (
              <Enter delay={step(2)}>
                <Card title={t('roster.title')}>
                  {shownRoster.isWeeklyOff ? (
                    <p className={styles.calm}>{t('roster.weekOffDay')}</p>
                  ) : shownRoster.holiday ? (
                    <p className={styles.calm}>{t('roster.holidayDay', { name: shownRoster.holiday.name })}</p>
                  ) : (
                    <div className={styles.stats}>
                      <StatTile
                        label={t('roster.summaryPresent')}
                        value={shownRoster.summary.present}
                        accent="var(--color-success)"
                      />
                      <StatTile
                        label={t('roster.summaryAbsent')}
                        value={shownRoster.summary.absent}
                        accent="var(--color-error)"
                      />
                      <StatTile label={t('roster.summaryUnmarked')} value={shownRoster.summary.unmarked} />
                    </div>
                  )}

                  {shownRoster.entries.length === 0 ? (
                    <p className={styles.empty}>{t('roster.noStaff')}</p>
                  ) : (
                    <ul className={styles.list}>
                      {shownRoster.entries.map((entry) => {
                        const open = markingId === entry.staffMember.id;
                        return (
                          <li key={entry.staffMember.id} className={styles.rosterItem}>
                            <button
                              type="button"
                              className={styles.rosterRow}
                              aria-expanded={open}
                              onClick={() => setMarkingId(open ? null : entry.staffMember.id)}
                            >
                              <span className={styles.rowText}>
                                <span className={styles.name}>{entry.staffMember.name}</span>
                                <span className={styles.meta}>{entry.staffMember.role}</span>
                              </span>
                              {entry.attendance ? (
                                <AttendanceStatusPill status={entry.attendance.status} />
                              ) : (
                                <Pill label={t('roster.unmarked')} tone="muted" />
                              )}
                            </button>
                            {open ? (
                              <div className={styles.markRow}>
                                <AttendanceStatusPicker
                                  name={`roster-${entry.staffMember.id}`}
                                  label={t('roster.markFor', { name: entry.staffMember.name })}
                                  hideLabel
                                  value={entry.attendance?.status ?? null}
                                  disabled={savingId === entry.staffMember.id}
                                  onChange={(status) => void handleQuickMark(entry.staffMember.id, status)}
                                />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </Enter>
            ) : null}

            <Enter delay={step(3)}>
              <InfoCard
                icon={IoPersonAddOutline}
                title={t('staff.add')}
                subtitle={t('staff.addSubtitle')}
                to={pathTo('addStaff')}
              />
            </Enter>
          </div>

          <div className={styles.column}>
            <Enter delay={step(4)}>
              <Card title={t('staffHub.staffSection')}>
                {staff.length === 0 ? (
                  <p className={styles.empty}>{t('staff.empty')}</p>
                ) : (
                  <ul className={styles.list}>
                    {staff.map((member) => (
                      <li key={member.id}>
                        <Link to={pathTo('staffDetail', { staffMemberId: member.id })} className={styles.linkRow}>
                          <span className={styles.rowText}>
                            <span className={cx(styles.name, member.status === 'INACTIVE' && styles.nameInactive)}>
                              {member.name}
                            </span>
                            <span className={styles.meta}>
                              {[member.role, branchName(member.branchId)].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {member.status === 'INACTIVE' ? <Pill label={t('editStaff.inactive')} tone="muted" /> : null}
                          <IoChevronForward className={styles.chevron} size={16} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Enter>

            {canRunPayroll ? (
              <Enter delay={step(5)}>
                <Card title={t('staffHub.payrollSection')}>
                  <MonthCursor label={label} onPrev={goPrev} onNext={goNext} canGoNext={canGoNext} />
                  {slips.length === 0 ? (
                    <p className={styles.empty}>{t('staffHub.noSlips')}</p>
                  ) : (
                    <ul className={styles.list}>
                      {slips.map((slip) => slipRow(slip, slip.staffMember?.name ?? slip.monthYear))}
                    </ul>
                  )}
                  <Link
                    className={styles.runButton}
                    to={`${pathTo('payrollRun', { year, month })}${branchId ? `?branch=${encodeURIComponent(branchId)}` : ''}`}
                  >
                    <IoPlayCircleOutline size={18} aria-hidden="true" />
                    <span>{t('staffHub.runPayroll', { month: label })}</span>
                  </Link>
                </Card>
              </Enter>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
