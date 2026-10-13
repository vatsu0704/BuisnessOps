import i18n from '@/i18n';
import { apiClient } from './client';
import { downloadApiFile } from '@/utils/downloadApiFile';
import { printHtml } from '@/utils/printHtml';
import type { ExportReport } from '@/types/export';

/**
 * Day-end and month-end export — requirement 17, as the app's `api/exports.ts`.
 *
 * Three endpoints per period, one per representation, so the path decides the
 * content type rather than a `?format=` a client could get wrong:
 *
 * - bare        → JSON, which the page reads to offer the export
 * - `/workbook` → .xlsx, "the file opens in Excel"
 * - `/document` → HTML, which the browser prints, or saves as a PDF
 *
 * Both files are fetched through `apiClient`, so a refusal is reported rather
 * than saved under a `.xlsx` name. `lang` is the page's current language, not the
 * account's stored one: the person pressing the button is the person reading.
 */

type DayParams = { date?: string; branchId?: string };
type MonthParams = { month?: string; branchId?: string };

const base = (businessId: string) => `/businesses/${businessId}/exports`;

export async function getDayEndExport(businessId: string, params: DayParams = {}): Promise<ExportReport> {
  const { data } = await apiClient.get<ExportReport>(`${base(businessId)}/day-end`, { params });
  return data;
}

export async function getMonthEndExport(businessId: string, params: MonthParams = {}): Promise<ExportReport> {
  const { data } = await apiClient.get<ExportReport>(`${base(businessId)}/month-end`, { params });
  return data;
}

/** The names the server gives them in `Content-Disposition`, so the app and the web save the same file. */
function nameFor(kind: 'day' | 'month', period: string, branchId?: string): string {
  return `${kind}-end-${period}-${branchId ? 'branch' : 'all-branches'}.xlsx`;
}

export function downloadDayEndWorkbook(businessId: string, params: DayParams = {}): Promise<void> {
  return downloadApiFile(
    `${base(businessId)}/day-end/workbook`,
    { ...params, lang: i18n.language },
    nameFor('day', params.date ?? 'today', params.branchId)
  );
}

export function downloadMonthEndWorkbook(businessId: string, params: MonthParams = {}): Promise<void> {
  return downloadApiFile(
    `${base(businessId)}/month-end/workbook`,
    { ...params, lang: i18n.language },
    nameFor('month', params.month ?? 'this-month', params.branchId)
  );
}

async function fetchDocument(path: string, params: Record<string, string | undefined>): Promise<string> {
  const { data } = await apiClient.get<string>(path, {
    params: { ...params, lang: i18n.language },
    responseType: 'text',
    // Otherwise axios parses anything that looks like JSON and hands back an object.
    transformResponse: (raw) => raw,
  });
  return data;
}

export async function printDayEndDocument(businessId: string, params: DayParams = {}): Promise<void> {
  await printHtml(await fetchDocument(`${base(businessId)}/day-end/document`, params));
}

export async function printMonthEndDocument(businessId: string, params: MonthParams = {}): Promise<void> {
  await printHtml(await fetchDocument(`${base(businessId)}/month-end/document`, params));
}
