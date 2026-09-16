import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import { useLanguage } from '@/hooks/useLanguage';
import { colors, radius, spacing } from '@/theme';

/** Compact header control: shows the active language, tapping moves to the next. */
export default function LanguageToggle() {
  const { current, next } = useLanguage();

  return (
    <PressableScale testID="language-toggle" style={styles.chip} onPress={() => void next()} hitSlop={6}>
      <Ionicons name="language-outline" size={14} color={colors.primary} />
      <Text style={styles.label}>{current.short}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
  },
  label: { fontSize: 12, fontWeight: '700', color: colors.primary },
});
