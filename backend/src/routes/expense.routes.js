const express = require('express');
const expenseController = require('../controllers/expense.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requireBranchAccess } = require('../middleware/branchScope');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

// Tenth router on '/businesses'. Guards stay per-route, never a blanket
// `scoped.use(...)` — see dataSource.routes.js for why.
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// --- Categories ------------------------------------------------------------
// Reading the list is `expense:view`, because the screens that *show* spending
// need to name what it was spent on. Changing the list is `expense:log`: the
// people who record the spending are the ones who know a category is missing.
scoped.get('/expense-categories', requirePermission('expense:view'), expenseController.listCategories);
scoped.post('/expense-categories', requirePermission('expense:log'), expenseController.createCategory);
scoped.patch(
  '/expense-categories/:categoryId',
  requirePermission('expense:log'),
  expenseController.updateCategory
);

// --- One branch's spending -------------------------------------------------
// `requireBranchAccess` gates these on the :branchId param; the capability says
// whether you may read spending at all, and the middleware says whose.
scoped.get(
  '/branches/:branchId/expenses',
  requirePermission('expense:view'),
  requireBranchAccess,
  expenseController.listExpenses
);

// Requirement 10's core question — "how much did I spend today, and how much
// did I sell today?" — which is one endpoint because it is one question.
scoped.get(
  '/branches/:branchId/expense-day',
  requirePermission('expense:view'),
  requireBranchAccess,
  expenseController.getDaySummary
);
scoped.get(
  '/branches/:branchId/expense-month',
  requirePermission('expense:view'),
  requireBranchAccess,
  expenseController.getMonthSummary
);

// --- Logging ---------------------------------------------------------------
// The branch is a body field here, so reach is checked in the controller.
scoped.post('/expenses', requirePermission('expense:log'), expenseController.logExpense);
scoped.patch('/expenses/:expenseId', requirePermission('expense:log'), expenseController.updateExpense);
scoped.delete('/expenses/:expenseId', requirePermission('expense:log'), expenseController.deleteExpense);

// --- The back office -------------------------------------------------------
// "The person at the back office will call the branches that haven't logged
// their daily expenses." Computed on demand, in each branch's own local date,
// so the answer is exact at the moment it is asked rather than as of whenever
// a job last ran.
scoped.get(
  '/expense-compliance',
  requirePermission('expense:viewAllBranches'),
  expenseController.getCompliance
);

router.use('/:businessId', scoped);

module.exports = router;
