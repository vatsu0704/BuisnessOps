import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParamList } from '@/navigation/AppNavigator';
import { createExpenseCategory, listExpenseCategories, logExpense } from '@/api/expenses';
import { extractErrorMessage } from '@/api/client';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId } from '@/hooks/useBusinessId';
import { parseOptionalNumber } from '@/utils/validation';
import { todayISO } from '@/utils/date';
import { haptics } from '@/utils/haptics';
import AnimatedEntrance from '@/components/AnimatedEntrance';
import CategoryPicker from '@/components/expense/CategoryPicker';
import DateField from '@/components/DateField';
import FormInput from '@/components/FormInput';
import OptionRow from '@/components/OptionRow';
import PressableScale from '@/components/PressableScale';
import PrimaryButton from '@/components/PrimaryButton';
import ScreenBackground from '@/components/ScreenBackground';
import SegmentedOption from '@/components/SegmentedOption';
import { colors, radius, shadow, spacing, typography } from '@/theme';
import { step } from '@/theme/motion';
import type { ExpenseCategory } from '@/types/expense';
import type { PaymentMethod } from '@/types/counter';

type Props = NativeStackScreenProps<AppStackParamList, 'AddExpense'>;

/**
 * Log an expense — requirement 10.
 *
 * Three side-by-side payment options is exactly what `SegmentedOption` is for,
 * and eight-plus categories is exactly what it is not: see `CategoryPicker`.
 */
const PAYMENT_OPTIONS: { value: PaymentMethod; icon: 'cash-outline' | 'phone-portrait-outline' | 'ellipsis-horizontal' }[] = [
  { value: 'CASH', icon: 'cash-outline' },
  { value: 'UPI', icon: 'phone-portrait-outline' },
  { value: 'UNSPECIFIED', icon: 'ellipsis-horizontal' },
];

