import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pill from '@/components/Pill';
import { colors, radius, spacing } from '@/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  badge: string;
  title: string;
  body: string;
  examples?: string[];
};

export default function PhaseNotice({ icon, badge, title, body, examples }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <Pill label={badge} />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {examples?.length ? (
        <View style={styles.examples}>
          <Text style={styles.examplesLabel}>What you&apos;ll be able to ask</Text>
          {examples.map((example) => (
            <View key={example} style={styles.exampleRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textTertiary} />
              <Text style={styles.exampleText}>{example}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  body: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.sm },
  examples: {
    marginTop: spacing.lg,
    backgroundColor: '#FAFAFC',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  examplesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  exampleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  exampleText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
