const express = require('express');
const exportController = require('../controllers/export.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

/**
 * Requirement 17 — day-end and month-end export.
 *
 * Twelfth router on '/businesses'. Guards stay per-route, never a blanket
 * `scoped.use(...)` — see dataSource.routes.js for why.
 *
 * `export:dayEnd` and `export:monthEnd` are separate capabilities, already in the
 * matrix, and both are held by CASHIER as well as the admin roles. The **scope**
 * is `req.branchAccess`, so a cashier asking for the whole business gets their own
 * branch — the capability says whether you may export, and the branch access says
 * what. No narrower endpoint is needed, and no role name is asked for anywhere.
 *
 * Three representations per period, each a route rather than a `?format=`, so the
 * content type is decided by the path and a client cannot ask for a spreadsheet
 * and be handed HTML:
 *
 * - bare        → JSON, for the screen that offers the export
 * - `/workbook` → .xlsx, the "opens in Excel" half of the requirement
 * - `/document` → HTML, which the device prints to PDF via expo-print
 */
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// --- The day ---------------------------------------------------------------
scoped.get('/exports/day-end', requirePermission('export:dayEnd'), exportController.getDayEnd);
scoped.get(
  '/exports/day-end/workbook',
  requirePermission('export:dayEnd'),
  exportController.getDayEndWorkbook
);
scoped.get(
  '/exports/day-end/document',
  requirePermission('export:dayEnd'),
  exportController.getDayEndDocument
);

// --- The month -------------------------------------------------------------
scoped.get('/exports/month-end', requirePermission('export:monthEnd'), exportController.getMonthEnd);
scoped.get(
  '/exports/month-end/workbook',
  requirePermission('export:monthEnd'),
  exportController.getMonthEndWorkbook
);
scoped.get(
  '/exports/month-end/document',
  requirePermission('export:monthEnd'),
  exportController.getMonthEndDocument
);

router.use('/:businessId', scoped);

module.exports = router;
