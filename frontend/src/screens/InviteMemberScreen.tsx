import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { inviteMember } from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import type { ApiErrorBody } from '@/api/errorMessages';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useCashierByBranch } from '@/hooks/useTeam';
import { refreshTeam } from '@/store/teamStore';
import { confirm } from '@/utils/confirm';
import { isValidEmail } from '@/utils/validation';
import { ROLES, roleHas } from '@/permissions';
import { SINGLE_BRANCH_ROLE } from '@/permissions/explain';
import type { MembershipRole } from '@/types/user';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import CashierBranchPicker from '@/components/CashierBranchPicker';
import FormInput from '@/components/FormInput';
import OptionRow from '@/components/OptionRow';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { useBusinessId } from '@/hooks/useBusinessId';

type Props = NativeStackScreenProps<AppStackParamList, 'InviteMember'>;

// OWNER is a valid MembershipRole but is never invitable (there's exactly
// one, created at signup) — narrowing the type here, not just the runtime
// list below, is what keeps roleHint_OWNER from needing to exist at all.
type InvitableRole = Exclude<MembershipRole, 'OWNER'>;

// Derived from the permission matrix, and deliberately: a hand-written list
// here is how a role ends up existing in the database, holding capabilities in
// the matrix, and being impossible to actually give anyone. The backend's
// validator derives the same list from the same matrix.
const INVITABLE_ROLES = ROLES.filter((r): r is InvitableRole => r !== 'OWNER');

// Which roles a branch selection is required for.
//
// MANAGER left this set in requirement 14: the role is business-wide now, so
// its BranchAccess rows have no effect and asking for them would be theatre.
// These are the roles whose reach `branch:allAccess` does NOT cover.
const BRANCH_SCOPED_ROLES = new Set<InvitableRole>(
  INVITABLE_ROLES.filter((r) => !roleHas(r, 'branch:allAccess'))
);

/**
 * Requirement 18 - one branch, and one cashier on it.
 *
 * Read from the mirrored matrix rather than written as a literal role name, and
 * compared with the backend by `lint:permissions`, so the picker below cannot
 * offer a shape the server refuses. For this one role the branch list is
 * single-select: tick-boxes would let somebody choose two branches, and the
 * invite would be rejected before it was ever created.
 */
const isSingleBranchRole = (role: InvitableRole) => role === SINGLE_BRANCH_ROLE;

/**
 * Is this failure requirement 18's "that branch already has a cashier"?
 *
 * The 409 carries the holder's name as a param, which is the whole reason the
 * app can ask a real question instead of reporting a failure and leaving the
 * admin to work out what to do next.
 */
function asBranchConflict(err: unknown): { branch: string; cashier: string } | null {
  const body = (err as { response?: { status?: number; data?: ApiErrorBody } }).response;
  if (body?.status !== 409 || body.data?.code !== 'BRANCH_ALREADY_HAS_CASHIER') return null;
  const params = body.data.params ?? {};
  if (typeof params.branch !== 'string' || typeof params.cashier !== 'string') return null;
  return { branch: params.branch, cashier: params.cashier };
}

// Six roles is past the point where a name alone identifies one at a glance,
// so each gets a glyph.
//
// A Record over InvitableRole rather than a partial map, deliberately: adding a
// role to the permission matrix now fails `tsc` here until someone chooses its
// icon. The alternative is a lookup that silently returns undefined and renders
// a row with a hole where every other row has a symbol.
const ROLE_ICONS: Record<InvitableRole, keyof typeof Ionicons.glyphMap> = {
  ADMIN: 'shield-checkmark-outline',
  MANAGER: 'briefcase-outline',
  WAREHOUSE: 'cube-outline',
  CASHIER: 'receipt-outline',
  DELIVERY_AGENT: 'bicycle-outline',
  STAFF: 'person-outline',
};

