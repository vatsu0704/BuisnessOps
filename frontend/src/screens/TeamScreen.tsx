import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { listInvites, listMemberships } from '@/api/team';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import type { PendingInvite, TeamMember } from '@/types/team';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';

type Props = NativeStackScreenProps<AppStackParamList, 'Team'>;

const FULL_ACCESS_ROLES = new Set(['OWNER', 'ADMIN']);

export default function TeamScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const businessId = useAuthStore((s) => s.user?.memberships?.[0]?.businessId);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              </View>
            </AnimatedEntrance>
          ))}

          {members.map((member, index) => (
            <AnimatedEntrance key={member.id} delay={step(Math.min(index + 1, 5))} style={styles.block}>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.name}>{member.user.name ?? member.user.email}</Text>
                  <Pill label={t(`role.${member.role}`)} />
                </View>
                <Text style={styles.meta}>{member.user.email}</Text>
                {FULL_ACCESS_ROLES.has(member.role) ? (
                  <Text style={styles.branchNote}>{t('team.allBranches')}</Text>
                ) : member.branchAccess.length === 0 ? (
                  <Text style={styles.branchNoteWarn}>{t('team.noBranches')}</Text>
                ) : (
                  <View style={styles.pillRow}>
                    {member.branchAccess.map((ba) => (
                      <Pill key={ba.id} label={ba.branch.name} tone="muted" />
                    ))}
                  </View>
                )}
              </View>
            </AnimatedEntrance>
          ))}
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
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  meta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  branchNote: { fontSize: 12, color: colors.textTertiary, marginTop: spacing.sm },
  branchNoteWarn: { fontSize: 12, color: colors.warning, marginTop: spacing.sm },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
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
