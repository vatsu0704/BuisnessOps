import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '@/theme';

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export default function HeroCard({ eyebrow, title, subtitle, icon }: Props) {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#6366F1', '#4338CA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={64} color={colors.white} />
        </View>
      ) : null}
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    ...shadow.md,
  },
  iconWrap: { position: 'absolute', right: -10, top: -8, opacity: 0.16 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.white, marginTop: spacing.sm },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.86)', marginTop: spacing.xs, lineHeight: 19 },
});
