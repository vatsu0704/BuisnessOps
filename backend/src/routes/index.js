const express = require('express');
const userRoutes = require('./user.routes');
const authRoutes = require('./auth.routes');
const businessRoutes = require('./business.routes');
const dataSourceRoutes = require('./dataSource.routes');
const staffRoutes = require('./staff.routes');
const attendanceRoutes = require('./attendance.routes');
const payrollRoutes = require('./payroll.routes');
const workCalendarRoutes = require('./workCalendar.routes');
const productRoutes = require('./product.routes');
const counterOrderRoutes = require('./counterOrder.routes');
const supplyRoutes = require('./supply.routes');
const expenseRoutes = require('./expense.routes');
const notificationRoutes = require('./notification.routes');
const analyticsRoutes = require('./analytics.routes');
const exportRoutes = require('./export.routes');
const inviteRoutes = require('./invite.routes');

const prisma = require('../config/db');

const router = express.Router();

/**
 * Is this instance actually able to serve?
 *
 * It used to answer `{ status: 'ok' }` unconditionally, which made it a test of
 * whether Node was running and nothing more. Every route below it needs
 * Postgres, so an instance that cannot reach the database is not healthy — and
 * a host driving restarts off this endpoint would have kept a broken instance
 * in rotation indefinitely, reporting itself fine the whole time.
 *
 * `SELECT 1` rather than a real query: it proves a connection can be taken from
 * the pool and a round trip completed, without the check itself becoming load.
 * 503 rather than 500, because "not ready yet, come back" is what a load
 * balancer is asking about.
 */
router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: 'ok', database: 'ok' });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});
router.use('/auth', authRoutes);
router.use('/businesses', businessRoutes);
router.use('/businesses', dataSourceRoutes);
router.use('/businesses', staffRoutes);
router.use('/businesses', attendanceRoutes);
router.use('/businesses', payrollRoutes);
router.use('/businesses', workCalendarRoutes);
router.use('/businesses', productRoutes);
router.use('/businesses', counterOrderRoutes);
router.use('/businesses', supplyRoutes);
router.use('/businesses', expenseRoutes);
// Requirements 13 and 15. Two mounts for the same reason notifications has
// two: the branch grid belongs to one business, the cross-business roll-up
// spans them and has no businessId to resolve a tenant from.
router.use('/businesses', analyticsRoutes.scoped);
router.use('/analytics', analyticsRoutes.router);
// Requirement 17.
router.use('/businesses', exportRoutes);
// Requirement 8. The business-scoped half mounts beside the others; the device
// and preference half does not, because a phone is registered before a business
// is chosen — see the header of notification.routes.js.
router.use('/businesses/:businessId', notificationRoutes.scoped);
router.use('/notifications', notificationRoutes.router);
router.use('/invites', inviteRoutes);
router.use('/users', userRoutes);

module.exports = router;
