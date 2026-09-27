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

/**
 * Where a person may be based, when the business already knows who they are.
 *
 * `StaffMember.branchId` scopes nothing — what someone may reach is decided by
 * their role — but it is not free-form either. Two things read it: the payroll
 * calendar, which takes the weekly off, the holidays and the geofence from that
 * branch, and `listStaffMembers`, which hands a branch-scoped caller every
 * employee record at their branches. A CASHIER holds `staff:viewOthers` **and**
 * `staff:setPay`, so filing the warehouse desk at a shop puts the desk on that
 * shop's roster with their salary visible to, and editable by, its cashier.
 *
 * ## Why `supplyOrder:fulfil` draws the line, and not `branch:allAccess`
 *
 * "Reaches every branch" is the obvious test and it is wrong. A DELIVERY_AGENT
 * holds `branch:allAccess` and `attendance:punchAnywhere` precisely because
 * they have **no** fixed place of work, so any branch is a legitimate payroll
 * home for them — `attendance.test.js` states that outright: *"the rider is
 * employed by this branch, that is their payroll home, but their work happens
 * at every other branch."* Refusing it would break that.
 *
 * What ties the warehouse desk to the warehouse is not reach, it is the work.
 * `supplyOrder:fulfil` is accepting, packing and dispatching goods, and those
 * happen where the goods are. So the test is `supplyOrder:fulfil` **without**
 * `staff:viewAllBranches` — the mirror image of the agent picker's
 * `supplyOrder:deliver` and not `supplyOrder:fulfil`, and for the same reason.
 * An owner, an admin and a manager hold every capability, so the second half is
 * what keeps them out of it; a cashier and a plain staff member hold neither
 * and are unaffected; a role added later that runs a warehouse lands on the
 * right side of the line by itself, and one that does not is unconstrained.
 *
 * Enforced here rather than in a controller because three doors reach it — the
 * add-staff screen, the edit screen, and the API directly — and a rule written
 * at one of them is a rule the other two do not have.
 */
async function assertBaseMatchesRole(businessId, branch, userId) {
  if (!userId) return;

  const membership = await prisma.membership.findFirst({
    where: { businessId, userId, status: 'ACTIVE' },
    select: { role: true },
  });
  // Nobody this business knows: most staff never hold a membership at all, and
  // there is no role to read a rule off.
  if (!membership) return;

  const runsTheWarehouse =
    roleHas(membership.role, 'supplyOrder:fulfil') &&
    !roleHas(membership.role, 'staff:viewAllBranches');

  if (runsTheWarehouse && branch.kind !== 'WAREHOUSE') {
    throw fail('STAFF_BASE_MUST_BE_WAREHOUSE', 400, { role: membership.role });
  }
}

// email, not a raw userId, is what a screen can actually collect — resolved
// server-side the same way business.service.js's createMembership does.
// Most staff (cashiers/cooks) never get an app account at all, so email is
// optional; when it's given, that person becomes punch-capable immediately.
async function createStaffMember(
  businessId,
  { branchId, name, role, externalId, baseSalary, email, phone, employeeCode, hiredOn, notes }
) {
  const branch = await assertBranchInBusiness(businessId, branchId);
  const userId = email ? await resolveUserIdByEmail(email) : null;
  await assertBaseMatchesRole(businessId, branch, userId);

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
  let branch = null;
  if (patch.branchId !== undefined && patch.branchId !== existing.branchId) {
    branch = await assertBranchInBusiness(businessId, patch.branchId);
    data.branchId = patch.branchId;
  }
  for (const field of ['hiredOn', 'exitedOn']) {
    if (patch[field] !== undefined) data[field] = patch[field] ? dateOnly(patch[field]) : null;
  }
  // An explicit null unlinks the app account; omitting the key leaves it alone.
  if (patch.email !== undefined) {
    data.userId = patch.email ? await resolveUserIdByEmail(patch.email) : null;
  }

  // Either half can break the pairing: moving the record to a shop, or linking
  // it to the warehouse desk's account while it already sits at one. So the
  // rule is checked against whichever values this patch is leaving behind,
  // never against the patch alone.
  if (data.branchId !== undefined || data.userId !== undefined) {
    const effectiveUserId = data.userId !== undefined ? data.userId : existing.userId;
    const effectiveBranch = branch ?? (await assertBranchInBusiness(businessId, existing.branchId));
    await assertBaseMatchesRole(businessId, effectiveBranch, effectiveUserId);
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
