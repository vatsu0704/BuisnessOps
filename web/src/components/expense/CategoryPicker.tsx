import { useTranslation } from 'react-i18next';
import { IoAdd } from 'react-icons/io5';
import { categoryLabel } from '@shared/utils/expenseCategory';
import chips from '@/components/ui/ChipGroup.module.css';
import type { ExpenseCategory } from '@/types/expense';
import { cx } from '@/utils/cx';
import styles from './CategoryPicker.module.css';

/**
 * What the money was spent on — requirement 10's category, the app's
 * `CategoryPicker`: chips sized by their own labels in a row that wraps, because
 * the list is eight long before a business adds one, and anything dividing the
 * width evenly breaks first in the Indic translations.
 *
 * The last chip adds a category, sitting in the row rather than above it: it is
 * the answer to "none of these is what I bought", a thought someone has while
 * reading the list, not before.
 */
export default function CategoryPicker({
  label,
  categories,
  value,
  onChange,
  onAddCategory,
}: {
  label: string;
  categories: ExpenseCategory[];
  value: string | null;
  onChange: (categoryId: string) => void;
  onAddCategory?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className={chips.group}>
      <legend className={chips.label}>{label}</legend>
      <div className={chips.chips}>
        {categories.map((category) => {
          const selected = category.id === value;
          return (
            <label key={category.id} className={cx(chips.chip, selected && chips.selected)}>
              <input
                type="radio"
                name="expense-category"
                value={category.id}
                checked={selected}
                onChange={() => onChange(category.id)}
                className="visually-hidden"
              />
              <span>{categoryLabel(category, t)}</span>
            </label>
          );
        })}
        {onAddCategory ? (
          <button type="button" className={cx(chips.chip, styles.add)} onClick={onAddCategory}>
            <IoAdd size={15} aria-hidden="true" />
            <span>{t('expenses.newCategory')}</span>
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}
