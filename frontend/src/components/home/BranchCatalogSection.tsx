import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import ProductRow from '@/components/ProductRow';
import PressableScale from '@/components/PressableScale';
import { colors, radius, shadow, spacing } from '@/theme';

const PREVIEW_COUNT = 5;

/**
 * Requirement 4: "after login, show the products on the home page by default".
 *
 * A preview, not the whole catalog — Home is a landing surface and the Products
 * tab is where the full list lives. Five rows is enough to make the point that
 * this branch has a catalog and what it charges, without turning Home into a
 * second Products screen.
 *
 * Shows the first branch the viewer can reach. For a cashier that is their
 * branch; for an owner it is whichever comes first, and the Products tab is
 * where they choose.
 */
export default function BranchCatalogSection() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const business = useAuthStore((s) => s.business);
  const membership = useMembership();
  const { branches } = useBranches();

  // The first branch this person can reach. For a cashier that is their branch;
  // for an owner it is whichever comes first, and the Products tab is where
  // they pick. Home deliberately offers no picker — it is a landing surface,
  // and a control here would compete with the one on the screen it links to.
  const resolvedBranchId = branches[0]?.id ?? null;
  const { products, error, refresh } = useBranchProducts(resolvedBranchId);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  // Nothing to say yet: with no branch there is nowhere to price a catalog, and
  // Home already offers "add your first branch" above.
  if (!resolvedBranchId) return null;

  const canManage = can.manageProducts(membership);
  const currency = business?.defaultCurrency ?? 'INR';
  const preview = products.slice(0, PREVIEW_COUNT);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('home.catalogTitle')}</Text>
        <PressableScale
          testID="home-open-products"
          style={styles.link}
          onPress={() => navigation.navigate('Products', { branchId: resolvedBranchId })}
        >
          <Text style={styles.linkText}>{t('home.catalogAll')}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </PressableScale>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!error && products.length === 0 ? (
        <PressableScale
          testID="home-add-first-product"
          style={styles.empty}
          onPress={() => canManage && navigation.navigate('AddProduct', { branchId: resolvedBranchId })}
        >
          <Ionicons name="pricetags-outline" size={20} color={colors.textTertiary} />
          <Text style={styles.emptyText}>
            {canManage ? t('home.catalogEmpty') : t('home.catalogEmptyReadOnly')}
          </Text>
        </PressableScale>
      ) : null}

      <View style={styles.list}>
        {preview.map((product) => (
          <ProductRow
            key={product.id}
            testID={`home-product-${product.id}`}
            product={product}
            currency={currency}
            onPress={
              canManage ? () => navigation.navigate('EditProduct', { productId: product.id }) : undefined
            }
          />
        ))}
      </View>

      {products.length > PREVIEW_COUNT ? (
        <Text style={styles.more}>{t('common.more', { count: products.length - PREVIEW_COUNT })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  list: { gap: spacing.sm },
  empty: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  emptyText: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
  error: { fontSize: 12.5, color: colors.error, marginBottom: spacing.sm },
  more: { fontSize: 12.5, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
});
