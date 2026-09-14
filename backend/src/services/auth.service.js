const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { signToken } = require('../utils/jwt');

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

// Creates the user, their business, and the founding OWNER membership in one
// transaction — there is no "join an existing business" path here; that
// happens via createMembership (business.service.js) once an OWNER/ADMIN
// invites the user by email.
async function signup({ email, password, name, businessName, industry, country, defaultCurrency, timezone }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const { user, business, membership } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash, name } });

    const business = await tx.business.create({
      data: { name: businessName, industry, country, defaultCurrency, timezone },
    });

    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        businessId: business.id,
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    return { user, business, membership };
  });

  const token = signToken({ sub: user.id });
  const membershipView = {
    id: membership.id,
    businessId: membership.businessId,
    role: membership.role,
    status: membership.status,
  };
  return { token, user: { ...sanitizeUser(user), memberships: [membershipView] }, business };
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
  return { token, user: sanitizeUser(user) };
}

async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { select: MEMBERSHIP_SELECT } },
  });
  if (!user) return null;
  return sanitizeUser(user);
}

module.exports = { signup, login, getCurrentUser };
