const prisma = require('../config/db');
const { fail } = require('../errors');
const { roleHas } = require('../permissions');
const { sendToDevice } = require('../notifications/push');

/**
 * Notifications — requirements 2 and 8.
 *
 * ## The shape everything here follows
 *
 * **Record first, send second, and never let the send fail the caller.** A
 * notification is a row in `notifications`; the push is a best-effort attempt
 * on top of it. Marking somebody absent has to succeed whether or not their
 * phone hears about it — requirement 2 says so explicitly for a worker with no
 * device, and the same must hold for a dead token, a flat battery or a server
 * with no Firebase credentials at all.
 *
 * **Codes, not sentences.** A row stores `code` + `params` and the device
 * renders `t('notifications.<code>', params)` every time it draws the list, so
 * a notification from last week appears in today's language. The push carries
 * rendered text as well, because Android draws the lock screen before any app
 * code runs — that is the one exception, and `notifications/labels.js` explains
 * what bounds it.
 *
 * **Who receives it is a capability question, asked per business.** Nothing
 * here names a role. "Tell the warehouse" is "tell everyone in this business
 * holding `supplyOrder:fulfil`", which means a role added later that also
 * fulfils orders is notified without anybody remembering to add it.
 */

/**
 * Notification categories a person can switch off (requirement 8).
 *
 * A category rather than a code: "turn off order updates" is a thing somebody
 * means, and "turn off SUPPLY_ORDER_PACKED" is not. Attendance is deliberately
 * **not** in the list — requirement 2 exists so a worker finds out they were
 * marked absent, and a setting that hides that would defeat the requirement it
 * was built for.
 */
const CATEGORIES = {
  ATTENDANCE_MARKED_PRESENT: 'attendance',
  ATTENDANCE_MARKED_ABSENT: 'attendance',
  ATTENDANCE_MARKED_HALF_DAY: 'attendance',
  ATTENDANCE_MARKED_LEAVE: 'attendance',
  SUPPLY_ORDER_PLACED: 'orders',
  SUPPLY_ORDER_ACCEPTED: 'orders',
  SUPPLY_ORDER_PACKED: 'orders',
  SUPPLY_ORDER_DISPATCHED: 'orders',
  SUPPLY_ORDER_DELIVERED: 'orders',
  SUPPLY_ORDER_REJECTED: 'orders',
  SUPPLY_ORDER_ASSIGNED: 'deliveries',
  SUPPLY_ORDER_DELAYED: 'delays',
  SUPPLY_PAYMENT_VERIFIED: 'payments',
};

/** Categories that cannot be switched off, and why, in one place. */
const REQUIRED_CATEGORIES = new Set(['attendance']);

const PLATFORMS = new Set(['ANDROID', 'IOS', 'WEB']);
const LOCALES = new Set(['EN', 'HI', 'GU', 'MR']);

// --- Device registration ---------------------------------------------------

/**
 * Register or refresh a device's push token.
 *
 * An **upsert on the token**, not on the user: the same handset signing in as
 * somebody else must move the row rather than leave the previous user
 * subscribed to a phone they have signed out of. `token` is unique in the
 * schema for exactly this.
 *
 * `locale` is the DEVICE's language, which is the whole reason the backend may
 * render push text at all. It is not read from `User.preferredLocale` — a
 * shared handset would otherwise show the wrong language on a lock screen the
 * app cannot re-render.
 */
async function registerDevice(userId, { token, platform, locale }) {
  const normalisedPlatform = PLATFORMS.has(platform) ? platform : 'ANDROID';
  const normalisedLocale = LOCALES.has(String(locale).toUpperCase())
    ? String(locale).toUpperCase()
    : 'EN';

  return prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform: normalisedPlatform, locale: normalisedLocale },
    update: {
      userId,
      platform: normalisedPlatform,
      locale: normalisedLocale,
      lastSeenAt: new Date(),
      // A device that is registering is by definition alive again.
      disabledAt: null,
    },
  });
}

/**
 * Stop sending to a device — on logout.
 *
 * Disabled rather than deleted, so the same handset coming back is an update
 * and the history of which devices a person used survives.
 */
async function unregisterDevice(userId, token) {
  await prisma.deviceToken.updateMany({
    where: { token, userId },
    data: { disabledAt: new Date() },
  });
}

// --- Preferences -----------------------------------------------------------

/**
 * Which categories this person wants.
 *
 * Stored as disabled codes on the user rather than as a table: there are five
 * categories and the answer is almost always "all of them", so a row per user
 * per category would be a join to learn nothing. Kept on `DeviceToken`-adjacent
 * state would be wrong too — a preference belongs to the person, not the phone.
 */
async function getPreferences(userId) {
  const disabled = await prisma.notificationPreference.findMany({ where: { userId } });
  const off = new Set(disabled.map((row) => row.category));

  return Object.values(CATEGORIES)
    .filter((category, index, all) => all.indexOf(category) === index)
    .map((category) => ({
      category,
      enabled: !off.has(category),
      // Surfaced so the screen can render the switch as fixed rather than
      // offering one that silently does nothing.
      required: REQUIRED_CATEGORIES.has(category),
    }));
}

/**
 * Turn a category on or off.
 *
 * `attendance` is refused rather than silently ignored: requirement 2 exists so
 * a worker finds out they were marked absent, and a switch that appears to work
 * and does not is worse than one that says no.
 */
