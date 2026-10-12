const express = require('express');
const legalController = require('../controllers/legal.controller');

const router = express.Router();

// Public web pages, not API routes — which is why they are mounted at the root
// rather than under /api. The Play Console and App Store Connect ask for these
// two URLs, and the app's Settings opens the first in a browser. The paths stay
// the same whatever host or domain the server moves to.
router.get('/privacy', legalController.privacy);
router.get('/delete-account', legalController.deleteAccount);

module.exports = router;
