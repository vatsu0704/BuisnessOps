const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { fail } = require('../errors');
const prisma = require('../config/db');

const SALT_ROUNDS = 10;

// The address a deleted account is left with is `deleted+<id>@` this. The app
// recognises a deleted account by it (frontend utils/account.ts) to show
// "Deleted account" rather than the address, so the two must stay the same.
const DELETED_EMAIL_DOMAIN = 'deleted.invalid';

/**
 * Deleting your own account — the Play Store and App Store both require it of
 * any app that lets people sign up, in the app itself and not only on request.
 *
 * ## What happens to a business
 *
 * A business someone **owns alone** goes with them, with everything in it.
 * A business they own **with anybody else still active in it** stops the whole
 * deletion: those people would lose their workplace's books because one person
 * left, and the owner is the only one who can decide that. They are told which
 * business, and can remove the team first. Nothing is changed in that case —
 * the check runs before any write, inside the same transaction.
 *
 * Every other membership — the businesses this person works *in* — is ended
 * (`REVOKED`), and their link to a staff record is cleared. The employer keeps
 * the attendance and the payslips: those are the employer's records about
 * paying somebody, not part of that somebody's account.
 *
 * ## Why the user row is anonymised rather than deleted
 *
 * `Membership.user` cascades, and every audit pointer at a membership —
 * who marked a day, who placed or carried a supply order, who logged an
 * expense, who changed a UPI ID — is `SetNull`. Deleting the row would therefore
 * quietly erase that history from *other people's* businesses. So the row stays
 * and stops being a person: no name, no phone, an email that cannot receive
 * mail, a password nobody knows, and `DISABLED`, which `requireAuth` refuses on
 * the very next request — the token in the app's hands dies at once, not when
 * it expires. Freeing the real address means the same person can sign up again.
 */
async function deleteAccount(userId, password) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
  if (!user) throw fail('USER_NOT_FOUND', 404);

  // 403 rather than 401: the session is fine, this one action was refused.
  // The app reads some 401 codes as "the session is over" and signs out.
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw fail('ACCOUNT_DELETE_PASSWORD_INCORRECT', 403);

  // Hashed outside the transaction — bcrypt is the slow part, and nothing in
  // it needs a lock held.
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const owned = await tx.membership.findMany({
      where: { userId, role: 'OWNER', status: 'ACTIVE' },
      select: { businessId: true, business: { select: { name: true } } },
      orderBy: { businessId: 'asc' },
    });

    // Locked before counting, in id order. An invite being accepted inserts a
    // membership that references the business row, and that insert has to
    // wait for this lock — so nobody can join a business between it being
    // counted as empty and it being deleted.
    for (const { businessId } of owned) {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
    }

    for (const { businessId, business } of owned) {
      const others = await tx.membership.count({
        where: { businessId, status: 'ACTIVE', userId: { not: userId } },
      });
      if (others > 0) {
        throw fail('ACCOUNT_DELETE_OWNER_HAS_TEAM', 409, { business: business.name, count: others });
      }
    }

    const deletedBusinessIds = [];
    for (const { businessId } of owned) {
      // `Expense.category` is ON DELETE RESTRICT, and Postgres does not promise
      // to cascade into expenses before categories. Removing the expenses
      // first takes the ordering out of its hands.
      await tx.expense.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      deletedBusinessIds.push(businessId);
    }

    await tx.membership.updateMany({ where: { userId }, data: { status: 'REVOKED' } });
    await tx.staffMember.updateMany({ where: { userId }, data: { userId: null } });
    await tx.deviceToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        // `.invalid` is reserved (RFC 2606), so this can never be delivered to,
        // and the user id keeps it unique.
        email: `deleted+${userId}@${DELETED_EMAIL_DOMAIN}`,
        name: null,
        phone: null,
        passwordHash: unusableHash,
        status: 'DISABLED',
      },
    });

    return { deletedBusinessIds };
  }, {
    // Prisma's default is 5 seconds, and the cascade through a business with
    // months of transactions, attendance and orders behind it can take longer.
    // Timing out half-way would roll back cleanly, but the person would be told
    // their account could not be deleted for a reason that is ours.
    timeout: 60000,
  });
}

module.exports = { deleteAccount, DELETED_EMAIL_DOMAIN };
