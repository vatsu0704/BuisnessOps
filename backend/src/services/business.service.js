const prisma = require('../config/db');

function createBranch(
  businessId,
  { name, code, city, region, country, timezone, currency, latitude, longitude, geofenceRadiusMeters }
) {
  return prisma.branch.create({
    data: {
      businessId,
      name,
      code,
      city,
      region,
      country,
      timezone,
      currency,
      latitude,
      longitude,
      geofenceRadiusMeters,
    },
  });
}

// accessibleBranchIds === null means the caller has full access (OWNER/ADMIN);
// otherwise it's the explicit branch list from their BranchAccess rows.
function listBranches(businessId, accessibleBranchIds) {
  const where = { businessId };
  if (accessibleBranchIds !== null) {
    where.id = { in: accessibleBranchIds };
  }
  return prisma.branch.findMany({ where, orderBy: { createdAt: 'asc' } });
}

function getBranch(businessId, branchId) {
  return prisma.branch.findFirst({ where: { id: branchId, businessId } });
}

// Simplified "invite": the target user must already have an account. There
// is no pending-invite/email flow yet — the membership is created ACTIVE
// immediately. Revisit if/when self-serve invites by email are needed.
async function createMembership(businessId, { email, role }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const err = new Error('No account found for this email — ask them to sign up first');
    err.status = 404;
    throw err;
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: user.id, businessId } },
  });
  if (existing) {
    const err = new Error('This user is already a member of this business');
    err.status = 409;
    throw err;
  }

  return prisma.membership.create({
    data: { userId: user.id, businessId, role, status: 'ACTIVE', joinedAt: new Date() },
  });
}

// OWNER/ADMIN-only "who's on the team" view. Ordered oldest-first so the
// owner's own membership (created at signup) always leads the list.
function listMemberships(businessId) {
  return prisma.membership.findMany({
    where: { businessId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      branchAccess: { include: { branch: { select: { id: true, name: true, code: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function addBranchAccess(businessId, membershipId, branchId) {
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, businessId } });
  if (!membership) {
    const err = new Error('Membership not found in this business');
    err.status = 404;
    throw err;
  }

  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) {
    const err = new Error('Branch not found in this business');
    err.status = 404;
    throw err;
  }

  const existing = await prisma.branchAccess.findUnique({
    where: { membershipId_branchId: { membershipId, branchId } },
  });
  if (existing) return existing;

  return prisma.branchAccess.create({ data: { membershipId, branchId } });
}

// Recent-first, capped list — enough to verify an ingestion run landed
// correctly without building out pagination/filtering yet.
function listTransactions(businessId, branchId, { limit = 50 } = {}) {
  return prisma.transaction.findMany({
    where: { businessId, branchId },
    include: { lineItems: true },
    orderBy: { occurredAt: 'desc' },
    take: Math.min(limit, 200),
  });
}

// All-time totals grouped by currency (a business's branches could in theory
// use different currencies). VOIDED/REFUNDED transactions don't count as
// sales. Not a metrics-catalog query — that's Phase 2 — just enough to make
// ingested data visible on Home.
function getSalesSummary(businessId, accessibleBranchIds) {
  const where = { businessId, status: 'COMPLETED' };
  if (accessibleBranchIds !== null) {
    where.branchId = { in: accessibleBranchIds };
  }

  return prisma.transaction.groupBy({
    by: ['currency'],
    where,
    _sum: { totalAmount: true },
    _count: true,
  });
}

module.exports = {
  createBranch,
  listBranches,
  getBranch,
  createMembership,
  listMemberships,
  addBranchAccess,
  listTransactions,
  getSalesSummary,
};
