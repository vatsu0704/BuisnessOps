const supplyOrderService = require('../services/supplyOrder.service');
const { fail, validationFailure } = require('../errors');
const { canReachBranch, scopeOf } = require('../middleware/staffScope');
const {
  validateAddItem,
  validateUpdateOrderItem,
  validatePlaceOrder,
  validateAccept,
  validateDispatch,
  validateAssign,
  validateDeliver,
  validateDelay,
  validateReject,
  validateCancel,
  validateVerifyPayment,
  validateListQuery,
} = require('../validations/supply.validation');

/**
 * Supply orders — requirements 3, 5, 5.1, 9, 11 and 12.
 *
 * The capability a route carries says WHAT the caller may do; the checks here
 * say WHICH orders they may do it to. Both are needed: `supplyOrder:deliver`
 * without the second would let any delivery agent close any order in the
 * business, including branches they have never been to.
 */

/** The scope shape the service's listings take. */
function listScope(req) {
  return { ...scopeOf(req), membershipId: req.tenant.membershipId };
}

/**
 * May this caller act on this particular order?
 *
 * Branch reach is the normal answer. The second arm matters for a delivery
 * agent who has been handed a run to a branch outside their usual access:
 * being named on the order IS the grant, and without this they would be able
 * to see the job and not close it.
 */
function assertCanTouch(req, order) {
  if (canReachBranch(scopeOf(req), order.branchId)) return;
  if (order.deliveryAgentMembershipId && order.deliveryAgentMembershipId === req.tenant.membershipId) {
    return;
  }
  throw fail('BRANCH_ACCESS_DENIED', 403);
}

async function loadTouchable(req) {
  const order = await supplyOrderService.getOrder(req.tenant.businessId, req.params.supplyOrderId);
  assertCanTouch(req, order);
  return order;
}

// --- The branch's cart -----------------------------------------------------

async function getCart(req, res, next) {
  try {
    const scope = scopeOf(req);
    if (!canReachBranch(scope, req.params.branchId)) throw fail('BRANCH_ACCESS_DENIED', 403);

    const cart = await supplyOrderService.getOrCreateCart(
      req.tenant.businessId,
      req.params.branchId
    );
    res.json(cart);
  } catch (err) {
    next(err);
  }
}

