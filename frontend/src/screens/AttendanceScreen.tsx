import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { getMyAttendance, punchIn, punchOut } from '@/api/attendance';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useMonthCursor } from '@/hooks/useMonthCursor';
import type { AttendanceRecord } from '@/types/staffing';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import AttendanceStatusPill from '@/components/AttendanceStatusPill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'Attendance'>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Best-effort: a punch always succeeds without location if the branch has no
// geofence configured, or if the user declines the permission — the backend
// is the actual authority on whether coordinates were required.
async function currentCoordinates(): Promise<{ latitude?: number; longitude?: number }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return {};
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return {};
  }
}

export default function AttendanceScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);
  const { month, year, label, goPrev, goNext } = useMonthCursor();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPunching, setIsPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notStaff, setNotStaff] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMyAttendance(businessId, month, year);
      setRecords(data);
      setNotStaff(false);
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) {
        setNotStaff(true);
      } else {
        setError(extractErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  }, [businessId, month, year]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const today = records.find((r) => r.date.slice(0, 10) === todayISO());
  const hasPunchedIn = !!today?.punchInAt;
  const hasPunchedOut = !!today?.punchOutAt;

  async function handlePunch() {
    if (!businessId) return;
    haptics.tap();
    setIsPunching(true);
    setError(null);
    try {
      const coords = await currentCoordinates();
      if (hasPunchedIn) {
        await punchOut(businessId, coords);
      } else {
        await punchIn(businessId, coords);
      }
      haptics.success();
      await load();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsPunching(false);
    }
  }

  const otherDays = records.filter((r) => r.date.slice(0, 10) !== todayISO());

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('attendance.title')}</Text>
          <PressableScale testID="attendance-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {notStaff ? (
            <AnimatedEntrance delay={step(0)}>
              <View style={styles.card}>
                <Ionicons name="person-outline" size={22} color={colors.textTertiary} />
                <Text style={styles.notStaffText}>{t('attendance.notStaff')}</Text>
              </View>
            </AnimatedEntrance>
          ) : (
            <>
              <AnimatedEntrance delay={step(0)}>
                <View style={styles.todayCard}>
                  <Text style={styles.todayLabel}>{t('attendance.today')}</Text>
                  {hasPunchedOut ? (
                    <Text style={styles.todayStatus}>
                      {t('attendance.doneForToday', {
                        inTime: formatTime(today?.punchInAt ?? null),
                        outTime: formatTime(today?.punchOutAt ?? null),
                      })}
                    </Text>
                  ) : hasPunchedIn ? (
                    <Text style={styles.todayStatus}>
                      {t('attendance.punchedInAt', { time: formatTime(today?.punchInAt ?? null) })}
                    </Text>
                  ) : (
                    <Text style={styles.todayStatus}>{t('attendance.notPunchedIn')}</Text>
                  )}

                  {!hasPunchedOut ? (
                    <PrimaryButton
                      testID="attendance-punch-button"
                      title={hasPunchedIn ? t('attendance.punchOut') : t('attendance.punchIn')}
                      icon={hasPunchedIn ? 'log-out-outline' : 'log-in-outline'}
                      loading={isPunching}
                      onPress={handlePunch}
                      style={styles.punchButton}
                    />
                  ) : null}
                </View>
              </AnimatedEntrance>

              {error ? (
                <AnimatedEntrance key={error} delay={0} distance={-8} style={styles.block}>
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                </AnimatedEntrance>
              ) : null}

              <AnimatedEntrance delay={step(1)} style={styles.block}>
                <View style={styles.monthNav}>
                  <PressableScale testID="attendance-prev-month" onPress={goPrev} style={styles.monthNavButton}>
                    <Ionicons name="chevron-back" size={18} color={colors.text} />
                  </PressableScale>
                  <Text style={styles.monthLabel}>{label}</Text>
                  <PressableScale testID="attendance-next-month" onPress={goNext} style={styles.monthNavButton}>
                    <Ionicons name="chevron-forward" size={18} color={colors.text} />
                  </PressableScale>
                </View>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.card}>
                  {isLoading ? (
                    <Text style={styles.emptyText}>{t('common.loading')}</Text>
                  ) : otherDays.length === 0 ? (
                    <Text style={styles.emptyText}>{t('attendance.noHistory')}</Text>
                  ) : (
                    otherDays.map((record, index) => (
                      <View key={record.id} style={[styles.dayRow, index > 0 && styles.dayRowDivided]}>
                        <Text style={styles.dayDate}>{record.date.slice(0, 10)}</Text>
                        <AttendanceStatusPill status={record.status} />
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
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  block: { marginTop: spacing.lg },
  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.md,
  },
  todayLabel: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' },
  todayStatus: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  punchButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  notStaffText: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text, minWidth: 140, textAlign: 'center' },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  dayRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  dayDate: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
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
