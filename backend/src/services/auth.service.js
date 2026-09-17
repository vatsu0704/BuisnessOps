const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { signToken } = require('../utils/jwt');
const inviteService = require('./invite.service');

const SALT_ROUNDS = 10;

// Every endpoint that returns a user (signup/login/me) includes the same
// membership shape, so the client never has to special-case "I got this
// user from login vs. from /me" — that inconsistency previously meant the
// app only knew the caller's role right after signup, not after login.
const MEMBERSHIP_SELECT = { id: true, businessId: true, role: true, status: true };

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
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const pendingInvites = await inviteService.getPendingInvites(normalizedEmail);

  if (pendingInvites.length === 0 && (!businessName || !industry || !country || !defaultCurrency || !timezone)) {
    const err = new Error(
      'businessName, industry, country, defaultCurrency and timezone are required to create a new business'
    );
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const { user, business, memberships } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: normalizedEmail, passwordHash, name } });

    if (pendingInvites.length > 0) {
      const memberships = await inviteService.claimPendingInvites(tx, user.id, pendingInvites);
      const business = await tx.business.findUnique({ where: { id: memberships[0].businessId } });
      return { user, business, memberships };
    }

    const business = await tx.business.create({
      data: { name: businessName, industry, country, defaultCurrency, timezone },
    });
    const membership = await tx.membership.create({
      data: { userId: user.id, businessId: business.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
    });
    return { user, business, memberships: [membership] };
  });

  const token = signToken({ sub: user.id });
  const membershipViews = memberships.map((m) => ({
    id: m.id,
    businessId: m.businessId,
    role: m.role,
    status: m.status,
  }));
  return { token, user: { ...sanitizeUser(user), memberships: membershipViews }, business };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { select: MEMBERSHIP_SELECT } },
  });
  if (!user) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const token = signToken({ sub: user.id });
  return { token, user: sanitizeUser(user), business: await primaryBusiness(user) };
}

// signup/login/me all hand back the same {user, business} shape for the same reason
// they already share MEMBERSHIP_SELECT: the client must not have to care which
// endpoint the session came from. Returning business only from signup previously
// meant the app knew the business name right after registering but lost it on the
// next login or app restart.
async function primaryBusiness(user) {
  const businessId = user.memberships?.[0]?.businessId;
  if (!businessId) return null;
  return prisma.business.findUnique({ where: { id: businessId } });
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
