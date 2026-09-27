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
import { staffBase } from '@/permissions/staffBase';
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
  const { branches, warehouseBranches } = useBranches();
  const canSetPay = can.setPay(membership);
  // Offering the way out of an empty picker, but only to someone who may take
  // it: a cashier holds no `branch:create` and would meet a 403.
  const canAddBranch = can.addBranches(membership);

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

  /**
   * Which of the three base questions this person gets — asked of the
   * capability matrix, never of a role name. See permissions/staffBase.ts.
   *
   * Somebody with no account here is asked the ordinary question, and so is
   * anybody a cashier adds: a cashier cannot read the team, so `matched` stays
   * null for them and this screen behaves exactly as it did.
   */
  const { question: baseQuestion, spansEveryBranch } = staffBase(matched?.role);

  /**
   * The locations this person may actually be based at.
   *
   *  - `PREMISES` — the warehouses and nothing else. **Empty is the honest
   *    answer** when the business has none: a warehouse desk without a
   *    warehouse is a gap in the setup, and offering a shop instead would put
   *    the desk on that shop's roster with their pay in its cashier's hands.
   *  - `NONE` — not asked at all. The business's own premises if it has one,
   *    otherwise its oldest location, which is where the admin of a single-shop
   *    business genuinely works. A list of one, so the effect below needs no
   *    special case for it.
   *  - `ANY` — every location, exactly as before.
   */
  const options = useMemo(() => {
    if (baseQuestion === 'PREMISES') return warehouseBranches;
    if (baseQuestion === 'ANY') return branches;
    const implied = warehouseBranches[0] ?? branches[0];
    return implied ? [implied] : [];
  }, [baseQuestion, branches, warehouseBranches]);

  /**
   * Keep the choice inside what is on offer, and start it somewhere sensible.
   *
   * Typing an email can change the question underneath a choice already made —
   * a shop is not an answer to where the warehouse desk is based — so a
   * selection that is no longer offered is dropped rather than quietly
   * submitted. After that: one option left is not a decision and is taken, and
   * a delivery agent is *offered* their depot without being held to it, because
   * it is the base they would usually name and any branch is legitimately
   * theirs. Anything else is the owner's to choose and is never guessed at.
   *
   * The second rule used to read `branches.length === 1`, taken as an
   * unambiguous case. For someone whose work spans every branch it is the
   * *most* ambiguous one — the single branch is a shop they do not belong to —
   * and it was being selected silently, which is what this screen was reported
   * for.
   */
  useEffect(() => {
    if (branchId) {
      if (!options.some((b) => b.id === branchId)) setBranchId(null);
      return;
    }
    if (options.length === 1) setBranchId(options[0].id);
    else if (spansEveryBranch && warehouseBranches.length === 1) setBranchId(warehouseBranches[0].id);
  }, [branchId, options, spansEveryBranch, warehouseBranches]);

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

            {/* --- Where they are based -----------------------------------
                Three shapes, chosen by capability in `staffBase`. The heading
                follows the *work* rather than the shape: "which branch do they
                work at?" is the wrong question for anyone whose work covers all
                of them, including a delivery agent, who is nonetheless still
                free to be based at any one of them. --- */}
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {spansEveryBranch
                    ? t('addStaff.branchHomeSection')
                    : t('addStaff.branchSection')}
                </Text>

                {branches.length === 0 ? (
                  <SetupNote
                    icon="storefront-outline"
                    text={t('addStaff.needsBranch')}
                    actionLabel={canAddBranch ? t('addStaff.addBranch') : null}
                    onAction={() => navigation.navigate('AddBranch')}
                  />
                ) : baseQuestion === 'NONE' ? (
                  /* Not a question: someone holding authority over people at
                     every branch is based at none of them in particular. The
                     line still says where the record will be filed, so hiding
                     the choice never hides the outcome — attendance and a
                     payslip have to land somewhere, and the owner should not
                     have to open the record later to find out where. */
                  <Text
                    testID="add-staff-branch-implied"
                    style={[styles.sectionHint, styles.sectionHintOnly]}
                  >
                    {t('addStaff.branchImplied', {
                      role: t(`role.${matched?.role ?? 'STAFF'}`),
                      branch: options[0]?.name ?? '',
                    })}
                  </Text>
                ) : baseQuestion === 'PREMISES' && options.length === 0 ? (
                  /* The warehouse desk, at a business with no warehouse. There
                     is no correct answer to offer, so the screen names what is
                     missing and offers to add it — a rule with no way out is a
                     dead end rather than a validation. */
                  <SetupNote
                    icon="cube-outline"
                    text={t('addStaff.needsWarehouse', {
                      role: t(`role.${matched?.role ?? 'STAFF'}`),
                    })}
                    actionLabel={canAddBranch ? t('addStaff.addWarehouse') : null}
                    onAction={() => navigation.navigate('AddBranch')}
                  />
                ) : (
                  <>
                    {/* A delivery agent works at none of these and a warehouse
                        desk ships to all of them — but attendance and payslips
                        are filed against a location, so they still have a base.
                        Saying so is what stops this reading as "which shop do
                        they belong to". */}
                    {spansEveryBranch ? (
                      <Text style={styles.sectionHint}>{t('addStaff.branchHomeHint')}</Text>
                    ) : null}
                    <View style={styles.grid}>
                      {options.map((b) => (
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
                  </>
                )}
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

/**
 * What the base card says when it has nothing correct to offer.
 *
 * Stacked, never a row of sentence-beside-button: every Indic translation of
 * both runs longer than the English, and a row would squeeze the sentence first
 * in exactly the languages that need the most room. The sentence wraps to
 * whatever width it needs and the action sits under it, sized by its own
 * content — which is why the pill carries its own horizontal padding rather
 * than borrowing width from a parent that happens to stretch it.
 */
function SetupNote({
  icon,
  text,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  actionLabel: string | null;
  onAction: () => void;
}) {
  return (
    <View style={styles.setupNote}>
      <View style={styles.setupRow}>
        <Ionicons name={icon} size={18} color={colors.textTertiary} />
        <Text style={styles.setupText}>{text}</Text>
      </View>
      {actionLabel ? (
        <PressableScale testID="add-staff-setup-action" style={styles.setupAction} onPress={onAction}>
          <Ionicons name="add" size={16} color={colors.primaryDark} />
          <Text style={styles.setupActionText}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
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
  // The hint's bottom margin exists to separate it from the picker underneath.
  // When it IS the whole card — the case with nothing to pick — that margin is
  // dead space against the card's own padding, and the card reads bottom-heavy.
  sectionHintOnly: { marginBottom: 0 },
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
  setupNote: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  // `flex-start` so the icon stays beside the first line of a sentence that
  // wraps to three, rather than floating against its middle.
  setupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // Takes the leftover width, so the sentence wraps inside the note instead of
  // pushing past its edge.
  setupText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  setupAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  setupActionText: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
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
