import type { TFunction } from 'i18next';
import type { UploadResult } from '@/api/dataSource';
import { translateDetail } from '@/api/errorMessages';

/**
 * What an import's answer means, in words — the app's Upload screen reads it the
 * same way.
 */
export function summariseUpload(result: UploadResult, t: TFunction) {
  // The untouched template: every row was a sample, so there was nothing to
  // import. Said plainly, rather than as a "complete" with three zeros.
  const examplesSkipped = result.examplesSkipped ?? 0;
  const onlyExamples = examplesSkipped > 0 && result.recordsProcessed === 0;
  const clean = result.recordsFailed === 0 && !onlyExamples;

  // Said out loud because both are otherwise invisible: samples quietly left
  // out, and which way round 01/09/2026 was read — a wrong guess there files a
  // month of sales in the wrong month.
  const notes: string[] = [];
  if (!onlyExamples) {
    if (examplesSkipped > 0) notes.push(t('upload.examplesSkipped', { count: examplesSkipped }));
    if (result.dateOrder === 'DAY_FIRST') notes.push(t('upload.dateOrderDayFirst'));
    if (result.dateOrder === 'MONTH_FIRST') notes.push(t('upload.dateOrderMonthFirst'));
  }

  // Each skipped row in the reader's language, or the server's English for a
  // code this build has no wording for — a server newer than the page.
  const rowErrors =
    result.errorDetails?.map((detail, index) => translateDetail(detail) ?? result.errors[index] ?? '') ?? result.errors;

  return { onlyExamples, clean, notes, rowErrors: rowErrors.filter(Boolean) };
}
