const prisma = require('../config/db');
const { addBranchAccess } = require('./business.service');

function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

async function assertBranchesBelongToBusiness(businessId, branchIds, client = prisma) {
  if (!branchIds.length) return;
  const matching = await client.branch.findMany({ where: { id: { in: branchIds }, businessId } });
  if (matching.length !== branchIds.length) {
    const err = new Error('One or more branchIds do not belong to this business');
    err.status = 400;
    throw err;
  }
}

// The single "add someone to my team" entry point (business.controller.js's
// createMembership route handler). Whether the target already has a BizIQ
// account decides what actually happens:
//  - account exists: join them immediately (ACTIVE Membership + BranchAccess).
//  - no account yet: store a PENDING Invite; auth.service.js's signup claims
//    it automatically if that email ever signs up (see claimPendingInvites).
// Either way the caller never has to know or care which happened up front —
// the response's `pending` flag says which one it got.
async function inviteMember(businessId, { email, role, branchIds = [] }) {
  const normalizedEmail = normalizeEmail(email);
  await assertBranchesBelongToBusiness(businessId, branchIds);

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    const invite = await prisma.invite.upsert({
      where: { businessId_email: { businessId, email: normalizedEmail } },
      update: { role, branchIds, status: 'PENDING', invitedAt: new Date(), acceptedAt: null },
      create: { businessId, email: normalizedEmail, role, branchIds, status: 'PENDING' },
    });
    return { pending: true, invite };
  }

  const existingMembership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: user.id, businessId } },
  });
  if (existingMembership) {
    const err = new Error('This user is already a member of this business');
    err.status = 409;
    throw err;
  }

  const membership = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.create({
      data: { userId: user.id, businessId, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    for (const branchId of branchIds) {
      await addBranchAccess(businessId, membership.id, branchId, tx);
    }
    return membership;
  });

  return { pending: false, membership };
}

// OWNER/ADMIN "who's still pending" view, shown alongside listMemberships
// on the Team screen.
function listInvites(businessId) {
  return prisma.invite.findMany({
    where: { businessId, status: 'PENDING' },
    orderBy: { invitedAt: 'desc' },
  });
}

// Public (unauthenticated) lookup used by the signup screen, before an
// account exists to authenticate as. Deliberately returns only what a
// legitimate invitee needs to see their own invite (business name + role),
// never the full invite/business record.
async function lookupInvite(email) {
  const normalizedEmail = normalizeEmail(email);
  const invite = await prisma.invite.findFirst({
    where: { email: normalizedEmail, status: 'PENDING' },
    include: { business: { select: { name: true } } },
    orderBy: { invitedAt: 'desc' },
  });
  if (!invite) return null;
  return { businessName: invite.business.name, role: invite.role };
}

function getPendingInvites(email) {
  return prisma.invite.findMany({ where: { email: normalizeEmail(email), status: 'PENDING' } });
}

// Called from inside auth.service.js's signup transaction, once per pending
// invite, so a person invited to more than one business before ever signing
// up joins all of them in the same atomic step that creates their account.
async function claimPendingInvites(tx, userId, invites) {
  const memberships = [];
  for (const invite of invites) {
    const membership = await tx.membership.create({
      data: { userId, businessId: invite.businessId, role: invite.role, status: 'ACTIVE', joinedAt: new Date() },
    });
    for (const branchId of invite.branchIds) {
      await addBranchAccess(invite.businessId, membership.id, branchId, tx);
    }
    await tx.invite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    memberships.push(membership);
  }
  return memberships;
}

module.exports = { inviteMember, listInvites, lookupInvite, getPendingInvites, claimPendingInvites };
