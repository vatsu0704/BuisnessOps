import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme';

/**
 * Signed in, but revoked from every business on the account.
 *
 * A real state now that access can be taken away, and one the app would
 * otherwise render as a dashboard of zeros with a working-looking "add your
 * first branch" button that fails on tap. Shown on Home, where it is seen, and
 * in Settings, where someone goes looking for an explanation.
 */
export default function NoBusinessAccessNotice() {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Ionicons name="lock-closed-outline" size={18} color={colors.warning} />
      <View style={styles.text}>
        <Text style={styles.title}>{t('settings.noAccessTitle')}</Text>
        <Text style={styles.body}>{t('settings.noAccessBody')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  text: { flex: 1 },
  title: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  body: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
});
