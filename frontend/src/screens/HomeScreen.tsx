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
import { useToday } from '@/hooks/useToday';
import { useMembership } from '@/hooks/useBusinessId';
import { useSupplyPayments } from '@/hooks/useSupplyPayments';
import { formatAmount } from '@/utils/format';
import { hasCapability, hasNoActiveBusiness } from '@/utils/permissions';
import type { Capability } from '@/permissions';
import { AI_CHAT_ENABLED } from '@/config/features';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import BrandMark from '@/components/BrandMark';
import InfoCard from '@/components/InfoCard';
import LanguageToggle from '@/components/LanguageToggle';
import NotificationBell from '@/components/NotificationBell';
import NoBusinessAccessNotice from '@/components/NoBusinessAccessNotice';
import PhaseNotice from '@/components/PhaseNotice';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import TodayPunchCard from '@/components/TodayPunchCard';
import Wordmark from '@/components/Wordmark';
import ExpenseGapsCard from '@/components/expense/ExpenseGapsCard';
import BranchCatalogSection from '@/components/home/BranchCatalogSection';
import BranchesSection from '@/components/home/BranchesSection';
import QuickActionsSection from '@/components/home/QuickActionsSection';
import RecentBillsSection from '@/components/home/RecentBillsSection';
import TodaySection from '@/components/home/TodaySection';
import { QUICK_ACTIONS, isQuickActionVisible } from '@/constants/quickActions';
import type { Membership } from '@/types/user';
import PlanBanner from '@/components/home/PlanBanner';
import { colors, gradient, radius, shadow, spacing } from '@/theme';
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
const SECTIONS: {
  key: string;
  capability: Capability | null;
  /**
   * Drop the card for anyone who `holds` this — unless they also hold
   * `unless`. The same shape `TAB_CATALOGUE` uses, and for the same reason.
   *
   * A capability says what someone *may* do; it does not say whose **job** it
   * is. An admin holds every capability in the matrix, so gating on the
   * capability alone put "Order raw material" and "Your deliveries" on an
   * owner's Home — neither of which an owner does. The branch orders, the
   * agent delivers.
   *
   * The discriminator is always a second capability, never a role name, so a
   * role added later lands on the right side of it by itself.
   */
  hideWhen?: { holds: Capability; unless?: Capability };
  /** For a section whose presence depends on more than one capability. */
  visible?: (membership: Membership | undefined) => boolean;
  Component: ComponentType;
}[] = [
  // Punching in is a daily action and belongs one tap from opening the app.
  // TodayPunchCard renders nothing for someone with no staff record, so it
  // needs no capability of its own.
  { key: 'punch', capability: null, Component: PunchSection },
  // Requirement 33. Today's sales, bills and spending lead, because they are
  // what Home is *read* for between customers — then the places to go, as a
  // grid of tiles, then the day's latest bills.
  { key: 'today', capability: 'analytics:viewToday', Component: TodaySection },
  {
    key: 'quickActions',
    capability: null,
    visible: (membership) =>
      QUICK_ACTIONS.some((action) => isQuickActionVisible(action, (capability) => hasCapability(membership, capability))),
    Component: QuickActionsSection,
  },
  { key: 'recentBills', capability: 'counterOrder:create', Component: RecentBillsSection },
  // Requirement 10. The chase list sits directly under the numbers because it
  // is the one card on Home that asks somebody to do something today.
  { key: 'expenseGaps', capability: 'expense:viewAllBranches', Component: ExpenseGapsSection },
  // Requirement 27 — what accounts has to pay for. The accountant also has a
  // Payments tab; for the owner, who holds the same capability, this is the
  // way in, and for both it says the figure without opening the screen.
  { key: 'payments', capability: 'supplyPayment:settle', Component: PaymentsSection },
  // Requirement 26 — payments sent to the warehouse that nobody has confirmed.
  // The desk's card; anyone who also pays (accounts, the owner) already has
  // both lists behind the card above, and two cards to one screen is one too many.
  {
    key: 'paymentsToConfirm',
    capability: 'supplyPayment:verify',
    hideWhen: { holds: 'supplyPayment:settle' },
    Component: PaymentsToConfirmSection,
  },
  { key: 'branches', capability: 'branch:update', Component: BranchesSection },
  // Requirement 4 — the catalog every branch sells from, a preview of it.
  { key: 'catalog', capability: 'product:view', Component: BranchCatalogSection },
];

function PunchSection() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  return <TodayPunchCard onOpenHistory={() => navigation.navigate('Attendance')} />;
}







function PaymentsSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { ready, readyTotal, onTheWay, refresh } = useSupplyPayments();
  // Home is a tab and never unmounts, so the figure is refreshed on every visit
  // rather than only the first.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );
  return (
    <InfoCard
      testID="home-open-payments"
      icon="card-outline"
      title={t('home.paymentsTitle')}
      subtitle={
        ready.length > 0
          ? t('home.paymentsReady', {
              amount: formatAmount(readyTotal, ready[0].currency),
              count: ready.length,
            })
          : onTheWay.length > 0
            ? t('home.paymentsOnTheWay', { count: onTheWay.length })
            : t('home.paymentsNone')
      }
      onPress={() => navigation.navigate('SupplyPayments')}
    />
  );
}

function PaymentsToConfirmSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { toConfirm, refresh } = useSupplyPayments();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );
  return (
    <InfoCard
      testID="home-open-payments-to-confirm"
      icon="shield-checkmark-outline"
      title={t('home.paymentsToConfirmTitle')}
      subtitle={
        toConfirm.length > 0
          ? t('home.paymentsToConfirmCount', { count: toConfirm.length })
          : t('home.paymentsToConfirmNone')
      }
      onPress={() => navigation.navigate('SupplyPayments')}
    />
  );
}


/**
 * Not an InfoCard: the back office's question is "who do I ring?", and the
 * answer is a list of names rather than a door to another screen.
 */
function ExpenseGapsSection() {
  return <ExpenseGapsCard />;
}


export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { isLoading, error, refresh, stats } = useBranches();
  const today = useToday();
  const rootNavigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  // A branch created, or sales data uploaded, in a modal must show up the
  // moment we return to Home. Sections own their own refresh beyond this.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      void today.refresh();
    }, [refresh, today.refresh])
  );

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email ?? '';

  // Revoked from every business: the sections below have nothing to show, and
  // the "add your first branch" card would fail on tap.
  const noAccess = hasNoActiveBusiness(user);

  const sections = SECTIONS.filter((section) => {
    if (section.capability && !hasCapability(membership, section.capability)) return false;
    if (section.visible && !section.visible(membership)) return false;
    if (!section.hideWhen) return true;
    const hidden =
      hasCapability(membership, section.hideWhen.holds) &&
      !(section.hideWhen.unless && hasCapability(membership, section.hideWhen.unless));
    return !hidden;
  });

  // A role whose surfaces are not built yet — WAREHOUSE and DELIVERY_AGENT
  // until Task 5 — would otherwise land on a blank screen and reasonably
  // conclude the app is broken. Saying so is better than showing nothing.
  const hasOnlyUniversalSections = sections.every((section) => section.capability === null && !section.visible);

  /**
   * Requirements 18 and 19 — a branch-scoped member with no branch.
   *
   * The state R18 creates on purpose: a displaced cashier keeps their account and
   * loses only the branch, and "until then the app tells them they have no branch
   * rather than showing empty screens". Every section below reads branch data, so
   * without this Home renders as a set of cards with nothing in them and the
   * person has no way to know whether they are broken or empty.
   *
   * It is also a real bug fix. `stats.total === 0` used to mean "this business
   * has no branches yet" and offered **Add your first branch** — which a cashier
   * cannot do, and tapping it navigated to a screen whose save would 403. The two
   * cases are told apart by `branch:create`: somebody who can add a branch is
   * being invited to; somebody who cannot is being told to ask.
   */
  const reachesEveryBranch = hasCapability(membership, 'branch:allAccess');
  const canAddBranch = hasCapability(membership, 'branch:create');
  const hasNoBranchAssigned = !!membership && !noAccess && !reachesEveryBranch && stats.total === 0;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          {/* The brand takes whatever the controls leave, so on a narrow phone
              the name stacks onto two lines instead of pushing them off screen. */}
          <View style={styles.brand}>
            <BrandMark width={36} delay={step(0)} />
            <AnimatedEntrance delay={step(2)} distance={0} scaleFrom={0.92} style={styles.brandName}>
              <Wordmark size={17} />
            </AnimatedEntrance>
          </View>
          <AnimatedEntrance delay={step(3)} distance={0} scaleFrom={0.92} style={styles.actions}>
            <LanguageToggle />
            <NotificationBell />
            <PressableScale testID="home-open-settings" onPress={() => navigation.navigate('Settings')}>
              <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(user?.name, user?.email)}</Text>
              </LinearGradient>
            </PressableScale>
          </AnimatedEntrance>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoading || today.isLoading}
              onRefresh={() => {
                void refresh();
                void today.refresh();
              }}
              tintColor={colors.primary}
            />
          }
        >
          <AnimatedEntrance delay={step(0)} style={styles.greetingBlock}>
            <Text style={styles.greeting}>{t('home.greeting', { name: firstName })}</Text>
            {/* The branch count sits with the business it counts. It used to be in
                the top bar, which cannot also hold the name on a 360dp phone. */}
            <View style={styles.businessRow}>
              {business ? <Text style={styles.business}>{business.name}</Text> : null}
              <View style={styles.branchChip}>
                <Ionicons name="git-branch-outline" size={13} color={colors.primary} />
                <Text style={styles.branchChipText}>{t('home.branchCount', { count: stats.total })}</Text>
              </View>
            </View>
          </AnimatedEntrance>

          {noAccess ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <NoBusinessAccessNotice />
            </AnimatedEntrance>
          ) : null}

          {/* Requirement 28: nothing at all unless the plan is ending, in grace,
              or has gone read-only. */}
          <PlanBanner membership={membership} onOpenPlan={() => rootNavigation.navigate('Plan')} />

          {error || today.error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error || today.error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {!error && !noAccess && stats.total === 0 && canAddBranch ? (
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

          {!error && hasNoBranchAssigned && !canAddBranch ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <PhaseNotice
                icon="git-branch-outline"
                badge={t('home.noBranchBadge')}
                title={t('home.noBranchTitle')}
                body={t('home.noBranchBody')}
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

          {hasOnlyUniversalSections && !noAccess && !hasNoBranchAssigned ? (
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
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandName: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  businessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  business: { flexShrink: 1, fontSize: 14, color: colors.textSecondary },
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
