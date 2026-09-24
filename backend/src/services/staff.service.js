const prisma = require('../config/db');
const { fail } = require('../errors');
const { roleHas } = require('../permissions');
const { dateOnly } = require('../utils/datetime');

function getBranchInBusiness(businessId, branchId) {
  return prisma.branch.findFirst({ where: { id: branchId, businessId } });
}

/**
 * A branchId from another business must not be accepted. Creation never checked
 * this and only survived because a nonexistent id trips Prisma's P2003 — which
 * says nothing useful, and would not have caught a *real* branch belonging to
 * someone else's business.
 */
async function assertBranchInBusiness(businessId, branchId) {
  const branch = await getBranchInBusiness(businessId, branchId);
  if (!branch) {
    throw fail('BRANCH_NOT_FOUND', 404);
  }
  return branch;
}

async function resolveUserIdByEmail(email) {
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (!user) {
    throw fail('STAFF_USER_NOT_FOUND', 404);
  }
  return user.id;
}

// email, not a raw userId, is what a screen can actually collect — resolved
// server-side the same way business.service.js's createMembership does.
// Most staff (cashiers/cooks) never get an app account at all, so email is
// optional; when it's given, that person becomes punch-capable immediately.
async function createStaffMember(
  businessId,
  { branchId, name, role, externalId, baseSalary, email, phone, employeeCode, hiredOn, notes }
) {
  await assertBranchInBusiness(businessId, branchId);
  const userId = email ? await resolveUserIdByEmail(email) : null;

  return prisma.staffMember.create({
    data: {
      businessId,
      branchId,
      userId,
      name,
      role,
      externalId,
      baseSalary,
      phone,
      employeeCode,
      hiredOn: hiredOn ? dateOnly(hiredOn) : null,
      notes,
    },
  });
}

/**
 * Partial update. `baseSalary` is gated to OWNER/ADMIN in the controller, not
 * here — this layer has no role context by design.
 *
 * A salary change overwrites outright: there is no effective-dated salary
 * history yet, so regenerating an unfinalized slip for a past month would use
 * the new figure. Finalizing a slip is what locks it.
 */
async function updateStaffMember(businessId, staffMemberId, patch) {
  const existing = await getStaffMember(businessId, staffMemberId);
  if (!existing) {
    throw fail('STAFF_NOT_FOUND', 404);
  }

  const data = {};
  for (const field of ['name', 'role', 'externalId', 'baseSalary', 'phone', 'employeeCode', 'notes']) {
    if (patch[field] !== undefined) data[field] = patch[field];
  }
  if (patch.branchId !== undefined && patch.branchId !== existing.branchId) {
    await assertBranchInBusiness(businessId, patch.branchId);
    data.branchId = patch.branchId;
  }
  for (const field of ['hiredOn', 'exitedOn']) {
    if (patch[field] !== undefined) data[field] = patch[field] ? dateOnly(patch[field]) : null;
  }
  // An explicit null unlinks the app account; omitting the key leaves it alone.
  if (patch.email !== undefined) {
    data.userId = patch.email ? await resolveUserIdByEmail(patch.email) : null;
  }

  return prisma.staffMember.update({ where: { id: staffMemberId }, data });
}

/**
 * Deactivate is not delete. Attendance rows and past payslips survive — they
 * are records of something that happened — but the person drops out of the
 * roster and out of the bulk payroll run. There is deliberately no hard-delete
 * endpoint.
 */
async function setStaffStatus(businessId, staffMemberId, status) {
  const existing = await getStaffMember(businessId, staffMemberId);
  if (!existing) {
    throw fail('STAFF_NOT_FOUND', 404);
  }
  return prisma.staffMember.update({
    where: { id: staffMemberId },
    data: { status, deactivatedAt: status === 'INACTIVE' ? new Date() : null },
  });
}

// accessibleBranchIds === null means the caller has full access (OWNER/ADMIN);
// otherwise it's the explicit branch list from their BranchAccess rows — same
// convention as business.service.js's listBranches.
function listStaffMembers(businessId, accessibleBranchIds, { role, userId } = {}) {
  const where = { businessId };
  if (accessibleBranchIds !== null) {
    where.branchId = { in: accessibleBranchIds };
  }
  // Someone who may not read colleagues sees only their own row, which is what
  // lets the personal view of the Staff tab reuse this endpoint instead of
  // needing its own.
  //
  // This used to be `role === 'STAFF'` — a deny-list, so every role added later
  // would have fallen through and been handed the whole branch roster. Asking
  // for the capability instead means a role sees colleagues only by holding
  // `staff:viewOthers`.
  if (!roleHas(role, 'staff:viewOthers')) {
    where.userId = userId;
  }
  return prisma.staffMember.findMany({ where, orderBy: { name: 'asc' } });
}

function getStaffMember(businessId, staffMemberId) {
  return prisma.staffMember.findFirst({ where: { id: staffMemberId, businessId } });
}

// Resolves "which StaffMember row is the logged-in caller" for self-service
// punch-in/out — a StaffMember only becomes punch-capable once an owner/admin
// links it to a User via userId.
function getStaffMemberByUserId(businessId, userId) {
  return prisma.staffMember.findFirst({ where: { businessId, userId } });
}

module.exports = {
  createStaffMember,
  updateStaffMember,
  setStaffStatus,
  listStaffMembers,
  getStaffMember,
  getStaffMemberByUserId,
  getBranchInBusiness,
  assertBranchInBusiness,
};
