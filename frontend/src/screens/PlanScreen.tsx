import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getSubscription } from '@/api/business';
import { extractErrorMessage } from '@/api/client';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useScreenEdges } from '@/hooks/useScreenEdges';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import Pill, { type PillTone } from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import { PLAN_ITEMS, subscriptionStateLine, subscriptionStatusLabel } from '@/constants/plans';
import { planName } from '@/permissions/explain';
import type { SubscriptionSummary } from '@/types/user';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';

/**
 * Requirement 28 — the owner's view of their plan.
 *
 * Where the subscription stands, the trading branches in use against the ones
 * paid for, and what every plan includes, cheapest first, with the current one
 * marked. Data scoped to this screen alone, so it is local state refetched on
 * focus rather than a store.
 *
 * There is deliberately no price and no way to buy here. A plan is changed by
 * hand after a UPI or bank payment until a payment gateway exists, and that
 * gateway is planned for the web app: Google Play's payments policy governs
 * what an Android app may say about paying outside Play Billing, and it has to
 * be checked before this screen says anything of the kind
 * (Docs/REQUIREMENTS.md R28).
 */

function statusTone(summary: SubscriptionSummary): PillTone {
  if (summary.state === 'READ_ONLY') return 'danger';
  if (summary.state === 'GRACE') return 'warning';
  return summary.status === 'ACTIVE' ? 'success' : 'brand';
}

export default function PlanScreen() {
  const edges = useScreenEdges();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const businessId = useBusinessId();

  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    try {
      setSummary(await getSubscription(businessId));
      setError(null);
    } catch (err) {
      // A failed refresh keeps what was showing and says why beside it.
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
      <SafeAreaView style={styles.safe} edges={edges}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('plans.title')}</Text>
            <Text style={styles.subtitle}>{t('plans.subtitle')}</Text>
          </View>
          <PressableScale testID="plan-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void load()} tintColor={colors.primary} />
          }
        >
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {summary ? (
            <>
              <AnimatedEntrance delay={step(0)} style={styles.card}>
                <Text style={styles.label}>{t('plans.currentPlan')}</Text>
                <Text testID="plan-current-name" style={styles.planName}>
                  {planName(summary.plan)}
                </Text>
                <View style={styles.pills}>
                  <Pill label={subscriptionStatusLabel(summary, t)} tone={statusTone(summary)} />
                  {summary.interval ? <Pill label={t(`plans.interval.${summary.interval}`)} tone="muted" /> : null}
                </View>
                <Text style={styles.stateLine}>{subscriptionStateLine(summary, t)}</Text>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(1)} style={styles.card}>
                <Text style={styles.label}>{t('plans.branchesTitle')}</Text>
                <Text style={styles.branchesLine}>
                  {summary.paidBranchCount === null
                    ? t('plans.branchesTrial', { used: summary.billedBranchCount })
                    : t('plans.branchesUsed', { used: summary.billedBranchCount, paid: summary.paidBranchCount })}
                </Text>
                <Text style={styles.note}>{t('plans.branchesNote')}</Text>
              </AnimatedEntrance>

              <AnimatedEntrance delay={step(2)}>
                <Text style={styles.sectionTitle}>{t('plans.compareTitle')}</Text>
              </AnimatedEntrance>

              {/* Stacked, one card per plan: three side-by-side columns would
                  be three narrow columns of Gujarati at 320dp. */}
              {summary.plans.map((plan, index) => {
                const isCurrent = plan.code === summary.plan;
                return (
                  <AnimatedEntrance
                    key={plan.code}
                    delay={step(3 + index)}
                    style={[styles.card, isCurrent && styles.cardCurrent]}
                  >
                    <View style={styles.planHeader}>
                      <Text style={styles.planTitle}>{planName(plan.code)}</Text>
                      {isCurrent ? <Pill label={t('plans.current')} tone="brand" icon="checkmark" /> : null}
                    </View>
                    <Text style={styles.lead}>{t(`plans.lead.${plan.code}`)}</Text>
                    <View style={styles.items}>
                      {PLAN_ITEMS[plan.code].map((item) => (
                        <View key={item} style={styles.item}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                          <Text style={styles.itemText}>{t(`plans.item.${item}`)}</Text>
                        </View>
                      ))}
                    </View>
                  </AnimatedEntrance>
                );
              })}
            </>
          ) : null}
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
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flexShrink: 1, gap: 2 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
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
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.sm,
  },
  cardCurrent: { borderColor: colors.primary, borderWidth: 1.5 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  planName: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stateLine: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.xs },
  branchesLine: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 21 },
  note: { fontSize: 12.5, color: colors.textTertiary, lineHeight: 17 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  // Wraps, so a long plan name or its "Current" pill never squeezes the other.
  planHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  planTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  lead: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  items: { gap: spacing.xs, marginTop: spacing.xs },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
