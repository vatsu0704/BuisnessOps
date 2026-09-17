const express = require('express');
const userRoutes = require('./user.routes');
const authRoutes = require('./auth.routes');
const businessRoutes = require('./business.routes');
const dataSourceRoutes = require('./dataSource.routes');
const staffRoutes = require('./staff.routes');
const attendanceRoutes = require('./attendance.routes');
const payrollRoutes = require('./payroll.routes');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/businesses', businessRoutes);
router.use('/businesses', dataSourceRoutes);
router.use('/businesses', staffRoutes);
router.use('/businesses', attendanceRoutes);
router.use('/businesses', payrollRoutes);
router.use('/users', userRoutes);

module.exports = router;
