import i18n from '@/i18n';
import { apiClient } from './client';
import { printHtml } from '@/utils/printHtml';
import type { MonthSummary, PayrollRunResult, SalarySlip } from '@/types/staffing';

/** Payroll — the app's `api/payroll.ts`: one payslip, every payslip for a month, and the month as payroll sees it. */

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
  const { data } = await apiClient.get<SalarySlip[]>(`/businesses/${businessId}/staff/${staffMemberId}/salary-slips`);
  return data;
}

export async function listSalarySlips(
  businessId: string,
  params: { monthYear?: string; branchId?: string } = {}
): Promise<SalarySlip[]> {
  const { data } = await apiClient.get<SalarySlip[]>(`/businesses/${businessId}/salary-slips`, { params });
  return data;
}

/** The same numbers the payslip is built from — the server serves both from one calculation. */
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

/** Preview and run answer in one shape, so the figures approved are the figures paid. */
export async function previewPayrollRun(
  businessId: string,
  params: { month: number; year: number; branchId?: string }
): Promise<PayrollRunResult> {
  const { data } = await apiClient.get<PayrollRunResult>(`/businesses/${businessId}/payroll/preview`, { params });
  return data;
}

export async function runPayroll(
  businessId: string,
  payload: { month: number; year: number; branchId?: string }
): Promise<PayrollRunResult> {
  const { data } = await apiClient.post<PayrollRunResult>(`/businesses/${businessId}/payroll/run`, payload);
  return data;
}

/**
 * A payslip through the print dialog, where "Save as PDF" is one of the choices —
 * the app prints the same document to a PDF it shares. The server renders it in
 * the page's current language (`lang`), which is what lets ₹ and Gujarati or
 * Devanagari print at all; it is fetched through `apiClient`, so a refusal is
 * reported rather than printed.
 */
export async function printSalarySlip(businessId: string, slip: Pick<SalarySlip, 'id'>): Promise<void> {
  const { data } = await apiClient.get<string>(`/businesses/${businessId}/salary-slips/${slip.id}/document`, {
    params: { lang: i18n.language },
    responseType: 'text',
    // Otherwise axios parses anything that looks like JSON and hands back an object.
    transformResponse: (raw) => raw,
  });
  await printHtml(data);
}