async function addItem(req, res, next) {
  try {
    const errors = validateAddItem(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    if (!canReachBranch(scopeOf(req), req.body.branchId)) throw fail('BRANCH_ACCESS_DENIED', 403);

    const cart = await supplyOrderService.addItem(req.tenant.businessId, req.body.branchId, {
      inventoryItemId: req.body.inventoryItemId,
      quantity: req.body.quantity,
    });
    res.status(201).json(cart);
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const errors = validateUpdateOrderItem(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.updateItem(
      req.tenant.businessId,
      req.params.supplyOrderId,
      req.params.itemId,
      { quantity: req.body.quantity }
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    await loadTouchable(req);
    const order = await supplyOrderService.updateItem(
      req.tenant.businessId,
      req.params.supplyOrderId,
      req.params.itemId,
      { quantity: 0 }
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function placeOrder(req, res, next) {
  try {
    const errors = validatePlaceOrder(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.placeOrder(req.tenant.businessId, req.params.supplyOrderId, {
      paymentMode: req.body.paymentMode,
      paymentReference: req.body.paymentReference,
      membershipId: req.tenant.membershipId,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function cancelOrder(req, res, next) {
  try {
    const errors = validateCancel(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.cancelOrder(req.tenant.businessId, req.params.supplyOrderId, {
      membershipId: req.tenant.membershipId,
      note: req.body.note,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// --- Reading ---------------------------------------------------------------

async function listBranchOrders(req, res, next) {
  try {
    const errors = validateListQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    if (req.query.branchId && !canReachBranch(scopeOf(req), req.query.branchId)) {
      throw fail('BRANCH_ACCESS_DENIED', 403);
    }

    const orders = await supplyOrderService.listBranchOrders(req.tenant.businessId, listScope(req), {
      branchId: req.query.branchId,
      status: req.query.status,
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

/** Requirement 3: one desk, every branch's incoming orders. */
async function listDeskOrders(req, res, next) {
  try {
    const errors = validateListQuery(req.query);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const orders = await supplyOrderService.listDeskOrders(req.tenant.businessId, listScope(req), {
      status: req.query.status,
      branchId: req.query.branchId,
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function listDeliveryOrders(req, res, next) {
  try {
    const orders = await supplyOrderService.listDeliveryOrders(req.tenant.businessId, listScope(req), {
      includeDelivered: req.query.includeDelivered === 'true',
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    res.json(await loadTouchable(req));
  } catch (err) {
    next(err);
  }
}

// --- The warehouse desk ----------------------------------------------------

async function acceptOrder(req, res, next) {
  try {
    const errors = validateAccept(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.acceptOrder(req.tenant.businessId, req.params.supplyOrderId, {
      promisedAt: req.body.promisedAt,
      membershipId: req.tenant.membershipId,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function packOrder(req, res, next) {
  try {
    await loadTouchable(req);
    const order = await supplyOrderService.packOrder(req.tenant.businessId, req.params.supplyOrderId, {
      membershipId: req.tenant.membershipId,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function dispatchOrder(req, res, next) {
  try {
    const errors = validateDispatch(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.dispatchOrder(req.tenant.businessId, req.params.supplyOrderId, {
      deliveryAgentMembershipId: req.body.deliveryAgentMembershipId,
      membershipId: req.tenant.membershipId,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

/**
 * Who the desk may hand a run to, and who is free to take one.
 *
 * No branch check: the answer is business-wide by nature — an agent carries to
 * every branch — and the list carries nothing branch-shaped to leak.
 */
async function listDeliveryAgents(req, res, next) {
  try {
    res.json(await supplyOrderService.listDeliveryAgents(req.tenant.businessId));
  } catch (err) {
    next(err);
  }
}

/** Give the run to an agent, or move it to a different one. */
async function assignOrder(req, res, next) {
  try {
    const errors = validateAssign(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.assignOrder(req.tenant.businessId, req.params.supplyOrderId, {
      deliveryAgentMembershipId: req.body.deliveryAgentMembershipId,
      membershipId: req.tenant.membershipId,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function rejectOrder(req, res, next) {
  try {
    const errors = validateReject(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.rejectOrder(req.tenant.businessId, req.params.supplyOrderId, {
      reasonCode: req.body.reasonCode,
      note: req.body.note,
      membershipId: req.tenant.membershipId,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const errors = validateVerifyPayment(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.verifyPayment(req.tenant.businessId, req.params.supplyOrderId, {
      outcome: req.body.outcome,
      note: req.body.note,
      membershipId: req.tenant.membershipId,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// --- On the road -----------------------------------------------------------

async function deliverOrder(req, res, next) {
  try {
    const errors = validateDeliver(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.deliverOrder(req.tenant.businessId, req.params.supplyOrderId, {
      membershipId: req.tenant.membershipId,
      scope: scopeOf(req),
      // Whether the cash actually changed hands. Only the person at the counter
      // knows, so it comes from them — and the service decides whether it was
      // needed, never the caller.
      cashCollected: req.body.cashCollected,
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

/** Requirement 9, from either end — the warehouse or the agent carrying it. */
async function postDelay(req, res, next) {
  try {
    const errors = validateDelay(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));
    await loadTouchable(req);

    const order = await supplyOrderService.postDelay(req.tenant.businessId, req.params.supplyOrderId, {
      delayMinutes: req.body.delayMinutes,
      reasonCode: req.body.reasonCode,
      note: req.body.note,
      membershipId: req.tenant.membershipId,
    });
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  placeOrder,
  cancelOrder,
  listBranchOrders,
  listDeskOrders,
  listDeliveryOrders,
  getOrder,
  acceptOrder,
  packOrder,
  dispatchOrder,
  listDeliveryAgents,
  assignOrder,
  rejectOrder,
  verifyPayment,
  deliverOrder,
  postDelay,
};
