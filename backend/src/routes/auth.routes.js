const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, signupLimiter, resetLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// The unauthenticated routes in the API, and therefore the ones worth guessing
// at. See middleware/rateLimit.js for why the limit stops here rather than
// covering everything.
router.post('/signup', signupLimiter, authController.signup);
router.post('/login', loginLimiter, authController.login);
// Public, and the only two routes added to that set since Phase 0. Both are
// rate-limited; `forgot-password` answers the same whether the address is known.
router.post('/forgot-password', resetLimiter, authController.forgotPassword);
router.post('/reset-password', resetLimiter, authController.resetPassword);
router.get('/me', requireAuth, authController.me);
// The login limiter because it takes a password, exactly as the delete route does.
router.post('/me/password', requireAuth, loginLimiter, authController.changePassword);
router.patch('/me/locale', requireAuth, authController.updateLocale);
// Account-level, so no tenant and no capability: anybody may end their own
// account. The login limiter because it takes a password, and an attacker
// holding a stolen token could otherwise use it to guess one.
router.post('/me/delete', requireAuth, loginLimiter, authController.deleteAccount);

module.exports = router;
