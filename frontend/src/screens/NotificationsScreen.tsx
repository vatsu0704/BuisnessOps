import { useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useNotifications } from '@/hooks/useNotifications';
import { useMembership } from '@/hooks/useBusinessId';
import { resolveDeepLink } from '@/navigation/routeAccess';
import { formatDate, formatTime, dateKeyFromApi } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import type { AppNotification, NotificationCode } from '@/types/notification';

type Props = NativeStackScreenProps<AppStackParamList, 'Notifications'>;

/**
 * The notification centre — requirement 8.
 *
 * Every row renders `t('notifications.<code>', params)` rather than a stored
 * sentence, so a notification received last week reads in whatever language is
 * selected now. That is the whole reason the server sends a code and its values
 * instead of prose.
 *
 * A `FlatList` rather than a mapped `ScrollView`: this is the one list in the
 * app that genuinely grows without bound over time.
 */

// A Record over every code, so adding one to the backend fails `tsc` here until
// someone picks its icon — rather than rendering a row with a hole in it.
const ICONS: Record<NotificationCode, keyof typeof Ionicons.glyphMap> = {
  ATTENDANCE_MARKED_PRESENT: 'checkmark-circle',
  ATTENDANCE_MARKED_ABSENT: 'close-circle',
  ATTENDANCE_MARKED_HALF_DAY: 'contrast',
  ATTENDANCE_MARKED_LEAVE: 'calendar-clear',
  SUPPLY_ORDER_PLACED: 'cart',
  SUPPLY_ORDER_ACCEPTED: 'checkmark-done',
  SUPPLY_ORDER_PACKED: 'cube',
  SUPPLY_ORDER_DISPATCHED: 'bicycle',
  SUPPLY_ORDER_DELIVERED: 'flag',
  SUPPLY_ORDER_REJECTED: 'close-circle',
  SUPPLY_ORDER_DELAYED: 'time',
  SUPPLY_PAYMENT_VERIFIED: 'card',
  SUPPLY_ORDER_ASSIGNED: 'navigate',
};

const TINTS: Record<NotificationCode, string> = {
  ATTENDANCE_MARKED_PRESENT: colors.success,
  ATTENDANCE_MARKED_ABSENT: colors.error,
  ATTENDANCE_MARKED_HALF_DAY: colors.warning,
  ATTENDANCE_MARKED_LEAVE: colors.textSecondary,
  SUPPLY_ORDER_PLACED: colors.primary,
  SUPPLY_ORDER_ACCEPTED: colors.primary,
  SUPPLY_ORDER_PACKED: colors.primary,
  SUPPLY_ORDER_DISPATCHED: colors.primary,
  SUPPLY_ORDER_DELIVERED: colors.success,
  SUPPLY_ORDER_REJECTED: colors.error,
  SUPPLY_ORDER_DELAYED: colors.warning,
  SUPPLY_PAYMENT_VERIFIED: colors.success,
  SUPPLY_ORDER_ASSIGNED: colors.primary,
};

export default function NotificationsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const membership = useMembership();
  const { notifications, unreadCount, isLoading, error, refresh, markRead, markAllRead } =
    useNotifications();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  function openNotification(notification: AppNotification) {
    haptics.tap();
    void markRead(notification.id);

    if (!notification.deepLink) return;

    // Re-checked rather than trusted: a notification outlives the access that
    // justified it, and dispatching into a route the navigator never registered
    // is a silent no-op — a tap that does nothing, which nobody reports.
    const target = resolveDeepLink(membership, notification.deepLink.route, notification.deepLink.params);
    navigation.replace(target.route as 'Tabs', target.params as undefined);
  }

  function renderItem({ item, index }: { item: AppNotification; index: number }) {
    const unread = item.status === 'UNREAD';
    return (
      <AnimatedEntrance delay={step(Math.min(index, 5))}>
        <PressableScale
          testID={`notification-${item.id}`}
          scaleTo={0.98}
          style={[styles.row, unread && styles.rowUnread]}
          onPress={() => openNotification(item)}
        >
          <View style={[styles.icon, { backgroundColor: `${TINTS[item.code]}1A` }]}>
            <Ionicons name={ICONS[item.code]} size={17} color={TINTS[item.code]} />
          </View>

          <View style={styles.body}>
            {/* The sentence is rebuilt from the code every time this draws, so
                changing the app language re-renders the whole history. */}
            <Text style={[styles.message, unread && styles.messageUnread]}>
              {t(`notifications.${item.code}` as 'notifications.SUPPLY_ORDER_PLACED', item.params)}
            </Text>
            <Text style={styles.when}>
              {formatDate(dateKeyFromApi(item.createdAt), t)} · {formatTime(item.createdAt, t)}
            </Text>
          </View>

          {unread ? <View style={styles.dot} /> : null}
        </PressableScale>
      </AnimatedEntrance>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('notificationCentre.title')}</Text>
            <Text style={styles.subtitle}>
              {unreadCount > 0
                ? t('notificationCentre.unreadBadge', { count: unreadCount })
                : t('notificationCentre.subtitle')}
            </Text>
          </View>
          <PressableScale
            testID="notifications-close"
            style={styles.close}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        {unreadCount > 0 ? (
          <PressableScale
            testID="notifications-mark-all"
            style={styles.markAll}
            onPress={() => {
              haptics.tap();
              void markAllRead();
            }}
          >
            <Ionicons name="checkmark-done-outline" size={15} color={colors.primary} />
            <Text style={styles.markAllText}>{t('notificationCentre.markAllRead')}</Text>
          </PressableScale>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isLoading && notifications.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.content}
            refreshing={isLoading}
            onRefresh={() => void refresh()}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={26} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>{t('notificationCentre.empty')}</Text>
                <Text style={styles.emptyBody}>{t('notificationCentre.emptyBody')}</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
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
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  markAllText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  // An unread row is tinted rather than bolder-only: weight alone is hard to
  // read against a list where every message is a different length.
  rowUnread: { backgroundColor: colors.primaryLight },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  message: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
  messageUnread: { color: colors.text, fontWeight: '600' },
  when: { fontSize: 11.5, color: colors.textTertiary, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.primary },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyBody: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  loader: { paddingVertical: spacing.xxl },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  label: typography.label,
});
