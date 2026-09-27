import type { TFunction } from 'i18next';
import type { ExpenseCategoryCode } from '@/types/expense';

/**
 * What to write on an expense category.
 *
 * The one rule requirement 10's categories carry, in one place because four
 * surfaces need it — the picker, the breakdown, the list of entries and the
 * delete confirmation.
 *
 * A **coded** category is one of the set every business starts with. The
 * backend cannot know the reader's language, so it sends the code and the word
 * is looked up here; the `name` it also sends is only the English fallback, the
 * same role the English in `errors/catalog.js` plays.
 *
 * A **custom** category is one somebody typed. It is shown exactly as typed,
 * because their own words are not ours to translate — the same reason a delay
 * note and a staff member's name are rendered verbatim.
 */
export function categoryLabel(
  category: { code: ExpenseCategoryCode | null; name: string | null },
  t: TFunction
): string {
  if (category.code) return t(`expenseCategory.${category.code}` as 'expenseCategory.OTHER');
  return category.name ?? '';
}