export default function AddExpenseScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  // `branches`, not `tradingBranches`: a warehouse has no till and still has an
  // electricity bill, and the server accepts one here for that reason.
  const { branches } = useBranches();

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [branchId, setBranchId] = useState<string | null>(route.params?.branchId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isSaving, setIsSaving] = useState(false);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setIsLoading(true);
    setError(null);
    try {
      setCategories(await listExpenseCategories(businessId));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  // One branch means there is no question to ask.
  useEffect(() => {
    if (!branchId && branches.length === 1) setBranchId(branches[0].id);
  }, [branchId, branches]);

  const parsedAmount = parseOptionalNumber(amount);
  const amountInvalid = parsedAmount === null || (parsedAmount !== undefined && parsedAmount <= 0);
  const canSave = !!branchId && !!categoryId && parsedAmount !== undefined && !amountInvalid && !isSaving;

  const branchName = useMemo(
    () => branches.find((branch) => branch.id === branchId)?.name ?? null,
    [branchId, branches]
  );

  async function handleSave() {
    if (!businessId || !branchId || !categoryId || parsedAmount === undefined || parsedAmount === null) return;
    haptics.tap();
    setIsSaving(true);
    setError(null);
    try {
      await logExpense(businessId, {
        branchId,
        categoryId,
        amount: parsedAmount,
        date,
        note: note.trim() || undefined,
        paymentMethod,
      });
      haptics.success();
      navigation.goBack();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateCategory() {
    if (!businessId || !newCategory.trim()) return;
    haptics.tap();
    setIsCreatingCategory(true);
    setError(null);
    try {
      const created = await createExpenseCategory(businessId, newCategory.trim());
      setCategories((current) => [...current, created]);
      // Chosen straight away: somebody who just typed "Vegetables" wants this
      // expense to be vegetables, and making them find the new chip is work
      // the app already knows the answer to.
      setCategoryId(created.id);
      setNewCategory('');
      setIsAddingCategory(false);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(extractErrorMessage(err));
    } finally {
      setIsCreatingCategory(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('expenses.addTitle')}</Text>
          <PressableScale testID="add-expense-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {error ? (
              <AnimatedEntrance key={error} delay={0} distance={-8} style={styles.block}>
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </AnimatedEntrance>
            ) : null}

            {branches.length > 1 ? (
              <AnimatedEntrance delay={step(0)} style={styles.block}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>{t('expenses.branch')}</Text>
                  {branches.map((branch) => (
                    <OptionRow
                      key={branch.id}
                      testID={`add-expense-branch-${branch.code}`}
                      icon={branch.kind === 'WAREHOUSE' ? 'cube-outline' : 'storefront-outline'}
                      title={branch.name}
                      description={branch.city ?? undefined}
                      selected={branchId === branch.id}
                      onPress={() => setBranchId(branch.id)}
                    />
                  ))}
                </View>
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={step(1)} style={styles.block}>
              <View style={styles.card}>
                {branches.length === 1 && branchName ? (
                  <Text style={styles.sectionHint}>{branchName}</Text>
                ) : null}

                {isLoading ? (
                  <ActivityIndicator color={colors.primary} style={styles.loader} />
                ) : (
                  <CategoryPicker
                    testIDPrefix="add-expense-category"
                    label={t('expenses.category')}
                    categories={categories}
                    value={categoryId}
                    onChange={setCategoryId}
                    onAddCategory={() => setIsAddingCategory(true)}
                    style={styles.picker}
                  />
                )}

                <FormInput
                  testID="add-expense-amount"
                  label={t('expenses.amount')}
                  icon="cash-outline"
                  keyboardType="numeric"
                  value={amount}
                  onChangeText={setAmount}
                />
                {amountInvalid ? (
                  <Text style={styles.fieldError}>{t('errors.validation.AMOUNT_POSITIVE')}</Text>
                ) : null}

                <DateField
                  testID="add-expense-date"
                  label={t('expenses.date')}
                  value={date}
                  onChange={setDate}
                  maximumDate={new Date()}
                />

                <FormInput
                  testID="add-expense-note"
                  label={t('expenses.note')}
                  icon="create-outline"
                  placeholder={t('expenses.notePlaceholder')}
                  value={note}
                  onChangeText={setNote}
                />

                <Text style={styles.fieldLabel}>{t('expenses.paidWith')}</Text>
                <View style={styles.paymentRow}>
                  {PAYMENT_OPTIONS.map((option) => (
                    <SegmentedOption
                      key={option.value}
                      testID={`add-expense-payment-${option.value}`}
                      icon={option.icon}
                      title={t(`paymentMethod.${option.value}` as 'paymentMethod.CASH')}
                      selected={paymentMethod === option.value}
                      onPress={() => setPaymentMethod(option.value)}
                    />
                  ))}
                </View>

                <PrimaryButton
                  testID="add-expense-submit"
                  title={t('expenses.save')}
                  icon="checkmark-circle-outline"
                  loading={isSaving}
                  disabled={!canSave}
                  onPress={handleSave}
                  style={styles.submit}
                />
              </View>
            </AnimatedEntrance>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* `onRequestClose` is what makes Android's back button close this
            rather than the screen underneath it. */}
        <Modal
          visible={isAddingCategory}
          transparent
          animationType="fade"
          onRequestClose={() => setIsAddingCategory(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t('expenses.newCategoryTitle')}</Text>
              <Text style={styles.modalBody}>{t('expenses.newCategoryHint')}</Text>
              <FormInput
                testID="add-expense-new-category"
                label={t('expenses.newCategoryPlaceholder')}
                icon="pricetag-outline"
                autoFocus
                value={newCategory}
                onChangeText={setNewCategory}
              />
              <View style={styles.modalActions}>
                <PressableScale
                  testID="add-expense-new-category-cancel"
                  style={styles.modalCancel}
                  onPress={() => {
                    setNewCategory('');
                    setIsAddingCategory(false);
                  }}
                >
                  <Text style={styles.modalCancelText}>{t('expenses.cancel')}</Text>
                </PressableScale>
                <PrimaryButton
                  testID="add-expense-new-category-submit"
                  title={t('expenses.create')}
                  loading={isCreatingCategory}
                  disabled={!newCategory.trim() || isCreatingCategory}
                  onPress={handleCreateCategory}
                  style={styles.modalSubmit}
                />
              </View>
            </View>
          </View>
        </Modal>
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
    marginBottom: spacing.sm,
  },
  sectionHint: { fontSize: 13, color: colors.textTertiary, marginBottom: spacing.lg },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.xs },
  picker: { marginBottom: spacing.lg },
  paymentRow: { flexDirection: 'row', gap: spacing.sm },
  submit: { marginTop: spacing.xl },
  loader: { paddingVertical: spacing.xl },
  fieldError: { fontSize: 12.5, color: colors.error, marginTop: -spacing.md, marginBottom: spacing.md },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.error },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,24,27,0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, ...shadow.md },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  modalBody: { fontSize: 13.5, color: colors.textSecondary, marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalCancel: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  modalSubmit: { flex: 1 },
});
