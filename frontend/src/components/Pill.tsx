import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'brand' | 'muted';
};

export default function Pill({ label, icon, tone = 'brand' }: Props) {
  const tint = tone === 'brand' ? colors.primary : colors.textSecondary;

  return (
    <View style={[styles.pill, tone === 'muted' && styles.pillMuted]}>
      {icon ? <Ionicons name={icon} size={13} color={tint} /> : null}
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </View>
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
  label: { fontSize: 12.5, fontWeight: '600' },
});
