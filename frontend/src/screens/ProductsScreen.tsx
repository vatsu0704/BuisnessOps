import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useAuthStore } from '@/store/authStore';
import { useBranches } from '@/hooks/useBranches';
import { useBranchProducts } from '@/hooks/useBranchProducts';
import { useMembership } from '@/hooks/useBusinessId';
import { can } from '@/utils/permissions';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import InfoCard from '@/components/InfoCard';
import PressableScale from '@/components/PressableScale';
import ProductRow from '@/components/ProductRow';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';

/**
 * The catalog — requirement 4.
 *
 * Always shows one branch at a time, because a price only means anything
 * relative to a branch. Someone with several branches gets a picker; someone
 * with one gets no picker at all rather than a control with a single option.
 */
export default function ProductsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { branches } = useBranches();
  const canManage = can.manageProducts(membership);

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  // Falls back to the first branch the person can reach, so the screen is
  // useful on open rather than asking for a choice before showing anything.
  const branchId = selectedBranchId ?? branches[0]?.id ?? null;

  const { products, isLoading, error, refresh } = useBranchProducts(branchId);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  // Grouped so a long catalog is scannable. Products with no category collect
  // under one heading rather than being dropped or scattered.
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof products>();
    for (const product of products) {
      const key = product.category?.trim() || t('products.uncategorised');
      const list = groups.get(key) ?? [];
      list.push(product);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [products, t]);

  const currency = business?.defaultCurrency ?? 'INR';

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('products.title')}</Text>
          {canManage && branchId ? (
            <PressableScale
              testID="products-add"
              style={styles.addButton}
              onPress={() => navigation.navigate('AddProduct', { branchId })}
            >
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.addText}>{t('products.add')}</Text>
            </PressableScale>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={() => void refresh()} tintColor={colors.primary} />
          }
        >
          {branches.length > 1 ? (
            <AnimatedEntrance delay={step(0)} style={styles.block}>
              <Text style={styles.sectionTitle}>{t('products.branchSection')}</Text>
              <View style={styles.grid}>
                {branches.map((branch) => (
                  <View key={branch.id} style={styles.gridItem}>
                    <SegmentedOption
                      testID={`products-branch-${branch.code}`}
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
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {/* No branch yet is a different state from no products, and says so:
              a catalog is priced per branch, so there is nowhere to put one. */}
          {!branchId ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <InfoCard
                testID="products-no-branch"
                icon="storefront-outline"
                title={t('products.noBranchTitle')}
                subtitle={t('products.noBranchSubtitle')}
                onPress={() => navigation.navigate('AddBranch')}
              />
            </AnimatedEntrance>
          ) : null}

          {branchId && !isLoading && products.length === 0 && !error ? (
            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.emptyCard}>
                <Ionicons name="pricetags-outline" size={22} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>{t('products.emptyTitle')}</Text>
                <Text style={styles.emptyBody}>
                  {canManage ? t('products.emptyBody') : t('products.emptyBodyReadOnly')}
                </Text>
              </View>
            </AnimatedEntrance>
          ) : null}

          {grouped.map(([category, items], groupIndex) => (
            <AnimatedEntrance
              key={category}
              delay={step(Math.min(groupIndex + 1, 5))}
              style={styles.block}
            >
              <Text style={styles.sectionTitle}>{category}</Text>
              <View style={styles.list}>
                {items.map((product) => (
                  <ProductRow
                    key={product.id}
                    testID={`products-row-${product.id}`}
                    product={product}
                    currency={currency}
                    onPress={
                      canManage ? () => navigation.navigate('EditProduct', { productId: product.id }) : undefined
                    }
                  />
                ))}
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
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  list: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48%' },
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
