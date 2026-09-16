import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuthStore } from '@/store/authStore';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import AuthHeader from '@/components/AuthHeader';
import FormInput from '@/components/FormInput';
import HeroCard from '@/components/HeroCard';
import InfoCard from '@/components/InfoCard';
import Pill from '@/components/Pill';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SectionDivider from '@/components/SectionDivider';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useAuthStore((s) => s.login);
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

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await login({ email: email.trim().toLowerCase(), password });
      haptics.success();
    } catch {
      // error is already captured in the store and rendered below
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <AuthHeader />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(1)} style={styles.intro}>
              <Pill label={t('login.pill')} icon="trending-up" />
              <Text style={styles.heading}>
                {t('login.headingPrefix')} <Text style={styles.headingBrand}>BizIQ</Text>
              </Text>
              <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)}>
              <HeroCard
                eyebrow={t('login.heroEyebrow')}
                title={t('login.heroTitle')}
                subtitle={t('login.heroSubtitle')}
                icon="bar-chart"
              />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(3)}>
              <SectionDivider label={t('login.divider')} />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(4)}>
              <Animated.View style={[styles.card, shakeStyle]}>
                {error ? (
                  <AnimatedEntrance key={error} delay={0} distance={-8}>
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle" size={16} color={colors.error} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  </AnimatedEntrance>
                ) : null}

                <FormInput
                  testID="login-email"
                  label={t('login.email')}
                  icon="mail-outline"
                  placeholder={t('login.emailPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) clearError();
                  }}
                />
                <FormInput
                  testID="login-password"
                  label={t('login.password')}
                  icon="lock-closed-outline"
                  placeholder={t('login.passwordPlaceholder')}
                  isPassword
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) clearError();
                  }}
                />

                <PrimaryButton
                  testID="login-submit"
                  title={isSubmitting ? t('login.submitting') : t('login.submit')}
                  icon="arrow-forward"
                  loading={isSubmitting}
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                />
              </Animated.View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(5)} style={styles.footerCard}>
              <InfoCard
                testID="login-goto-signup"
                icon="storefront-outline"
                title={t('login.registerTitle')}
                subtitle={t('login.registerSubtitle')}
                onPress={() => navigation.navigate('Signup')}
              />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(6)}>
              <Text style={styles.footerNote}>{t('login.footer')}</Text>
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
  intro: { marginTop: spacing.xl, gap: spacing.md },
  heading: { fontSize: 31, fontWeight: '800', color: colors.text, letterSpacing: -0.6, lineHeight: 38 },
  headingBrand: { color: colors.primary },
  subtitle: { fontSize: 14.5, color: colors.textSecondary, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.md,
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
  footerCard: { marginTop: spacing.lg },
  footerNote: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
