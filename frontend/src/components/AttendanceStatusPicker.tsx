import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { ATTENDANCE_TONE } from '@/components/AttendanceStatusPill';
import { colors, radius, spacing, typography } from '@/theme';
import type { AttendanceStatus } from '@/types/staffing';

/**
 * Marking somebody's day — the control behind "Mark a day" on a staff member
 * and the quick mark on the roster, which had a copy of the list each.
 *
 * It used to be four `SegmentedOption` chips in a row. That component divides
 * the width evenly between its siblings, which is right for two or three
 * options and wrong for four: on a 393dp phone each chip got about 76dp, and
 * "Present" at 13px does not fit in 76dp minus its own padding — so the labels
 * broke mid-word and rendered as "Prese nt" and "Absen t". Every Indic
 * translation is longer than the English, so the languages most of these users
 * read broke harder.
 *
 * Here each chip is the width of its own label and the row wraps, so no label
 * can ever break however long the translation runs or however many statuses
 * there come to be.
 */

// The order they are offered in: the answer given on most days first.
const MARKABLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

// A Record over every status, so adding one to the backend enum fails `tsc`
// here until someone picks its icon — rather than rendering a chip with a hole
// in it.
const ICONS: Record<AttendanceStatus, keyof typeof Ionicons.glyphMap> = {
  PRESENT: 'checkmark-circle',
  ABSENT: 'close-circle',
  HALF_DAY: 'contrast',
  LEAVE: 'calendar-clear',
};

type Props = {
  /** `null` while nothing has been chosen — Save stays disabled until it isn't. */
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  /** Suffixed with the status, so each chip keeps a stable test id. */
  testIDPrefix: string;
  /**
   * Taken as a prop rather than a key of its own, the way `DateField` does it —
   * the form above this names its fields, the roster's inline quick-mark does
   * not need naming, and the component should not have to know which it is in.
   */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export default function AttendanceStatusPicker({
  value,
  onChange,
  testIDPrefix,
  label,
  style,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={style}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.wrap} accessibilityRole="radiogroup">
        {MARKABLE.map((status) => {
          const tone = ATTENDANCE_TONE[status];
          const selected = value === status;
          return (
            <PressableScale
              key={status}
              testID={`${testIDPrefix}-${status}`}
              scaleTo={0.96}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`attendanceStatus.${status}`)}
              style={[styles.chip, selected && { backgroundColor: tone.bg, borderColor: tone.fg }]}
              onPress={() => onChange(status)}
            >
              <Ionicons
                name={ICONS[status]}
                size={15}
                color={selected ? tone.fg : colors.textTertiary}
              />
              <Text style={[styles.label, selected && { color: tone.fg }]}>
                {t(`attendanceStatus.${status}`)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // No `flex` and no width: a chip is as wide as what is written on it, which
  // is the only sizing that survives four languages of different lengths.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
});
