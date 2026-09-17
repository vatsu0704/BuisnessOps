const express = require('express');
const inviteController = require('../controllers/invite.controller');

const router = express.Router();

// No requireAuth here on purpose — see invite.controller.js.
router.get('/lookup', inviteController.lookup);

module.exports = router;
