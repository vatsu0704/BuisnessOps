import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { assignBranchAccess, removeBranchAccess, revokeInvite, revokeMembership } from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import type { CashierConflicts, PendingInvite, TeamMember } from '@/types/team';
import { useCashierByBranch, useTeam } from '@/hooks/useTeam';
import { useBranches } from '@/hooks/useBranches';
import { filterInvites, filterMembers } from '@/utils/teamFilter';
import CashierBranchPicker from '@/components/CashierBranchPicker';
import {
  asAssignmentConflict,
  canRemoveMember,
  hasCashierConflicts,
  isSingleBranchRole,
  reachesEveryBranch,
} from '@/utils/teamRules';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import Picker from '@/components/Picker';
import ScreenBackground from '@/components/ScreenBackground';
import SearchInput from '@/components/SearchInput';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { isDeletedAccount } from '@/utils/account';
import { confirm } from '@/utils/confirm';
import { haptics } from '@/utils/haptics';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';

type Props = NativeStackScreenProps<AppStackParamList, 'Team'>;

// Who reaches every branch, who holds exactly one, who may remove whom and what
// requirement 18's 409s say are `utils/teamRules.ts`, shared with the web's Team
// page so the two cannot disagree about any of it.

/** How many people a page shows before asking. */
const PAGE = 20;
/** The branch filter's "every branch" row. Not a branch id, so it cannot collide. */
const ALL = '__all__';

