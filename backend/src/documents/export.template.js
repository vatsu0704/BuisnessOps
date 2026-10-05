const { html, raw, render } = require('./escape');
const { renderDocument, section, keyValues, statCards, dataTable } = require('./layout');
const { formatMoney, formatDateLong, formatMonthYear, formatTimestamp } = require('./format');
const { interpolate } = require('../errors');
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
 * The printable day-end / month-end summary — requirement 17.
 *
 * Uses the same `layout.js` shell the payslip does, rather than a second styling
 * system: one A4 stylesheet, one font stack that covers Devanagari and Gujarati
 * from the device's own faces, one place to change if the brand changes.
 *
 * Every interpolation goes through the `html` tagged template, which escapes by
 * default — branch names, staff names and expense notes are all user-supplied and
 * this markup is handed to a WebView. A fragment that is already rendered is
 * composed with `raw()`; there is no way to opt out of escaping by accident.
 *
 * ## A summary, not a reproduction of the spreadsheet
 *
 * The .xlsx carries every row for someone who wants to work with the numbers.
 * This is for reading and handing over, so it leads with the totals, then lists
 * the records at a level a person can take in — and where a section would run to
 * hundreds of rows it says how many there were rather than printing all of them.
 * A forty-page PDF of counter tokens is not a summary.
 */

/** Past this, a section prints its totals and a count instead of every row. */
const MAX_ROWS_PER_SECTION = 60;

function statusLabel(map, value, labels) {
  const key = map[value];
  return key ? labels[key] : (value ?? '');
}

/**
 * `formatTimestamp` takes a timezone and falls back to the **server's** when it is
 * omitted — a silent third wrong answer beside UTC. The export is per-branch, so
 * the branch's own clock is the only correct frame, and it is always passed.
 */
function timeOf(instant, timeZone) {
  if (!instant) return '';
  return formatTimestamp(instant, timeZone);
}

function itemSummary(items) {
  return items.map((item) => `${item.productNameSnapshot ?? item.itemNameSnapshot ?? ''} ×${item.quantity}`).join(', ');
}

// --- Sections --------------------------------------------------------------

function counterSection(rows, currency, labels, timeZone) {
  if (rows.length === 0) return html`<p class="muted">${labels.noRecords}</p>`;

  const shown = rows.slice(0, MAX_ROWS_PER_SECTION);
  const table = dataTable(
    [
      { label: labels.colToken },
      { label: labels.colOpened },
      { label: labels.colItems },
      { label: labels.colStatus },
      { label: labels.colPayment },
      { label: labels.colTakenBy },
      { label: labels.colAmount, numeric: true },
    ],
    shown.map((order) => ({
      cells: [
        `#${order.tokenNumber}`,
        timeOf(order.openedAt, timeZone),
        itemSummary(order.items ?? []),
        statusLabel(COUNTER_STATUS, order.status, labels),
        statusLabel(PAYMENT_METHOD, order.paymentMethod, labels),
        order.placedByMembership?.user?.name ?? '',
        formatMoney(order.totalAmount, currency),
      ],
    }))
  );

  return withOverflowNote(table, rows.length, shown.length, labels);
}

function supplySection(rows, currency, labels, timeZone) {
  if (rows.length === 0) return html`<p class="muted">${labels.noRecords}</p>`;

  const shown = rows.slice(0, MAX_ROWS_PER_SECTION);
  const table = dataTable(
    [
      { label: labels.colOrderNumber },
      { label: labels.colPlacedAt },
      { label: labels.colItems },
      { label: labels.colStatus },
      { label: labels.colPaymentMode },
      { label: labels.colPaymentStatus },
      { label: labels.colAmount, numeric: true },
    ],
    shown.map((order) => ({
      cells: [
        order.orderNumber === null ? '' : `#${order.orderNumber}`,
        timeOf(order.placedAt, timeZone),
        // The supplier rides in front of the items rather than in a column of
        // its own: the printed table is already as wide as an A4 page allows,
        // and only a vendor order needs saying — the warehouse is the default.
        order.vendor?.name
          ? `${order.vendor.name} — ${itemSummary(order.items ?? [])}`
          : itemSummary(order.items ?? []),
        statusLabel(SUPPLY_STATUS, order.status, labels),
        statusLabel(PAYMENT_MODE, order.paymentMode, labels),
        statusLabel(PAYMENT_STATUS, order.paymentStatus, labels),
        formatMoney(order.totalAmount, currency),
      ],
    }))
  );

  return withOverflowNote(table, rows.length, shown.length, labels);
}

