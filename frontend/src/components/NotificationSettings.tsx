import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { getNotificationPreferences, setNotificationPreference } from '@/api/notifications';
import { extractErrorMessage } from '@/api/client';
import { hasPushPermission } from '@/utils/push';
import { haptics } from '@/utils/haptics';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import type { NotificationCategory, NotificationPreference } from '@/types/notification';

/**
 * "Notification management for all users" — requirement 8's last line.
 *
 * Two separate things on one card, and the order matters:
 *
 * 1. **Whether this device can receive anything at all.** If Android's
 *    permission was refused, every switch below it is decoration. That is shown
 *    first, and it tells the person to go to the OS rather than offering a
 *    button — Android only ever asks once, and after a denial the app cannot
 *    re-trigger the prompt however much it would like to.
 * 2. **Which categories they want.** A preference belongs to the person, not
 *    the phone, so these follow them to every device and every business.
 *
 * Attendance is rendered as fixed rather than as a switch that refuses: a
 * control that looks operable and is not is worse than one that explains
 * itself. Requirement 2 exists so a worker finds out they were marked absent.
 */

const LABELS: Record<NotificationCategory, { title: string; hint: string }> = {
  attendance: {
    title: 'notificationCentre.categoryAttendance',
    hint: 'notificationCentre.categoryAttendanceHint',
  },
  orders: {
    title: 'notificationCentre.categoryOrders',
    hint: 'notificationCentre.categoryOrdersHint',
  },
  delays: {
    title: 'notificationCentre.categoryDelays',
    hint: 'notificationCentre.categoryDelaysHint',
  },
  payments: {
    title: 'notificationCentre.categoryPayments',
    hint: 'notificationCentre.categoryPaymentsHint',
  },
  deliveries: {
    title: 'notificationCentre.categoryDeliveries',
    hint: 'notificationCentre.categoryDeliveriesHint',
  },
};

export default function NotificationSettings() {
  const { t } = useTranslation();

  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [deviceAllowed, setDeviceAllowed] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<NotificationCategory | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loaded, allowed] = await Promise.all([getNotificationPreferences(), hasPushPermission()]);
      setPreferences(loaded);
      setDeviceAllowed(allowed);
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(category: NotificationCategory, enabled: boolean) {
    haptics.select();
    setSaving(category);
    // Flipped locally first: a switch that waits for a round trip before moving
    // reads as broken on a slow connection.
    setPreferences((current) =>
      current.map((p) => (p.category === category ? { ...p, enabled } : p))
    );
    try {
      setPreferences(await setNotificationPreference(category, enabled));
      setError(null);
    } catch (err) {
      setError(extractErrorMessage(err));
      await load();
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('notificationCentre.preferencesSection')}</Text>

      {deviceAllowed === false ? (
        <View style={styles.deviceWarning}>
          <Ionicons name="notifications-off-outline" size={16} color={colors.warning} />
          <View style={styles.deviceText}>
            <Text style={styles.deviceTitle}>{t('notificationCentre.deviceOff')}</Text>
            <Text style={styles.deviceHint}>{t('notificationCentre.deviceOffHint')}</Text>
          </View>
        </View>
      ) : deviceAllowed ? (
        <View style={styles.deviceOk}>
          <Ionicons name="checkmark-circle-outline" size={15} color={colors.success} />
          <Text style={styles.deviceOkText}>{t('notificationCentre.deviceOn')}</Text>
        </View>
      ) : null}

      <Text style={styles.hint}>{t('notificationCentre.preferencesHint')}</Text>

      {isLoading && preferences.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        preferences.map((preference, index) => {
          const label = LABELS[preference.category];
          if (!label) return null;
          return (
            <View
              key={preference.category}
              style={[styles.row, index > 0 && styles.rowDivided]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {t(label.title as 'notificationCentre.categoryOrders')}
                </Text>
                <Text style={styles.rowHint}>
                  {t(label.hint as 'notificationCentre.categoryOrdersHint')}
                </Text>
              </View>

              {preference.required ? (
                <Text style={styles.required}>{t('notificationCentre.required')}</Text>
              ) : (
                <Switch
                  testID={`notification-pref-${preference.category}`}
                  value={preference.enabled}
                  disabled={saving === preference.category}
                  onValueChange={(next) => void toggle(preference.category, next)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              )}
            </View>
          );
        })
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: 12.5, color: colors.textTertiary, marginBottom: spacing.sm },
  deviceWarning: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  deviceText: { flex: 1 },
  deviceTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  deviceHint: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  deviceOk: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  deviceOkText: { fontSize: 12.5, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowHint: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  // A word rather than a disabled switch: a control that looks operable and is
  // not reads as a bug, and this one has a reason worth stating.
  required: { fontSize: 11.5, fontWeight: '700', color: colors.textTertiary },
  loader: { paddingVertical: spacing.lg },
  error: { fontSize: 12.5, color: colors.error, marginTop: spacing.sm },
});
