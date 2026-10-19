import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { IoChevronForward, IoLogInOutline, IoLogOutOutline } from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { getMyAttendance } from '@/api/attendance';
import { getWorkWeek } from '@/api/workCalendar';
import PrimaryButton from '@/components/ui/PrimaryButton';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useMyStaffMember } from '@/hooks/useMyStaffMember';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import type { AttendanceRecord } from '@/types/staffing';
import { cx } from '@/utils/cx';
import { dateKeyFromApi, formatDate, formatTime, todayISO, weekdayOfISO } from '@/utils/date';
import { punchNow } from '@/utils/punch';
import styles from './TodayPunchCard.module.css';

/**
 * Punching in, one click from opening the site — the app's `TodayPunchCard`.
 * For most of the people who use it, this is the action they open it for.
 *
 * Home lists it only for somebody with a staff record (`useMyStaffMember`), so an
 * owner who does not punch never sees an empty card. On a weekly off it says so
 * instead of asking for a punch nobody expects.
 */
export default function TodayPunchCard() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { staffMember } = useMyStaffMember();

  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayISO();
  const branchId = staffMember?.branchId;

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const now = new Date();
      const [records, workWeek] = await Promise.all([
        getMyAttendance(businessId, now.getMonth() + 1, now.getFullYear()),
        getWorkWeek(businessId).catch(() => null),
      ]);
      setRecord(records.find((r) => dateKeyFromApi(r.date) === today) ?? null);
      if (workWeek) {
        // A branch's own weekly off wins whole over the business's — the payroll rule.
        const branch = workWeek.branches.find((b) => b.id === branchId);
        setWeeklyOffDays(branch?.weeklyOffOverride ? branch.weeklyOffDays : workWeek.weeklyOffDays);
      }
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, branchId, today]);

  useRefreshOnFocus(load);

  async function handlePunch(direction: 'in' | 'out') {
    if (!businessId) return;
    setIsBusy(true);
    setError(null);
    const outcome = await punchNow(businessId, direction);
    if ('error' in outcome) setError(outcome.error);
    else setRecord(outcome.record);
    setIsBusy(false);
  }

  const isWeeklyOff = weeklyOffDays.includes(weekdayOfISO(today));
  const hasPunchedIn = !!record?.punchInAt;
  const hasPunchedOut = !!record?.punchOutAt;

  let status: string;
  if (hasPunchedOut && record?.punchInAt && record.punchOutAt) {
    status = t('today.done', { inTime: formatTime(record.punchInAt, t), outTime: formatTime(record.punchOutAt, t) });
  } else if (hasPunchedIn && record?.punchInAt) {
    status = t('today.punchedInAt', { time: formatTime(record.punchInAt, t) });
  } else if (isWeeklyOff) {
    status = t('today.weekOff');
  } else {
    status = t('today.notPunchedIn');
  }

  return (
    <section className={styles.card} aria-labelledby="today-punch-title">
      <Link to={pathTo('attendance')} className={styles.head} aria-describedby="today-punch-history">
        <span className={styles.headText}>
          <span id="today-punch-title" className={styles.label}>
            {t('today.title')}
          </span>
          <span className={styles.date}>{formatDate(today, t)}</span>
        </span>
        <span id="today-punch-history" className="visually-hidden">
          {t('today.viewHistory')}
        </span>
        <IoChevronForward className={styles.chevron} size={18} aria-hidden="true" />
      </Link>

      <p className={cx(styles.status, isWeeklyOff && !hasPunchedIn && styles.statusMuted)} aria-live="polite">
        {status}
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}

      {!hasPunchedOut ? (
        <PrimaryButton
          block
          className={styles.button}
          title={hasPunchedIn ? t('today.punchOut') : t('today.punchIn')}
          icon={hasPunchedIn ? IoLogOutOutline : IoLogInOutline}
          loading={isBusy}
          onClick={() => void handlePunch(hasPunchedIn ? 'out' : 'in')}
        />
      ) : null}
    </section>
  );
}
