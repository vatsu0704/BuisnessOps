import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { IoCalendarClear, IoCheckmarkCircle, IoCloseCircle, IoContrast } from 'react-icons/io5';
import ChipGroup from '@/components/ui/ChipGroup';
import type { AttendanceStatus } from '@/types/staffing';

// The order they are offered in: the answer given on most days first.
const MARKABLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

// Records over every status, so a status added to the backend enum fails `tsc`
// here until it has an icon and a colour — rather than a chip with a hole in it.
const ICONS: Record<AttendanceStatus, IconType> = {
  PRESENT: IoCheckmarkCircle,
  ABSENT: IoCloseCircle,
  HALF_DAY: IoContrast,
  LEAVE: IoCalendarClear,
};

const TONES: Record<AttendanceStatus, { fg: string; bg: string }> = {
  PRESENT: { fg: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  HALF_DAY: { fg: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  ABSENT: { fg: 'var(--color-error)', bg: 'var(--color-error-bg)' },
  LEAVE: { fg: 'var(--color-text-secondary)', bg: 'var(--color-muted-bg)' },
};

type Props = {
  /** The radio group's name — unique per row on a page with several (the roster). */
  name: string;
  /** `null` while nothing has been chosen — Save stays disabled until it is. */
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  /** Shown above the chips; the roster's inline quick mark keeps it for screen readers only. */
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
};

/**
 * Marking somebody's day — "Mark a day" on a staff member and the roster's quick
 * mark, the app's `AttendanceStatusPicker`. Four statuses, so chips the width of
 * their own label in a row that wraps: four chips dividing a row evenly broke
 * "Present" mid-word on a phone, and every Indic translation is longer still.
 */
export default function AttendanceStatusPicker({ name, value, onChange, label, hideLabel, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <ChipGroup<AttendanceStatus>
      name={name}
      label={label}
      hideLabel={hideLabel}
      disabled={disabled}
      options={MARKABLE.map((status) => ({
        value: status,
        label: t(`attendanceStatus.${status}`),
        icon: ICONS[status],
        tone: TONES[status],
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
