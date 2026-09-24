import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import type { ComponentType } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import type { AppTabParamList } from '@/navigation/TabNavigator';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useSalesSummary } from '@/hooks/useSalesSummary';
import { useMembership } from '@/hooks/useBusinessId';
import { hasCapability, hasNoActiveBusiness } from '@/utils/permissions';
import type { Capability } from '@/permissions';
import { AI_CHAT_ENABLED } from '@/config/features';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import BrandMark from '@/components/BrandMark';
import InfoCard from '@/components/InfoCard';
import LanguageToggle from '@/components/LanguageToggle';
import NoBusinessAccessNotice from '@/components/NoBusinessAccessNotice';
import PhaseNotice from '@/components/PhaseNotice';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import TodayPunchCard from '@/components/TodayPunchCard';
import BranchCatalogSection from '@/components/home/BranchCatalogSection';
import BranchesSection from '@/components/home/BranchesSection';
import SalesTilesSection from '@/components/home/SalesTilesSection';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';

type Props = BottomTabScreenProps<AppTabParamList, 'Home'>;

function initials(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * What Home shows, in order, and what each part needs.
 *
 * Home used to be one fixed column for everyone. With six roles that does not
 * work: a delivery agent has no use for the business's takings, and a cashier's
 * first need is the catalog (requirement 4), not a branch list.
 *
 * Each section fetches its own data and renders its own empty state, so adding
 * a role adds **no screens** — it adds rows here, and only when that role needs
 * a surface nobody else has. Tasks 5 and 6 add the warehouse queue, the
 * delivery list and the expense-gap list the same way.
 */
const SECTIONS: { key: string; capability: Capability | null; Component: ComponentType }[] = [
  // Punching in is a daily action and belongs one tap from opening the app.
  // TodayPunchCard renders nothing for someone with no staff record, so it
  // needs no capability of its own.
  { key: 'punch', capability: null, Component: PunchSection },
  // Requirement 4 — the default post-login surface.
  { key: 'catalog', capability: 'product:view', Component: BranchCatalogSection },
  { key: 'sales', capability: 'analytics:viewBranch', Component: SalesTilesSection },
  { key: 'branches', capability: 'branch:update', Component: BranchesSection },
  { key: 'upload', capability: 'dataSource:manage', Component: UploadSection },
];

function PunchSection() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  return <TodayPunchCard onOpenHistory={() => navigation.navigate('Attendance')} />;
}

function UploadSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  return (
    <InfoCard
      testID="home-open-upload"
      icon="cloud-upload-outline"
      title={t('home.dataTitle')}
      subtitle={t('home.dataSubtitle')}
      onPress={() => navigation.navigate('Upload')}
    />
  );
}

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { isLoading, error, refresh, stats } = useBranches();
  const sales = useSalesSummary();
  const rootNavigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  // A branch created, or sales data uploaded, in a modal must show up the
  // moment we return to Home. Sections own their own refresh beyond this.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      void sales.refresh();
    }, [refresh, sales.refresh])
  );

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? '';

  // Revoked from every business: the sections below have nothing to show, and
  // the "add your first branch" card would fail on tap.
  const noAccess = hasNoActiveBusiness(user);

  const sections = SECTIONS.filter(
    (section) => !section.capability || hasCapability(membership, section.capability)
  );

  // A role whose surfaces are not built yet — WAREHOUSE and DELIVERY_AGENT
  // until Task 5 — would otherwise land on a blank screen and reasonably
  // conclude the app is broken. Saying so is better than showing nothing.
  const hasOnlyUniversalSections = sections.every((section) => section.capability === null);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <BrandMark size={34} />
          <Text style={styles.wordmark}>BizIQ</Text>
          <View style={styles.topBarSpacer} />
          <LanguageToggle />
          <View style={styles.branchChip}>
            <Ionicons name="git-branch-outline" size={13} color={colors.primary} />
            <Text style={styles.branchChipText}>{t('home.branchCount', { count: stats.total })}</Text>
          </View>
          <PressableScale testID="home-open-settings" onPress={() => navigation.navigate('Settings')}>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initials(user?.name, user?.email)}</Text>
            </LinearGradient>
          </PressableScale>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoading || sales.isLoading}
              onRefresh={() => {
                void refresh();
                void sales.refresh();
              }}
              tintColor={colors.primary}
            />
          }
        >
          <AnimatedEntrance delay={step(0)} style={styles.greetingBlock}>
            <Text style={styles.greeting}>{t('home.greeting', { name: firstName })}</Text>
            {business ? <Text style={styles.business}>{business.name}</Text> : null}
          </AnimatedEntrance>

          {noAccess ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <NoBusinessAccessNotice />
            </AnimatedEntrance>
          ) : null}

          {error || sales.error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error || sales.error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {!error && !noAccess && stats.total === 0 ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <InfoCard
                testID="home-add-first-branch"
                icon="storefront-outline"
                title={t('home.emptyTitle')}
                subtitle={t('home.emptySubtitle')}
                onPress={() => rootNavigation.navigate('AddBranch')}
              />
            </AnimatedEntrance>
          ) : null}

          {sections.map((section, index) => (
            <AnimatedEntrance
              key={section.key}
              delay={step(Math.min(index + 1, 5))}
              style={styles.block}
            >
              <section.Component />
            </AnimatedEntrance>
          ))}

          {hasOnlyUniversalSections && !noAccess ? (
            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <PhaseNotice
                icon="construct-outline"
                badge={t('home.roleEmptyBadge')}
                title={t('home.roleEmptyTitle')}
                body={t('home.roleEmptyBody')}
              />
            </AnimatedEntrance>
          ) : null}

          {/* Requirement 7 — the query engine's teaser, hidden until there is a
              query engine. Kept on disk so Phase 2 restores it rather than
              rewriting it. */}
          {AI_CHAT_ENABLED ? (
            <AnimatedEntrance delay={step(5)} style={styles.block}>
              <PhaseNotice
                icon="sparkles-outline"
                badge={t('home.queryBadge')}
                title={t('home.queryTitle')}
                body={t('home.queryBody')}
                examples={[t('home.queryExample1'), t('home.queryExample2'), t('home.queryExample3')]}
              />
            </AnimatedEntrance>
          ) : null}
        </ScrollView>

        {/* The ask bar was never tappable — decoration promising a feature that
            does not exist. Requirement 7 takes it off the screen. */}
        {AI_CHAT_ENABLED ? (
          <AnimatedEntrance delay={step(6)}>
            <View style={styles.askBar}>
              <View style={styles.askInput}>
                <Ionicons name="chatbubble-ellipses-outline" size={17} color={colors.textTertiary} />
                <Text style={styles.askPlaceholder}>{t('home.askPlaceholder')}</Text>
              </View>
              <View style={styles.askSend}>
                <Ionicons name="arrow-up" size={18} color={colors.white} />
              </View>
            </View>
            <Text style={styles.askNote}>{t('home.askNote')}</Text>
          </AnimatedEntrance>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  wordmark: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  topBarSpacer: { flex: 1 },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  branchChipText: { fontSize: 11.5, fontWeight: '700', color: colors.primary },
  avatar: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  greetingBlock: { marginBottom: spacing.xs },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  business: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  block: { marginTop: spacing.lg },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  // Kept with the ask bar they belong to, behind AI_CHAT_ENABLED.
  askBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  askInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.sm,
  },
  askPlaceholder: { fontSize: 14, color: colors.textTertiary },
  askSend: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askNote: {
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
});
