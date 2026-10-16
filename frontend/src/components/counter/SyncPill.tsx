import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import type { CounterSyncState } from '@/store/counterStore';

type Props = {
  state: CounterSyncState;
  /** Sales on this phone the server has not recorded yet. */
  pendingCount: number;
  /** Sales the server refused, waiting for a person. */
  attentionCount: number;
};

/**
 * Whether the counter's bills have reached the server (requirement 30), in one
 * line the cashier can read at a glance — and nothing at all when everything is
 * sent, because "all good" on a till every minute is noise.
 *
 * Its own row under the header rather than squeezed beside the title: the
 * sentence grows with the number and runs longer in every Indic language.
 */
export default function SyncPill({ state, pendingCount, attentionCount }: Props) {
  const { t } = useTranslation();

  let icon: keyof typeof Ionicons.glyphMap;
  let text: string;
  let tint: string;
  let background: string;

  if (attentionCount > 0) {
    icon = 'alert-circle-outline';
    text = t('counter.sync.attention', { count: attentionCount });
    tint = colors.error;
    background = colors.errorBg;
  } else if (pendingCount === 0) {
    return null;
  } else if (state === 'syncing') {
    icon = 'cloud-upload-outline';
    text = t('counter.sync.syncing', { count: pendingCount });
    tint = colors.primary;
    background = colors.primaryLight;
  } else if (state === 'blocked') {
    icon = 'lock-closed-outline';
    text = t('counter.sync.blocked', { count: pendingCount });
    tint = colors.warning;
    background = '#FDF3E3';
  } else if (state === 'offline') {
    icon = 'cloud-offline-outline';
    text = t('counter.sync.offline', { count: pendingCount });
    tint = colors.warning;
    background = '#FDF3E3';
  } else {
    icon = 'cloud-upload-outline';
    text = t('counter.sync.pending', { count: pendingCount });
    tint = colors.primary;
    background = colors.primaryLight;
  }

  return (
    <View testID="counter-sync-pill" style={[styles.pill, { backgroundColor: background }]}>
      <Ionicons name={icon} size={15} color={tint} />
      <Text style={[styles.text, { color: tint }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  text: { flex: 1, fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
});
