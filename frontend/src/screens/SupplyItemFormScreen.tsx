import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { useBusinessId } from '@/hooks/useBusinessId';
import { extractErrorMessage } from '@/api/client';
import { createSupplyItem, listSupplyItems, updateSupplyItem } from '@/api/supply';
import type { SupplyItem } from '@/types/supply';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import FormInput from '@/components/FormInput';
import Pill from '@/components/Pill';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import { colors, radius, spacing } from '@/theme';
import { step } from '@/theme/motion';
import { confirm } from '@/utils/confirm';
import { haptics } from '@/utils/haptics';

/**
 * Add or edit one thing the warehouse supplies.
 *
 * One screen for both, because the fields are identical and a separate "add"
 * copy is how one of them ends up missing the price field. Which it is comes
 * from whether a `inventoryItemId` was passed.
 *
 * Leaving the price empty is allowed and meaningful: an item with no price
 * cannot be ordered, which is different from one that has been withdrawn. The
 * first says "we have not settled on a price"; the second says "we no longer
 * supply this". Both are real states a catalog needs.
 */
export default function SupplyItemFormScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'SupplyItemForm'>>();
  const businessId = useBusinessId();
  const inventoryItemId = params?.inventoryItemId;

  const [item, setItem] = useState<SupplyItem | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !inventoryItemId) return;
    setError(null);
    try {
      // No single-item GET is needed here: the list is small, already cached by
      // the screen that linked in, and asking for it inactive-inclusive is the
      // only way an edit of a withdrawn item can find it at all.
      const all = await listSupplyItems(businessId, { includeInactive: true });
      const found = all.find((candidate) => candidate.id === inventoryItemId) ?? null;
      setItem(found);
      if (found) {
        setName(found.name);
        setUnit(found.unit);
        setCategory(found.category ?? '');
        setPrice(found.unitPrice === null ? '' : String(Number(found.unitPrice)));
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId, inventoryItemId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  /** Empty means "no price", which is a value here rather than a missing one. */
  function parsePrice(): number | null {
    const trimmed = price.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  async function save() {
    if (!businessId || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        unit: unit.trim(),
        category: category.trim() || null,
        unitPrice: parsePrice(),
      };
      if (inventoryItemId) await updateSupplyItem(businessId, inventoryItemId, payload);
      else await createSupplyItem(businessId, payload);
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive() {
    if (!businessId || !item || isSaving) return;

    // Only the destructive direction asks. Withdrawing takes an item off every
    // branch's order list at once; putting it back is the same button again,
    // and a question in front of an undo is just friction.
    if (item.isActive) {
      const ok = await confirm({
        title: t('supply.withdrawTitle', { name: item.name }),
        body: t('supply.withdrawBody'),
        confirmLabel: t('supply.withdraw'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }

    setIsSaving(true);
    setError(null);
    try {
      setItem(await updateSupplyItem(businessId, item.id, { isActive: !item.isActive }));
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  const canSave = name.trim().length > 0 && unit.trim().length > 0;

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {inventoryItemId ? t('supply.editItem') : t('supply.addItem')}
          </Text>
          <PressableScale
            testID="supply-item-close"
            style={styles.close}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error ? (
              <AnimatedEntrance key={error} delay={0} style={styles.block}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {item && !item.isActive ? (
              <AnimatedEntrance delay={step(0)} style={styles.block}>
                <Pill label={t('supply.withdrawn')} tone="muted" />
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.form}>
                <FormInput
                  testID="supply-item-name"
                  label={t('supply.itemName')}
                  icon="cube-outline"
                  value={name}
                  onChangeText={setName}
                />
                <FormInput
                  testID="supply-item-unit"
                  label={t('supply.itemUnit')}
                  hint={t('supply.itemUnitHint')}
                  icon="scale-outline"
                  value={unit}
                  onChangeText={setUnit}
                />
                <FormInput
                  testID="supply-item-category"
                  label={t('supply.itemCategory')}
                  icon="folder-outline"
                  value={category}
                  onChangeText={setCategory}
                />
                <FormInput
                  testID="supply-item-price"
                  label={t('supply.itemPrice')}
                  hint={t('supply.noteOptional')}
                  icon="pricetag-outline"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={step(2)} style={styles.block}>
              <PrimaryButton
                testID="supply-item-save"
                title={inventoryItemId ? t('supply.editItem') : t('supply.addItem')}
                loading={isSaving}
                disabled={!canSave}
                onPress={() => void save()}
              />
            </AnimatedEntrance>

            {item ? (
              <AnimatedEntrance delay={step(3)} style={styles.block}>
                <PressableScale
                  testID="supply-item-toggle-active"
                  style={styles.dangerRow}
                  onPress={() => void toggleActive()}
                >
                  <Ionicons
                    name={item.isActive ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={item.isActive ? colors.warning : colors.success}
                  />
                  <Text style={styles.dangerText}>
                    {item.isActive ? t('supply.withdraw') : t('supply.restore')}
                  </Text>
                </PressableScale>
                <Text style={styles.footnote}>{t('supply.itemActiveHint')}</Text>
              </AnimatedEntrance>
            ) : null}
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
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { flexShrink: 1, fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
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
  form: { gap: spacing.md },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  dangerText: { fontSize: 14, fontWeight: '600', color: colors.text },
  footnote: { marginTop: spacing.xs, fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
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
