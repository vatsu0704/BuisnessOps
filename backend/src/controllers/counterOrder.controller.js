const counterOrderService = require('../services/counterOrder.service');
const { fail, validationFailure } = require('../errors');
const { canReachBranch, scopeOf } = require('../middleware/staffScope');
const {
  validateOpenOrder,
  validateAddItem,
  validateUpdateItem,
  validateCloseOrder,
  validateDayQuery,
  validateCloseDay,
} = require('../validations/counterOrder.validation');

/**
 * The branch is a body field or a query param on most of these, not a route
 * param, so `requireBranchAccess` (which reads `req.params`) cannot gate them.
 * Same check, same scope, applied here instead.
 */
function assertReachable(req, branchId) {
  if (!canReachBranch(scopeOf(req), branchId)) throw fail('BRANCH_ACCESS_DENIED', 403);
}

/**
 * For the routes keyed on an order id rather than a branch: load it first, then
 * check reach over the branch it belongs to. Without this, knowing an order id
 * would be enough to ring up items at a branch you cannot reach.
 */
async function assertCanTouchOrder(req) {
  const order = await counterOrderService.getOrder(req.tenant.businessId, req.params.counterOrderId);
  assertReachable(req, order.branchId);
  return order;
}

async function openOrder(req, res, next) {
  try {
    const errors = validateOpenOrder(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    assertReachable(req, req.body.branchId);

    const order = await counterOrderService.openOrder(req.tenant.businessId, {
      branchId: req.body.branchId,
      paymentMethod: req.body.paymentMethod,
      // Who rang it up comes from the session, never the body.
      membershipId: req.tenant.membershipId,
    });
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

async function listOrders(req, res, next) {
  try {
    const errors = validateDayQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    assertReachable(req, req.params.branchId);

    const orders = await counterOrderService.listOrders(req.tenant.businessId, req.params.branchId, {
      date: req.query.date,
      status: req.query.status,
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function getDaySummary(req, res, next) {
  try {
    const errors = validateDayQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    assertReachable(req, req.params.branchId);

    const summary = await counterOrderService.getDaySummary(req.tenant.businessId, req.params.branchId, {
      date: req.query.date,
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const order = await assertCanTouchOrder(req);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function addItem(req, res, next) {
  try {
    const errors = validateAddItem(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await assertCanTouchOrder(req);

    const order = await counterOrderService.addItem(
      req.tenant.businessId,
      req.params.counterOrderId,
      req.body
    );
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const errors = validateUpdateItem(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await assertCanTouchOrder(req);

    const order = await counterOrderService.updateItem(
      req.tenant.businessId,
      req.params.counterOrderId,
      req.params.itemId,
      req.body
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    await assertCanTouchOrder(req);
    const order = await counterOrderService.removeItem(
      req.tenant.businessId,
      req.params.counterOrderId,
      req.params.itemId
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function closeOrder(req, res, next) {
  try {
    const errors = validateCloseOrder(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await assertCanTouchOrder(req);

    const order = await counterOrderService.closeOrder(req.tenant.businessId, req.params.counterOrderId, {
      paymentMethod: req.body.paymentMethod,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function reopenOrder(req, res, next) {
  try {
    await assertCanTouchOrder(req);
    const order = await counterOrderService.reopenOrder(req.tenant.businessId, req.params.counterOrderId);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function voidOrder(req, res, next) {
  try {
    await assertCanTouchOrder(req);
    const order = await counterOrderService.voidOrder(req.tenant.businessId, req.params.counterOrderId);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function closeDay(req, res, next) {
  try {
    const errors = validateCloseDay(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    assertReachable(req, req.params.branchId);

    const closed = await counterOrderService.closeDay(req.tenant.businessId, req.params.branchId, {
      date: req.body.date,
      membershipId: req.tenant.membershipId,
    });
    res.status(201).json(closed);
  } catch (err) {
    next(err);
  }
}

async function reopenDay(req, res, next) {
  try {
    assertReachable(req, req.params.branchId);
    const reopened = await counterOrderService.reopenDay(req.tenant.businessId, req.params.branchId, {
      date: req.query.date,
    });
    res.json(reopened);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  openOrder,
  listOrders,
  getDaySummary,
  getOrder,
  addItem,
  updateItem,
  removeItem,
  closeOrder,
  reopenOrder,
  voidOrder,
  closeDay,
  reopenDay,
};
