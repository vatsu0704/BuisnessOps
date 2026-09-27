import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { can } from '@/utils/permissions';
import { extractErrorMessage } from '@/api/client';
import { addSupplyCartItem, getSupplyCart, listSupplyItems } from '@/api/supply';
import type { SupplyItem, SupplyOrder } from '@/types/supply';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import PressableScale from '@/components/PressableScale';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { formatAmount } from '@/utils/format';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

/**
 * The raw-material catalog — requirement 5.
 *
 * One screen doing two jobs on purpose, because it is one list: a cashier taps
 * to add to the branch's order, and the warehouse desk taps to edit what it
 * stocks. Splitting them would mean two screens showing the same rows, and the
 * desk's copy would be the one that forgot to show a withdrawn item.
 *
 * Quantities are NOT set here. Tapping adds one, and the exact amount is typed
 * on the cart screen, where a numeric field has room to be a numeric field.
 * Getting to 20 kg by tapping a plus twenty times is not a design.
 */
export default function SupplyCatalogScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const businessId = useBusinessId();
  const membership = useMembership();
  const business = useAuthStore((s) => s.business);
  const { tradingBranches: branches } = useBranches();

  const canOrder = can.orderSupplies(membership);
  const canManage = can.manageSupplyItems(membership);

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const branchId = selectedBranchId ?? branches[0]?.id ?? null;

  const [items, setItems] = useState<SupplyItem[]>([]);
  const [cart, setCart] = useState<SupplyOrder | null>(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currency = business?.defaultCurrency ?? 'INR';

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      // The desk needs to see what it has withdrawn in order to bring it back;
      // a cashier is only shown what can actually be ordered.
      const list = await listSupplyItems(businessId, { includeInactive: canManage });
      setItems(list);
      setCart(canOrder && branchId ? await getSupplyCart(businessId, branchId) : null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, branchId, canManage, canOrder]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const quantityInCart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of cart?.items ?? []) {
      if (line.inventoryItemId) counts.set(line.inventoryItemId, Number(line.quantity));
    }
    return counts;
  }, [cart]);

  const grouped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const groups = new Map<string, SupplyItem[]>();
    for (const item of items) {
      if (needle && !item.name.toLowerCase().includes(needle)) continue;
      const key = item.category?.trim() || t('supply.uncategorised');
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items, search, t]);

  async function addOne(item: SupplyItem) {
    if (!businessId || !branchId || busyItemId) return;
    setBusyItemId(item.id);
    setError(null);
    try {
      setCart(
        await addSupplyCartItem(businessId, {
          branchId,
          inventoryItemId: item.id,
          quantity: 1,
        })
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  const cartCount = cart?.items.length ?? 0;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('supply.catalogTitle')}</Text>
            <Text style={styles.subtitle}>{t('supply.catalogSubtitle')}</Text>
          </View>
          {canManage ? (
            <PressableScale
              testID="supply-add-item"
              style={styles.addButton}
              onPress={() => navigation.navigate('SupplyItemForm', {})}
            >
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.addText}>{t('supply.addItem')}</Text>
            </PressableScale>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void load()} tintColor={colors.primary} />
          }
        >
          {canOrder && branches.length > 1 ? (
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <Text style={styles.sectionTitle}>{t('supply.branch')}</Text>
              <View style={styles.branchGrid}>
                {branches.map((branch) => (
                  <View key={branch.id} style={styles.branchItem}>
                    <SegmentedOption
                      testID={`supply-branch-${branch.code}`}
                      title={branch.name}
                      caption={branch.code}
                      icon="storefront-outline"
                      selected={branch.id === branchId}
                      onPress={() => setSelectedBranchId(branch.id)}
                    />
                  </View>
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

          {items.length > 6 ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color={colors.textTertiary} />
                <TextInput
                  testID="supply-search"
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('supply.search')}
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="search"
                />
              </View>
            </AnimatedEntrance>
          ) : null}

          {!isLoading && items.length === 0 ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.emptyCard}>
                <Ionicons name="cube-outline" size={22} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>{t('supply.catalogEmpty')}</Text>
                <Text style={styles.emptyBody}>{t('supply.catalogEmptyBody')}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {grouped.map(([category, group], groupIndex) => (
            <AnimatedEntrance key={category} delay={step(Math.min(groupIndex + 2, 5))} style={styles.block}>
              <Text style={styles.sectionTitle}>{category}</Text>
              <View style={styles.list}>
                {group.map((item) => {
                  const inCart = quantityInCart.get(item.id) ?? 0;
                  const orderable = item.isActive && item.unitPrice !== null;
                  return (
                    <View key={item.id} style={[styles.row, !item.isActive && styles.rowWithdrawn]}>
                      <PressableScale
                        testID={`supply-item-${item.id}`}
                        scaleTo={0.99}
                        style={styles.rowText}
                        onPress={
                          canManage
                            ? () => navigation.navigate('SupplyItemForm', { inventoryItemId: item.id })
                            : undefined
                        }
                      >
                        <Text style={styles.rowName}>{item.name}</Text>
                        <Text style={styles.rowMeta}>
                          {item.unitPrice === null
                            ? t('supply.noPriceYet')
                            : t('supply.perUnit', {
                                price: formatAmount(Number(item.unitPrice), currency),
                                unit: item.unit,
                              })}
                          {!item.isActive ? ` · ${t('supply.withdrawn')}` : ''}
                        </Text>
                      </PressableScale>

                      {canOrder && orderable ? (
                        <PressableScale
                          testID={`supply-add-${item.id}`}
                          style={[styles.addChip, inCart > 0 && styles.addChipActive]}
                          disabled={busyItemId !== null || !branchId}
                          onPress={() => void addOne(item)}
                        >
                          {inCart > 0 ? (
                            <Text style={styles.addChipCount}>{inCart}</Text>
                          ) : (
                            <Ionicons name="add" size={16} color={colors.primary} />
                          )}
                        </PressableScale>
                      ) : null}

                      {canManage && !canOrder ? (
                        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </AnimatedEntrance>
          ))}
        </ScrollView>

        {/* The order lives under the thumb, the way the counter's does. */}
        {canOrder && cart && cartCount > 0 ? (
          <View style={styles.tray}>
            <View style={styles.trayText}>
              <Text style={styles.trayCount}>{t('supply.reviewCount', { count: cartCount })}</Text>
              <Text style={styles.trayTotal}>
                {formatAmount(Number(cart.totalAmount), cart.currency)}
              </Text>
            </View>
            <PressableScale
              testID="supply-open-cart"
              style={styles.trayButton}
              onPress={() => navigation.navigate('SupplyCart', { supplyOrderId: cart.id })}
            >
              <Text style={styles.trayButtonText}>{t('supply.openCart')}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.white} />
            </PressableScale>
          </View>
        ) : null}
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  addText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  block: { marginTop: spacing.lg },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  branchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  branchItem: { flexGrow: 1, flexBasis: '46%' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md - 2, fontSize: 14, color: colors.text },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowWithdrawn: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12.5, color: colors.textTertiary },
  addChip: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChipActive: { backgroundColor: colors.primaryLight },
  addChipCount: { fontSize: 13, fontWeight: '800', color: colors.primary },
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
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...shadow.md,
  },
  trayText: { flex: 1 },
  trayCount: { fontSize: 12.5, color: colors.textSecondary },
  trayTotal: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  trayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  trayButtonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
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