async function setPreference(userId, category, enabled) {
  const known = new Set(Object.values(CATEGORIES));
  if (!known.has(category)) throw fail('NOTIFICATION_CATEGORY_UNKNOWN', 400, { category });
  if (REQUIRED_CATEGORIES.has(category)) throw fail('NOTIFICATION_CATEGORY_REQUIRED', 400);

  if (enabled) {
    await prisma.notificationPreference.deleteMany({ where: { userId, category } });
  } else {
    await prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      create: { userId, category },
      update: {},
    });
  }
  return getPreferences(userId);
}

// --- Recording and sending -------------------------------------------------

/**
 * Everyone in a business who holds a capability.
 *
 * The one place "who should be told" is answered, and it never names a role —
 * so a role added later that fulfils orders is notified without anybody
 * remembering to come back here.
 */
async function membersWith(businessId, capability, { branchId } = {}) {
  const memberships = await prisma.membership.findMany({
    where: { businessId, status: 'ACTIVE' },
    include: { branchAccess: true },
  });

  return memberships.filter((membership) => {
    if (!roleHas(membership.role, capability)) return false;
    // A branch-scoped member is only told about their own branches. A member
    // with `branch:allAccess` has no BranchAccess rows and hears about all.
    if (!branchId) return true;
    if (roleHas(membership.role, 'branch:allAccess')) return true;
    return membership.branchAccess.some((access) => access.branchId === branchId);
  });
}

/**
 * Write the row, then try to push it.
 *
 * Never throws for a delivery problem. The only thing that can fail here is the
 * database write, and if that fails the caller genuinely should know.
 */
async function isMuted(userId, code) {
  const category = CATEGORIES[code];
  if (!category || REQUIRED_CATEGORIES.has(category)) return false;
  const row = await prisma.notificationPreference.findFirst({ where: { userId, category } });
  return !!row;
}

async function notifyUser({ businessId, userId, branchId = null, code, params = {}, deepLink = null }) {
  // Checked BEFORE the row is written, not before the push. "Turn off order
  // updates" means stop telling me about orders — a badge still counting them
  // in the centre would contradict the switch that was just moved. Nothing is
  // lost: the event itself is in SupplyOrderEvent or Attendance either way, and
  // those are the audit trail. This is only whether the person is told.
  if (await isMuted(userId, code)) return null;

  const notification = await prisma.notification.create({
    data: { businessId, userId, branchId, code, params, deepLink },
  });

  // Fire and forget from the caller's point of view: the row is already safe.
  await deliver(notification).catch(() => {});
  return notification;
}

/** Notify every member of a business holding `capability`. */
async function notifyCapability(businessId, capability, payload, { branchId, exceptUserId } = {}) {
  const members = await membersWith(businessId, capability, { branchId });
  const seen = new Set();

  const created = [];
  for (const member of members) {
    // The person who caused it does not need telling they caused it.
    if (member.userId === exceptUserId) continue;
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);
    // `notifyUser` returns null for a muted category, so a muted member simply
    // does not appear in what this reports as created.
    const created_ = await notifyUser({ businessId, userId: member.userId, branchId, ...payload });
    if (created_) created.push(created_);
  }
  return created;
}

/**
 * Push one recorded notification to every live device the recipient has.
 *
 * Each device is sent in its OWN language, because two people sharing an
 * account — or one person with a phone and a tablet set differently — should
 * each read it in theirs.
 */
async function deliver(notification) {
  const devices = await prisma.deviceToken.findMany({
    where: { userId: notification.userId, disabledAt: null },
  });

  // No device is not a failure: requirement 2 is explicit that a worker who has
  // never opened the app is simply not notified, and marking still succeeds.
  if (devices.length === 0) return;

  const errors = [];
  let anyDelivered = false;

  for (const device of devices) {
    const result = await sendToDevice({
      token: device.token,
      locale: device.locale,
      code: notification.code,
      params: notification.params ?? {},
      deepLink: notification.deepLink ?? null,
    });

    if (result.ok) anyDelivered = true;
    // Only a token FCM says is dead gets disabled. A transient failure must
    // not, or one bad afternoon quietly unsubscribes the whole business.
    if (result.deadToken) {
      await prisma.deviceToken.update({
        where: { id: device.id },
        data: { disabledAt: new Date() },
      });
    }
    if (result.error) errors.push(result.error);
  }

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      sentAt: anyDelivered ? new Date() : null,
      deliveryError: anyDelivered || errors.length === 0 ? null : errors[0].slice(0, 300),
    },
  });
}

// --- The centre ------------------------------------------------------------

/**
 * This person's notifications in this business.
 *
 * Scoped to the active business on purpose: switching business should change
 * what the list shows, the same way every other screen does. The badge counts
 * the same scope, so it cannot claim unread items the current screen has no way
 * to show.
 */
function listNotifications(businessId, userId, { status, limit = 50 } = {}) {
  return prisma.notification.findMany({
    where: { businessId, userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
  });
}

function countUnread(businessId, userId) {
  return prisma.notification.count({ where: { businessId, userId, status: 'UNREAD' } });
}

async function markRead(businessId, userId, notificationId) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, businessId, userId },
  });
  if (!notification) throw fail('NOTIFICATION_NOT_FOUND', 404);
  if (notification.status === 'READ') return notification;

  return prisma.notification.update({
    where: { id: notificationId },
    data: { status: 'READ', readAt: new Date() },
  });
}

async function markAllRead(businessId, userId) {
  const { count } = await prisma.notification.updateMany({
    where: { businessId, userId, status: 'UNREAD' },
    data: { status: 'READ', readAt: new Date() },
  });
  return { count };
}

module.exports = {
  CATEGORIES,
  REQUIRED_CATEGORIES,
  registerDevice,
  unregisterDevice,
  getPreferences,
  setPreference,
  notifyUser,
  notifyCapability,
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
};
