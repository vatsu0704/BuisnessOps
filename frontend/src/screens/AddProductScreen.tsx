import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { createProduct } from '@/api/product';
import { extractErrorMessage } from '@/api/client';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId, useMembership } from '@/hooks/useBusinessId';
import { hasCapability } from '@/utils/permissions';
import { parseOptionalNumber } from '@/utils/validation';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import OptionRow from '@/components/OptionRow';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import { haptics } from '@/utils/haptics';

type Props = NativeStackScreenProps<AppStackParamList, 'AddProduct'>;

/**
 * Add a product — requirement 4, both halves.
 *
 * The scope choice is the interesting part: a product either belongs to the
 * whole business or to one branch. Someone with all-branch reach picks; a
 * cashier does not get the choice at all, because the server refuses them the
 * business-wide option and offering a control that always fails is worse than
 * not offering it.
 */
export default function AddProductScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const membership = useMembership();
  const { branches } = useBranches();

  // Only an all-branch role may create a product the whole business sells.
  const canCreateBusinessWide = hasCapability(membership, 'branch:allAccess');

  const defaultBranchId = route.params?.branchId ?? branches[0]?.id ?? null;

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [scope, setScope] = useState<'BUSINESS' | 'BRANCH'>(
    canCreateBusinessWide ? 'BUSINESS' : 'BRANCH'
  );
  const [branchId, setBranchId] = useState<string | null>(defaultBranchId);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellParsed = parseOptionalNumber(sellPrice);
  const costParsed = parseOptionalNumber(costPrice);
  const sellInvalid = sellParsed === null;
  const costInvalid = costParsed === null;

  const canSubmit =
    !!businessId &&
    name.trim().length > 0 &&
    unit.trim().length > 0 &&
    !sellInvalid &&
    !costInvalid &&
    (scope === 'BUSINESS' || !!branchId) &&
    !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit || !businessId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createProduct(businessId, {
        name: name.trim(),
        unit: unit.trim(),
        category: category.trim() || undefined,
        sku: sku.trim() || undefined,
        sellPrice: sellParsed ?? undefined,
        costPrice: costParsed ?? undefined,
        branchId: scope === 'BRANCH' && branchId ? branchId : undefined,
      });
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('addProduct.title')}</Text>
            <PressableScale testID="add-product-close" style={styles.close} onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={20} color={colors.text} />
            </PressableScale>
          </View>

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
                <FormInput
                  testID="add-product-name"
                  label={t('addProduct.name')}
                  icon="pricetag-outline"
                  placeholder={t('addProduct.namePlaceholder')}
                  value={name}
                  onChangeText={setName}
                />
                <FormInput
                  testID="add-product-unit"
                  label={t('addProduct.unit')}
                  icon="cube-outline"
                  placeholder={t('addProduct.unitPlaceholder')}
                  hint={t('addProduct.unitHint')}
                  value={unit}
                  onChangeText={setUnit}
                />
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-product-sell"
                      label={t('addProduct.sellPrice')}
                      hint={t('addProduct.optional')}
                      icon="cash-outline"
                      keyboardType="numeric"
                      value={sellPrice}
                      onChangeText={setSellPrice}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-product-cost"
                      label={t('addProduct.costPrice')}
                      hint={t('addProduct.optional')}
                      icon="trending-down-outline"
                      keyboardType="numeric"
                      value={costPrice}
                      onChangeText={setCostPrice}
                    />
                  </View>
                </View>
                {sellInvalid || costInvalid ? (
                  <Text style={styles.fieldError}>{t('addProduct.invalidNumber')}</Text>
                ) : null}
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-product-category"
                      label={t('addProduct.category')}
                      hint={t('addProduct.optional')}
                      icon="folder-outline"
                      value={category}
                      onChangeText={setCategory}
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FormInput
                      testID="add-product-sku"
                      label={t('addProduct.sku')}
                      hint={t('addProduct.optional')}
                      icon="barcode-outline"
                      autoCapitalize="characters"
                      value={sku}
                      onChangeText={setSku}
                    />
                  </View>
                </View>
              </View>
            </AnimatedEntrance>

            {/* Only offered to someone who may actually take both options. */}
            {canCreateBusinessWide ? (
              <AnimatedEntrance delay={step(1)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('addProduct.scopeSection')}</Text>
                  <View style={styles.scopeList}>
                    <OptionRow
                      testID="add-product-scope-business"
                      icon="business-outline"
                      title={t('addProduct.scopeBusiness')}
                      description={t('addProduct.scopeBusinessHint')}
                      selected={scope === 'BUSINESS'}
                      onPress={() => setScope('BUSINESS')}
                    />
                    <OptionRow
                      testID="add-product-scope-branch"
                      icon="storefront-outline"
                      title={t('addProduct.scopeBranch')}
                      description={t('addProduct.scopeBranchHint')}
                      selected={scope === 'BRANCH'}
                      onPress={() => setScope('BRANCH')}
                    />
                  </View>
                </View>
              </AnimatedEntrance>
            ) : null}

            {scope === 'BRANCH' && branches.length > 1 ? (
              <AnimatedEntrance delay={step(2)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('addProduct.branchSection')}</Text>
                  <View style={styles.scopeList}>
                    {branches.map((branch) => (
                      <OptionRow
                        key={branch.id}
                        testID={`add-product-branch-${branch.code}`}
                        icon="storefront-outline"
                        title={branch.name}
                        description={branch.code}
                        selected={branch.id === branchId}
                        onPress={() => setBranchId(branch.id)}
                      />
                    ))}
                  </View>
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(3)} style={styles.submitWrap}>
              <PrimaryButton
                testID="add-product-submit"
                title={isSubmitting ? t('addProduct.submitting') : t('addProduct.submit')}
                icon="arrow-forward"
                loading={isSubmitting}
                disabled={!canSubmit}
                onPress={handleSubmit}
              />
            </AnimatedEntrance>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  flex: { flex: 1 },
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
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  scopeList: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  submitWrap: { marginTop: spacing.lg },
  fieldError: { fontSize: 12.5, color: colors.error, marginTop: -spacing.sm, marginBottom: spacing.md },
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
