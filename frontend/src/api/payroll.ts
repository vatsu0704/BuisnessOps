import { apiClient } from '@/api/client';
import { printHtmlDocument } from '@/utils/printDocument';
import i18n from '@/i18n';
import type { MonthSummary, PayrollRunResult, SalarySlip } from '@/types/staffing';

export async function generateSalarySlip(
  businessId: string,
  staffMemberId: string,
  payload: { month: number; year: number; deductions?: number; deductionNote?: string }
): Promise<SalarySlip> {
  const { data } = await apiClient.post<SalarySlip>(
    `/businesses/${businessId}/staff/${staffMemberId}/salary-slips/generate`,
    payload
  );
  return data;
}

export async function listStaffSalarySlips(businessId: string, staffMemberId: string): Promise<SalarySlip[]> {
  const { data } = await apiClient.get<SalarySlip[]>(
    `/businesses/${businessId}/staff/${staffMemberId}/salary-slips`
  );
  return data;
}

export async function listSalarySlips(
  businessId: string,
  params: { monthYear?: string; branchId?: string } = {}
): Promise<SalarySlip[]> {
  const { data } = await apiClient.get<SalarySlip[]>(`/businesses/${businessId}/salary-slips`, { params });
  return data;
}

export async function finalizeSalarySlip(businessId: string, slipId: string): Promise<SalarySlip> {
  const { data } = await apiClient.post<SalarySlip>(`/businesses/${businessId}/salary-slips/${slipId}/finalize`);
  return data;
}

export async function getStaffMonthSummary(
  businessId: string,
  staffMemberId: string,
  month: number,
  year: number
): Promise<MonthSummary> {
  const { data } = await apiClient.get<MonthSummary>(
    `/businesses/${businessId}/staff/${staffMemberId}/attendance/summary`,
    { params: { month, year } }
  );
  return data;
}

export async function previewPayrollRun(
  businessId: string,
  params: { month: number; year: number; branchId?: string }
): Promise<PayrollRunResult> {
  const { data } = await apiClient.get<PayrollRunResult>(`/businesses/${businessId}/payroll/preview`, { params });
  return data;
}

export async function runPayroll(
  businessId: string,
  payload: {
    month: number;
    year: number;
    branchId?: string;
    staffMemberIds?: string[];
    deductionsByStaffId?: Record<string, number>;
  }
): Promise<PayrollRunResult> {
  const { data } = await apiClient.post<PayrollRunResult>(`/businesses/${businessId}/payroll/run`, payload);
  return data;
}

/**
 * The payslip as HTML, for the device to print to PDF.
 *
 * Replaces downloadSalarySlipPdf, which fetched a server-generated PDF via
 * `FileSystem.downloadAsync`. That had two problems, both fixed by this
 * removal: the PDF could not render `₹` or any Indic script (pdfmake with
 * base-14 Helvetica), and downloadAsync does not reject on an HTTP error
 * status — a 403 silently wrote `{"message":"Insufficient permissions"}` into
 * a .pdf and shared a corrupt file. Going through apiClient means axios
 * rejects, and the caller's existing catch reports it properly.
 */
export async function fetchSalarySlipHtml(businessId: string, slipId: string, lang: string): Promise<string> {
  const { data } = await apiClient.get<string>(`/businesses/${businessId}/salary-slips/${slipId}/document`, {
    params: { lang },
    responseType: 'text',
    // Without this axios sniffs the body and hands back a parsed object for
    // anything that looks like JSON, and a string otherwise — inconsistently.
    transformResponse: (raw) => raw,
  });
  return data;
}

/** Fetches the payslip in the app's current language and hands it to the OS. */
export async function shareSalarySlip(businessId: string, slip: SalarySlip): Promise<void> {
  const html = await fetchSalarySlipHtml(businessId, slip.id, i18n.language);
  await printHtmlDocument(html, `payslip-${slip.monthYear}.pdf`);
}
