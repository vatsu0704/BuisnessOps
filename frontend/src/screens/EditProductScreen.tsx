import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { getProduct, updateProduct, setBranchPricing, clearBranchPricing } from '@/api/product';
import { extractErrorMessage } from '@/api/client';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId } from '@/hooks/useBusinessId';
import { parseOptionalNumber } from '@/utils/validation';
import type { Product } from '@/types/product';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'EditProduct'>;

/**
 * Edit a product, and set what one branch charges for it.
 *
 * Two distinct saves, deliberately kept apart: the product's own fields go to
 * the business-wide record, and the per-branch price goes to that branch's
 * override. Merging them into one button would make "change the price here"
 * quietly change it everywhere, which is the opposite of what requirement 4
 * asks for.
 */
export default function EditProductScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { branches } = useBranches();
  const { productId } = route.params;

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');

  // Per-branch override, edited against whichever branch is selected below.
  const [priceBranchId, setPriceBranchId] = useState<string | null>(null);
  const [branchSell, setBranchSell] = useState('');
  const [branchCost, setBranchCost] = useState('');
  const [branchNotice, setBranchNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      const found = await getProduct(businessId, productId);
      setProduct(found);
      setName(found.name);
      setUnit(found.unit);
      setCategory(found.category ?? '');
      setSellPrice(found.sellPrice ?? '');
      setCostPrice(found.costPrice ?? '');
      // A branch-only product can only ever be priced at its own branch.
      setPriceBranchId(found.branchId ?? branches[0]?.id ?? null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId, productId, branches]);

  useEffect(() => {
    void load();
  }, [load]);

  const sellParsed = parseOptionalNumber(sellPrice);
  const costParsed = parseOptionalNumber(costPrice);
  const detailsValid =
    name.trim().length > 0 && unit.trim().length > 0 && sellParsed !== null && costParsed !== null;

  async function saveDetails() {
    if (!businessId || !detailsValid || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateProduct(businessId, productId, {
        name: name.trim(),
        unit: unit.trim(),
        category: category.trim() || null,
        sellPrice: sellParsed ?? null,
        costPrice: costParsed ?? null,
      });
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  async function toggleActive() {
    if (!businessId || !product || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateProduct(businessId, productId, { isActive: !product.isActive });
      setProduct(updated);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveBranchPrice() {
    if (!businessId || !priceBranchId || isSaving) return;
    const sell = parseOptionalNumber(branchSell);
    const cost = parseOptionalNumber(branchCost);
    if (sell === null || cost === null) return;

    setIsSaving(true);
    setError(null);
    setBranchNotice(null);
    try {
      if (branchSell.trim() === '' && branchCost.trim() === '') {
        // Both blank means "stop overriding", which is a delete rather than a
        // save of nothing. A 404 here just means there was no override to drop.
        await clearBranchPricing(businessId, productId, priceBranchId).catch(() => {});
        setBranchNotice(t('editProduct.branchPriceCleared'));
      } else {
        await setBranchPricing(businessId, productId, priceBranchId, {
          costPrice: cost ?? 0,
          sellPrice: sell ?? 0,
        });
        setBranchNotice(t('editProduct.branchPriceSaved'));
      }
      haptics.success();
      setBranchSell('');
      setBranchCost('');
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  const branchPriceValid =
    parseOptionalNumber(branchSell) !== null && parseOptionalNumber(branchCost) !== null;
  const bothBlank = branchSell.trim() === '' && branchCost.trim() === '';
  const canSaveBranchPrice =
    !!priceBranchId && branchPriceValid && (bothBlank || (!!branchSell.trim() && !!branchCost.trim()));

  // A branch-only product is priced at its own branch and nowhere else, so the
  // picker would offer choices that all fail.
  const pricingBranches = product?.branchId
    ? branches.filter((b) => b.id === product.branchId)
    : branches;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('editProduct.title')}</Text>
            <PressableScale testID="edit-product-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {error ? (
                <AnimatedEntrance key={error} delay={0} distance={-8}>
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                </AnimatedEntrance>
              ) : null}

              <AnimatedEntrance delay={step(0)}>
                <View style={styles.card}>
                  <View style={styles.scopeRow}>
                    <Pill
                      label={product?.branchId ? t('products.branchOnly') : t('editProduct.businessWide')}
                      tone={product?.branchId ? 'brand' : 'muted'}
                    />
                    {product && !product.isActive ? (
                      <Pill label={t('editProduct.withdrawn')} tone="muted" />
                    ) : null}
                  </View>

                  <FormInput
                    testID="edit-product-name"
                    label={t('addProduct.name')}
                    icon="pricetag-outline"
                    value={name}
                    onChangeText={setName}
                  />
                  <FormInput
                    testID="edit-product-unit"
                    label={t('addProduct.unit')}
                    icon="cube-outline"
                    value={unit}
                    onChangeText={setUnit}
                  />
                  <View style={styles.row}>
                    <View style={styles.rowItem}>
                      <FormInput
                        testID="edit-product-sell"
                        label={t('editProduct.defaultSell')}
                        icon="cash-outline"
                        keyboardType="numeric"
                        value={sellPrice}
                        onChangeText={setSellPrice}
                      />
                    </View>
                    <View style={styles.rowItem}>
                      <FormInput
                        testID="edit-product-cost"
                        label={t('editProduct.defaultCost')}
                        icon="trending-down-outline"
                        keyboardType="numeric"
                        value={costPrice}
                        onChangeText={setCostPrice}
                      />
                    </View>
                  </View>
                  <FormInput
                    testID="edit-product-category"
                    label={t('addProduct.category')}
                    icon="folder-outline"
                    value={category}
                    onChangeText={setCategory}
                  />

                  <PrimaryButton
                    testID="edit-product-save"
                    title={t('editProduct.save')}
                    loading={isSaving}
                    disabled={!detailsValid || isSaving}
                    onPress={saveDetails}
                  />
                </View>
              </AnimatedEntrance>

              {pricingBranches.length > 0 ? (
                <AnimatedEntrance delay={step(1)} style={styles.block}>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>{t('editProduct.branchPriceSection')}</Text>
                    <Text style={styles.hint}>{t('editProduct.branchPriceHint')}</Text>

                    {pricingBranches.length > 1 ? (
                      <View style={styles.grid}>
                        {pricingBranches.map((branch) => (
                          <View key={branch.id} style={styles.gridItem}>
                            <SegmentedOption
                              testID={`edit-product-price-branch-${branch.code}`}
                              title={branch.name}
                              caption={branch.code}
                              icon="storefront-outline"
                              selected={branch.id === priceBranchId}
                              onPress={() => setPriceBranchId(branch.id)}
                            />
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.row}>
                      <View style={styles.rowItem}>
                        <FormInput
                          testID="edit-product-branch-sell"
                          label={t('editProduct.branchSell')}
                          icon="cash-outline"
                          keyboardType="numeric"
                          value={branchSell}
                          onChangeText={setBranchSell}
                        />
                      </View>
                      <View style={styles.rowItem}>
                        <FormInput
                          testID="edit-product-branch-cost"
                          label={t('editProduct.branchCost')}
                          icon="trending-down-outline"
                          keyboardType="numeric"
                          value={branchCost}
                          onChangeText={setBranchCost}
                        />
                      </View>
                    </View>

                    {branchNotice ? <Text style={styles.notice}>{branchNotice}</Text> : null}

                    <PrimaryButton
                      testID="edit-product-branch-save"
                      title={bothBlank ? t('editProduct.branchPriceClear') : t('editProduct.branchPriceSave')}
                      loading={isSaving}
                      disabled={!canSaveBranchPrice || isSaving}
                      onPress={saveBranchPrice}
                    />
                  </View>
                </AnimatedEntrance>
              ) : null}

              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <PressableScale testID="edit-product-toggle-active" style={styles.dangerRow} onPress={toggleActive}>
                  <Ionicons
                    name={product?.isActive ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={product?.isActive ? colors.warning : colors.success}
                  />
                  <Text style={styles.dangerText}>
                    {product?.isActive ? t('editProduct.withdraw') : t('editProduct.restore')}
                  </Text>
                </PressableScale>
                <Text style={styles.footnote}>{t('editProduct.withdrawHint')}</Text>
              </AnimatedEntrance>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  block: { marginTop: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, ...shadow.md },
  scopeRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  hint: { fontSize: 12.5, color: colors.textTertiary, lineHeight: 17, marginBottom: spacing.md },
  notice: { fontSize: 12.5, color: colors.success, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  gridItem: { width: '48%' },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  dangerText: { fontSize: 14, fontWeight: '700', color: colors.text },
  footnote: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 17,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
});
