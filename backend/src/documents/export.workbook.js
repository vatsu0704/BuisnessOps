const XLSX = require('xlsx');
const { dateKeyOf, localTimestampKey } = require('../utils/datetime');
const {
  labelsFor,
  COUNTER_STATUS,
  SUPPLY_STATUS,
  PAYMENT_STATUS,
  PAYMENT_MODE,
  ATTENDANCE_STATUS,
  PAYMENT_METHOD,
  SLIP_STATUS,
} = require('./export.labels');

/**
 * The day-end / month-end spreadsheet — requirement 17's "the file opens in Excel".
 *
 * Uses the `xlsx` package the backend already carries for CSV/Excel *import*, so
 * this adds no dependency: the same library reads and writes.
 *
 * ## Amounts are numbers, dates are strings
 *
 * Every money cell is a JavaScript number, not `"₹2,000.00"`. A formatted string
 * is text to Excel — it cannot be summed, sorted or charted, which is the entire
 * reason somebody asked for a spreadsheet rather than a PDF. `Decimal` therefore
 * goes through `Number()` here, at the edge, and only here.
 *
 * Dates go the other way: `2026-09-25` as text, never a spreadsheet date serial.
 * A serial is interpreted against the *reader's* locale, so the same file shows
 * 25/09 in India and 09/25 in the US, and Excel has been known to reinterpret
 * ambiguous ones outright. An ISO string means one thing everywhere and still
 * sorts correctly.
 *
 * ## One row per record, with its branch on it
 *
 * Not one sheet per branch. A flat table with a Branch column is what a pivot
 * table wants, and it means a one-branch export and a forty-branch export are the
 * same shape — so nothing downstream has to care how many there were.
 */

/**
 * Excel refuses `[ ] : * ? / \` in a sheet name and truncates past 31 characters.
 * The names are translated, so this cannot be assumed away — a Devanagari name is
 * well inside the limit but the rule still has to be applied somewhere.
 */
function safeSheetName(name, fallback) {
  const cleaned = String(name || fallback).replace(/[[\]:*?/\\]/g, ' ').trim();
  return (cleaned || fallback).slice(0, 31);
}

function num(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(map, value, labels) {
  const key = map[value];
  return key ? labels[key] : (value ?? '');
}

/**
 * An instant as 'YYYY-MM-DD HH:MM' in the **branch's** timezone.
 *
 * Sortable as text, unambiguous in any locale, and in the clock the person
 * reading it was working to. UTC would show a 09:05 sale in Kolkata as 03:35.
 */
function timestamp(instant, timeZone) {
  if (!instant) return '';
  return localTimestampKey(new Date(instant), timeZone);
}

function itemSummary(items) {
  return (items ?? [])
    .map((item) => `${item.productNameSnapshot ?? item.itemNameSnapshot ?? ''} x${item.quantity}`)
    .join('; ');
}

function appendSheet(workbook, name, rows, fallback) {
  // A sheet with only headers is still worth shipping: its absence reads as "the
  // export is broken", whereas an empty sheet reads as "nothing was recorded".
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(name, fallback));
}

// --- Sheets ----------------------------------------------------------------

function summaryRows(report, labels) {
  const isDay = report.kind === 'DAY';

  const header = [
    labels.colBranch,
    isDay ? labels.colDate : labels.month,
    labels.counterSales,
    labels.tokens,
    labels.voided,
    labels.supplySpend,
    labels.supplyOrders,
    labels.expenses,
    labels.entries,
    labels.statusPresent,
    labels.statusAbsent,
    labels.statusHalfDay,
    labels.statusLeave,
  ];
  if (!isDay) header.push(labels.payroll, labels.payslips);

  const rows = [header];

  for (const s of report.branches) {
    const row = [
      s.branch.name,
      isDay ? s.date : s.month,
      num(s.totals.counterSales),
      s.totals.counterOrderCount,
      s.totals.counterVoidCount,
      num(s.totals.supplySpend),
      s.totals.supplyOrderCount,
      num(s.totals.expenseTotal),
      s.totals.expenseCount,
      s.totals.attendance.PRESENT,
      s.totals.attendance.ABSENT,
      s.totals.attendance.HALF_DAY,
      s.totals.attendance.LEAVE,
    ];
    if (!isDay) row.push(num(s.totals.payroll), s.totals.payslipCount);
    rows.push(row);
  }

  const t = report.totals;
  const totalRow = [
    labels.total,
    '',
    num(t.counterSales),
    t.counterOrderCount,
    t.counterVoidCount,
    num(t.supplySpend),
    t.supplyOrderCount,
    num(t.expenseTotal),
    t.expenseCount,
    t.attendance.PRESENT,
    t.attendance.ABSENT,
    t.attendance.HALF_DAY,
    t.attendance.LEAVE,
  ];
  if (!isDay) totalRow.push(num(t.payroll), t.payslipCount);
  rows.push(totalRow);

  return rows;
}

