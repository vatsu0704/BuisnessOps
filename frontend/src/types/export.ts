import type { BranchKind } from '@/types/branch';
import type { AttendanceStatus, SalarySlipStatus } from '@/types/staffing';
import type { CounterOrderStatus, PaymentMethod } from '@/types/counter';
import type { SupplyOrderStatus, SupplyPaymentMode, SupplyPaymentStatus } from '@/types/supply';

/**
 * Day-end and month-end export — requirement 17.
 *
 * Money arrives as a string, as everywhere else Prisma serialises a `Decimal`.
 * `Number(...)` happens at the point of display and nowhere else.
 *
 * The app reads this JSON to *offer* the export — how many records there are, what
 * the totals come to, whether anything is worth checking. The .xlsx and the
 * printable summary are separate endpoints returning bytes and markup, so nothing
 * here describes them.
 */

export type ExportTotals = {
  counterSales: string;
  counterOrderCount: number;
  counterVoidCount: number;
  counterOpenCount: number;
  supplySpend: string;
  supplyOrderCount: number;
  expenseTotal: string;
  expenseCount: number;
  attendance: Record<AttendanceStatus, number>;
  staffMarked: number;
  /** Month export only. */
  payroll?: string;
  payslipCount?: number;
  payslipDraftCount?: number;
};

/**
 * Evidence that one payment may have been recorded twice — the question §5 of
 * REQUIREMENTS.md left for this task.
 *
 * A code and params, never a sentence: the app renders
 * `t('exports.overlap.<code>', params)` so it reads in the device's language. Only
 * the printable document renders it as prose, because a printed page cannot hold a
 * translation key.
 */
export type ExportOverlap = {
  code: 'EXPENSE_MATCHES_SUPPLY_ORDER';
  params: { category: string; amount: string; orderNumber: number; date: string };
  expenseId: string;
  supplyOrderId: string;
};

export type ExportCounterOrder = {
  id: string;
  tokenNumber: number;
  tokenDate: string;
  status: CounterOrderStatus;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  openedAt: string;
  closedAt: string | null;
};

export type ExportSupplyOrder = {
  id: string;
  orderNumber: number | null;
  status: SupplyOrderStatus;
  totalAmount: string;
  paymentMode: SupplyPaymentMode | null;
  paymentStatus: SupplyPaymentStatus;
  placedAt: string | null;
};

export type ExportExpense = {
  id: string;
  amount: string;
  expenseDate: string;
  note: string | null;
  paymentMethod: PaymentMethod;
  category: { id: string; code: string | null; name: string } | null;
};

export type ExportAttendance = {
  id: string;
  date: string;
  status: AttendanceStatus;
  punchInAt: string | null;
  punchOutAt: string | null;
  staffMember: { name: string; employeeCode: string | null; role: string } | null;
};

export type ExportSalarySlip = {
  id: string;
  monthYear: string;
  netPay: string;
  grossPay: string;
  deductions: string;
  status: SalarySlipStatus;
  staffMember: { name: string; employeeCode: string | null; role: string } | null;
};

export type ExportBranchSection = {
  branch: {
    id: string;
    name: string;
    code: string;
    kind: BranchKind;
    timezone: string;
    currency: string;
  };
  /** Day export only — and each branch may have a different one, when none was asked for. */
  date?: string;
  /** Month export only. */
  month?: string;
  counterOrders: ExportCounterOrder[];
  supplyOrders: ExportSupplyOrder[];
  expenses: ExportExpense[];
  attendance: ExportAttendance[];
  /** Month export only. */
  salarySlips?: ExportSalarySlip[];
  totals: ExportTotals;
  overlaps: ExportOverlap[];
  dayClose: { closedAt: string; closedBy: string | null } | null;
};

export type ExportReport = {
  kind: 'DAY' | 'MONTH';
  /** Null when each branch was asked about its own local date — there was no single one. */
  date?: string | null;
  month?: string;
  business: { id: string; name: string; currency: string };
  generatedAt: string;
  branches: ExportBranchSection[];
  totals: ExportTotals;
  overlaps: ExportOverlap[];
};