export default function InviteMemberScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { tradingBranches: branches } = useBranches();
  /**
   * Requirement 18: who already holds each branch, so the picker can say so
   * before the admin chooses rather than after the server refuses.
   *
   * A hint, not the rule. This route is gated on `team:invite` while the member
   * list behind the hint needs `team:view` — the same roles hold both today, but
   * if that ever stopped being true the map would simply come back empty and
   * every branch would read "no cashier yet". Nothing breaks, because the
   * *server* is what enforces the rule and its 409 names the holder, which is
   * what the confirmation below is built from.
   */
  const cashierByBranch = useCashierByBranch();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('STAFF');
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);
  const needsBranches = BRANCH_SCOPED_ROLES.has(role);
  const singleBranch = isSingleBranchRole(role);

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

  /**
   * Changing the role can leave an illegal selection behind: pick two branches
   * for a staff member, then switch to cashier, and the invite would be refused
   * for a choice that is no longer on screen. Keep the first and drop the rest.
   */
  function chooseRole(next: InvitableRole) {
    setRole(next);
    if (isSingleBranchRole(next)) {
      setSelectedBranchIds((prev) => new Set([...prev].slice(0, 1)));
    }
  }

  function send(id: string, confirmSwap: boolean) {
    return inviteMember(id, {
      email: emailTrimmed,
      role,
      branchIds: needsBranches ? Array.from(selectedBranchIds) : undefined,
      ...(confirmSwap ? { confirm: true } : {}),
    });
  }

  function done() {
    haptics.success();
    // The Team screen and this screen's own branch hints read one store, so the
    // new member has to reach it before we navigate back to the list.
    void refreshTeam();
    navigation.goBack();
  }

  function report(err: unknown) {
    haptics.error();
    setError(extractErrorMessage(err));
    setIsSubmitting(false);
  }

  /**
   * Requirement 18's swap, at the invite door.
   *
   * The server refuses an occupied branch with a 409 that **names the cashier
   * holding it**, which is what lets this ask a real question - "moving it to
   * this person leaves Hari with no branch" - rather than reporting a failure and
   * making the admin work out what to do. Confirming resends the same request
   * with `confirm`, so there is one code path and one decision.
   */
  async function handleSubmit() {
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await send(businessId, false);
      done();
      return;
    } catch (err) {
      const conflict = asBranchConflict(err);
      if (!conflict) {
        report(err);
        return;
      }
      setIsSubmitting(false);
      const ok = await confirm({
        title: t('inviteMember.swapTitle'),
        body: t('inviteMember.swapBody', conflict),
        confirmLabel: t('inviteMember.swapConfirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }

    setIsSubmitting(true);
    try {
      await send(businessId, true);
      done();
    } catch (err) {
      report(err);
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
                {/* A list rather than a row of chips: six roles cannot share a
                    line, and the hint belongs beside the role it describes
                    rather than under the group, where it only ever described
                    whichever one happened to be selected. */}
                <View style={styles.roleList} accessibilityRole="radiogroup">
                  {INVITABLE_ROLES.map((r) => (
                    <OptionRow
                      key={r}
                      testID={`invite-member-role-${r}`}
                      icon={ROLE_ICONS[r]}
                      title={t(`role.${r}`)}
                      description={t(`inviteMember.roleHint_${r}`)}
                      selected={role === r}
                      onPress={() => chooseRole(r)}
                    />
                  ))}
                </View>
              </View>
            </AnimatedEntrance>

            {needsBranches ? (
              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('inviteMember.branchSection')}</Text>
                  {/* Requirement 18 - a cashier gets a single-select list that
                      names each branch's current cashier. Chips would offer a
                      second branch the server will not accept, and have no room
                      for the sentence that turns a refusal into a decision.
                      Every other branch-scoped role keeps the multi-select grid:
                      a delivery agent covering three branches stays possible. */}
                  {singleBranch ? (
                    <>
                      <Text style={styles.sectionHint}>{t('inviteMember.cashierBranchHint')}</Text>
                      <CashierBranchPicker
                        branches={branches}
                        cashierByBranch={cashierByBranch}
                        selectedBranchId={[...selectedBranchIds][0] ?? null}
                        onSelect={(branchId) => {
                          haptics.select();
                          setSelectedBranchIds(new Set([branchId]));
                        }}
                        testIDPrefix="invite-member-branch"
                      />
                    </>
                  ) : (
                    <>
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
                      {branches.length === 0 ? (
                        <Text style={styles.emptyText}>{t('inviteMember.noBranches')}</Text>
                      ) : null}
                    </>
                  )}
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
  // Sits between the uppercase section label and the list, which already has
  // the label's bottom margin above it, so this only needs the gap below.
  sectionHint: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
  roleList: { gap: spacing.sm },
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
