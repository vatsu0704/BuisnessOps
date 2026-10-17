import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import type { IconType } from 'react-icons';
import {
  IoCashOutline,
  IoCheckmarkCircleOutline,
  IoCreateOutline,
  IoCubeOutline,
  IoEllipsisHorizontal,
  IoPhonePortraitOutline,
  IoPricetagOutline,
  IoStorefrontOutline,
} from 'react-icons/io5';
import { extractErrorMessage } from '@/api/client';
import { createExpenseCategory, listExpenseCategories, logExpense } from '@/api/expenses';
import fieldStyles from '@/components/branches/BranchFields.module.css';
import CategoryPicker from '@/components/expense/CategoryPicker';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ChipGroup from '@/components/ui/ChipGroup';
import DateField from '@/components/ui/DateField';
import Dialog from '@/components/ui/Dialog';
import Enter from '@/components/ui/Enter';
import ErrorBanner from '@/components/ui/ErrorBanner';
import FormInput from '@/components/ui/FormInput';
import OptionRow from '@/components/ui/OptionRow';
import PageHeader from '@/components/ui/PageHeader';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Spinner from '@/components/ui/Spinner';
import { useBranches } from '@/hooks/useBranches';
import { useBusinessId } from '@/hooks/useBusinessId';
import { useGoBack } from '@/hooks/useGoBack';
import { pathTo } from '@/routes/paths';
import { refreshToday } from '@/store/todayStore';
import { step } from '@/theme/motion';
import type { PaymentMethod } from '@/types/counter';
import type { ExpenseCategory } from '@/types/expense';
import { todayISO } from '@/utils/date';
import { parseOptionalNumber } from '@/utils/validation';
import styles from './FormPage.module.css';

/** Three side-by-side choices — few enough for one row of chips. */
const PAYMENT_OPTIONS: { value: PaymentMethod; icon: IconType }[] = [
  { value: 'CASH', icon: IoCashOutline },
  { value: 'UPI', icon: IoPhonePortraitOutline },
  { value: 'UNSPECIFIED', icon: IoEllipsisHorizontal },
];

/**
 * Log an expense — requirement 10, the app's Add expense screen: which branch,
 * what for (one of the categories, or a new one made on the spot), how much,
 * which day, a note, and how it was paid.
 *
 * A warehouse is offered too: it has no till and still has an electricity bill,
 * and the server accepts one here for that reason.
 */
