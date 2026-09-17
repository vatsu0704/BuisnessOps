import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { grantBranchAccess, inviteMember } from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { isValidEmail } from '@/utils/validation';
import type { MembershipRole } from '@/types/user';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'InviteMember'>;

// OWNER is a valid MembershipRole but is never invitable (there's exactly
// one, created at signup) — narrowing the type here, not just the runtime
// list below, is what keeps roleHint_OWNER from needing to exist at all.
type InvitableRole = Exclude<MembershipRole, 'OWNER'>;
const INVITABLE_ROLES: InvitableRole[] = ['ADMIN', 'MANAGER', 'STAFF'];
const BRANCH_SCOPED_ROLES = new Set<InvitableRole>(['MANAGER', 'STAFF']);

export default function InviteMemberScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);
  const { branches } = useBranches();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('STAFF');
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);
  const needsBranches = BRANCH_SCOPED_ROLES.has(role);

  const canSubmit =
    !!businessId &&
    emailTrimmed.length > 0 &&
    !emailInvalid &&
    (!needsBranches || selectedBranchIds.size > 0) &&
    !isSubmitting;

  function toggleBranch(branchId: string) {
    haptics.select();
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const membership = await inviteMember(businessId, { email: emailTrimmed, role });
      if (needsBranches) {
        await Promise.all(
          Array.from(selectedBranchIds).map((branchId) => grantBranchAccess(businessId, membership.id, branchId))
        );
      }
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('inviteMember.title')}</Text>
            <PressableScale testID="invite-member-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <Text style={styles.subtitle}>{t('inviteMember.subtitle')}</Text>
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
                  testID="invite-member-email"
                  label={t('inviteMember.email')}
                  icon="mail-outline"
                  placeholder={t('inviteMember.emailPlaceholder')}
                  hint={t('inviteMember.emailHint')}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                {emailInvalid ? <Text style={styles.fieldError}>{t('inviteMember.emailInvalid')}</Text> : null}

                <Text style={styles.sectionTitle}>{t('inviteMember.roleSection')}</Text>
                <View style={styles.chipRow}>
                  {INVITABLE_ROLES.map((r) => (
                    <SegmentedOption
                      key={r}
                      testID={`invite-member-role-${r}`}
                      title={t(`role.${r}`)}
                      selected={role === r}
                      onPress={() => setRole(r)}
                    />
                  ))}
                </View>
                <Text style={styles.roleHint}>{t(`inviteMember.roleHint_${role}`)}</Text>
              </View>
            </AnimatedEntrance>

            {needsBranches ? (
              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('inviteMember.branchSection')}</Text>
                  <View style={styles.grid}>
                    {branches.map((b) => (
                      <View key={b.id} style={styles.gridItem}>
                        <SegmentedOption
                          testID={`invite-member-branch-${b.code}`}
                          title={b.name}
                          caption={b.code}
                          icon="storefront-outline"
                          selected={selectedBranchIds.has(b.id)}
                          onPress={() => toggleBranch(b.id)}
                        />
                      </View>
                    ))}
                  </View>
                  {branches.length === 0 ? <Text style={styles.emptyText}>{t('inviteMember.noBranches')}</Text> : null}
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(3)} style={styles.submitWrap}>
              <PrimaryButton
                testID="invite-member-submit"
                title={isSubmitting ? t('inviteMember.submitting') : t('inviteMember.submit')}
                icon="arrow-forward"
                loading={isSubmitting}
                disabled={!canSubmit}
                onPress={handleSubmit}
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
  block: { marginTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  roleHint: { fontSize: 12.5, color: colors.textTertiary, marginTop: spacing.sm, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48%' },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.sm },
  submitWrap: { marginTop: spacing.lg },
  fieldError: { fontSize: 12.5, color: colors.error, marginTop: -spacing.sm, marginBottom: spacing.md },
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
