import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addMonths, monthLabel } from '@/utils/date';

/**
 * 1-12/year cursor for "which month am I looking at", defaulting to the
 * current month.
 *
 * Two fixes over the original: the month name comes from the translation files
 * rather than a hardcoded English array (which made a Hindi payroll heading
 * read "पेरोल — September 2026"), and there is an upper clamp. It previously
 * scrolled forever into the future, offering payroll for months that cannot
 * have happened — and the backend now rejects those outright.
 */
export function useMonthCursor() {
  const { t } = useTranslation();
  const now = new Date();
  const nowMonth = now.getMonth() + 1;
  const nowYear = now.getFullYear();

  const [month, setMonth] = useState(nowMonth);
  const [year, setYear] = useState(nowYear);

  const label = useMemo(() => monthLabel(month, year, t), [month, year, t]);
  const canGoNext = year < nowYear || (year === nowYear && month < nowMonth);
  const isCurrentMonth = month === nowMonth && year === nowYear;

  function goPrev() {
    const next = addMonths(month, year, -1);
    setMonth(next.month);
    setYear(next.year);
  }

  function goNext() {
    if (!canGoNext) return;
    const next = addMonths(month, year, 1);
    setMonth(next.month);
    setYear(next.year);
  }

  return { month, year, label, goPrev, goNext, canGoNext, isCurrentMonth };
}
