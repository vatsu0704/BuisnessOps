const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, signupLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// The only two unauthenticated routes in the API, and therefore the only two
// worth guessing at. See middleware/rateLimit.js for why the limit stops here
// rather than covering everything.
router.post('/signup', signupLimiter, authController.signup);
router.post('/login', loginLimiter, authController.login);
router.get('/me', requireAuth, authController.me);
router.patch('/me/locale', requireAuth, authController.updateLocale);
// Account-level, so no tenant and no capability: anybody may end their own
// account. The login limiter because it takes a password, and an attacker
// holding a stolen token could otherwise use it to guess one.
router.post('/me/delete', requireAuth, loginLimiter, authController.deleteAccount);

module.exports = router;
