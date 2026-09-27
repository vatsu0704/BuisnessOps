import i18n from '@/i18n';
import { apiClient } from '@/api/client';
import { printHtmlDocument } from '@/utils/printDocument';
import { shareApiFile, XLSX_MIME } from '@/utils/downloadFile';
import type { ExportReport } from '@/types/export';

/**
 * Day-end and month-end export — requirement 17.
 *
 * Three endpoints per period, one for each representation, so the content type is
 * decided by the path rather than by a `?format=` a client could get wrong:
 *
 * - bare        → JSON, which the screen reads to offer the export
 * - `/workbook` → .xlsx, "the file opens in Excel"
 * - `/document` → HTML, which the device prints to PDF
 *
 * Both file paths go through helpers that fetch via `apiClient`, because axios
 * rejects on a non-2xx. `FileSystem.downloadAsync` does not, and once shipped a
 * 403 JSON body inside a `.pdf` — see the headers of `downloadFile.ts` and
 * `printDocument.ts`.
 *
 * The `lang` the documents are rendered in is the app's *current* language, not
 * the account's stored preference: the person pressing the button is the person
 * reading the file.
 */

type DayParams = { date?: string; branchId?: string };
type MonthParams = { month?: string; branchId?: string };

const base = (businessId: string) => `/businesses/${businessId}/exports`;

// --- The data, for the screen that offers the export -----------------------

export async function getDayEndExport(businessId: string, params: DayParams = {}): Promise<ExportReport> {
  const { data } = await apiClient.get<ExportReport>(`${base(businessId)}/day-end`, { params });
  return data;
}

export async function getMonthEndExport(businessId: string, params: MonthParams = {}): Promise<ExportReport> {
  const { data } = await apiClient.get<ExportReport>(`${base(businessId)}/month-end`, { params });
  return data;
}

// --- The spreadsheet -------------------------------------------------------

/**
 * Filenames mirror what the server puts in `Content-Disposition`, so a file saved
 * from the phone and one saved from a browser are named the same thing.
 */
function nameFor(kind: 'day' | 'month', period: string, branchId?: string): string {
  const scope = branchId ? 'branch' : 'all-branches';
  return `${kind}-end-${period}-${scope}.xlsx`;
}

export function shareDayEndWorkbook(businessId: string, params: DayParams = {}): Promise<void> {
  return shareApiFile(
    `${base(businessId)}/day-end/workbook`,
    { ...params, lang: i18n.language },
    nameFor('day', params.date ?? 'today', params.branchId),
    XLSX_MIME
  );
}

export function shareMonthEndWorkbook(businessId: string, params: MonthParams = {}): Promise<void> {
  return shareApiFile(
    `${base(businessId)}/month-end/workbook`,
    { ...params, lang: i18n.language },
    nameFor('month', params.month ?? 'this-month', params.branchId),
    XLSX_MIME
  );
}

// --- The printable summary -------------------------------------------------

async function fetchDocument(path: string, params: Record<string, string | undefined>): Promise<string> {
  const { data } = await apiClient.get<string>(path, {
    params: { ...params, lang: i18n.language },
    responseType: 'text',
    // Without this axios sniffs the body and hands back a parsed object for
    // anything that looks like JSON, and a string otherwise — inconsistently.
    transformResponse: (raw) => raw,
  });
  return data;
}

export async function shareDayEndDocument(businessId: string, params: DayParams = {}): Promise<void> {
  const html = await fetchDocument(`${base(businessId)}/day-end/document`, params);
  await printHtmlDocument(html, `day-end-${params.date ?? 'today'}.pdf`);
}

export async function shareMonthEndDocument(businessId: string, params: MonthParams = {}): Promise<void> {
  const html = await fetchDocument(`${base(businessId)}/month-end/document`, params);
  await printHtmlDocument(html, `month-end-${params.month ?? 'this-month'}.pdf`);
}
