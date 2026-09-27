export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE';
export type StaffStatus = 'ACTIVE' | 'INACTIVE';
export type SalarySlipStatus = 'DRAFT' | 'FINALIZED';

// Why the payroll run skipped someone. Machine codes, not prose: the backend
// has no i18n, so the client translates these under payrollRun.reason.*.
export type PayrollSkipReason = 'NO_BASE_SALARY' | 'INACTIVE' | 'ALREADY_FINALIZED' | 'NO_WORKING_DAYS';

export interface StaffMember {
  id: string;
  businessId: string;
  branchId: string;
  userId: string | null;
  name: string;
  role: string;
  externalId: string | null;
  // Decimal fields arrive as strings — Prisma serializes them that way to
  // avoid float precision loss (see backend/src/utils/money.js).
  baseSalary: string | null;
  status: StaffStatus;
  phone: string | null;
  employeeCode: string | null;
  hiredOn: string | null;
  exitedOn: string | null;
  deactivatedAt: string | null;
  notes: string | null;
}

/** GET /staff/me — "am I a staff member here", with the branch the card needs. */
export interface MyStaffMember extends StaffMember {
  branch: { id: string; name: string; timezone: string; geofenceRadiusMeters: number | null } | null;
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
  /**
   * Where the punch happened. Decimal strings, like every other Prisma decimal.
   *
   * Recorded on every punch that supplies them, and **required** for a role
   * holding `attendance:punchAnywhere` — a delivery agent has no fixed branch,
   * so the coordinates are what replaces the geofence as the record of where
   * they were.
   */
  punchInLat: string | null;
  punchInLng: string | null;
  punchOutLat: string | null;
  punchOutLng: string | null;
  notes: string | null;
  markedByMembershipId: string | null;
}

export interface SalarySlip {
  id: string;
  businessId: string;
  branchId: string;
  staffMemberId: string;
  monthYear: string;
  baseSalary: string;
  workingDays: string;
  daysPresent: string;
  daysHalfDay: string;
  daysAbsent: string;
  daysLeave: string;
  daysPending: string;
  daysWeeklyOff: string;
  daysHoliday: string;
  totalDaysWorked: string;
  grossPay: string;
  deductions: string;
  deductionNote: string | null;
  netPay: string;
  currency: string;
  status: SalarySlipStatus;
  generatedAt: string;
  finalizedAt: string | null;
  staffMember?: { id: string; name: string; role: string };
}

/** The month as payroll sees it — the same numbers the payslip is built from. */
export interface MonthSummary {
  monthYear: string;
  workingDays: number;
  daysPresent: number;
  daysHalfDay: number;
  daysAbsent: number;
  daysLeave: number;
  daysPending: number;
  daysNotEmployed: number;
  daysWeeklyOff: number;
  daysHoliday: number;
  totalDaysWorked: string;
  monthInProgress: boolean;
  holidays: { date: string; name: string; isPaid: boolean }[];
}

export interface RosterEntry {
  staffMember: {
    id: string;
    name: string;
    role: string;
    userId: string | null;
    employeeCode: string | null;
    hiredOn: string | null;
  };
  attendance: AttendanceRecord | null;
}

export interface DailyRoster {
  date: string;
  isWeeklyOff: boolean;
  holiday: { name: string; isPaid: boolean } | null;
  isWorkingDay: boolean;
  summary: {
    total: number;
    present: number;
    absent: number;
    halfDay: number;
    leave: number;
    unmarked: number;
  };
  entries: RosterEntry[];
}

export interface PayrollRunSkip {
  staffMemberId: string;
  name: string;
  reason: PayrollSkipReason;
}

export interface PayrollRunResult {
  monthYear: string;
  monthInProgress: boolean;
  ready: number;
  generated: number;
  skipped: PayrollRunSkip[];
  totals: { grossPay: string; deductions: string; netPay: string; currency: string | null };
  slips: (SalarySlip & { name?: string })[];
}

export interface Holiday {
  id: string;
  businessId: string;
  branchId: string | null;
  date: string;
  name: string;
  isPaid: boolean;
  branch?: { id: string; name: string } | null;
}

export interface WorkWeek {
  weeklyOffDays: number[];
  unmarkedWorkingDayStatus: 'PRESENT' | 'ABSENT';
  branches: {
    id: string;
    name: string;
    code: string;
    timezone: string;
    weeklyOffOverride: boolean;
    weeklyOffDays: number[];
  }[];
}
