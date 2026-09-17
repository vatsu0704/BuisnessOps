const prisma = require('../config/db');

// email, not a raw userId, is what a screen can actually collect — resolved
// server-side the same way business.service.js's createMembership does.
// Most staff (cashiers/cooks) never get an app account at all, so email is
// optional; when it's given, that person becomes punch-capable immediately.
async function createStaffMember(businessId, { branchId, name, role, externalId, baseSalary, email }) {
  let userId = null;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const err = new Error('No account found for this email — ask them to sign up first');
      err.status = 404;
      throw err;
    }
    userId = user.id;
  }

  return prisma.staffMember.create({
    data: { businessId, branchId, userId, name, role, externalId, baseSalary },
  });
}

// accessibleBranchIds === null means the caller has full access (OWNER/ADMIN);
// otherwise it's the explicit branch list from their BranchAccess rows — same
// convention as business.service.js's listBranches.
function listStaffMembers(businessId, accessibleBranchIds) {
  const where = { businessId };
  if (accessibleBranchIds !== null) {
    where.branchId = { in: accessibleBranchIds };
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

module.exports = { createStaffMember, listStaffMembers, getStaffMember, getStaffMemberByUserId };
