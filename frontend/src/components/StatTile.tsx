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

/**
 * One number in a row of them.
 *
 * The number sits at the **bottom** of the tile rather than directly under its
 * label: tiles in a row stretch to a common height, so a label that wraps to
 * two lines ("Today's takings" beside "Tokens") would otherwise push its number
 * a line lower than its neighbours'. Bottom alignment keeps the figures on one
 * line however the labels fall — which matters most in Hindi, Gujarati and
 * Marathi, where they wrap sooner than the English ones do.
 */
export default function StatTile({ label, value, caption, accent, formatValue }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <AnimatedCount
          value={value}
          formatValue={formatValue}
          style={[styles.value, accent ? { color: accent } : null]}
        />
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    justifyContent: 'space-between',
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
