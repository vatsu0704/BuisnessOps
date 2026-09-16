import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing } from '@/theme';
import { duration } from '@/theme/motion';

const SEGMENTS = 4;

type Strength = { score: number; label: string; color: string; hint: string };

export function scorePassword(password: string): Strength {
  if (password.length === 0) {
    return { score: 0, label: '', color: colors.border, hint: '' };
  }
  if (password.length < 8) {
    return { score: 1, label: 'Too short', color: colors.error, hint: 'needs 8+ characters' };
  }

  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (variety <= 1) return { score: 2, label: 'Weak', color: colors.warning, hint: 'add numbers or capitals' };
  if (variety === 2 || password.length < 12) {
    return { score: 3, label: 'Good', color: colors.primary, hint: '8+ characters' };
  }
  return { score: 4, label: 'Strong', color: colors.success, hint: 'nicely varied' };
}

function Segment({ active, color, index }: { active: boolean; color: string; index: number }) {
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(active ? 1 : 0, { duration: duration.quick + index * 40 });
  }, [active, fill, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + fill.value * 0.82,
    backgroundColor: fill.value > 0.5 ? color : colors.border,
  }));

  return <Animated.View style={[styles.segment, animatedStyle]} />;
}

export default function PasswordStrength({ password }: { password: string }) {
  const { score, label, color, hint } = scorePassword(password);

  if (password.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.caption}>Security level</Text>
        <Text style={[styles.value, { color }]}>
          {label}
          {hint ? <Text style={styles.hint}>{`  ·  ${hint}`}</Text> : null}
        </Text>
      </View>
      <View style={styles.track}>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <Segment key={i} index={i} active={i < score} color={color} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caption: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  value: { fontSize: 12, fontWeight: '700' },
  hint: { color: colors.textTertiary, fontWeight: '500' },
  track: { flexDirection: 'row', gap: spacing.xs + 2, marginTop: spacing.sm },
  segment: { flex: 1, height: 5, borderRadius: radius.full },
});
