import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Picker from '@/components/Picker';
import { useLanguage } from '@/hooks/useLanguage';
import type { LanguageCode } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Pick the app's language.
 *
 * A dropdown rather than four stacked rows. Four languages laid out flat is a
 * fifth of the Settings screen spent on a setting most people touch once, and it
 * grows every time a language is added — the exact shape CLAUDE.md warns about,
 * one release ahead of the problem.
 *
 * That argument is now `Picker`'s, and this is the first caller of it: the sheet
 * this screen used to own by hand became `Sheet`, and the field became `Picker`'s.
 * `searchFrom={1}` keeps the dropdown whatever the count — the reasoning above is
 * about the room four rows take, not about scanning them — and `Picker` leaves the
 * search box out until a list is genuinely long, so four languages get none.
 */
export default function LanguageSelector() {
  const { t } = useTranslation();
  const { current, languages, change } = useLanguage();

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('language.title')}</Text>
      <Picker
        testIDPrefix="language"
        label={t('language.title')}
        hideLabel
        icon="language-outline"
        searchFrom={1}
        value={current.code}
        onChange={(code) => void change(code as LanguageCode)}
        options={languages.map((language) => ({
          value: language.code,
          label: language.label,
          description: t(`language.${language.code}`),
        }))}
      />
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
});
