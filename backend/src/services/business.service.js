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
    const err = new Error('Branch not found');
    err.status = 404;
    throw err;
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
    const err = new Error('A geofence radius needs the branch latitude and longitude to be set');
    err.status = 400;
    throw err;
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
    const err = new Error('Membership not found in this business');
    err.status = 404;
    throw err;
  }

  const branch = await client.branch.findFirst({ where: { id: branchId, businessId } });
  if (!branch) {
    const err = new Error('Branch not found in this business');
    err.status = 404;
    throw err;
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

module.exports = {
  createBranch,
  updateBranch,
  listBranches,
  getBranch,
  listMemberships,
  addBranchAccess,
  listTransactions,
  getSalesSummary,
};
