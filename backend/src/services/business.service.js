const prisma = require('../config/db');
const { fail } = require('../errors');

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

/**
 * Partial update of a branch. Branch settings used to be write-once at
 * creation — there was no PATCH at all — so a geofence could never be
 * corrected or removed, and a wrong timezone silently mis-filed every punch
 * near local midnight.
 *
 * `geofenceRadiusMeters: null` explicitly clears the geofence; omitting the key
 * leaves it alone. That distinction is why this walks the keys rather than
 * spreading the body.
 */
async function updateBranch(businessId, branchId, patch) {
  const existing = await prisma.branch.findFirst({ where: { id: branchId, businessId } });
  if (!existing) {
    throw fail('BRANCH_NOT_FOUND', 404);
  }

  const data = {};
  const fields = [
    'name',
    'city',
    'region',
    'country',
    'currency',
    'status',
    'timezone',
    'latitude',
    'longitude',
    'geofenceRadiusMeters',
    'weeklyOffOverride',
    'weeklyOffDays',
  ];
  for (const field of fields) {
    if (patch[field] !== undefined) data[field] = patch[field];
  }

  // A radius without coordinates would silently never enforce, since
  // assertWithinGeofence needs all three. Reject it against the merged result
  // rather than the body alone, so setting a radius on a branch that already
  // has coordinates still works.
  const lat = data.latitude !== undefined ? data.latitude : existing.latitude;
  const radius = data.geofenceRadiusMeters !== undefined ? data.geofenceRadiusMeters : existing.geofenceRadiusMeters;
  if (radius !== null && radius !== undefined && (lat === null || lat === undefined)) {
    throw fail('GEOFENCE_NEEDS_COORDINATES', 400);
  }

  return prisma.branch.update({ where: { id: branchId }, data });
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

// `client` defaults to the top-level prisma singleton but accepts a
// `$transaction` callback's tx client too, so invite.service.js can grant
// branch access atomically alongside the membership that needs it.
async function addBranchAccess(businessId, membershipId, branchId, client = prisma) {
  const membership = await client.membership.findFirst({ where: { id: membershipId, businessId } });
  if (!membership) {
    throw fail('MEMBERSHIP_NOT_FOUND', 404);
  }

  const branch = await client.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) {
    throw fail('BRANCH_NOT_FOUND_IN_BUSINESS', 404);
  }

  const existing = await client.branchAccess.findUnique({
    where: { membershipId_branchId: { membershipId, branchId } },
  });
  if (existing) return existing;

  return client.branchAccess.create({ data: { membershipId, branchId } });
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

// The business record itself. Needed once a person can belong to more than
// one: switching businesses has to replace the full Business on the session
// (industry, currency, timezone — not just the id and name that the
// membership list carries), and nothing else exposed it.
function getBusiness(businessId) {
  return prisma.business.findUnique({ where: { id: businessId } });
}

/**
 * Take away someone's access to this business.
 *
 * A soft revoke: the row stays and its status becomes REVOKED, which
 * `resolveTenant` already refuses (it requires status ACTIVE), so access ends
 * on the revoked person's very next request without any token invalidation.
 * Deleting the row instead would null out `Attendance.markedByMembershipId`
 * on every day this person ever marked, erasing who made those calls.
 *
 * BranchAccess rows are deliberately left in place so re-inviting someone
 * restores the scope they had rather than silently starting them at none.
 *
 * `actor` is the caller's own membership, and the two guards below are the
 * whole reason this isn't a one-line status update.
 */
async function revokeMembership(businessId, membershipId, actor) {
  const target = await prisma.membership.findFirst({ where: { id: membershipId, businessId } });
  if (!target) {
    throw fail('MEMBERSHIP_NOT_FOUND', 404);
  }

  // Idempotent rather than a 409: a double tap on a slow connection shouldn't
  // surface as an error for something that is already true.
  if (target.status === 'REVOKED') return target;

  // Also what keeps a business from losing its only owner: OWNER is not in
  // INVITABLE_ROLES, so the one created at signup is the only one there will
  // ever be, and this is the single path by which they could remove themselves.
  if (target.id === actor.membershipId) {
    throw fail('MEMBERSHIP_SELF_REVOKE', 400);
  }

  // requireRole lets OWNER and ADMIN both reach this route, but an ADMIN
  // removing the OWNER would be a privilege escalation — the lesser role
  // seizing the business from the greater one.
  if (target.role === 'OWNER' && actor.role !== 'OWNER') {
    throw fail('MEMBERSHIP_OWNER_REVOKE_REQUIRES_OWNER', 403);
  }

  return prisma.membership.update({ where: { id: membershipId }, data: { status: 'REVOKED' } });
}

/**
 * Narrow a MANAGER/STAFF member's scope by one branch — the counterpart to
 * addBranchAccess, which could previously only ever add.
 *
 * Leaving someone with zero branches is allowed: it is a real state the Team
 * screen already renders a warning for, and it is fully recoverable by
 * granting again. OWNER/ADMIN have implicit all-branch access and no
 * BranchAccess rows, so this never applies to them.
 */
async function removeBranchAccess(businessId, membershipId, branchId) {
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, businessId } });
  if (!membership) {
    throw fail('MEMBERSHIP_NOT_FOUND', 404);
  }

  const existing = await prisma.branchAccess.findUnique({
    where: { membershipId_branchId: { membershipId, branchId } },
  });
  if (!existing) {
    throw fail('MEMBERSHIP_BRANCH_ACCESS_NOT_FOUND', 404);
  }

  await prisma.branchAccess.delete({ where: { id: existing.id } });
  return { id: existing.id, membershipId, branchId };
}

module.exports = {
  getBusiness,
  createBranch,
  updateBranch,
  listBranches,
  getBranch,
  listMemberships,
  addBranchAccess,
  removeBranchAccess,
  revokeMembership,
  listTransactions,
  getSalesSummary,
};
