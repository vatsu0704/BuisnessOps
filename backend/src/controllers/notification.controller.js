const notificationService = require('../services/notification.service');
const { validationFailure, fieldError } = require('../errors');

/**
 * Requirements 2 and 8.
 *
 * **None of these carry a capability**, and that is correct rather than an
 * omission: every route here acts on the caller's **own** notifications and
 * their own devices, scoped by `req.userId` from the session. They are
 * self-service in the same way `Attendance` is — a capability would be asking
 * "may you read somebody's notifications?", and nobody can.
 */

function validateDeviceToken(body) {
  const errors = [];
  if (!body.token || typeof body.token !== 'string') errors.push(fieldError('DEVICE_TOKEN_REQUIRED', 'token'));
  return errors;
}

async function registerDevice(req, res, next) {
  try {
    const errors = validateDeviceToken(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    const device = await notificationService.registerDevice(req.userId, {
      token: req.body.token,
      platform: req.body.platform,
      // The DEVICE's language, not the account's. See DeviceToken.locale.
      locale: req.body.locale,
    });
    res.status(201).json({ id: device.id, platform: device.platform, locale: device.locale });
  } catch (err) {
    next(err);
  }
}

async function unregisterDevice(req, res, next) {
  try {
    const errors = validateDeviceToken(req.body);
    if (errors.length) return res.status(400).json(validationFailure(errors));

    await notificationService.unregisterDevice(req.userId, req.body.token);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function getPreferences(req, res, next) {
  try {
    res.json(await notificationService.getPreferences(req.userId));
  } catch (err) {
    next(err);
  }
}

async function setPreference(req, res, next) {
  try {
    if (typeof req.body.enabled !== 'boolean') {
      return res
        .status(400)
        .json(validationFailure([fieldError('NOTIFICATION_ENABLED_REQUIRED', 'enabled')]));
    }
    const preferences = await notificationService.setPreference(
      req.userId,
      req.params.category,
      req.body.enabled
    );
    res.json(preferences);
  } catch (err) {
    next(err);
  }
}

// --- Scoped to a business --------------------------------------------------

async function list(req, res, next) {
  try {
    const notifications = await notificationService.listNotifications(
      req.tenant.businessId,
      req.userId,
      { status: req.query.status === 'UNREAD' ? 'UNREAD' : undefined }
    );
    res.json(notifications);
  } catch (err) {
    next(err);
  }
}

async function unreadCount(req, res, next) {
  try {
    const count = await notificationService.countUnread(req.tenant.businessId, req.userId);
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const notification = await notificationService.markRead(
      req.tenant.businessId,
      req.userId,
      req.params.notificationId
    );
    res.json(notification);
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    res.json(await notificationService.markAllRead(req.tenant.businessId, req.userId));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerDevice,
  unregisterDevice,
  getPreferences,
  setPreference,
  list,
  unreadCount,
  markRead,
  markAllRead,
};
