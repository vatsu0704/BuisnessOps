const bcrypt = require('bcryptjs');
const { fail } = require('../errors');
const prisma = require('../config/db');
const { signToken } = require('../utils/jwt');
const inviteService = require('./invite.service');
const businessService = require('./business.service');

const SALT_ROUNDS = 10;

// Every endpoint that returns a user (signup/login/me) includes the same
// membership shape, so the client never has to special-case "I got this
// user from login vs. from /me" — that inconsistency previously meant the
// app only knew the caller's role right after signup, not after login.
// The business name rides along because the client needs it to name each
// membership in the business switcher. Without it the switcher could only
// offer a list of uuids, and naming them would cost one request per membership
// just to render a menu.
const MEMBERSHIP_SELECT = {
  id: true,
  businessId: true,
  role: true,
  status: true,
  business: { select: { id: true, name: true } },
};

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// Two paths, decided by whether an OWNER/ADMIN somewhere already invited
// this email (invite.service.js's pending Invite, created when they invited
// someone with no account yet):
//  - invited: join every business that invited them, with the role/branches
//    that invite already specified — the person never self-selects a role,
//    since a role has to come from someone with the authority to grant it.
//  - not invited: the original "create my own business" path, as OWNER.
// Either way happens inside one transaction, so a partial account can never
// exist (e.g. a user row with no membership at all).
async function signup({ email, password, name, businessName, industry, country, defaultCurrency, timezone }) {
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw fail('AUTH_EMAIL_TAKEN', 409);
  }

  const pendingInvites = await inviteService.getPendingInvites(normalizedEmail);

  if (pendingInvites.length === 0 && (!businessName || !industry || !country || !defaultCurrency || !timezone)) {
    throw fail('AUTH_BUSINESS_DETAILS_REQUIRED', 400);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const { user, business, memberships } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: normalizedEmail, passwordHash, name } });

    if (pendingInvites.length > 0) {
      const memberships = await inviteService.claimPendingInvites(tx, user.id, pendingInvites);
      const business = await tx.business.findUnique({ where: { id: memberships[0].businessId } });
      return { user, business, memberships };
    }

    // Shared with POST /businesses, which is how someone adds their second
    // business (requirement 16). Creating a business has to mean exactly the
    // same thing whichever door it came through.
    const { business, membership } = await businessService.createBusinessForUser(
      user.id,
      { name: businessName, industry, country, defaultCurrency, timezone },
      tx
    );
    return { user, business, memberships: [membership] };
  });

  const token = signToken({ sub: user.id });
  // Re-read through MEMBERSHIP_SELECT rather than hand-mapping the rows the
  // transaction created: the hand-mapped version silently lacked whatever the
  // select later gained (the business name, most recently), so signup and
  // login handed the client two different membership shapes.
  const membershipViews = await prisma.membership.findMany({
    where: { id: { in: memberships.map((m) => m.id) } },
    select: MEMBERSHIP_SELECT,
  });
  return { token, user: { ...sanitizeUser(user), memberships: membershipViews }, business };
}

async function login({ email, password }) {
  // Normalized the same way signup stores it. Without this, an address typed
  // with different casing or a trailing space misses the unique index and comes
  // back as "Invalid email or password" — indistinguishable from a wrong one.
  const normalizedEmail = String(email).toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { memberships: { select: MEMBERSHIP_SELECT } },
  });
  if (!user) {
    throw fail('AUTH_CREDENTIALS_INVALID', 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw fail('AUTH_CREDENTIALS_INVALID', 401);
  }

  const token = signToken({ sub: user.id });
  return { token, user: sanitizeUser(user), business: await primaryBusiness(user) };
}

// signup/login/me all hand back the same {user, business} shape for the same reason
// they already share MEMBERSHIP_SELECT: the client must not have to care which
// endpoint the session came from. Returning business only from signup previously
// meant the app knew the business name right after registering but lost it on the
// next login or app restart.
// Which business a session opens on when the client has no stored preference.
//
// ACTIVE only, with no fallback to whichever row came back first: a REVOKED
// membership is a business this person can no longer reach, and naming it here
// would hand the client a businessId that resolveTenant refuses on every
// subsequent request. Null is the honest answer, and the app says so.
async function primaryBusiness(user) {
  const chosen = (user.memberships ?? []).find((m) => m.status === 'ACTIVE');
  if (!chosen) return null;
  return prisma.business.findUnique({ where: { id: chosen.businessId } });
}

async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { select: MEMBERSHIP_SELECT } },
  });
  if (!user) return null;
  return { user: sanitizeUser(user), business: await primaryBusiness(user) };
}

// Language is stored per user rather than per device so a manager who signs in
// on a shared terminal still gets their own language.
async function updatePreferredLocale(userId, preferredLocale) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { preferredLocale },
    include: { memberships: { select: MEMBERSHIP_SELECT } },
  });
  return sanitizeUser(user);
}

module.exports = { signup, login, getCurrentUser, updatePreferredLocale };
