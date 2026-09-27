import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useNavigationState } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { extractErrorMessage } from '@/api/client';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import SupplyOrderCard from '@/components/supply/SupplyOrderCard';
import type { SupplyOrder, SupplyOrderStatus } from '@/types/supply';
import { colors, radius, shadow, spacing } from '@/theme';
import { step } from '@/theme/motion';

/**
 * The cashier's tracking list, the warehouse desk and the delivery queue are
 * the same screen fetching different rows.
 *
 * They are one component for the reason three copies would not stay one: the
 * next change to how an order reads — a payment pill, a delay banner — would
 * land in whichever copy someone had open. What genuinely differs is passed in:
 * which orders, what the empty state says, and whether the branch is worth
 * naming.
 */
export default function SupplyOrderList({
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  emptyIcon = 'cube-outline',
  showBranch = false,
  statusFilters,
  fetchOrders,
  testIDPrefix,
}: {
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptyBody: string;
  emptyIcon?: keyof typeof Ionicons.glyphMap;
  showBranch?: boolean;
  /** Offered as chips above the list. Omit for a list with nothing to narrow. */
  statusFilters?: SupplyOrderStatus[];
  fetchOrders: (businessId: string, status?: SupplyOrderStatus) => Promise<SupplyOrder[]>;
  testIDPrefix: string;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const businessId = useBusinessId();
  // Mounted as a tab for the role whose daily work it is, and pushed for
  // everyone senior enough that it was demoted off their tab bar. Only the
  // pushed copy has anywhere to go back to.
  const isPushed = useNavigationState((state) => state.type === 'stack');

  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [status, setStatus] = useState<SupplyOrderStatus | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setOrders(await fetchOrders(businessId, status));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, status, fetchOrders]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {isPushed ? (
            <PressableScale
              testID={`${testIDPrefix}-close`}
              style={styles.close}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void load()} tintColor={colors.primary} />
          }
        >
          {statusFilters ? (
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              {/* A wrap, not a row: seven statuses will never fit side by side,
                  and they run longer in Gujarati than in English. */}
              <View style={styles.filters}>
                <PressableScale
                  testID={`${testIDPrefix}-filter-all`}
                  onPress={() => setStatus(undefined)}
                >
                  <Pill label={t('common.all')} tone={status === undefined ? 'brand' : 'muted'} />
                </PressableScale>
                {statusFilters.map((value) => (
                  <PressableScale
                    key={value}
                    testID={`${testIDPrefix}-filter-${value}`}
                    onPress={() => setStatus(status === value ? undefined : value)}
                  >
                    <Pill
                      label={t(`supplyStatus.${value}`)}
                      tone={status === value ? 'brand' : 'muted'}
                    />
                  </PressableScale>
                ))}
              </View>
            </AnimatedEntrance>
          ) : null}

          {error ? (
            <AnimatedEntrance key={error} delay={0} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {!isLoading && orders.length === 0 && !error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.emptyCard}>
                <Ionicons name={emptyIcon} size={22} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                <Text style={styles.emptyBody}>{emptyBody}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {orders.length > 0 ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.list}>
                {orders.map((order) => (
                  <SupplyOrderCard
                    key={order.id}
                    testID={`${testIDPrefix}-order-${order.id}`}
                    order={order}
                    showBranch={showBranch}
                    onPress={() =>
                      order.status === 'DRAFT'
                        ? navigation.navigate('SupplyCart', { supplyOrderId: order.id })
                        : navigation.navigate('SupplyOrderDetail', { supplyOrderId: order.id })
                    }
                  />
                ))}
              </View>
            </AnimatedEntrance>
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
  subtitle: { fontSize: 13, color: colors.textSecondary },
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
  block: { marginTop: spacing.lg },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  list: { gap: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.md,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
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
