import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import type { Industry } from '@/types/business';
import { INDUSTRY_OPTIONS } from '@/constants/industries';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddBusiness'>;

/**
 * Requirement 16 — a second business on the account you already have, rather
 * than a second account.
 *
 * The same fields signup collects, because it is the same operation: the
 * backend runs both through one `createBusinessForUser`. Defaults match
 * signup's for the same reason — someone adding their second shop in the same
 * country should not have to retype the country.
 *
 * On success the app switches to the new business immediately. Creating one and
 * then leaving the person on the old one would mean the very next thing they do
 * (add a branch) lands in the wrong place.
 */
export default function AddBusinessScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const addBusiness = useAuthStore((s) => s.addBusiness);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const currentBusiness = useAuthStore((s) => s.business);

  // Seeded from the business being acted under: a second branch of the same
  // operation is far more likely than one on another continent, and every one
  // of these is editable.
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<Industry>(currentBusiness?.industry ?? 'RETAIL');
  const [country, setCountry] = useState(currentBusiness?.country ?? 'IN');
  const [defaultCurrency, setDefaultCurrency] = useState(currentBusiness?.defaultCurrency ?? 'INR');
  const [timezone, setTimezone] = useState(currentBusiness?.timezone ?? 'Asia/Kolkata');
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    country.trim().length > 0 &&
    defaultCurrency.trim().length > 0 &&
    timezone.trim().length > 0 &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await addBusiness({
        name: name.trim(),
        industry,
        country: country.trim(),
        defaultCurrency: defaultCurrency.trim(),
        timezone: timezone.trim(),
      });
      haptics.success();
      navigation.goBack();
    } catch {
      haptics.error();
      // The store has already put the translated message on `error`; reading it
      // back keeps one source rather than formatting the same failure twice.
      setError(useAuthStore.getState().error);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('addBusiness.title')}</Text>
            <PressableScale testID="add-business-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <Text style={styles.subtitle}>{t('addBusiness.subtitle')}</Text>
            </AnimatedEntrance>

            {error ? (
              <AnimatedEntrance key={error} delay={0} distance={-8}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(1)}>
              <View style={styles.card}>
                <FormInput
                  testID="add-business-name"
                  label={t('addBusiness.name')}
                  icon="briefcase-outline"
                  placeholder={t('addBusiness.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                />

                <Text style={styles.fieldLabel}>{t('addBusiness.industry')}</Text>
                <View style={styles.grid}>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <View key={opt.value} style={styles.gridItem}>
                      <SegmentedOption
                        testID={`add-business-industry-${opt.value}`}
                        title={t(`industry.${opt.value}`)}
                        caption={t(`industry.${opt.value}_caption`)}
                        icon={opt.icon}
                        selected={industry === opt.value}
                        onPress={() => setIndustry(opt.value)}
                      />
                    </View>
                  ))}
                </View>

                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-business-country"
                      label={t('addBusiness.country')}
                      icon="flag-outline"
                      autoCapitalize="characters"
                      value={country}
                      onChangeText={setCountry}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-business-currency"
                      label={t('addBusiness.currency')}
                      icon="cash-outline"
                      autoCapitalize="characters"
                      value={defaultCurrency}
                      onChangeText={setDefaultCurrency}
                    />
                  </View>
                </View>

                <FormInput
                  testID="add-business-timezone"
                  label={t('addBusiness.timezone')}
                  icon="time-outline"
                  hint={t('addBusiness.timezoneHint')}
                  value={timezone}
                  onChangeText={setTimezone}
                />
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)} style={styles.submitWrap}>
              <PrimaryButton
                testID="add-business-submit"
                title={isSubmitting ? t('addBusiness.submitting') : t('addBusiness.submit')}
                icon="arrow-forward"
                loading={isSubmitting}
                disabled={!canSubmit}
                onPress={handleSubmit}
              />
              <Text style={styles.footnote}>{t('addBusiness.switchNote')}</Text>
            </AnimatedEntrance>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, ...shadow.md },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  gridItem: { width: '48%' },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  submitWrap: { marginTop: spacing.lg },
  footnote: {
    fontSize: 12.5,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 17,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
