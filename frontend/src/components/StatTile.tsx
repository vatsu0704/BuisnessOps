import { StyleSheet, Text, View } from 'react-native';
import AnimatedCount from '@/components/AnimatedCount';
import { colors, radius, spacing } from '@/theme';

type Props = {
  label: string;
  value: number;
  caption?: string;
  accent?: string;
  formatValue?: (value: number) => string;
};

export default function StatTile({ label, value, caption, accent, formatValue }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <AnimatedCount
        value={value}
        formatValue={formatValue}
        style={[styles.value, accent ? { color: accent } : null]}
      />
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
  },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  value: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: spacing.xs, letterSpacing: -0.5 },
  caption: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
});
