const express = require('express');
const counterOrderController = require('../controllers/counterOrder.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

// Ninth router on '/businesses'. Guards stay per-route, never a blanket
// `scoped.use(...)` — see dataSource.routes.js for why.
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// --- The day at a branch ---------------------------------------------------
// "The money keeps counting" (requirement 1) is this summary, which is also
// what the day-end export (requirement 17) closes over.
scoped.get(
  '/branches/:branchId/counter-orders',
  requirePermission('counterOrder:create'),
  counterOrderController.listOrders
);
scoped.get(
  '/branches/:branchId/counter-day',
  requirePermission('counterOrder:create'),
  counterOrderController.getDaySummary
);

// Closing the day is what makes its orders immutable, so it is its own
// capability rather than riding along with placing an order.
scoped.post(
  '/branches/:branchId/counter-day/close',
  requirePermission('counterOrder:closeDay'),
  counterOrderController.closeDay
);
scoped.delete(
  '/branches/:branchId/counter-day/close',
  requirePermission('counterOrder:closeDay'),
  counterOrderController.reopenDay
);

// --- One order -------------------------------------------------------------
scoped.post('/counter-orders', requirePermission('counterOrder:create'), counterOrderController.openOrder);
scoped.get(
  '/counter-orders/:counterOrderId',
  requirePermission('counterOrder:create'),
  counterOrderController.getOrder
);

// Editing after the order is placed is requirement 1's explicit ask, so these
// carry `counterOrder:edit` rather than `create`.
scoped.post(
  '/counter-orders/:counterOrderId/items',
  requirePermission('counterOrder:edit'),
  counterOrderController.addItem
);
scoped.patch(
  '/counter-orders/:counterOrderId/items/:itemId',
  requirePermission('counterOrder:edit'),
  counterOrderController.updateItem
);
scoped.delete(
  '/counter-orders/:counterOrderId/items/:itemId',
  requirePermission('counterOrder:edit'),
  counterOrderController.removeItem
);

// Closing an order hands it over; it does NOT make it immutable. The floor is
// the day close above.
scoped.post(
  '/counter-orders/:counterOrderId/close',
  requirePermission('counterOrder:edit'),
  counterOrderController.closeOrder
);
scoped.post(
  '/counter-orders/:counterOrderId/reopen',
  requirePermission('counterOrder:edit'),
  counterOrderController.reopenOrder
);

scoped.post(
  '/counter-orders/:counterOrderId/void',
  requirePermission('counterOrder:void'),
  counterOrderController.voidOrder
);

router.use('/:businessId', scoped);

module.exports = router;
