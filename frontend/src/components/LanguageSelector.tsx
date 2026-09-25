import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import OptionRow from '@/components/OptionRow';
import PressableScale from '@/components/PressableScale';
import { useLanguage } from '@/hooks/useLanguage';
import type { LanguageCode } from '@/i18n';
import { colors, radius, shadow, spacing, typography } from '@/theme';

/**
 * Pick the app's language.
 *
 * A dropdown rather than four stacked rows. Four languages laid out flat is a
 * fifth of the Settings screen spent on a setting most people touch once, and
 * it grows every time a language is added — the exact shape CLAUDE.md warns
 * about, one release ahead of the problem.
 *
 * Built from `Modal`, which is React Native's own: it renders above everything
 * without a portal, `onRequestClose` gives the Android back button the right
 * behaviour for free, and it needs no dependency. `@react-native-picker/picker`
 * would be a native module for a list of four.
 */
export default function LanguageSelector() {
  const { t } = useTranslation();
  const { current, languages, change } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  async function pick(code: LanguageCode) {
    setIsOpen(false);
    await change(code);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('language.title')}</Text>

      {/* The closed state says what is selected and that it can be changed —
          the two things a dropdown owes the person looking at it. */}
      <PressableScale
        testID="language-selector"
        scaleTo={0.99}
        style={styles.field}
        accessibilityRole="button"
        accessibilityLabel={`${t('language.title')}: ${current.label}`}
        onPress={() => setIsOpen(true)}
      >
        <Ionicons name="language-outline" size={18} color={colors.primary} />
        <View style={styles.fieldText}>
          <Text style={styles.fieldLabel}>{current.label}</Text>
          <Text style={styles.fieldNative}>{t(`language.${current.code}`)}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
      </PressableScale>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        // Android's back button. Without this the sheet is a trap on the one
        // platform this app actually ships to.
        onRequestClose={() => setIsOpen(false)}
      >
        {/* Tapping the scrim closes it, which is what every sheet on this
            platform does. The sheet is itself a Pressable with nothing to do:
            React Native hands the touch to the innermost responder rather than
            bubbling it, so this is what stops a tap on the sheet reaching the
            scrim behind it and closing the thing being tapped. */}
        <Pressable style={styles.scrim} onPress={() => setIsOpen(false)}>
          <SafeAreaView style={styles.sheetWrap} edges={['bottom']}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.grabber} />
              <Text style={styles.sheetTitle}>{t('language.title')}</Text>

              {/* Rows stack, so a fifth language costs height rather than
                  squeezing the four that are already here. */}
              <View style={styles.list}>
                {languages.map((language) => (
                  <OptionRow
                    key={language.code}
                    testID={`language-option-${language.code}`}
                    title={language.label}
                    description={t(`language.${language.code}`)}
                    selected={language.code === current.code}
                    onPress={() => void pick(language.code)}
                  />
                ))}
              </View>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  // Takes the leftover width so a long language name wraps inside the field
  // rather than pushing the chevron off the edge.
  fieldText: { flex: 1 },
  fieldLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  fieldNative: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  scrim: { flex: 1, backgroundColor: 'rgba(17, 17, 27, 0.45)', justifyContent: 'flex-end' },
  sheetWrap: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  sheet: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    ...shadow.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  list: { gap: spacing.xs },
});
