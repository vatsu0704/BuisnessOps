import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

export type PillTone = 'brand' | 'muted' | 'success' | 'warning' | 'danger';

const TONES: Record<PillTone, { tint: string; background: string }> = {
  brand: { tint: colors.primary, background: colors.primaryLight },
  muted: { tint: colors.textSecondary, background: '#F1F1F5' },
  success: { tint: colors.success, background: '#E8F6ED' },
  warning: { tint: colors.warning, background: '#FDF3E3' },
  danger: { tint: colors.error, background: colors.errorBg },
};

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * Five tones rather than two, because a supply order's status and its
   * payment state both need to say "fine", "waiting" and "went wrong" at a
   * glance. Colour alone never carries the meaning — the label always says it
   * too, so the pill still reads correctly to someone who cannot tell the
   * amber from the green.
   */
  tone?: PillTone;
  /**
   * Turns the pill into a "remove this" control, used for the branch grants on
   * the Team screen. Omitted everywhere else, so the pill stays the plain
   * label it is in the other ten places it appears.
   */
  onRemove?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

export default function Pill({ label, icon, tone = 'brand', onRemove, accessibilityLabel, testID }: Props) {
  const { tint, background } = TONES[tone];

  const body = (
    <>
      {icon ? <Ionicons name={icon} size={13} color={tint} /> : null}
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
      {onRemove ? <Ionicons name="close-circle" size={15} color={tint} /> : null}
    </>
  );

  if (!onRemove) {
    return <View style={[styles.pill, { backgroundColor: background }]}>{body}</View>;
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onRemove}
      style={({ pressed }) => [styles.pill, { backgroundColor: background }, pressed && styles.pressed]}
      // The pill is small, so extend the touch target past what is drawn
      // rather than making every branch chip on the screen bigger.
      hitSlop={6}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
  },
  pressed: { opacity: 0.6 },
  label: { fontSize: 12.5, fontWeight: '600' },
});
