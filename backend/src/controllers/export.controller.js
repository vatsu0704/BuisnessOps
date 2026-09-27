const exportService = require('../services/export.service');
const { renderExportHtml } = require('../documents/export.template');
const { renderExportWorkbook } = require('../documents/export.workbook');
const { SUPPORTED: SUPPORTED_LANGS } = require('../documents/export.labels');
const { validationFailure } = require('../errors');
const { validateDayEndQuery, validateMonthEndQuery } = require('../validations/export.validation');

/**
 * Requirement 17 — day-end and month-end export.
 *
 * Three representations of one report, and the data is assembled once for all
 * three: JSON for the screen that offers the export, .xlsx for working with the
 * numbers, HTML for reading and handing over. A fourth would be another renderer,
 * not another query.
 */

// Locale codes the app uses → the document language. Same map the payslip route
// applies, and the same fallback: the business's own default when the device
// asked for nothing, English when even that is unknown.
const LOCALE_TO_LANG = { EN: 'en', HI: 'hi', GU: 'gu', MR: 'mr' };

function langOf(req, business) {
  const requested = String(req.query.lang || '').toLowerCase();
  if (SUPPORTED_LANGS.includes(requested)) return requested;
  return LOCALE_TO_LANG[business?.defaultLocale] || 'en';
}

/**
 * A filename a person can recognise in their downloads.
 *
 * ASCII only, deliberately: this goes in a `Content-Disposition` header, where a
 * non-ASCII byte needs RFC 5987 encoding that not every client handles. The
 * document's *contents* are translated; its filename is an identifier.
 */
function filenameFor(report, extension) {
  const period = report.kind === 'DAY' ? (report.date ?? 'today') : report.month;
  const scope = report.branches.length === 1 ? report.branches[0].branch.code : 'all-branches';
  const safe = `${report.kind.toLowerCase()}-end-${period}-${scope}`.replace(/[^A-Za-z0-9._-]/g, '-');
  return `${safe}.${extension}`;
}

/** The three things every handler needs: validated query, resolved report, language. */
async function buildReport(req, { month }) {
  const errors = month ? validateMonthEndQuery(req.query) : validateDayEndQuery(req.query);
  if (errors.length) return { errors };

  const options = {
    branchId: req.query.branchId,
    accessibleBranchIds: req.branchAccess,
  };

  const report = month
    ? await exportService.getMonthEnd(req.tenant.businessId, { ...options, month: req.query.month })
    : await exportService.getDayEnd(req.tenant.businessId, { ...options, date: req.query.date });

  return { report };
}

// --- JSON ------------------------------------------------------------------

function jsonHandler(month) {
  return async function handler(req, res, next) {
    try {
      const { errors, report } = await buildReport(req, { month });
      if (errors) return res.status(400).json(validationFailure(errors));
      res.json(report);
    } catch (err) {
      next(err);
    }
  };
}

// --- Spreadsheet -----------------------------------------------------------

function workbookHandler(month) {
  return async function handler(req, res, next) {
    try {
      const { errors, report } = await buildReport(req, { month });
      if (errors) return res.status(400).json(validationFailure(errors));

      const buffer = renderExportWorkbook({ report, lang: langOf(req, report.business) });

      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${filenameFor(report, 'xlsx')}"`);
      // Without this the length is unknown and some clients cannot show progress
      // on what is, for a busy month, a genuinely large download.
      res.set('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };
}

// --- Printable summary -----------------------------------------------------

function documentHandler(month) {
  return async function handler(req, res, next) {
    try {
      const { errors, report } = await buildReport(req, { month });
      if (errors) return res.status(400).json(validationFailure(errors));

      const html = renderExportHtml({ report, lang: langOf(req, report.business) });

      // The document has no scripts and no remote assets, so the policy says so.
      // Same lockdown the payslip route applies: helmet() is global, and this
      // tightens the routes that return markup rather than JSON.
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(html);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  getDayEnd: jsonHandler(false),
  getMonthEnd: jsonHandler(true),
  getDayEndWorkbook: workbookHandler(false),
  getMonthEndWorkbook: workbookHandler(true),
  getDayEndDocument: documentHandler(false),
  getMonthEndDocument: documentHandler(true),
  filenameFor,
};
