import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useNotifications } from '@/hooks/useNotifications';
import PressableScale from '@/components/PressableScale';
import { colors, radius, spacing } from '@/theme';

/**
 * The way into the notification centre, with its unread count.
 *
 * Reads the same store the centre does, so marking something read there updates
 * this in the same frame — the defect `branchStore`'s header describes, avoided
 * by not having two copies in the first place.
 *
 * The badge caps at 9+. A two-digit number inside a 16dp circle either shrinks
 * the text past reading or pushes the circle out of the top bar, and "how many
 * exactly" is not a question anybody asks of a badge.
 */
export default function NotificationBell() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { unreadCount } = useNotifications();

  return (
    <PressableScale
      testID="home-open-notifications"
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={
        unreadCount > 0
          ? t('notificationCentre.unreadBadge', { count: unreadCount })
          : t('notificationCentre.title')
      }
      onPress={() => navigation.navigate('Notifications')}
    >
      <Ionicons
        name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
        size={18}
        color={unreadCount > 0 ? colors.primary : colors.textSecondary}
      />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Overhangs the button deliberately, so the icon inside stays centred and
  // readable rather than being pushed aside by the count.
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: radius.full,
    paddingHorizontal: 4,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  badgeText: { fontSize: 9.5, fontWeight: '800', color: colors.white },
  spacer: { width: spacing.xs },
});
