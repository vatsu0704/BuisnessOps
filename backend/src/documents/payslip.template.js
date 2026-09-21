const { html } = require('./escape');
const { renderDocument, section, keyValues, statCards, dataTable } = require('./layout');
const { formatMoney, formatDays, formatDateLong, formatMonthYear, formatTimestamp } = require('./format');
const { labelsFor } = require('./payslip.labels');
const { dec } = require('../utils/money');
const { dateKeyOf, safeZone } = require('../utils/datetime');

const LOCALE_TAG = { en: 'en-IN', hi: 'hi-IN', gu: 'gu-IN', mr: 'mr-IN' };

/**
 * The payslip, as a self-contained HTML document.
 *
 * Structure follows the POS daily-sales report Vatsal supplied as the
 * reference: a header band, an identification block, a summary strip of cards,
 * then itemised tables and a footer.
 *
 * Takes already-loaded data and does no I/O of its own — a renderer must not
 * acquire the right to query the database, which is why this lives beside
 * services/ rather than inside it.
 */
function renderPayslipHtml({ business, branch, staffMember, slip, lang = 'en' }) {
  const t = labelsFor(lang);
  const locale = LOCALE_TAG[lang] || 'en-IN';
  const currency = slip.currency;
  const money = (amount) => formatMoney(amount, currency);
  const timeZone = safeZone(branch?.timezone, business.timezone);

  const isFinal = slip.status === 'FINALIZED';
  const monthLabel = formatMonthYear(slip.monthYear, locale);

  // Slips generated before the working-days migration have no day buckets —
  // the migration deliberately left them at 0 rather than inventing a
  // breakdown from attendance that may since have changed.
  const breakdownTotal = dec(slip.daysPresent)
    .plus(dec(slip.daysHalfDay))
    .plus(dec(slip.daysAbsent))
    .plus(dec(slip.daysLeave))
    .plus(dec(slip.daysWeeklyOff))
    .plus(dec(slip.daysHoliday));
  const hasBreakdown = breakdownTotal.greaterThan(0);
  const monthInProgress = dec(slip.daysPending).greaterThan(0);

  const head = html`<div class="doc-head">
    <div class="doc-head-row">
      <div>
        <div class="biz-name">${business.name}</div>
        <div class="biz-sub">
          ${[branch?.name, branch?.city].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style="text-align:right">
        <div class="doc-title">${t.title}</div>
        <div class="doc-period">${monthLabel}</div>
        <div class="chip ${isFinal ? 'chip-final' : 'chip-draft'}">${isFinal ? t.finalized : t.draft}</div>
      </div>
    </div>
  </div>`;

  const identity = html`<table class="grid"><tr>
    <td>
      ${keyValues([
        [t.employee, staffMember.name],
        [t.employeeCode, staffMember.employeeCode],
        [t.role, staffMember.role],
        [t.phone, staffMember.phone],
      ])}
    </td>
    <td>
      ${keyValues([
        [t.branch, branch?.name],
        [t.joined, staffMember.hiredOn ? formatDateLong(dateKeyOf(staffMember.hiredOn), locale) : null],
        // Short id only: enough to quote when querying a slip, without
        // printing a full uuid across the page.
        [t.reference, String(slip.id).slice(0, 8).toUpperCase()],
        [t.generatedOn, formatTimestamp(slip.generatedAt, timeZone, locale)],
      ])}
    </td>
  </tr></table>`;

  const summary = statCards([
    { label: t.gross, value: money(slip.grossPay) },
    { label: t.deductions, value: money(slip.deductions) },
    { label: t.net, value: money(slip.netPay), emphasis: true },
  ]);

  const attendanceRows = [
    [t.workingDays, slip.workingDays],
    [t.present, slip.daysPresent],
    [t.halfDays, slip.daysHalfDay],
    [t.absent, slip.daysAbsent],
    [t.leave, slip.daysLeave],
    [t.weeklyOff, slip.daysWeeklyOff],
    [t.holidays, slip.daysHoliday],
    [t.pending, slip.daysPending],
  ]
    // Don't pad the table with rows that are all zero; keep the ones that
    // carry the model (working days, present) even when zero.
    .filter(([label, value]) => dec(value).greaterThan(0) || label === t.workingDays || label === t.present)
    .map(([label, value]) => ({ cells: [label, formatDays(value)] }));

  const attendanceSection = hasBreakdown
    ? section(
        t.attendance,
        html`${dataTable([{ label: t.item }, { label: t.dayCount, numeric: true }], attendanceRows)}
        <div class="note" style="margin-top:8px">${t.weekOffNote}</div>
        ${monthInProgress ? html`<div class="note">${t.monthInProgress}</div>` : ''}`
      )
    : section(t.attendance, html`<div class="note">${t.noBreakdown}</div>`);

  // The arithmetic, in words, under the basic-pay row. An employee can check
  // their own payslip by hand — the same traceability the product promises for
  // every other number it reports.
  const workings = html`${money(slip.baseSalary)} ÷ ${formatDays(slip.workingDays)} ${t.workingDaysShort} × ${formatDays(
    slip.totalDaysWorked
  )} = ${money(slip.grossPay)}`;

  const earningsRows = [
    { cells: [t.basicProRated, money(slip.grossPay)], workings },
    {
      cells: [
        slip.deductionNote ? html`${t.deductions} <span class="muted">— ${slip.deductionNote}</span>` : t.deductions,
        dec(slip.deductions).greaterThan(0) ? html`− ${money(slip.deductions)}` : money(0),
      ],
    },
    { cells: [t.net, money(slip.netPay)], total: true },
  ];

  const body = html`${head}
${identity}
<div class="section">${summary}</div>
${attendanceSection}
${section(t.earnings, dataTable([{ label: t.description }, { label: t.amount, numeric: true }], earningsRows))}
<div class="foot">
  <div class="foot-row">
    <div>${t.computerGenerated}</div>
    <div>${business.name}</div>
  </div>
</div>`;

  return renderDocument({
    lang,
    title: `${t.documentTitle} — ${staffMember.name} — ${monthLabel}`,
    body,
  });
}

module.exports = { renderPayslipHtml };
