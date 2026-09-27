import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { createStaffMember } from '@/api/staff';
import { listMemberships } from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { roleHas } from '@/permissions';
import type { TeamMember } from '@/types/team';
import { isValidEmail, parseOptionalNumber } from '@/utils/validation';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { can } from '@/utils/permissions';

type Props = NativeStackScreenProps<AppStackParamList, 'AddStaff'>;

export default function AddStaffScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { branches } = useBranches();
  const canSetPay = can.setPay(membership);

  const [branchId, setBranchId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [email, setEmail] = useState('');

  /**
   * The team, so that typing an email can say who this person already is.
   *
   * Only fetched for someone who may read the team — a cashier adding staff at
   * their own branch holds `staff:create` and not `team:view`, and for them
   * this stays empty and the screen behaves exactly as it did.
   */
  const [team, setTeam] = useState<TeamMember[]>([]);
  useEffect(() => {
    if (!businessId || !can.manageTeam(membership)) return;
    // A failed lookup is not an error worth showing: it only costs the hint.
    listMemberships(businessId)
      .then(setTeam)
      .catch(() => {});
  }, [businessId, membership]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const emailInvalid = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);

  /**
   * Who this email already is in this business.
   *
   * The email field was only ever "link an account so they can punch in". It
   * also happens to be the one thing on this form that identifies a person the
   * business already knows, so it can answer the question the form was making
   * the owner answer by hand: a warehouse person is not attached to a shop.
   */
  const matched = useMemo(() => {
    const needle = emailTrimmed.toLowerCase();
    if (!needle) return null;
    return team.find((m) => m.user.email.toLowerCase() === needle && m.status === 'ACTIVE') ?? null;
  }, [team, emailTrimmed]);

  // Whose work is not tied to one location: a delivery agent, the warehouse
  // desk, an admin. Asked of the capability matrix, never of a role name — so
  // a role added later that reaches every branch lands here by itself.
  const matchedReachesEveryBranch = !!matched && roleHas(matched.role, 'branch:allAccess');

  /**
   * Choose the location when there is nothing to choose.
   *
   * Two unambiguous cases, and no others — guessing for a branch-scoped person
   * would file someone at the wrong shop silently, which is worse than a tap:
   *
   *  1. The business has one location. There is no decision to make.
   *  2. The email belongs to somebody whose work spans every branch, and a
   *     warehouse exists. A delivery agent is at no branch in particular and
   *     the warehouse desk is at all of them; the business's own premises is
   *     the base either of them would name, and it is usually the only
   *     location that is not somebody else's shop.
   *
   * It never overwrites a choice already made by hand.
   */
  const warehouse = useMemo(() => branches.find((b) => b.kind === 'WAREHOUSE') ?? null, [branches]);
  useEffect(() => {
    if (branchId) return;
    if (matchedReachesEveryBranch && warehouse) setBranchId(warehouse.id);
    else if (branches.length === 1) setBranchId(branches[0].id);
  }, [branchId, branches, matchedReachesEveryBranch, warehouse]);

  /**
   * Offer their membership role as the job title.
   *
   * `StaffMember.role` is free text — "Cashier", "Senior rider" — and is not
   * the membership role. But when the business already knows this person as a
   * delivery agent, typing "Delivery agent" again is work the screen can do.
   * Only while the field is untouched, so it is a suggestion and never an
   * overwrite.
   */
  const [roleTouched, setRoleTouched] = useState(false);
  useEffect(() => {
    if (roleTouched) return;
    // Mirrors the match both ways, so clearing the email clears a suggestion
    // that is no longer about anybody.
    setRole(matched ? t(`role.${matched.role}`) : '');
  }, [matched, roleTouched, t]);
  const baseSalaryParsed = parseOptionalNumber(baseSalary);
  const baseSalaryInvalid = baseSalaryParsed === null;

  const canSubmit =
    !!businessId &&
    !!branchId &&
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    !emailInvalid &&
    !baseSalaryInvalid &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || !businessId || !branchId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createStaffMember(businessId, {
        branchId,
        name: name.trim(),
        role: role.trim(),
        ...(canSetPay ? { baseSalary: baseSalaryParsed ?? undefined } : {}),
        email: emailTrimmed || undefined,
      });
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
            <Text style={styles.title}>{t('addStaff.title')}</Text>
            <PressableScale testID="add-staff-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <AnimatedEntrance delay={step(0)}>
              <Text style={styles.subtitle}>{t('addStaff.subtitle')}</Text>
            </AnimatedEntrance>

            {error ? (
              <AnimatedEntrance key={error} delay={0} distance={-8}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {/* --- Who they are -------------------------------------------
                First, and the email with it. The branch question below reads
                completely differently depending on the answer — a delivery
                agent works at none of these places — and this used to be the
                LAST card on the screen, so the form asked "which branch do
                they work at?" before it had any way of knowing that the answer
                was "none of them". Identity decides the question; it cannot
                come after it. --- */}
            <AnimatedEntrance delay={step(1)}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('addStaff.personSection')}</Text>
                <FormInput
                  testID="add-staff-email"
                  label={t('addStaff.email')}
                  hint={t('addStaff.emailHint')}
                  icon="mail-outline"
                  placeholder={t('addStaff.emailPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                {emailInvalid ? <Text style={styles.fieldError}>{t('addStaff.emailInvalid')}</Text> : null}

                {matched ? (
                  <View style={styles.matchCard}>
                    <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
                    <Text style={styles.matchText}>
                      {t('addStaff.knownMember', {
                        name: matched.user.name ?? matched.user.email,
                        role: t(`role.${matched.role}`),
                      })}
                    </Text>
                  </View>
                ) : null}

                <FormInput
                  testID="add-staff-name"
                  label={t('addStaff.name')}
                  icon="person-outline"
                  placeholder={t('addStaff.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                />
                <FormInput
                  testID="add-staff-role"
                  label={t('addStaff.role')}
                  icon="briefcase-outline"
                  placeholder={t('addStaff.rolePlaceholder')}
                  value={role}
                  onChangeText={(next) => {
                    setRoleTouched(true);
                    setRole(next);
                  }}
                />
              </View>
            </AnimatedEntrance>

            {/* --- Where they are based ----------------------------------- */}
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {matchedReachesEveryBranch
                    ? t('addStaff.branchHomeSection')
                    : t('addStaff.branchSection')}
                </Text>
                {/* A delivery agent works at none of these and a warehouse desk
                    ships to all of them — but attendance and payslips are filed
                    against a location, so they still have a base. Saying so is
                    what stops this reading as "which shop do they belong to". */}
                {matchedReachesEveryBranch ? (
                  <Text style={styles.sectionHint}>{t('addStaff.branchHomeHint')}</Text>
                ) : null}
                <View style={styles.grid}>
                  {branches.map((b) => (
                    <View key={b.id} style={styles.gridItem}>
                      <SegmentedOption
                        testID={`add-staff-branch-${b.code}`}
                        title={b.name}
                        caption={[
                          b.kind === 'WAREHOUSE' ? t('addBranch.kindWarehouse') : b.code,
                          b.city,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        icon={b.kind === 'WAREHOUSE' ? 'cube-outline' : 'storefront-outline'}
                        selected={branchId === b.id}
                        onPress={() => setBranchId(b.id)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            </AnimatedEntrance>

            {/* --- What they are paid -------------------------------------
                Hidden for anyone without staff:setPay, the same way
                EditStaffScreen hides it — the server 403s the whole request if
                the field is sent, so offering it would break creating the staff
                member at all, not just the pay. --- */}
            {canSetPay ? (
              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <View style={styles.card}>
                  <FormInput
                    testID="add-staff-salary"
                    label={t('addStaff.baseSalary')}
                    hint={t('addStaff.optional')}
                    icon="cash-outline"
                    placeholder={t('addStaff.baseSalaryPlaceholder')}
                    keyboardType="numeric"
                    value={baseSalary}
                    onChangeText={setBaseSalary}
                  />
                  {baseSalaryInvalid ? (
                    <Text style={styles.fieldError}>{t('addStaff.invalidNumber')}</Text>
                  ) : null}
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(4)} style={styles.submitWrap}>
              <PrimaryButton
                testID="add-staff-submit"
                title={isSubmitting ? t('addStaff.submitting') : t('addStaff.submit')}
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
  fieldError: { fontSize: 12.5, color: colors.error, marginTop: -spacing.sm, marginBottom: spacing.md },
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
    marginBottom: spacing.md,
  },
  // Sits under the section title when the role reaches every branch, to say
  // what the choice below actually means.
  sectionHint: {
    fontSize: 12.5,
    color: colors.textTertiary,
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  // Takes the leftover width so a long name wraps inside the card rather than
  // pushing past its edge.
  matchText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.primaryDark, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48%' },
  submitWrap: { marginTop: spacing.lg },
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
