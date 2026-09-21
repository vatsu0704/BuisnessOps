import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'brand' | 'muted';
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
  const tint = tone === 'brand' ? colors.primary : colors.textSecondary;

  const body = (
    <>
      {icon ? <Ionicons name={icon} size={13} color={tint} /> : null}
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
      {onRemove ? <Ionicons name="close-circle" size={15} color={tint} /> : null}
    </>
  );

  if (!onRemove) {
    return <View style={[styles.pill, tone === 'muted' && styles.pillMuted]}>{body}</View>;
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onRemove}
      style={({ pressed }) => [styles.pill, tone === 'muted' && styles.pillMuted, pressed && styles.pressed]}
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
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
  },
  pillMuted: { backgroundColor: '#F1F1F5' },
  pressed: { opacity: 0.6 },
  label: { fontSize: 12.5, fontWeight: '600' },
});
