const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { requireAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/tenant');

const router = express.Router();

/**
 * Requirements 2 and 8.
 *
 * Split into two groups on purpose:
 *
 * - **Device and preference routes are NOT tenant-scoped.** A phone belongs to
 *   a person, not to a business, and it has to be registered the moment they
 *   log in — before any business is chosen, and for a user who belongs to
 *   none. Mounting these under `/businesses/:businessId` would mean a token
 *   registered while acting as business A stops being found when they switch
 *   to B, which is the same handset going quiet for no reason.
 * - **The notification list IS tenant-scoped**, because switching business must
 *   change what the list shows, the way every other screen does — and the badge
 *   must count the same scope it can display.
 *
 * Nothing here carries a `requirePermission`. Every route acts on the caller's
 * own rows, keyed by `req.userId` from the session; there is no capability for
 * "read your own notifications" because there is nobody to withhold it from.
 */

// --- This device, this person ----------------------------------------------
router.post('/device-token', requireAuth, notificationController.registerDevice);
router.delete('/device-token', requireAuth, notificationController.unregisterDevice);
router.get('/preferences', requireAuth, notificationController.getPreferences);
router.patch('/preferences/:category', requireAuth, notificationController.setPreference);

// --- This person, in this business -----------------------------------------
const scoped = express.Router({ mergeParams: true });
scoped.use(requireAuth, resolveTenant);

scoped.get('/notifications', notificationController.list);
scoped.get('/notifications/unread-count', notificationController.unreadCount);
scoped.post('/notifications/read-all', notificationController.markAllRead);
scoped.post('/notifications/:notificationId/read', notificationController.markRead);

module.exports = { router, scoped };
