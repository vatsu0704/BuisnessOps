import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableScale from '@/components/PressableScale';
import { clampDayKey, shiftDayKey } from '@/utils/counterQueue';
import { formatDate, fromISODate, toISODate } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import { colors, radius, spacing } from '@/theme';

type Props = {
  /** The day being shown, as YYYY-MM-DD. */
  value: string;
  /** The branch's own today — never the device's. Nothing later can be chosen. */
  today: string;
  onChange: (dayKey: string) => void;
  testIDPrefix: string;
};

/**
 * Which day the counter is showing — the month cursor's shape, a day at a time.
 *
 * Chevrons *and* a tappable date: yesterday is the overwhelmingly common ask and
 * wants one tap, while the 3rd of last month would be forty of them.
 *
 * `today` is the **branch's** day, computed from the offset the server reported,
 * not `new Date()`. A phone set to the wrong zone is already on yesterday between
 * 18:30 and midnight in India — exactly when a shop is busiest — so reading the
 * limit off the device would offer a day that has not happened.
 *
 * Not `DateField`: that is a form control with a label above it, a 48dp icon box
 * and a bottom margin, and stripping all three with flags would make it two
 * components wearing one name.
 */
export default function DayCursor({ value, today, onChange, testIDPrefix }: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const canGoNext = value < today;

  return (
    <View style={styles.wrap}>
      <View style={styles.cursor}>
        <PressableScale
          testID={`${testIDPrefix}-prev`}
          style={styles.step}
          accessibilityLabel={t('counter.previousDay')}
          onPress={() => onChange(shiftDayKey(value, -1))}
        >
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </PressableScale>

        <PressableScale
          testID={`${testIDPrefix}-date`}
          scaleTo={0.98}
          style={styles.date}
          accessibilityLabel={`${t('counter.whichDay')}: ${formatDate(value, t)}`}
          onPress={() => {
            haptics.select();
            setIsOpen(true);
          }}
        >
          {/* The short form: the long one does not fit between two chevrons at
              320dp in Gujarati. */}
          <Text style={styles.dateText} numberOfLines={1}>
            {formatDate(value, t)}
          </Text>
        </PressableScale>

        <PressableScale
          testID={`${testIDPrefix}-next`}
          style={[styles.step, !canGoNext && styles.stepOff]}
          accessibilityLabel={t('counter.nextDay')}
          onPress={() => canGoNext && onChange(clampDayKey(shiftDayKey(value, 1), today))}
        >
          <Ionicons name="chevron-forward" size={16} color={canGoNext ? colors.text : colors.textTertiary} />
        </PressableScale>
      </View>

      {/* A second control rather than overloading the dimmed chevron. */}
      {canGoNext ? (
        <PressableScale testID={`${testIDPrefix}-today`} style={styles.today} onPress={() => onChange(today)}>
          <Text style={styles.todayText}>{t('counter.backToToday')}</Text>
        </PressableScale>
      ) : null}

      {isOpen ? (
        <DateTimePicker
          value={fromISODate(value)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={fromISODate(today)}
          onChange={(event, selected) => {
            // Android fires 'dismissed' on cancel; iOS keeps the inline picker
            // open until the caller closes it.
            if (Platform.OS === 'android') setIsOpen(false);
            if (event.type === 'dismissed' || !selected) return;
            onChange(clampDayKey(toISODate(selected), today));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  // The date takes whatever the two fixed chevrons leave, so a long day name in
  // Gujarati never pushes a button off the edge.
  cursor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexGrow: 1, flexBasis: 200 },
  step: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  stepOff: { opacity: 0.4 },
  date: {
    flex: 1,
    minWidth: 0,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  dateText: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  today: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  todayText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