function expenseSection(rows, currency, labels) {
  if (rows.length === 0) return html`<p class="muted">${labels.noRecords}</p>`;

  const shown = rows.slice(0, MAX_ROWS_PER_SECTION);
  const table = dataTable(
    [
      { label: labels.colCategory },
      { label: labels.colNote },
      { label: labels.colPayment },
      { label: labels.colRecordedBy },
      { label: labels.colAmount, numeric: true },
    ],
    shown.map((expense) => ({
      cells: [
        // A seeded category's name is the English fallback and a custom one's is
        // what somebody typed. Neither is translated here: the document cannot
        // know which, and printing a code would be worse than printing English.
        expense.category?.name ?? '',
        expense.note ?? '',
        statusLabel(PAYMENT_METHOD, expense.paymentMethod, labels),
        expense.recordedByMembership?.user?.name ?? '',
        formatMoney(expense.amount, currency),
      ],
    }))
  );

  return withOverflowNote(table, rows.length, shown.length, labels);
}

function attendanceSection(rows, labels, timeZone) {
  if (rows.length === 0) return html`<p class="muted">${labels.noRecords}</p>`;

  const shown = rows.slice(0, MAX_ROWS_PER_SECTION);
  const table = dataTable(
    [
      { label: labels.colStaff },
      { label: labels.colRole },
      { label: labels.colStatus },
      { label: labels.colPunchIn },
      { label: labels.colPunchOut },
    ],
    shown.map((record) => ({
      cells: [
        record.staffMember?.name ?? '',
        record.staffMember?.role ?? '',
        statusLabel(ATTENDANCE_STATUS, record.status, labels),
        timeOf(record.punchInAt, timeZone),
        timeOf(record.punchOutAt, timeZone),
      ],
    }))
  );

  return withOverflowNote(table, rows.length, shown.length, labels);
}

function payrollSection(rows, currency, labels) {
  if (!rows || rows.length === 0) return html`<p class="muted">${labels.noRecords}</p>`;

  return dataTable(
    [
      { label: labels.colStaff },
      { label: labels.colDaysWorked, numeric: true },
      { label: labels.colGross, numeric: true },
      { label: labels.colDeductions, numeric: true },
      { label: labels.colNet, numeric: true },
      { label: labels.colStatus },
    ],
    rows.map((slip) => ({
      cells: [
        slip.staffMember?.name ?? '',
        String(slip.totalDaysWorked),
        formatMoney(slip.grossPay, currency),
        formatMoney(slip.deductions, currency),
        formatMoney(slip.netPay, currency),
        statusLabel(SLIP_STATUS, slip.status, labels),
      ],
    }))
  );
}

function withOverflowNote(table, total, shown, labels) {
  if (total <= shown) return table;
  // Says what was left out rather than silently truncating, which would make the
  // document disagree with the spreadsheet for no visible reason.
  return html`${table}<p class="muted">${interpolate(labels.moreInSpreadsheet, {
    hidden: total - shown,
  })}</p>`;
}

// --- One branch ------------------------------------------------------------

