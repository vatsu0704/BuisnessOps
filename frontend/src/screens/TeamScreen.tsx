import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import {
  listInvites,
  listMemberships,
  removeBranchAccess,
  revokeInvite,
  revokeMembership,
} from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import type { PendingInvite, TeamMember } from '@/types/team';
import type { MembershipRole } from '@/types/user';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';

type Props = NativeStackScreenProps<AppStackParamList, 'Team'>;

// Describes the LISTED member's role — do they implicitly reach every branch?
// This is a property of the row being rendered, not a permission check on the
// viewer, so it stays here rather than moving into utils/permissions.
const FULL_ACCESS_ROLES = new Set<MembershipRole>(['OWNER', 'ADMIN']);

export default function TeamScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const viewer = useMembership();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which row has a request in flight, so a slow network cannot be double-tapped
  // into two revokes. Keyed by membership or invite id.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [membersResult, invitesResult] = await Promise.all([
        listMemberships(businessId),
        listInvites(businessId),
      ]);
      setMembers(membersResult);
      setInvites(invitesResult);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  /**
   * Every revoke goes through here: confirm, run, then reload from the server
   * rather than patching local state. The server decides what a revoke means
   * (a membership keeps its row as REVOKED, an invite vanishes from the
   * pending list), and guessing that here is how the two drift apart.
   */
  const confirmAndRun = useCallback(
    (rowId: string, title: string, body: string, confirmLabel: string, run: () => Promise<void>) => {
      Alert.alert(title, body, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: confirmLabel,
          style: 'destructive',
          onPress: () => {
            void (async () => {
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
        },
      ]);
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
   * Mirrors the two server-side guards, so the app never offers a button that
   * is going to come back 400 or 403: nobody may revoke themselves (which is
   * also what stops a business losing its only owner), and an ADMIN may not
   * take the business from the OWNER.
   */
  const canRemove = (member: TeamMember) =>
    !!viewer &&
    member.status === 'ACTIVE' &&
    member.id !== viewer.id &&
    !(member.role === 'OWNER' && viewer.role !== 'OWNER');

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

          {error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {!isLoading && members.length === 0 && invites.length === 0 && !error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <Text style={styles.emptyText}>{t('team.empty')}</Text>
            </AnimatedEntrance>
          ) : null}

          {invites.map((invite, index) => (
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

          {members.map((member, index) => {
            const revoked = member.status === 'REVOKED';
            const isYou = member.id === viewer?.id;
            return (
              <AnimatedEntrance key={member.id} delay={step(Math.min(index + 1, 5))} style={styles.block}>
                <View style={[styles.card, revoked && styles.revokedCard]}>
                  <View style={styles.cardHead}>
                    <Text style={[styles.name, revoked && styles.nameRevoked]}>
                      {member.user.name ?? member.user.email}
                      {isYou ? ` · ${t('team.you')}` : ''}
                    </Text>
                    <Pill
                      label={revoked ? t('team.revoked') : t(`role.${member.role}`)}
                      tone={revoked ? 'muted' : 'brand'}
                    />
                  </View>
                  <Text style={styles.meta}>{member.user.email}</Text>

                  {revoked ? (
                    <Text style={styles.branchNote}>{t('team.revokedNote')}</Text>
                  ) : FULL_ACCESS_ROLES.has(member.role) ? (
                    <Text style={styles.branchNote}>{t('team.allBranches')}</Text>
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
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
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
