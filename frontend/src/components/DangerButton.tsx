import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { colors, radius, spacing } from '@/theme';

type Props = {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /**
   * `outline` for an action that leaves something behind — logging out ends a
   * session, not an account. `solid` for the last step of one that cannot be
   * undone, so it does not look like any other button on the screen.
   */
  variant?: 'outline' | 'solid';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The red button: Log out, and Delete account's final confirm.
 *
 * Settings' logout button was styled inline, and deleting an account needed the
 * same shape twice more; three copies of one style drift apart one padding at a
 * time. Like `PrimaryButton` it sizes to its content with its own padding, so it
 * looks right whether a caller stretches it or not.
 */
export default function DangerButton({
  title,
  icon,
  onPress,
  variant = 'outline',
  loading,
  disabled,
  style,
  testID,
}: Props) {
  const solid = variant === 'solid';
  const isDisabled = disabled || loading;
  const tint = solid ? colors.white : colors.error;

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[styles.base, solid ? styles.solid : styles.outline, isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={tint} />
      ) : null}
      <Text style={[styles.label, { color: tint }]}>{title}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.error,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
  },
  outline: { backgroundColor: colors.surface },
  solid: { backgroundColor: colors.error },
  disabled: { opacity: 0.5 },
  label: { fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
});
