import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuthStore } from '@/store/authStore';
import type { Industry } from '@/types/business';
import { isValidEmail } from '@/utils/validation';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import AuthHeader from '@/components/AuthHeader';
import FormInput from '@/components/FormInput';
import InfoCard from '@/components/InfoCard';
import PasswordStrength from '@/components/PasswordStrength';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

// Labels and captions come from the translation files, keyed by `value`.
const INDUSTRIES: { value: Industry; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'RETAIL', icon: 'storefront-outline' },
  { value: 'FOOD_BEVERAGE', icon: 'restaurant-outline' },
  { value: 'SERVICES', icon: 'construct-outline' },
  { value: 'FRANCHISE_OTHER', icon: 'business-outline' },
];

export default function SignupScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [industry, setIndustry] = useState<Industry>('RETAIL');
  const [country, setCountry] = useState('IN');
  const [defaultCurrency, setDefaultCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  const signup = useAuthStore((s) => s.signup);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const shakeX = useSharedValue(0);
  const lastError = useRef<string | null>(null);

  useEffect(() => {
    const current = error ?? null;
    if (current && current !== lastError.current) {
      shakeX.value = withSequence(
        withTiming(-8, { duration: 45 }),
        withTiming(8, { duration: 45 }),
        withTiming(-5, { duration: 45 }),
        withTiming(5, { duration: 45 }),
        withTiming(0, { duration: 45 })
      );
      haptics.error();
    }
    lastError.current = current;
  }, [error, shakeX]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword;
  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);

  const canSubmit =
    name.trim().length > 0 &&
    businessName.trim().length > 0 &&
    emailTrimmed.length > 0 &&
    !emailInvalid &&
    password.length >= 8 &&
    password === confirmPassword &&
    country.trim().length > 0 &&
    defaultCurrency.trim().length > 0 &&
    timezone.trim().length > 0 &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await signup({
        name: name.trim(),
        businessName: businessName.trim(),
        email: email.trim().toLowerCase(),
        password,
        industry,
        country: country.trim(),
        defaultCurrency: defaultCurrency.trim(),
        timezone: timezone.trim(),
      });
      haptics.success();
    } catch {
      // error is already captured in the store and rendered below
    }
  }

  function onFieldChange(setter: (text: string) => void) {
    return (text: string) => {
      setter(text);
      if (error) clearError();
    };
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <AuthHeader caption={t('signup.headerCaption')} onBack={() => navigation.navigate('Login')} />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(1)} style={styles.intro}>
              <Pill label={t('signup.pill')} icon="git-branch-outline" />
              <Text style={styles.heading}>{t('signup.heading')}</Text>
              <Text style={styles.subtitle}>{t('signup.subtitle')}</Text>
            </AnimatedEntrance>

            {error ? (
              <AnimatedEntrance key={error} delay={0} distance={-8}>
                <Animated.View style={[styles.errorBanner, shakeStyle]}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(2)}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('signup.accountSection')}</Text>

                <FormInput
                  testID="signup-name"
                  label={t('signup.fullName')}
                  icon="person-outline"
                  placeholder={t('signup.fullNamePlaceholder')}
                  value={name}
                  onChangeText={onFieldChange(setName)}
                />
                <FormInput
                  testID="signup-email"
                  label={t('signup.email')}
                  icon="mail-outline"
                  placeholder={t('signup.emailPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={onFieldChange(setEmail)}
                />
                {emailInvalid ? <Text style={styles.mismatch}>{t('signup.emailInvalid')}</Text> : null}
                <FormInput
                  testID="signup-password"
                  label={t('signup.createPassword')}
                  hint={t('signup.passwordHint')}
                  icon="lock-closed-outline"
                  placeholder={t('signup.passwordPlaceholder')}
                  isPassword
                  value={password}
                  onChangeText={onFieldChange(setPassword)}
                />
                <PasswordStrength password={password} />

                <FormInput
                  testID="signup-confirm-password"
                  label={t('signup.confirmPassword')}
                  icon="shield-checkmark-outline"
                  placeholder={t('signup.confirmPlaceholder')}
                  isPassword
                  value={confirmPassword}
                  onChangeText={onFieldChange(setConfirmPassword)}
                />
                {passwordsMatch ? null : <Text style={styles.mismatch}>{t('signup.mismatch')}</Text>}
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(3)}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('signup.businessSection')}</Text>

                <FormInput
                  testID="signup-businessName"
                  label={t('signup.businessName')}
                  icon="briefcase-outline"
                  placeholder={t('signup.businessNamePlaceholder')}
                  value={businessName}
                  onChangeText={onFieldChange(setBusinessName)}
                />

                <Text style={styles.fieldLabel}>{t('signup.industry')}</Text>
                <View style={styles.grid}>
                  {INDUSTRIES.map((opt) => (
                    <View key={opt.value} style={styles.gridItem}>
                      <SegmentedOption
                        testID={`signup-industry-${opt.value}`}
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
                      label={t('signup.country')}
                      icon="flag-outline"
                      autoCapitalize="characters"
                      value={country}
                      onChangeText={onFieldChange(setCountry)}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      label={t('signup.currency')}
                      icon="cash-outline"
                      autoCapitalize="characters"
                      value={defaultCurrency}
                      onChangeText={onFieldChange(setDefaultCurrency)}
                    />
                  </View>
                </View>

                <FormInput
                  label={t('signup.timezone')}
                  icon="time-outline"
                  value={timezone}
                  onChangeText={onFieldChange(setTimezone)}
                />
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(4)}>
              <PrimaryButton
                testID="signup-submit"
                title={isSubmitting ? t('signup.submitting') : t('signup.submit')}
                icon="arrow-forward"
                loading={isSubmitting}
                disabled={!canSubmit}
                onPress={handleSubmit}
              />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(5)} style={styles.infoWrap}>
              <InfoCard
                icon="cloud-upload-outline"
                title={t('signup.dataTitle')}
                subtitle={t('signup.dataSubtitle')}
              />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(6)}>
              <PressableScale
                testID="signup-goto-login"
                onPress={() => navigation.navigate('Login')}
                style={styles.linkWrap}
                scaleTo={0.97}
              >
                <Text style={styles.link}>
                  {t('signup.haveAccount')} <Text style={styles.linkStrong}>{t('signup.logIn')}</Text>
                </Text>
              </PressableScale>
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
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  intro: { marginTop: spacing.xl, marginBottom: spacing.xl, gap: spacing.md },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5, lineHeight: 34 },
  subtitle: { fontSize: 14.5, color: colors.textSecondary, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadow.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.lg,
  },
  fieldLabel: { ...typography.label, color: colors.text, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  gridItem: { width: '48%' },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  mismatch: { fontSize: 12.5, color: colors.error, marginTop: -spacing.sm, marginBottom: spacing.sm },
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
  infoWrap: { marginTop: spacing.lg },
  linkWrap: { marginTop: spacing.xl, alignItems: 'center' },
  link: { color: colors.textSecondary, fontSize: 14 },
  linkStrong: { color: colors.primary, fontWeight: '700' },
});
