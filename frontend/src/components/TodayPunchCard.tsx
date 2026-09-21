import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getMyAttendance, punchIn, punchOut, type Coordinates } from '@/api/attendance';
import { getWorkWeek } from '@/api/workCalendar';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useMyStaffMember } from '@/hooks/useMyStaffMember';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { dateKeyFromApi, formatDate, todayISO, weekdayOfISO } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import type { AttendanceRecord } from '@/types/staffing';

interface Props {
  onOpenHistory: () => void;
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Punching in, one tap from opening the app.
 *
 * Attendance used to live two taps into Settings, which is where you go once a
 * month — not where you go at the start of every shift. This is the single
 * most-used action in the app for most of its users.
 *
 * Renders nothing at all when the viewer has no StaffMember record (an owner
 * who doesn't punch) or while that is still unknown, so Home never flashes an
 * empty card.
 */
export default function TodayPunchCard({ onOpenHistory }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { staffMember, isStaff, isLoading: isResolving } = useMyStaffMember();

  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayISO();

  const load = useCallback(async () => {
    if (!businessId || !isStaff) return;
    try {
      const now = new Date();
      const [records, workWeek] = await Promise.all([
        getMyAttendance(businessId, now.getMonth() + 1, now.getFullYear()),
        getWorkWeek(businessId).catch(() => null),
      ]);
      setRecord(records.find((r) => dateKeyFromApi(r.date) === today) ?? null);
      if (workWeek) {
        // A branch override wins whole over the business default — the same
        // rule the payroll calculator applies.
        const branch = workWeek.branches.find((b) => b.id === staffMember?.branchId);
        setWeeklyOffDays(branch?.weeklyOffOverride ? branch.weeklyOffDays : workWeek.weeklyOffDays);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, isStaff, staffMember?.branchId, today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function currentCoordinates(): Promise<Coordinates> {
    // Best-effort: a punch succeeds without location when the branch has no
    // geofence configured. The backend is the authority on whether it's needed.
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return {};
      const position = await Location.getCurrentPositionAsync({});
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch {
      return {};
    }
  }

  async function handlePunch(direction: 'in' | 'out') {
    if (!businessId) return;
    haptics.tap();
    setIsBusy(true);
    setError(null);
    try {
      const coords = await currentCoordinates();
      const next = direction === 'in' ? await punchIn(businessId, coords) : await punchOut(businessId, coords);
      setRecord(next);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  // No card at all rather than an empty one.
  if (isResolving || !isStaff) return null;

  const isWeeklyOff = weeklyOffDays.includes(weekdayOfISO(today));
  const hasPunchedIn = !!record?.punchInAt;
  const hasPunchedOut = !!record?.punchOutAt;

  let statusLine: string;
  if (hasPunchedOut && record?.punchInAt && record?.punchOutAt) {
    statusLine = t('today.done', { inTime: timeOf(record.punchInAt), outTime: timeOf(record.punchOutAt) });
  } else if (hasPunchedIn && record?.punchInAt) {
    statusLine = t('today.punchedInAt', { time: timeOf(record.punchInAt) });
  } else if (isWeeklyOff) {
    // Don't nag someone to punch on their day off.
    statusLine = t('today.weekOff');
  } else {
    statusLine = t('today.notPunchedIn');
  }

  return (
    <View style={styles.card}>
      <PressableScale scaleTo={0.99} onPress={onOpenHistory} style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.label}>{t('today.title')}</Text>
          <Text style={styles.date}>{formatDate(today, t)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </PressableScale>

      <Text style={[styles.status, isWeeklyOff && !hasPunchedIn && styles.statusMuted]}>{statusLine}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!hasPunchedOut ? (
        <PrimaryButton
          testID={hasPunchedIn ? 'today-punch-out' : 'today-punch-in'}
          title={hasPunchedIn ? t('today.punchOut') : t('today.punchIn')}
          icon={hasPunchedIn ? 'log-out-outline' : 'log-in-outline'}
          loading={isBusy}
          onPress={() => handlePunch(hasPunchedIn ? 'out' : 'in')}
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1 },
  label: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontSize: 10,
  },
  date: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 1 },
  status: { fontSize: 13.5, color: colors.textSecondary, marginTop: spacing.sm },
  statusMuted: { color: colors.textTertiary },
  error: { fontSize: 12.5, color: colors.error, marginTop: spacing.xs },
  button: { marginTop: spacing.md },
});
