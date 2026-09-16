import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing } from '@/theme';
import { duration } from '@/theme/motion';

const SEGMENTS = 4;

type LabelKey = 'password.tooShort' | 'password.weak' | 'password.good' | 'password.strong';
type HintKey = 'password.hintShort' | 'password.hintVariety' | 'password.hintLength' | 'password.hintVaried';

type Strength = {
  score: number;
  labelKey: LabelKey | null;
  hintKey: HintKey | null;
  color: string;
};

export function scorePassword(password: string): Strength {
  if (password.length === 0) {
    return { score: 0, labelKey: null, hintKey: null, color: colors.border };
  }
  if (password.length < 8) {
    return { score: 1, labelKey: 'password.tooShort', hintKey: 'password.hintShort', color: colors.error };
  }

  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (variety <= 1) {
    return { score: 2, labelKey: 'password.weak', hintKey: 'password.hintVariety', color: colors.warning };
  }
  if (variety === 2 || password.length < 12) {
    return { score: 3, labelKey: 'password.good', hintKey: 'password.hintLength', color: colors.primary };
  }
  return { score: 4, labelKey: 'password.strong', hintKey: 'password.hintVaried', color: colors.success };
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
  const { t } = useTranslation();
  const { score, labelKey, hintKey, color } = scorePassword(password);

  if (password.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.caption}>{t('password.level')}</Text>
        <Text style={[styles.value, { color }]}>
          {labelKey ? t(labelKey) : ''}
          {hintKey ? <Text style={styles.hint}>{`  ·  ${t(hintKey)}`}</Text> : null}
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
