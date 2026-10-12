import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import DangerButton from '@/components/DangerButton';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { haptics } from '@/utils/haptics';
import { openLegalPage } from '@/utils/legalLinks';

type Props = NativeStackScreenProps<AppStackParamList, 'DeleteAccount'>;

/**
 * Deleting your own account — required by both app stores of any app that lets
 * people sign up. The server decides what goes (backend
 * `services/account.service.js`); this screen's job is to say so plainly before
 * anybody presses the button, because nothing here can be undone.
 *
 * Which businesses go with the account is read from the memberships the session
 * already has. It is **ownership**, not a permission: every business has exactly
 * one `OWNER` membership, the one that created it, and `OWNER` cannot be granted
 * by invitation. So this is a fact about the account's shape, like
 * `SINGLE_BRANCH_ROLE`, rather than a role check standing in for a capability.
 *
 * Whether an owned business still has a team is the server's call, made inside
 * the transaction that would delete it. Guessing here from a team list that may
 * be minutes old would only ever be a second, weaker copy of that check.
 */
export default function DeleteAccountScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const isSubmitting = useAuthStore((s) => s.isSubmitting);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const active = (user?.memberships ?? []).filter((m) => m.status === 'ACTIVE');
  const owned = active.filter((m) => m.role === 'OWNER');
  const workedIn = active.filter((m) => m.role !== 'OWNER');
  const canSubmit = password.length > 0 && !isSubmitting;

  async function handleDelete() {
    if (!canSubmit) return;
    setError(null);
    const sure = await confirm({
      title: t('deleteAccount.confirmTitle'),
      body: owned.length > 0 ? t('deleteAccount.confirmBodyOwner') : t('deleteAccount.confirmBody'),
      confirmLabel: t('deleteAccount.confirmAction'),
      cancelLabel: t('common.cancel'),
    });
    if (!sure) return;

    try {
      // On success the session ends and the navigator swaps to sign-in by
      // itself, unmounting this screen — so there is nothing to do after it.
      await deleteAccount(password);
      haptics.success();
    } catch {
      haptics.error();
      setError(useAuthStore.getState().error);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('deleteAccount.title')}</Text>
            <PressableScale testID="delete-account-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <Text style={styles.subtitle}>{t('deleteAccount.subtitle')}</Text>
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
                <Text style={styles.sectionTitle}>{t('deleteAccount.goesTitle')}</Text>
                <Bullet icon="person-remove-outline" text={t('deleteAccount.goesAccount')} />
                {owned.length > 0 ? (
                  <>
                    <Bullet icon="business-outline" text={t('deleteAccount.goesBusinesses')} />
                    <View style={styles.names}>
                      {owned.map((m) => (
                        <Text key={m.id} style={styles.name}>
                          {m.business.name}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.tip}>
                      <Ionicons name="download-outline" size={16} color={colors.primary} />
                      <Text style={styles.tipText}>{t('deleteAccount.exportFirst')}</Text>
                    </View>
                    <Text style={styles.note}>{t('deleteAccount.teamRule')}</Text>
                  </>
                ) : null}
              </View>
            </AnimatedEntrance>

            {workedIn.length > 0 ? (
              <AnimatedEntrance delay={step(2)}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('deleteAccount.staysTitle')}</Text>
                  <Bullet icon="exit-outline" text={t('deleteAccount.losesAccess')} />
                  <View style={styles.names}>
                    {workedIn.map((m) => (
                      <Text key={m.id} style={styles.name}>
                        {m.business.name}
                      </Text>
                    ))}
                  </View>
                  <Bullet icon="document-text-outline" text={t('deleteAccount.employerKeeps')} />
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(3)}>
              <View style={styles.card}>
                <FormInput
                  testID="delete-account-password"
                  label={t('deleteAccount.passwordLabel')}
                  hint={t('deleteAccount.passwordHint')}
                  icon="lock-closed-outline"
                  isPassword
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={handleDelete}
                />
                <DangerButton
                  testID="delete-account-submit"
                  variant="solid"
                  icon="trash-outline"
                  title={isSubmitting ? t('deleteAccount.submitting') : t('deleteAccount.submit')}
                  loading={isSubmitting}
                  disabled={!canSubmit}
                  onPress={handleDelete}
                />
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(4)}>
              <PressableScale
                testID="delete-account-details"
                style={styles.linkWrap}
                scaleTo={0.97}
                onPress={() => openLegalPage('delete-account')}
              >
                <Text style={styles.link}>{t('deleteAccount.readMore')}</Text>
              </PressableScale>
            </AnimatedEntrance>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Bullet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.bullet}>
      <Ionicons name={icon} size={17} color={colors.textSecondary} style={styles.bulletIcon} />
      <Text style={styles.bulletText}>{text}</Text>
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
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  subtitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, ...shadow.sm },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bulletIcon: { marginTop: 1 },
  bulletText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  names: { paddingLeft: spacing.xl + 1, gap: spacing.xs },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  tipText: { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '600', lineHeight: 18 },
  note: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
  linkWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  link: { fontSize: 13.5, color: colors.primary, fontWeight: '600', textAlign: 'center' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