function counterRows(report, labels) {
  const rows = [
    [
      labels.colBranch,
      labels.colDate,
      labels.colToken,
      labels.colOpened,
      labels.colClosed,
      labels.colStatus,
      labels.colPayment,
      labels.colTakenBy,
      labels.colItems,
      labels.colAmount,
    ],
  ];

  for (const s of report.branches) {
    for (const order of s.counterOrders) {
      rows.push([
        s.branch.name,
        dateKeyOf(order.tokenDate),
        order.tokenNumber,
        timestamp(order.openedAt, s.branch.timezone),
        timestamp(order.closedAt, s.branch.timezone),
        statusLabel(COUNTER_STATUS, order.status, labels),
        statusLabel(PAYMENT_METHOD, order.paymentMethod, labels),
        order.placedByMembership?.user?.name ?? '',
        itemSummary(order.items),
        num(order.totalAmount),
      ]);
    }
  }

  return rows;
}

function supplyRows(report, labels) {
  const rows = [
    [
      labels.colBranch,
      labels.colOrderNumber,
      labels.colPlacedAt,
      labels.colStatus,
      labels.colPaymentMode,
      labels.colPaymentStatus,
      labels.colPlacedBy,
      labels.colAgent,
      labels.colItems,
      labels.colAmount,
    ],
  ];

  for (const s of report.branches) {
    for (const order of s.supplyOrders) {
      rows.push([
        s.branch.name,
        order.orderNumber ?? '',
        timestamp(order.placedAt, s.branch.timezone),
        statusLabel(SUPPLY_STATUS, order.status, labels),
        statusLabel(PAYMENT_MODE, order.paymentMode, labels),
        statusLabel(PAYMENT_STATUS, order.paymentStatus, labels),
        order.placedByMembership?.user?.name ?? '',
        order.deliveryAgentMembership?.user?.name ?? '',
        itemSummary(order.items),
        num(order.totalAmount),
      ]);
    }
  }

  return rows;
}

function expenseRows(report, labels) {
  const rows = [
    [
      labels.colBranch,
      labels.colDate,
      labels.colCategory,
      labels.colNote,
      labels.colPayment,
      labels.colRecordedBy,
      labels.colAmount,
    ],
  ];

  for (const s of report.branches) {
    for (const expense of s.expenses) {
      rows.push([
        s.branch.name,
        dateKeyOf(expense.expenseDate),
        expense.category?.name ?? '',
        expense.note ?? '',
        statusLabel(PAYMENT_METHOD, expense.paymentMethod, labels),
        expense.recordedByMembership?.user?.name ?? '',
        num(expense.amount),
      ]);
    }
  }

  return rows;
}

function attendanceRows(report, labels) {
  const rows = [
    [
      labels.colBranch,
      labels.colDate,
      labels.colStaff,
      labels.colCode,
      labels.colRole,
      labels.colStatus,
      labels.colPunchIn,
      labels.colPunchOut,
    ],
  ];

  for (const s of report.branches) {
    for (const record of s.attendance) {
      rows.push([
        s.branch.name,
        dateKeyOf(record.date),
        record.staffMember?.name ?? '',
        record.staffMember?.employeeCode ?? '',
        record.staffMember?.role ?? '',
        statusLabel(ATTENDANCE_STATUS, record.status, labels),
        timestamp(record.punchInAt, s.branch.timezone),
        timestamp(record.punchOutAt, s.branch.timezone),
      ]);
    }
  }

  return rows;
}

function payrollRows(report, labels) {
  const rows = [
    [
      labels.colBranch,
      labels.month,
      labels.colStaff,
      labels.colCode,
      labels.colDaysWorked,
      labels.colGross,
      labels.colDeductions,
      labels.colNet,
      labels.colStatus,
    ],
  ];

  for (const s of report.branches) {
    for (const slip of s.salarySlips ?? []) {
      rows.push([
        s.branch.name,
        slip.monthYear,
        slip.staffMember?.name ?? '',
        slip.staffMember?.employeeCode ?? '',
        num(slip.totalDaysWorked),
        num(slip.grossPay),
        num(slip.deductions),
        num(slip.netPay),
        statusLabel(SLIP_STATUS, slip.status, labels),
      ]);
    }
  }

  return rows;
}

// --- The workbook ----------------------------------------------------------

/**
 * `report` is exactly what `export.service.js` returned. Like the HTML template,
 * this does no arithmetic of its own — every total it writes is one the service
 * computed, so the spreadsheet and the printable summary cannot disagree.
 *
 * Returns a Buffer, which the controller streams.
 */
function renderExportWorkbook({ report, lang = 'en' }) {
  const labels = labelsFor(lang);
  const workbook = XLSX.utils.book_new();

  appendSheet(workbook, labels.sheetSummary, summaryRows(report, labels), 'Summary');
  appendSheet(workbook, labels.sheetCounter, counterRows(report, labels), 'Counter');
  appendSheet(workbook, labels.sheetSupply, supplyRows(report, labels), 'Supply');
  appendSheet(workbook, labels.sheetExpenses, expenseRows(report, labels), 'Expenses');
  appendSheet(workbook, labels.sheetAttendance, attendanceRows(report, labels), 'Attendance');
  if (report.kind === 'MONTH') {
    appendSheet(workbook, labels.sheetPayroll, payrollRows(report, labels), 'Payslips');
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { renderExportWorkbook, safeSheetName };
