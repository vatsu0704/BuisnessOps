const expenseService = require('../services/expense.service');
const { fail, validationFailure } = require('../errors');
const { canReachBranch, scopeOf } = require('../middleware/staffScope');
const {
  validateLogExpense,
  validateUpdateExpense,
  validateCreateCategory,
  validateUpdateCategory,
  validateExpenseQuery,
  validateMonthQuery,
  validateComplianceQuery,
} = require('../validations/expense.validation');

/**
 * Requirement 10's endpoints.
 *
 * The branch arrives as a body field on `logExpense` and a route param
 * everywhere else, so reach is checked here in the first case and by
 * `requireBranchAccess` in the rest — the same split counterOrder.controller
 * already makes, and for the same reason: that middleware reads `req.params`
 * and cannot see a body.
 */

function assertReachable(req, branchId) {
  if (!canReachBranch(scopeOf(req), branchId)) throw fail('BRANCH_ACCESS_DENIED', 403);
}

/**
 * For the routes keyed on an expense id rather than a branch: load it first,
 * then check reach over the branch it belongs to. Without this, knowing an id
 * would be enough to edit spending at a branch you cannot reach.
 */
async function loadReachableExpense(req) {
  const expense = await expenseService.getExpense(req.tenant.businessId, req.params.expenseId);
  assertReachable(req, expense.branchId);
  return expense;
}

// --- Categories ------------------------------------------------------------

async function listCategories(req, res, next) {
  try {
    const categories = await expenseService.listCategories(req.tenant.businessId, {
      // Withdrawn categories are still on expenses already logged, so the
      // screens that *list* spending need them to render a row's category at
      // all. The picker asks without this flag.
      includeInactive: req.query.includeInactive === 'true',
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const errors = validateCreateCategory(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const category = await expenseService.createCategory(req.tenant.businessId, { name: req.body.name });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const errors = validateUpdateCategory(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const category = await expenseService.updateCategory(req.tenant.businessId, req.params.categoryId, {
      name: req.body.name,
      isActive: req.body.isActive,
    });
    res.json(category);
  } catch (err) {
    next(err);
  }
}

// --- Expenses --------------------------------------------------------------

async function logExpense(req, res, next) {
  try {
    const errors = validateLogExpense(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    assertReachable(req, req.body.branchId);

    const expense = await expenseService.logExpense(req.tenant.businessId, {
      branchId: req.body.branchId,
      categoryId: req.body.categoryId,
      amount: req.body.amount,
      date: req.body.date,
      note: req.body.note,
      paymentMethod: req.body.paymentMethod,
      // Who logged it comes from the session, never the body.
      membershipId: req.tenant.membershipId,
    });
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
}

async function updateExpense(req, res, next) {
  try {
    const errors = validateUpdateExpense(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadReachableExpense(req);

    const expense = await expenseService.updateExpense(req.tenant.businessId, req.params.expenseId, {
      categoryId: req.body.categoryId,
      amount: req.body.amount,
      date: req.body.date,
      note: req.body.note,
      paymentMethod: req.body.paymentMethod,
    });
    res.json(expense);
  } catch (err) {
    next(err);
  }
}

async function deleteExpense(req, res, next) {
  try {
    await loadReachableExpense(req);
    await expenseService.deleteExpense(req.tenant.businessId, req.params.expenseId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listExpenses(req, res, next) {
  try {
    const errors = validateExpenseQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const expenses = await expenseService.listExpenses(req.tenant.businessId, req.params.branchId, {
      date: req.query.date,
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
    });
    res.json(expenses);
  } catch (err) {
    next(err);
  }
}

async function getDaySummary(req, res, next) {
  try {
    const errors = validateExpenseQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const summary = await expenseService.getDaySummary(req.tenant.businessId, req.params.branchId, {
      date: req.query.date,
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function getMonthSummary(req, res, next) {
  try {
    const errors = validateMonthQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const summary = await expenseService.getMonthSummary(req.tenant.businessId, req.params.branchId, {
      month: Number(req.query.month),
      year: Number(req.query.year),
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function getCompliance(req, res, next) {
  try {
    const errors = validateComplianceQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const compliance = await expenseService.listExpenseCompliance(req.tenant.businessId, {
      date: req.query.date,
    });
    res.json(compliance);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  logExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  getDaySummary,
  getMonthSummary,
  getCompliance,
};
