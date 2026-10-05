const express = require('express');
const supplyItemController = require('../controllers/supplyItem.controller');
const supplyOrderController = require('../controllers/supplyOrder.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

// Tenth router on '/businesses'. Guards stay per-route, never a blanket
// `scoped.use(...)` — see dataSource.routes.js for why.
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

// --- The raw-material catalog ----------------------------------------------
// Reading and writing are split because the two belong to different people: a
// cashier orders from this list, and the warehouse decides what is on it and
// what it costs.
scoped.get('/supply-items', requirePermission('supplyItem:view'), supplyItemController.listItems);
scoped.get(
  '/supply-items/:inventoryItemId',
  requirePermission('supplyItem:view'),
  supplyItemController.getItem
);
scoped.post('/supply-items', requirePermission('supplyItem:manage'), supplyItemController.createItem);
scoped.patch(
  '/supply-items/:inventoryItemId',
  requirePermission('supplyItem:manage'),
  supplyItemController.updateItem
);

// --- Three listings, three capabilities ------------------------------------
// The same rows, cut three ways, and the capability required is what decides
// which cut a caller gets. One endpoint with a `?scope=` switch would have to
// re-derive the permission inside the handler, which is exactly the kind of
// role check the capability matrix exists to remove.
scoped.get('/supply-orders', requirePermission('supplyOrder:view'), supplyOrderController.listBranchOrders);
// Requirement 3: one desk, every branch's incoming orders.
scoped.get('/supply-desk', requirePermission('supplyOrder:fulfil'), supplyOrderController.listDeskOrders);
// Requirement 12: the run this agent is carrying.
scoped.get(
  '/supply-deliveries',
  requirePermission('supplyOrder:deliver'),
  supplyOrderController.listDeliveryOrders
);
scoped.get(
  '/supply-orders/:supplyOrderId',
  requirePermission('supplyOrder:view'),
  supplyOrderController.getOrder
);

// --- The branch's cart ------------------------------------------------------
scoped.get(
  '/branches/:branchId/supply-cart',
  requirePermission('supplyOrder:create'),
  supplyOrderController.getCart
);
scoped.post('/supply-cart/items', requirePermission('supplyOrder:create'), supplyOrderController.addItem);
scoped.patch(
  '/supply-orders/:supplyOrderId/items/:itemId',
  requirePermission('supplyOrder:create'),
  supplyOrderController.updateItem
);
scoped.delete(
  '/supply-orders/:supplyOrderId/items/:itemId',
  requirePermission('supplyOrder:create'),
  supplyOrderController.removeItem
);
scoped.post(
  '/supply-orders/:supplyOrderId/place',
  requirePermission('supplyOrder:create'),
  supplyOrderController.placeOrder
);
// The branch withdrawing its own order, which the service allows only while the
// warehouse has not accepted it. `reject` below is the desk's separate verb for
// the same end state — different people, different reasons, different rules.
scoped.post(
  '/supply-orders/:supplyOrderId/cancel',
  requirePermission('supplyOrder:create'),
  supplyOrderController.cancelOrder
);

// --- The warehouse desk ------------------------------------------------------
scoped.post(
  '/supply-orders/:supplyOrderId/accept',
  requirePermission('supplyOrder:fulfil'),
  supplyOrderController.acceptOrder
);
scoped.post(
  '/supply-orders/:supplyOrderId/pack',
  requirePermission('supplyOrder:fulfil'),
  supplyOrderController.packOrder
);
scoped.post(
  '/supply-orders/:supplyOrderId/dispatch',
  requirePermission('supplyOrder:fulfil'),
  supplyOrderController.dispatchOrder
);
// Who the desk may hand a run to, and who is free to take one.
//
// Guarded by `supplyOrder:fulfil` — the capability that already covers
// dispatching — and deliberately NOT by `team:view`, which the warehouse desk
// does not hold and must not need in order to do its own job. The response is
// narrowed to match: a name, a duty state and a count, never a team record.
scoped.get(
  '/supply-delivery-agents',
  requirePermission('supplyOrder:fulfil'),
  supplyOrderController.listDeliveryAgents
);
scoped.post(
  '/supply-orders/:supplyOrderId/assign',
  requirePermission('supplyOrder:fulfil'),
  supplyOrderController.assignOrder
);
scoped.post(
  '/supply-orders/:supplyOrderId/reject',
  requirePermission('supplyOrder:fulfil'),
  supplyOrderController.rejectOrder
);
// Requirement 9's first half, and requirement 26's "Received" / "Not received":
// the warehouse says whether a branch's payment reached it. Its own capability
// since Task 12 rather than `supplyOrder:fulfil`, so the accountant can confirm
// money without being handed the desk — the desk holds it too, and lost nothing.
scoped.post(
  '/supply-orders/:supplyOrderId/verify-payment',
  requirePermission('supplyPayment:verify'),
  supplyOrderController.verifyPayment
);

// --- On the road --------------------------------------------------------------
scoped.post(
  '/supply-orders/:supplyOrderId/deliver',
  requirePermission('supplyOrder:deliver'),
  supplyOrderController.deliverOrder
);
// Requirement 9's second half. Its own capability rather than riding on fulfil
// or deliver, because BOTH the desk and the agent post these and neither holds
// the other's rights.
scoped.post(
  '/supply-orders/:supplyOrderId/delays',
  requirePermission('supplyOrder:delay'),
  supplyOrderController.postDelay
);

// --- At the branch (requirements 25 and 26) ----------------------------------
// A vendor's goods arriving. Nobody of ours carried them, so the branch is the
// one who says so — its own capability, held by the cashier.
scoped.post(
  '/supply-orders/:supplyOrderId/receive',
  requirePermission('supplyOrder:receive'),
  supplyOrderController.receiveOrder
);
// A franchise branch paying for an order it already placed: pay-on-delivery
// paid early, a payment the warehouse said never arrived paid again, or a
// vendor paid after the goods came. Rides on `supplyOrder:create` — paying for
// the branch's own order is part of ordering it.
scoped.post(
  '/supply-orders/:supplyOrderId/pay',
  requirePermission('supplyOrder:create'),
  supplyOrderController.recordPayment
);

// --- Accounts (requirement 27) -------------------------------------------------
// What accounts pays for, and the payments waiting for someone to confirm they
// arrived. Two capabilities because they are two jobs: the desk confirms
// payments too, and pays for nothing.
scoped.get(
  '/supply-payments/due',
  requirePermission('supplyPayment:settle'),
  supplyOrderController.listPaymentsDue
);
scoped.post(
  '/supply-payments/settle',
  requirePermission('supplyPayment:settle'),
  supplyOrderController.settlePayments
);
scoped.get(
  '/supply-payments/to-confirm',
  requirePermission('supplyPayment:verify'),
  supplyOrderController.listPaymentsToConfirm
);

router.use('/:businessId', scoped);

module.exports = router;
