import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import PressableScale from '@/components/PressableScale';
import { useLanguage } from '@/hooks/useLanguage';
import { colors, radius, spacing, typography } from '@/theme';

export default function LanguageSelector() {
  const { t } = useTranslation();
  const { current, languages, change } = useLanguage();

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('language.title')}</Text>

      {languages.map((language) => {
        const selected = language.code === current.code;
        return (
          <PressableScale
            key={language.code}
            testID={`language-option-${language.code}`}
            style={[styles.row, selected && styles.rowSelected]}
            scaleTo={0.98}
            onPress={() => void change(language.code)}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, selected && styles.labelSelected]}>{language.label}</Text>
              <Text style={styles.native}>{t(`language.${language.code}`)}</Text>
            </View>
            {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rowText: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  labelSelected: { color: colors.primary },
  native: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
