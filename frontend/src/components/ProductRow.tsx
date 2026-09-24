import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import PressableScale from '@/components/PressableScale';
import Pill from '@/components/Pill';
import { formatAmount } from '@/utils/format';
import type { BranchProduct } from '@/types/product';
import { colors, radius, spacing } from '@/theme';

type Props = {
  product: BranchProduct;
  currency: string;
  onPress?: () => void;
  testID?: string;
};

/**
 * One catalog row: name, what it is sold by, and what this branch charges.
 *
 * Shared by the Products tab and Home's catalog section so the two cannot show
 * the same product differently — in particular so a branch price override shows
 * as the price in both, rather than one of them quietly rendering the
 * business-wide default.
 */
export default function ProductRow({ product, currency, onPress, testID }: Props) {
  const { t } = useTranslation();

  const price = product.effectiveSellPrice;
  const isBranchOwn = product.branchId !== null;
  const isOverridden = product.branchDetail !== null;

  const body = (
    <View style={styles.row}>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {product.name}
          </Text>
          {/* Says which products are this branch's own, because the difference
              decides who is allowed to change them. */}
          {isBranchOwn ? <Pill label={t('products.branchOnly')} tone="brand" /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[product.unit, product.sku, product.category].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View style={styles.priceCol}>
        <Text style={styles.price}>
          {price === null ? t('products.noPrice') : formatAmount(Number(price), currency)}
        </Text>
        {/* A price that differs from the business default is worth saying out
            loud — otherwise "why is chai ₹25 here?" has no answer on screen. */}
        {isOverridden ? <Text style={styles.overridden}>{t('products.branchPrice')}</Text> : null}
      </View>

      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </View>
  );

  if (!onPress) return <View style={styles.wrap}>{body}</View>;

  return (
    <PressableScale testID={testID} scaleTo={0.99} style={styles.wrap} onPress={onPress}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Takes the leftover width so a long product name truncates instead of
  // pushing the price off the edge.
  text: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: colors.textTertiary },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  overridden: { fontSize: 10.5, color: colors.primary, fontWeight: '600' },
});
