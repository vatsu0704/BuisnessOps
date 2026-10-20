import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { forgotPassword } from '@/api/auth';
import { extractErrorMessage } from '@/api/client';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import AuthHeader from '@/components/AuthHeader';
import FormInput from '@/components/FormInput';
import InfoCard from '@/components/InfoCard';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SectionDivider from '@/components/SectionDivider';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { isValidEmail } from '@/utils/validation';
import { haptics } from '@/utils/haptics';
import { colors, radius, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

/**
 * Ask for a link to set a new password.
 *
 * ## Why it says the same thing either way
 *
 * The server answers identically whether or not the address has an account, so
 * this screen must too. Saying "no account with that address" would turn a
 * public endpoint into a way of asking who banks here.
 *
 * ## Why the new password is not set here
 *
 * The link in the email opens the **web** page. The app would otherwise need
 * deep links that work before anybody is signed in, which nothing here does
 * today — its deep links are notification taps inside the signed-in navigator.
 * Setting the password in a browser and then signing in to the app with it is
 * one extra step and no new machinery.
 */
export default function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isValidEmail(email) && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      haptics.success();
      setSent(true);
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <AuthHeader />
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <Text style={styles.title}>{t('forgotPassword.title')}</Text>
              <Text style={styles.subtitle}>{t('forgotPassword.subtitle')}</Text>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <SectionDivider label={t('forgotPassword.divider')} />
            </AnimatedEntrance>

            {sent ? (
              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <View style={styles.card}>
                  <View style={styles.sentHead}>
                    <Ionicons name="mail-open-outline" size={18} color={colors.success} />
                    <Text style={styles.sentTitle}>{t('forgotPassword.sentTitle')}</Text>
                  </View>
                  <Text style={styles.sentBody}>{t('forgotPassword.sentBody', { email: email.trim() })}</Text>
                  <Text style={styles.sentNote}>{t('forgotPassword.sentNote')}</Text>
                </View>
              </AnimatedEntrance>
            ) : (
              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <View style={styles.card}>
                  {error ? (
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle" size={16} color={colors.error} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <FormInput
                    testID="forgot-password-email"
                    label={t('login.email')}
                    icon="mail-outline"
                    placeholder={t('login.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (error) setError(null);
                    }}
                  />

                  <PrimaryButton
                    testID="forgot-password-submit"
                    title={isSubmitting ? t('forgotPassword.sending') : t('forgotPassword.submit')}
                    icon="arrow-forward"
                    loading={isSubmitting}
                    disabled={!canSubmit}
                    onPress={() => void handleSubmit()}
                  />
                </View>
              </AnimatedEntrance>
            )}

            <AnimatedEntrance delay={step(4)} style={styles.block}>
              <InfoCard
                testID="forgot-password-back"
                icon="log-in-outline"
                title={t('forgotPassword.backToLogin')}
                subtitle={t('forgotPassword.backToLoginSubtitle')}
                onPress={() => navigation.goBack()}
              />
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
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.lg },
  title: { ...typography.title, color: colors.text },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  sentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sentTitle: { fontSize: 15, fontWeight: '800', color: colors.success },
  sentBody: { fontSize: 14, lineHeight: 20, color: colors.text },
  sentNote: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
});
