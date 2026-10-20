import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { changePassword } from '@/api/auth';
import { extractErrorMessage } from '@/api/client';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PasswordStrength from '@/components/PasswordStrength';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import { useScreenEdges } from '@/hooks/useScreenEdges';
import { haptics } from '@/utils/haptics';
import { colors, radius, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

type Props = NativeStackScreenProps<AppStackParamList, 'ChangePassword'>;

const MIN_LENGTH = 8;

/**
 * Change the password while signed in.
 *
 * The primitive that was missing: until this existed there was no way to change
 * a password at all, which is also why Settings had nowhere to put one.
 *
 * The server hands back a **new token**, because the change ends every session
 * older than it. Without replacing the stored one, changing your password would
 * sign you out of the device you did it on — while still, correctly, signing out
 * all the others.
 */
export default function ChangePasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const edges = useScreenEdges();
  const replaceToken = useAuthStore((s) => s.replaceToken);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_LENGTH && newPassword === confirm && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { token } = await changePassword({ currentPassword, newPassword });
      await replaceToken(token);
      haptics.success();
      navigation.goBack();
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
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('changePassword.title')}</Text>
          <PressableScale
            testID="change-password-close"
            style={styles.close}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.hint}>{t('changePassword.hint')}</Text>

                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <FormInput
                  testID="change-password-current"
                  label={t('changePassword.current')}
                  icon="lock-closed-outline"
                  isPassword
                  value={currentPassword}
                  onChangeText={(text) => {
                    setCurrentPassword(text);
                    if (error) setError(null);
                  }}
                />
                <FormInput
                  testID="change-password-new"
                  label={t('changePassword.new')}
                  icon="key-outline"
                  isPassword
                  hint={t('signup.passwordHint')}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <PasswordStrength password={newPassword} />
                <FormInput
                  testID="change-password-confirm"
                  label={t('changePassword.confirm')}
                  icon="shield-checkmark-outline"
                  isPassword
                  value={confirm}
                  onChangeText={setConfirm}
                />
                {confirm !== '' && confirm !== newPassword ? (
                  <Text style={styles.mismatch}>{t('resetPassword.passwordMismatch')}</Text>
                ) : null}

                <PrimaryButton
                  testID="change-password-submit"
                  title={isSubmitting ? t('resetPassword.saving') : t('changePassword.submit')}
                  icon="checkmark"
                  loading={isSubmitting}
                  disabled={!canSubmit}
                  onPress={() => void handleSubmit()}
                />
              </View>
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { ...typography.title, color: colors.text, flex: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  hint: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  mismatch: { fontSize: 12.5, color: colors.error, marginTop: -spacing.xs },
});