export default function AddExpensePage() {
  const { t } = useTranslation();
  const businessId = useBusinessId();
  const { branches } = useBranches();
  const [searchParams] = useSearchParams();

  const requested = searchParams.get('branch');
  const [chosenBranchId, setChosenBranchId] = useState<string | null>(null);
  // One branch means there is no question to ask.
  const branchId =
    chosenBranchId ??
    branches.find((b) => b.id === requested)?.id ??
    (branches.length === 1 ? branches[0].id : null);
  const goBack = useGoBack(branchId ? `${pathTo('expenses')}?branch=${encodeURIComponent(branchId)}` : pathTo('expenses'));

  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isSaving, setIsSaving] = useState(false);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      setCategories(await listExpenseCategories(businessId));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedAmount = parseOptionalNumber(amount);
  const amountInvalid = parsedAmount === null || (parsedAmount !== undefined && parsedAmount <= 0);
  const canSave = !!branchId && !!categoryId && parsedAmount !== undefined && !amountInvalid && !isSaving;
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !branchId || !categoryId || parsedAmount === undefined || parsedAmount === null || !canSave) {
      return;
    }
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
      // Home's spending figure moves with it before the page underneath is shown.
      void refreshToday();
      goBack();
    } catch (err) {
      setError(extractErrorMessage(err));
      setIsSaving(false);
    }
  }

  function closeNewCategory() {
    setNewCategory('');
    setCategoryError(null);
    setIsAddingCategory(false);
  }

  async function handleCreateCategory(event: FormEvent) {
    event.preventDefault();
    if (!businessId || !newCategory.trim()) return;
    setIsCreatingCategory(true);
    setCategoryError(null);
    try {
      const created = await createExpenseCategory(businessId, newCategory.trim());
      setCategories((current) => [...(current ?? []), created]);
      // Chosen straight away: somebody who just typed "Vegetables" wants this
      // expense to be vegetables.
      setCategoryId(created.id);
      closeNewCategory();
    } catch (err) {
      setCategoryError(extractErrorMessage(err));
    } finally {
      setIsCreatingCategory(false);
    }
  }

  return (
    <>
      <form className={styles.page} onSubmit={handleSubmit} noValidate>
        <PageHeader
          title={t('expenses.addTitle')}
          backTo={branchId ? `${pathTo('expenses')}?branch=${encodeURIComponent(branchId)}` : pathTo('expenses')}
        />

        {branches.length > 1 ? (
          <Enter delay={step(1)}>
            <Card>
              <fieldset className={fieldStyles.fieldset}>
                <legend className={fieldStyles.heading}>{t('expenses.branch')}</legend>
                <div className={fieldStyles.legendGap} />
                <div className={fieldStyles.modelList}>
                  {branches.map((branch) => (
                    <OptionRow
                      key={branch.id}
                      name="expense-branch"
                      value={branch.id}
                      icon={branch.kind === 'WAREHOUSE' ? IoCubeOutline : IoStorefrontOutline}
                      title={branch.name}
                      description={branch.city ?? undefined}
                      selected={branchId === branch.id}
                      onSelect={() => setChosenBranchId(branch.id)}
                    />
                  ))}
                </div>
              </fieldset>
            </Card>
          </Enter>
        ) : null}

        <Enter delay={step(2)}>
          <Card title={branches.length === 1 && branchName ? branchName : undefined}>
            <div className={styles.fieldGroup}>
              {categories === null && !error ? (
                <div className={styles.loading}>
                  <Spinner size={22} />
                </div>
              ) : (
                <CategoryPicker
                  label={t('expenses.category')}
                  categories={categories ?? []}
                  value={categoryId}
                  onChange={setCategoryId}
                  onAddCategory={() => setIsAddingCategory(true)}
                />
              )}
            </div>
            <FormInput
              label={t('expenses.amount')}
              icon={IoCashOutline}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={amountInvalid ? t('errors.validation.AMOUNT_POSITIVE') : null}
            />
            <DateField label={t('expenses.date')} value={date} onChange={setDate} />
            <FormInput
              label={t('expenses.note')}
              icon={IoCreateOutline}
              placeholder={t('expenses.notePlaceholder')}
              autoComplete="off"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <ChipGroup<PaymentMethod>
              name="expense-payment"
              label={t('expenses.paidWith')}
              options={PAYMENT_OPTIONS.map((option) => ({
                value: option.value,
                label: t(`paymentMethod.${option.value}`),
                icon: option.icon,
              }))}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
          </Card>
        </Enter>

        <Enter delay={step(3)} className={styles.submit}>
          {error ? <ErrorBanner key={error} message={error} /> : null}
          <PrimaryButton
            type="submit"
            block
            title={t('expenses.save')}
            icon={IoCheckmarkCircleOutline}
            loading={isSaving}
            disabled={!canSave}
          />
        </Enter>
      </form>

      <Dialog
        open={isAddingCategory}
        title={t('expenses.newCategoryTitle')}
        onClose={closeNewCategory}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" title={t('expenses.cancel')} onClick={closeNewCategory} />
            <PrimaryButton
              type="submit"
              form="new-expense-category"
              title={t('expenses.create')}
              loading={isCreatingCategory}
              disabled={!newCategory.trim() || isCreatingCategory}
            />
          </>
        }
      >
        <form id="new-expense-category" onSubmit={handleCreateCategory} noValidate>
          <p className={styles.dialogBody}>{t('expenses.newCategoryHint')}</p>
          <FormInput
            label={t('expenses.newCategoryPlaceholder')}
            icon={IoPricetagOutline}
            autoFocus
            autoComplete="off"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            error={categoryError}
          />
        </form>
      </Dialog>
    </>
  );
}
