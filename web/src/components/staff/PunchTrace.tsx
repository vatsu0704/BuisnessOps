import { useTranslation } from 'react-i18next';
import { IoLocationOutline, IoOpenOutline } from 'react-icons/io5';
import type { AttendanceRecord } from '@/types/staffing';
import { formatTime } from '@/utils/date';
import { mapLink } from '@/utils/location';
import styles from './PunchTrace.module.css';

/**
 * When and where someone punched — what an admin or manager reads to check a day
 * that happened away from a branch, the app's `PunchTrace`. A delivery agent's
 * punches are exempt from the geofence and record a place instead, and a record
 * nobody can look at is not a record.
 *
 * Renders nothing for a day marked by hand, so it can sit on every row.
 */
export default function PunchTrace({ record }: { record: AttendanceRecord | null }) {
  const { t } = useTranslation();

  const inTime = formatTime(record?.punchInAt, t);
  const outTime = formatTime(record?.punchOutAt, t);
  if (!inTime && !outTime) return null;

  // Where they finished answers "where were they?" better, so it wins when both exist.
  const lat = record?.punchOutLat ?? record?.punchInLat ?? null;
  const lng = record?.punchOutLng ?? record?.punchInLng ?? null;

  return (
    <div className={styles.trace}>
      <p className={styles.times}>
        {inTime ? <span>{t('attendance.traceIn', { time: inTime })}</span> : null}
        {outTime ? <span>{t('attendance.traceOut', { time: outTime })}</span> : null}
      </p>
      {lat !== null && lng !== null ? (
        <a
          className={styles.place}
          href={mapLink({ latitude: Number(lat), longitude: Number(lng) })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IoLocationOutline size={13} aria-hidden="true" />
          <span>{t('attendance.traceWhere')}</span>
          <IoOpenOutline size={12} aria-hidden="true" />
        </a>
      ) : (
        <p className={styles.noPlace}>{t('attendance.traceNoLocation')}</p>
      )}
    </div>
  );
}
