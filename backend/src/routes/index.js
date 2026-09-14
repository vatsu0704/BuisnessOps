const express = require('express');
const userRoutes = require('./user.routes');
const authRoutes = require('./auth.routes');
const businessRoutes = require('./business.routes');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/businesses', businessRoutes);
router.use('/users', userRoutes);

module.exports = router;
