import { useTranslation } from 'react-i18next';
import Pill, { type PillTone } from '@/components/ui/Pill';
import type { AttendanceStatus } from '@/types/staffing';

/**
 * One tone per status, the same colours `AttendanceStatusPicker` uses — so the
 * colour pressed when marking a day is the colour the day wears afterwards, as in
 * the app.
 */
export const ATTENDANCE_PILL_TONE: Record<AttendanceStatus, PillTone> = {
  PRESENT: 'success',
  HALF_DAY: 'warning',
  ABSENT: 'danger',
  LEAVE: 'muted',
};

export default function AttendanceStatusPill({ status }: { status: AttendanceStatus }) {
  const { t } = useTranslation();
  return <Pill label={t(`attendanceStatus.${status}`)} tone={ATTENDANCE_PILL_TONE[status]} />;
}