export default function TeamScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const viewer = useMembership();

  // The team lives in a store rather than here, because a second screen now
  // reads it: the invite screen has to know which branches already have a
  // cashier. See teamStore's header for what a private copy per screen costs.
  const { members, invites, conflicts, isLoading, error: loadError, refresh } = useTeam();
  const cashierByBranch = useCashierByBranch();
  const { tradingBranches } = useBranches();
  const [query, setQuery] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // A business with two hundred branches has the staff to match, and
  // "who runs Vesu Point?" meant scrolling until a name was recognised.
  const filter = { query, branchId };
  const shownMembers = filterMembers(members, filter);
  const shownInvites = filterInvites(invites, filter);
  const total = members.length + invites.length;
  const shownTotal = shownMembers.length + shownInvites.length;
  const isFiltered = query.trim() !== '' || branchId !== null;
  // Two hundred cards in a ScrollView is slow, and a VirtualizedList nested in
  // one is unsupported — so the rest arrive on asking.
  const visibleInvites = shownInvites.slice(0, limit);
  const visibleMembers = shownMembers.slice(0, Math.max(0, limit - shownInvites.length));
  const hidden = shownTotal - visibleInvites.length - visibleMembers.length;

  const [error, setError] = useState<string | null>(null);
  // Which row has a request in flight, so a slow network cannot be double-tapped
  // into two revokes. Keyed by membership or invite id.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which cashier's branch picker is open. One at a time: two open pickers is two
  // half-made decisions on one screen.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const load = refresh;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  /**
   * Every revoke goes through here: confirm, run, then reload from the server
   * rather than patching local state. The server decides what a revoke means
   * (a membership keeps its row as REVOKED, an invite vanishes from the
   * pending list), and guessing that here is how the two drift apart.
   */
  const confirmAndRun = useCallback(
    (rowId: string, title: string, body: string, confirmLabel: string, run: () => Promise<void>) => {
      void (async () => {
        const ok = await confirm({ title, body, confirmLabel, cancelLabel: t('common.cancel') });
        if (!ok) return;
        setBusyId(rowId);
        setError(null);
        try {
          await run();
          haptics.success();
          await load();
        } catch (err) {
          haptics.error();
          setError(extractErrorMessage(err));
        } finally {
          setBusyId(null);
        }
      })();
    },
    [load, t]
  );

  const onRevokeInvite = (invite: PendingInvite) => {
    if (!businessId) return;
    confirmAndRun(
      invite.id,
      t('team.revokeInviteTitle'),
      t('team.revokeInviteBody', { email: invite.email }),
      t('team.revokeInvite'),
      () => revokeInvite(businessId, invite.id)
    );
  };

  const onRemoveMember = (member: TeamMember) => {
    if (!businessId) return;
    confirmAndRun(
      member.id,
      t('team.removeMemberTitle', { name: member.user.name ?? member.user.email }),
      t('team.removeMemberBody'),
      t('team.removeMember'),
      () => revokeMembership(businessId, member.id)
    );
  };

  const onRemoveBranch = (member: TeamMember, branch: { id: string; name: string }) => {
    if (!businessId) return;
    confirmAndRun(
      member.id,
      t('team.removeBranchTitle'),
      t('team.removeBranchBody', { name: member.user.name ?? member.user.email, branch: branch.name }),
      t('common.remove'),
      () => removeBranchAccess(businessId, member.id, branch.id)
    );
  };

  /**
   * Requirement 18 - give a cashier a branch, or move them to another one.
   *
   * The optimistic request goes first and the question is asked only if the
   * server objects, which is deliberate: this screen knows who holds what, so it
   * could predict the conflict, but predicting it means two places deciding the
   * same rule and one of them working from a list that is a few seconds old. The
   * server's 409 is the truth, it arrives with the blocker's name in it, and the
   * retry is the same request with `confirm` - one code path, one decision.
   */
  const onAssignBranch = useCallback(
    (member: TeamMember, branchId: string) => {
      if (!businessId) return;
      void (async () => {
        setBusyId(member.id);
        setError(null);
        const name = member.user.name ?? member.user.email;
        try {
          await assignBranchAccess(businessId, member.id, branchId);
        } catch (err) {
          const conflict = asAssignmentConflict(err);
          if (!conflict) {
            haptics.error();
            setError(extractErrorMessage(err));
            setBusyId(null);
            return;
          }

          // Two sentences, each from its own key, because one of them applies
          // only sometimes: displacing a cashier and vacating a branch are
          // separate consequences and a single template cannot carry both
          // across four languages.
          const displaces = conflict.code === 'BRANCH_ALREADY_HAS_CASHIER';
          const body = displaces
            ? [
                t('team.swapBody', { branch: conflict.branch, cashier: conflict.cashier, name }),
                conflict.currentBranch
                  ? t('team.swapAlsoVacates', { currentBranch: conflict.currentBranch })
                  : '',
              ]
                .filter(Boolean)
                .join(' ')
            : t('team.moveBody', { branch: conflict.branch, currentBranch: conflict.currentBranch, name });

          setBusyId(null);
          const ok = await confirm({
            title: displaces ? t('team.swapTitle') : t('team.moveTitle'),
            body,
            confirmLabel: t('team.swapConfirm'),
            cancelLabel: t('common.cancel'),
          });
          if (!ok) return;

          setBusyId(member.id);
          try {
            await assignBranchAccess(businessId, member.id, branchId, { confirm: true });
          } catch (retryErr) {
            haptics.error();
            setError(extractErrorMessage(retryErr));
            setBusyId(null);
            return;
          }
        }
        haptics.success();
        setPickerFor(null);
        await load();
        setBusyId(null);
      })();
    },
    [businessId, load, t]
  );

  const canRemove = (member: TeamMember) => canRemoveMember(viewer, member);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('team.title')}</Text>
          <PressableScale testID="team-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedEntrance delay={step(0)}>
            <InfoCard
              testID="team-invite"
              icon="person-add-outline"
              title={t('team.invite')}
              subtitle={t('team.inviteSubtitle')}
              onPress={() => navigation.navigate('InviteMember')}
            />
          </AnimatedEntrance>

          {error || loadError ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error || loadError}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {/* Requirement 18's audit. Memberships created before the rule existed
              are reported, never rewritten: nothing but a person knows which
              cashier is the one still turning up. It sits above the list because
              it is the one thing on this screen asking for a decision. */}
          {hasCashierConflicts(conflicts) ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <ConflictPanel conflicts={conflicts} />
            </AnimatedEntrance>
          ) : null}

          {!isLoading && members.length === 0 && invites.length === 0 && !error && !loadError ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <Text style={styles.emptyText}>{t('team.empty')}</Text>
            </AnimatedEntrance>
          ) : null}

          {total > 0 ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.filters}>
                <SearchInput
                  testID="team-search"
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('team.search')}
                />
                {tradingBranches.length > 1 ? (
                  <Picker
                    testIDPrefix="team-branch-filter"
                    label={t('team.atBranch')}
                    hideLabel
                    icon="storefront-outline"
                    value={branchId ?? ALL}
                    onChange={(next) => setBranchId(next === ALL ? null : next)}
                    options={[
                      { value: ALL, label: t('reports.allBranches') },
                      ...tradingBranches.map((b) => ({
                        value: b.id,
                        label: b.name,
                        description: b.code,
                        keywords: [b.code, b.city, b.region],
                      })),
                    ]}
                  />
                ) : null}
                {isFiltered ? (
                  <Text style={styles.filterCount}>{t('team.showing', { shown: shownTotal, total })}</Text>
                ) : null}
              </View>
            </AnimatedEntrance>
          ) : null}

          {isFiltered && shownTotal === 0 ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <Text style={styles.emptyText}>{t('team.noMatches')}</Text>
            </AnimatedEntrance>
          ) : null}

          {visibleInvites.map((invite, index) => (
            <AnimatedEntrance key={invite.id} delay={step(Math.min(index + 1, 5))} style={styles.block}>
              <View style={[styles.card, styles.pendingCard]}>
                <View style={styles.cardHead}>
                  <Text style={styles.name}>{invite.email}</Text>
                  <Pill label={t('team.pending')} tone="muted" />
                </View>
                <Text style={styles.meta}>{t(`role.${invite.role}`)}</Text>
                <PressableScale
                  testID={`team-revoke-invite-${invite.id}`}
                  style={styles.dangerAction}
                  scaleTo={0.98}
                  disabled={busyId === invite.id}
                  onPress={() => onRevokeInvite(invite)}
                >
                  <Ionicons name="close-circle-outline" size={15} color={colors.error} />
                  <Text style={styles.dangerActionText}>
                    {busyId === invite.id ? t('common.loading') : t('team.revokeInvite')}
                  </Text>
                </PressableScale>
              </View>
            </AnimatedEntrance>
          ))}

          {visibleMembers.map((member, index) => {
            const revoked = member.status === 'REVOKED';
            const isYou = member.id === viewer?.id;
            const deleted = isDeletedAccount(member.user);
            return (
              <AnimatedEntrance key={member.id} delay={step(Math.min(index + 1, 5))} style={styles.block}>
                <View style={[styles.card, revoked && styles.revokedCard]}>
                  <View style={styles.cardHead}>
                    <Text style={[styles.name, revoked && styles.nameRevoked]}>
                      {deleted ? t('team.deletedAccount') : member.user.name ?? member.user.email}
                      {isYou ? ` · ${t('team.you')}` : ''}
                    </Text>
                    <Pill
                      label={revoked ? t('team.revoked') : t(`role.${member.role}`)}
                      tone={revoked ? 'muted' : 'brand'}
                    />
                  </View>
                  {deleted ? null : <Text style={styles.meta}>{member.user.email}</Text>}

                  {revoked ? (
                    <Text style={styles.branchNote}>{t('team.revokedNote')}</Text>
                  ) : reachesEveryBranch(member.role) ? (
                    <Text style={styles.branchNote}>{t('team.allBranches')}</Text>
                  ) : isSingleBranchRole(member.role) ? (
                    /* Requirement 18. A cashier's branch is one assignment that
                       moves, not a set that grows - so it gets a "change branch"
                       action rather than removable pills, and holding none is
                       named rather than left looking like an empty list. */
                    <>
                      {member.branchAccess.length === 0 ? (
                        <Text style={styles.branchNoteWarn}>{t('team.cashierNoBranch')}</Text>
                      ) : (
                        <>
                          <View style={styles.pillRow}>
                            {member.branchAccess.map((ba) => (
                              <Pill key={ba.id} label={ba.branch.name} tone="brand" />
                            ))}
                          </View>
                          <Text style={styles.branchHint}>{t('team.cashierRule')}</Text>
                        </>
                      )}
                      {pickerFor === member.id ? (
                        <View style={styles.picker}>
                          <Text style={styles.pickerTitle}>{t('team.pickBranch')}</Text>
                          <CashierBranchPicker
                            branches={tradingBranches}
                            cashierByBranch={cashierByBranch}
                            selectedBranchId={member.branchAccess[0]?.branch.id ?? null}
                            forMembershipId={member.id}
                            onSelect={(branchId) => onAssignBranch(member, branchId)}
                            testIDPrefix={`team-assign-${member.id}`}
                          />
                          <PressableScale
                            testID={`team-assign-cancel-${member.id}`}
                            style={styles.linkAction}
                            scaleTo={0.98}
                            onPress={() => setPickerFor(null)}
                          >
                            <Text style={styles.linkActionText}>{t('common.cancel')}</Text>
                          </PressableScale>
                        </View>
                      ) : (
                        <PressableScale
                          testID={`team-assign-branch-${member.id}`}
                          style={styles.linkAction}
                          scaleTo={0.98}
                          disabled={busyId === member.id}
                          onPress={() => {
                            haptics.select();
                            setPickerFor(member.id);
                          }}
                        >
                          <Ionicons name="swap-horizontal-outline" size={15} color={colors.primary} />
                          <Text style={styles.linkActionText}>
                            {busyId === member.id
                              ? t('common.loading')
                              : member.branchAccess.length === 0
                                ? t('team.assignBranch')
                                : t('team.changeBranch')}
                          </Text>
                        </PressableScale>
                      )}
                    </>
                  ) : member.branchAccess.length === 0 ? (
                    <Text style={styles.branchNoteWarn}>{t('team.noBranches')}</Text>
                  ) : (
                    <>
                      <View style={styles.pillRow}>
                        {member.branchAccess.map((ba) => (
                          <Pill
                            key={ba.id}
                            testID={`team-branch-${member.id}-${ba.branch.id}`}
                            label={ba.branch.name}
                            tone="muted"
                            onRemove={() => onRemoveBranch(member, ba.branch)}
                            accessibilityLabel={t('team.removeBranchAccessibility', { branch: ba.branch.name })}
                          />
                        ))}
                      </View>
                      <Text style={styles.branchHint}>{t('team.removeBranchHint')}</Text>
                    </>
                  )}

                  {canRemove(member) ? (
                    <PressableScale
                      testID={`team-remove-member-${member.id}`}
                      style={styles.dangerAction}
                      scaleTo={0.98}
                      disabled={busyId === member.id}
                      onPress={() => onRemoveMember(member)}
                    >
                      <Ionicons name="person-remove-outline" size={15} color={colors.error} />
                      <Text style={styles.dangerActionText}>
                        {busyId === member.id ? t('common.loading') : t('team.removeMember')}
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
              </AnimatedEntrance>
            );
          })}

          {hidden > 0 ? (
            <AnimatedEntrance delay={step(5)} style={styles.block}>
              <PressableScale
                testID="team-show-more"
                style={styles.showMore}
                onPress={() => setLimit((shown: number) => shown + PAGE)}
              >
                <Text style={styles.showMoreText}>{t('team.showMore', { count: hidden })}</Text>
              </PressableScale>
            </AnimatedEntrance>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/**
 * Requirement 18's audit, rendered.
 *
 * Deliberately not actionable from here. Every line is a fact and the fix is the
 * "change branch" action on the row it names, because settling a shared branch
 * means deciding who keeps it - and a one-tap "fix" button would have to guess.
 */
function ConflictPanel({ conflicts }: { conflicts: CashierConflicts }) {
  const { t } = useTranslation();
  return (
    <View style={styles.conflictCard} testID="team-cashier-conflicts">
      <View style={styles.conflictHead}>
        <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
        <Text style={styles.conflictTitle}>{t('team.conflictsTitle')}</Text>
      </View>
      <Text style={styles.conflictBody}>{t('team.conflictsBody')}</Text>
      {conflicts.sharedBranches.map((entry) => (
        <Text key={entry.branch.id} style={styles.conflictLine}>
          {t('team.conflictSharedBranch', {
            branch: entry.branch.name,
            count: entry.cashiers.length,
            names: entry.cashiers.map((c) => c.name ?? c.email).join(', '),
          })}
        </Text>
      ))}
      {conflicts.misassignedCashiers.map((entry) => (
        <Text key={entry.membershipId} style={styles.conflictLine}>
          {entry.branchCount === 0
            ? t('team.conflictNoBranch', { name: entry.name ?? entry.email })
            : t('team.conflictTooManyBranches', {
                name: entry.name ?? entry.email,
                count: entry.branchCount,
              })}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  filterCount: { fontSize: 12.5, color: colors.textSecondary },
  showMore: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  showMoreText: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
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
  block: { marginTop: spacing.md },
  emptyText: { fontSize: 13.5, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  pendingCard: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, shadowOpacity: 0 },
  revokedCard: { opacity: 0.6, shadowOpacity: 0 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  nameRevoked: { textDecorationLine: 'line-through', color: colors.textSecondary },
  meta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  branchNote: { fontSize: 12, color: colors.textTertiary, marginTop: spacing.sm },
  branchNoteWarn: { fontSize: 12, color: colors.warning, marginTop: spacing.sm },
  branchHint: { fontSize: 11.5, color: colors.textTertiary, marginTop: spacing.xs },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  dangerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  dangerActionText: { fontSize: 13, fontWeight: '700', color: colors.error },
  // The branch picker, opened inside the card it belongs to rather than as a
  // modal: the decision is about this person, and a sheet would hide the row
  // whose branch is being changed.
  picker: { marginTop: spacing.md, gap: spacing.sm },
  pickerTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  linkAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  linkActionText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  conflictCard: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  conflictHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  conflictTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  conflictBody: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 18 },
  // Each conflict is one line of fact. Indented, so the list reads as items
  // under the explanation rather than as more of the explanation.
  conflictLine: { fontSize: 12.5, color: colors.text, lineHeight: 18, paddingLeft: spacing.sm },
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
