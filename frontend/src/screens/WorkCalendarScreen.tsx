import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { createHoliday, deleteHoliday, getWorkWeek, listHolidays, updateWorkWeek } from '@/api/workCalendar';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import { dateKeyFromApi, formatDateLong, todayISO, weekdayName } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import type { Holiday, WorkWeek } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import DateField from '@/components/DateField';
import FormInput from '@/components/FormInput';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

type Props = NativeStackScreenProps<AppStackParamList, 'WorkCalendar'>;

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The weekly off and the holiday calendar.
 *
 * These set the payroll divisor: working days = calendar days − week-offs −
 * holidays. Week-offs and holidays are PAID, which is why they are excluded
 * from the divisor rather than counted as days not worked — someone present on
 * every working day earns exactly their salary.
 *
 * Without this screen the whole working-days model would be invisible and
 * unconfigurable, sitting at its default of "Sundays off".
 */
export default function WorkCalendarScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const year = new Date().getFullYear();

  const [workWeek, setWorkWeek] = useState<WorkWeek | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [holidayDate, setHolidayDate] = useState(todayISO());
  const [holidayName, setHolidayName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [week, list] = await Promise.all([getWorkWeek(businessId), listHolidays(businessId, { year })]);
      setWorkWeek(week);
      setHolidays(list);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, year]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleWeekday(day: number) {
    if (!businessId || !workWeek) return;
    const next = workWeek.weeklyOffDays.includes(day)
      ? workWeek.weeklyOffDays.filter((d) => d !== day)
      : [...workWeek.weeklyOffDays, day].sort();
    // All seven would leave no working days at all and payroll would have
    // nothing to divide by; the server rejects it, so don't offer it.
    if (next.length === 7) return;

    haptics.select();
    setWorkWeek({ ...workWeek, weeklyOffDays: next });
    setIsSaving(true);
    try {
      await updateWorkWeek(businessId, { weeklyOffDays: next });
    } catch (err) {
      setError(extractErrorMessage(err));
      await load();
    } finally {
      setIsSaving(false);
    }
  }

  async function setUnmarked(status: 'PRESENT' | 'ABSENT') {
    if (!businessId || !workWeek) return;
    haptics.select();
    setWorkWeek({ ...workWeek, unmarkedWorkingDayStatus: status });
    try {
      await updateWorkWeek(businessId, { unmarkedWorkingDayStatus: status });
    } catch (err) {
      setError(extractErrorMessage(err));
      await load();
    }
  }

  async function handleAddHoliday() {
    if (!businessId || !holidayName.trim()) return;
    haptics.tap();
    setIsAdding(true);
    setError(null);
    try {
      await createHoliday(businessId, { date: holidayDate, name: holidayName.trim() });
      setHolidayName('');
      haptics.success();
      await load();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleDeleteHoliday(holidayId: string) {
    if (!businessId) return;
    haptics.tap();
    try {
      await deleteHoliday(businessId, holidayId);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {t('workCalendar.title')}
          </Text>
          <PressableScale testID="work-calendar-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? (
            <AnimatedEntrance key={error} delay={0} distance={-8} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {isLoading || !workWeek ? (
            <Text style={styles.emptyText}>{t('common.loading')}</Text>
          ) : (
            <>
              <AnimatedEntrance delay={step(0)}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('workCalendar.weeklyOff')}</Text>
                  <View style={styles.weekRow}>
                    {WEEKDAYS.map((day) => {
                      const selected = workWeek.weeklyOffDays.includes(day);
                      return (
                        <PressableScale
                          key={day}
                          testID={`work-calendar-weekday-${day}`}
                          scaleTo={0.94}
                          style={[styles.weekChip, selected && styles.weekChipOn]}
                          onPress={() => toggleWeekday(day)}
                          disabled={isSaving}
                        >
                          <Text style={[styles.weekChipText, selected && styles.weekChipTextOn]}>
                            {weekdayName(day, t)}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                  <Text style={styles.hint}>{t('workCalendar.weeklyOffHint')}</Text>
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(1)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('workCalendar.unmarkedTitle')}</Text>
                  <View style={styles.chipRow}>
                    <View style={styles.chipItem}>
                      <SegmentedOption
                        testID="work-calendar-unmarked-present"
                        title={t('workCalendar.unmarkedPresent')}
                        selected={workWeek.unmarkedWorkingDayStatus === 'PRESENT'}
                        onPress={() => setUnmarked('PRESENT')}
                      />
                    </View>
                    <View style={styles.chipItem}>
                      <SegmentedOption
                        testID="work-calendar-unmarked-absent"
                        title={t('workCalendar.unmarkedAbsent')}
                        selected={workWeek.unmarkedWorkingDayStatus === 'ABSENT'}
                        onPress={() => setUnmarked('ABSENT')}
                      />
                    </View>
                  </View>
                  <Text style={styles.hint}>{t('workCalendar.unmarkedHint')}</Text>
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('workCalendar.addHoliday')}</Text>
                  <DateField
                    testID="work-calendar-holiday-date"
                    label={t('workCalendar.holidayDate')}
                    value={holidayDate}
                    onChange={setHolidayDate}
                    // A holiday can legitimately be in the future, unlike an
                    // attendance mark.
                    maximumDate={new Date(year + 1, 11, 31)}
                  />
                  <FormInput
                    testID="work-calendar-holiday-name"
                    label={t('workCalendar.holidayName')}
                    icon="sparkles-outline"
                    value={holidayName}
                    onChangeText={setHolidayName}
                  />
                  <PrimaryButton
                    testID="work-calendar-add-holiday"
                    title={t('workCalendar.addHoliday')}
                    icon="add"
                    loading={isAdding}
                    disabled={!holidayName.trim()}
                    onPress={handleAddHoliday}
                  />
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('workCalendar.holidays')}</Text>
                  {holidays.length === 0 ? (
                    <Text style={styles.emptyText}>{t('workCalendar.noHolidays', { year })}</Text>
                  ) : (
                    holidays.map((holiday, index) => (
                      <View key={holiday.id} style={[styles.row, index > 0 && styles.divided]}>
                        <View style={styles.rowText}>
                          <Text style={styles.name}>{holiday.name}</Text>
                          <Text style={styles.meta}>{formatDateLong(dateKeyFromApi(holiday.date), t)}</Text>
                        </View>
                        <Pill
                          label={holiday.branch ? holiday.branch.name : t('workCalendar.allBranches')}
                          tone="muted"
                        />
                        <PressableScale
                          testID={`work-calendar-delete-${holiday.id}`}
                          style={styles.iconButton}
                          onPress={() => handleDeleteHoliday(holiday.id)}
                        >
                          <Ionicons name="trash-outline" size={15} color={colors.error} />
                        </PressableScale>
                      </View>
                    ))
                  )}
                </View>
              </AnimatedEntrance>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4, flex: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  weekRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  weekChip: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  weekChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  weekChipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  weekChipTextOn: { color: colors.primary, fontWeight: '800' },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chipItem: { flex: 1 },
  hint: { fontSize: 11.5, color: colors.textTertiary, marginTop: spacing.sm, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  divided: { borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  rowText: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
