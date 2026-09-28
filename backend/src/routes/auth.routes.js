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

module.exports = router;
