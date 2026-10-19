import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IoLogInOutline, IoLogOutOutline, IoPersonOutline } from 'react-icons/io5';
import { useMonthCursor } from '@shared/hooks/useMonthCursor';
import { extractErrorMessage } from '@/api/client';
import { getMyAttendance } from '@/api/attendance';
import AttendanceStatusPill from '@/components/staff/AttendanceStatusPill';
import Card from '@/components/ui/Card';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import MonthCursor from '@/components/ui/MonthCursor';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { pathTo } from '@/routes/paths';
import { step } from '@/theme/motion';
import type { AttendanceRecord } from '@/types/staffing';
import { dateKeyFromApi, formatDate, formatTime, todayISO } from '@/utils/date';
import { punchNow } from '@/utils/punch';
import styles from './AttendancePage.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * My attendance — the app's Attendance screen: today, with the one button that
 * matters (punch in, then punch out), and the month's days under it.
 *
 * Open to everyone, as in the app: whether somebody is on a roster is the
 * server's answer, and a 404 from it is said as "not on the staff here" rather
 * than shown as a failure.
 */
export default function AttendancePage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { month, year, label, goPrev, goNext, canGoNext } = useMonthCursor();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [notStaff, setNotStaff] = useState(false);
  const [isPunching, setIsPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!businessId) return;
    const request = ++latest.current;
    try {
      const data = await getMyAttendance(businessId, month, year);
      if (request !== latest.current) return;
      setRecords(data);
      setLoadedMonth(`${year}-${pad(month)}`);
      setNotStaff(false);
      setError(null);
    } catch (err) {
      if (request !== latest.current) return;
      if ((err as { response?: { status?: number } }).response?.status === 404) setNotStaff(true);
      else setError(extractErrorMessage(err));
      setLoadedMonth(`${year}-${pad(month)}`);
    }
  }, [businessId, month, year]);

  useEffect(() => {
    void load();
  }, [load]);
  useRefreshOnFocus(load, { onMount: false });

  const today = todayISO();
  const todayRecord = records.find((r) => dateKeyFromApi(r.date) === today);
  const hasPunchedIn = !!todayRecord?.punchInAt;
  const hasPunchedOut = !!todayRecord?.punchOutAt;

  async function handlePunch() {
    if (!businessId) return;
    setIsPunching(true);
    setError(null);
    const outcome = await punchNow(businessId, hasPunchedIn ? 'out' : 'in');
    if ('error' in outcome) setError(outcome.error);
    else await load();
    setIsPunching(false);
  }

  const otherDays = records.filter((r) => dateKeyFromApi(r.date) !== today);
  const monthShown = loadedMonth === `${year}-${pad(month)}`;

  return (
    <div className={styles.page}>
      <PageHeader title={t('attendance.title')} backTo={pathTo('staff')} />

      {!loadedMonth ? (
        <div className={styles.loading}>
          <Spinner size={24} />
        </div>
      ) : notStaff ? (
        <Enter delay={step(1)}>
          <Card>
            <div className={styles.notice}>
              <IoPersonOutline size={22} aria-hidden="true" />
              <p>{t('attendance.notStaff')}</p>
            </div>
          </Card>
        </Enter>
      ) : (
        <>
          <Enter delay={step(1)}>
            <section className={styles.today} aria-labelledby="attendance-today">
              <h2 id="attendance-today" className={styles.todayLabel}>
                {t('attendance.today')}
              </h2>
              <p className={styles.todayStatus} aria-live="polite">
                {hasPunchedOut
                  ? t('attendance.doneForToday', {
                      inTime: formatTime(todayRecord?.punchInAt, t),
                      outTime: formatTime(todayRecord?.punchOutAt, t),
                    })
                  : hasPunchedIn
                    ? t('attendance.punchedInAt', { time: formatTime(todayRecord?.punchInAt, t) })
                    : t('attendance.notPunchedIn')}
              </p>
              {!hasPunchedOut ? (
                <PrimaryButton
                  block
                  className={styles.punch}
                  title={hasPunchedIn ? t('attendance.punchOut') : t('attendance.punchIn')}
                  icon={hasPunchedIn ? IoLogOutOutline : IoLogInOutline}
                  loading={isPunching}
                  onClick={() => void handlePunch()}
                />
              ) : null}
            </section>
          </Enter>

          {error ? <ErrorBanner key={error} message={error} /> : null}

          <Enter delay={step(2)}>
            <MonthCursor label={label} onPrev={goPrev} onNext={goNext} canGoNext={canGoNext} />
          </Enter>

          <Enter delay={step(3)}>
            <Card>
              {!monthShown ? (
                <div className={styles.loading}>
                  <Spinner size={20} />
                </div>
              ) : otherDays.length === 0 ? (
                <p className={styles.empty}>{t('attendance.noHistory')}</p>
              ) : (
                <ul className={styles.days}>
                  {otherDays.map((record) => (
                    <li key={record.id} className={styles.day}>
                      <span className={styles.dayDate}>{formatDate(dateKeyFromApi(record.date), t)}</span>
                      <AttendanceStatusPill status={record.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Enter>
        </>
      )}
    </div>
  );
}