function branchBlock(branchSection, kind, labels, locale) {
  const { branch, totals } = branchSection;
  const currency = branch.currency;

  const cards = [
    { label: labels.counterSales, value: formatMoney(totals.counterSales, currency), emphasis: true },
    { label: labels.supplySpend, value: formatMoney(totals.supplySpend, currency) },
    { label: labels.expenses, value: formatMoney(totals.expenseTotal, currency) },
  ];
  if (kind === 'MONTH') {
    cards.push({ label: labels.payroll, value: formatMoney(totals.payroll, currency) });
  }

  const meta = [
    [labels.branch, `${branch.name} (${branch.code})`],
    [
      kind === 'DAY' ? labels.date : labels.month,
      kind === 'DAY' ? formatDateLong(branchSection.date, locale) : formatMonthYear(branchSection.month, locale),
    ],
    [labels.tokens, `${totals.counterOrderCount}`],
    [labels.voided, totals.counterVoidCount ? `${totals.counterVoidCount}` : null],
    [labels.stillOpen, totals.counterOpenCount ? `${totals.counterOpenCount}` : null],
    [labels.supplyOrders, `${totals.supplyOrderCount}`],
    [labels.entries, `${totals.expenseCount}`],
    [
      labels.sectionAttendance,
      `${labels.statusPresent} ${totals.attendance.PRESENT} · ${labels.statusAbsent} ${totals.attendance.ABSENT} · ` +
        `${labels.statusHalfDay} ${totals.attendance.HALF_DAY} · ${labels.statusLeave} ${totals.attendance.LEAVE}`,
    ],
  ];

  const closeNote = kind !== 'DAY'
    ? null
    : branchSection.dayClose
      ? interpolate(labels.dayClosed, {
          at: formatTimestamp(branchSection.dayClose.closedAt, branch.timezone),
          who: branchSection.dayClose.closedBy ?? '',
        })
      : labels.dayNotClosed;

  return html`
    <div class="section">
      <div class="section-title">${branch.name}</div>
      ${statCards(cards)}
      ${keyValues(meta)}
      ${closeNote ? html`<p class="muted">${closeNote}</p>` : raw('')}
      ${section(labels.sectionCounter, counterSection(branchSection.counterOrders, currency, labels, branch.timezone))}
      ${section(labels.sectionSupply, supplySection(branchSection.supplyOrders, currency, labels, branch.timezone))}
      ${section(labels.sectionExpenses, expenseSection(branchSection.expenses, currency, labels))}
      ${section(labels.sectionAttendance, attendanceSection(branchSection.attendance, labels, branch.timezone))}
      ${kind === 'MONTH'
        ? section(labels.sectionPayroll, payrollSection(branchSection.salarySlips, currency, labels))
        : raw('')}
    </div>
  `;
}

// --- The document ----------------------------------------------------------

/**
 * `report` is whatever `export.service.js` returned, unchanged. The template does
 * no arithmetic of its own — every figure it prints is one the service computed,
 * so the page and the spreadsheet cannot disagree.
 */
function renderExportHtml({ report, lang = 'en', locale = 'en-IN' }) {
  const labels = labelsFor(lang);
  const currency = report.business.currency;
  const isDay = report.kind === 'DAY';
  const title = isDay ? labels.dayTitle : labels.monthTitle;

  const period = isDay
    ? report.date
      ? formatDateLong(report.date, locale)
      : labels.eachBranchOwnDay
    : formatMonthYear(report.month, locale);

  const header = keyValues([
    [labels.business, report.business.name],
    [isDay ? labels.date : labels.month, period],
    [labels.branch, report.branches.length === 1 ? report.branches[0].branch.name : labels.allBranches],
    // The document's own timestamp, in the first branch's clock — there is no
    // business-level timezone, and the server's would be meaningless to a reader.
    [labels.generatedOn, formatTimestamp(report.generatedAt, report.branches[0]?.branch?.timezone)],
  ]);

  const { totals } = report;
  // Counter sales less what went out. Deliberately NOT called net profit: it
  // knows nothing about payroll on a day export, and requirement 13's figure
  // subtracts more than this. The hint under it says so.
  const movement = Number(totals.counterSales) - Number(totals.expenseTotal) - Number(totals.supplySpend);

  const summaryCards = [
    { label: labels.counterSales, value: formatMoney(totals.counterSales, currency) },
    { label: labels.supplySpend, value: formatMoney(totals.supplySpend, currency) },
    { label: labels.expenses, value: formatMoney(totals.expenseTotal, currency) },
    { label: labels.netMovement, value: formatMoney(movement, currency), emphasis: true },
  ];

  const warnings = [];
  if (!isDay && totals.payslipDraftCount > 0) {
    warnings.push(interpolate(labels.draftPayrollWarning, { count: totals.payslipDraftCount }));
  }
  for (const overlap of report.overlaps) {
    warnings.push(
      interpolate(labels.overlapWarning, {
        amount: formatMoney(overlap.params.amount, currency),
        category: overlap.params.category,
        date: formatDateLong(overlap.params.date, locale),
        orderNumber: overlap.params.orderNumber,
      })
    );
  }

  const body = html`
    ${header}
    ${section(labels.summary, html`${statCards(summaryCards)}<p class="muted">${labels.netMovementHint}</p>`)}
    ${warnings.length
      ? section(
          labels.warnings,
          html`<ul>${warnings.map((warning) => html`<li>${warning}</li>`)}</ul>`
        )
      : raw('')}
    ${report.branches.map((branchSection) => branchBlock(branchSection, report.kind, labels, locale))}
  `;

  return renderDocument({ lang, title, body });
}

module.exports = { renderExportHtml, MAX_ROWS_PER_SECTION };
