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
const inviteRoutes = require('./invite.routes');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
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
// Requirement 8. The business-scoped half mounts beside the others; the device
// and preference half does not, because a phone is registered before a business
// is chosen — see the header of notification.routes.js.
router.use('/businesses/:businessId', notificationRoutes.scoped);
router.use('/notifications', notificationRoutes.router);
router.use('/invites', inviteRoutes);
router.use('/users', userRoutes);

module.exports = router;
