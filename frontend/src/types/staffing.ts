export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
export type StaffStatus = 'ACTIVE' | 'INACTIVE';
export type SalarySlipStatus = 'DRAFT' | 'FINALIZED';

export interface StaffMember {
  id: string;
  businessId: string;
  branchId: string;
  userId: string | null;
  name: string;
  role: string;
  externalId: string | null;
  // Decimal fields arrive as strings — Prisma serializes them that way to
  // avoid float precision loss (see backend/src/services/business.service.js).
  baseSalary: string | null;
  status: StaffStatus;
}

export interface AttendanceRecord {
  id: string;
  businessId: string;
  branchId: string;
  staffMemberId: string;
  date: string;
  status: AttendanceStatus;
  punchInAt: string | null;
  punchOutAt: string | null;
  notes: string | null;
}

export interface SalarySlip {
  id: string;
  businessId: string;
  staffMemberId: string;
  monthYear: string;
  totalDaysWorked: string;
  grossPay: string;
  deductions: string;
  netPay: string;
  currency: string;
  status: SalarySlipStatus;
  generatedAt: string;
  staffMember?: { id: string; name: string; role: string };
}
