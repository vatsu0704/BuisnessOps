const prisma = require('../config/db');
const { fail } = require('../errors');
const { addBranchAccess } = require('./business.service');

function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

async function assertBranchesBelongToBusiness(businessId, branchIds, client = prisma) {
  if (!branchIds.length) return;
  const matching = await client.branch.findMany({ where: { id: { in: branchIds }, businessId } });
  if (matching.length !== branchIds.length) {
    throw fail('INVITE_BRANCHES_NOT_IN_BUSINESS', 400);
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

  // A revoked member is re-invitable, and that is the only way back in: there
  // is no separate "reinstate" endpoint, and without this branch the 409 below
  // would make every revoke permanent for that person and business. The role
  // and branches come from this invite, not from whatever they had before —
  // re-adding someone is a fresh decision about their access, not an undo.
  if (existingMembership && existingMembership.status === 'REVOKED') {
    return {
      pending: false,
      membership: await prisma.$transaction(async (tx) => {
        const membership = await tx.membership.update({
          where: { id: existingMembership.id },
          data: { role, status: 'ACTIVE', joinedAt: new Date() },
        });
        for (const branchId of branchIds) {
          await addBranchAccess(businessId, membership.id, branchId, tx);
        }
        return membership;
      }),
    };
  }

  if (existingMembership) {
    throw fail('MEMBERSHIP_ALREADY_EXISTS', 409);
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

/**
 * Withdraw an invite that was never accepted.
 *
 * REVOKED rather than deleted, so the row keeps its history — and because the
 * @@unique([businessId, email]) constraint means inviting the same address
 * again upserts this very row back to PENDING, which is exactly the behaviour
 * wanted. Only PENDING invites can be revoked: an ACCEPTED one is now a
 * Membership, and taking that away is revokeMembership's job, not this one's.
 */
async function revokeInvite(businessId, inviteId) {
  const invite = await prisma.invite.findFirst({ where: { id: inviteId, businessId } });
  if (!invite) {
    throw fail('INVITE_NOT_FOUND', 404);
  }
  if (invite.status === 'ACCEPTED') {
    throw fail('INVITE_ALREADY_ACCEPTED', 409);
  }
  if (invite.status === 'REVOKED') return invite;

  return prisma.invite.update({ where: { id: inviteId }, data: { status: 'REVOKED' } });
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

module.exports = {
  inviteMember,
  listInvites,
  revokeInvite,
  lookupInvite,
  getPendingInvites,
  claimPendingInvites,
};
