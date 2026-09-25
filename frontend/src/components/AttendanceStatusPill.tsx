import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import type { AttendanceStatus } from '@/types/staffing';

/**
 * One tone per status, shared with `AttendanceStatusPicker` — so the colour you
 * press when marking a day is the colour the day wears afterwards.
 */
export const ATTENDANCE_TONE: Record<AttendanceStatus, { bg: string; fg: string }> = {
  PRESENT: { bg: '#DCFCE7', fg: colors.success },
  HALF_DAY: { bg: '#FEF3C7', fg: colors.warning },
  ABSENT: { bg: colors.errorBg, fg: colors.error },
  LEAVE: { bg: '#F1F1F5', fg: colors.textSecondary },
};

export default function AttendanceStatusPill({ status }: { status: AttendanceStatus }) {
  const { t } = useTranslation();
  const tone = ATTENDANCE_TONE[status];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.label, { color: tone.fg }]}>{t(`attendanceStatus.${status}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  label: { fontSize: 11.5, fontWeight: '700' },
});
