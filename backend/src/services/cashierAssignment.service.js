const prisma = require('../config/db');
const { fail } = require('../errors');
const { SINGLE_BRANCH_ROLE } = require('../permissions');

/**
 * Requirement 18 — one cashier per branch, one branch per cashier.
 *
 * "Admin should assign only one branch to one cashier. Two cashiers in one
 * branch is not possible. Yes, admin can switch to another cashier for that
 * branch."
 *
 * ## Why this is a service and not a validator
 *
 * Every other rule in `validations/` is a fact about the request body — a
 * missing field, a number out of range — and can be decided without touching
 * the database. This one is a fact about the *world*: whether some other person
 * currently holds the branch. Two admins pressing Assign at the same moment
 * both see a free branch, and both write. So the rule has to be enforced where
 * the write happens, inside the transaction that makes it, which is here.
 *
 * The validator still pre-empts the part it can see (a cashier invited with no
 * branch, or with two) so the common mistake is caught before an invite is
 * created. That is a convenience; this is the guarantee.
 *
 * ## Three doors into the same room
 *
 * A BranchAccess row for a cashier can be written from three places, and all
 * three go through `business.service.js:addBranchAccess`, which calls this:
 *
 *  1. **the invite** — an admin invites a cashier and names their branch;
 *  2. **the claim** — a cashier who had no account signs up later, and
 *     `claimPendingInvites` grants what the invite promised;
 *  3. **the branch-access edit** — an admin moves an existing cashier.
 *
 * Door 2 is the interesting one, because nobody is present to be asked. The
 * branch was free when the invite was written and may be taken by the time the
 * invitee signs up, possibly months later. Stealing it from whoever holds it
 * now would be exactly what the requirement forbids ("reported, not silently
 * rewritten"), and refusing the signup would lock someone out of their own
 * account over an admin's scheduling problem. So the claim grants the
 * membership and skips the branch, leaving a cashier with no branch — a state
 * the app names explicitly — and the conflict surfaces in `listCashierConflicts`
 * for an admin to settle.
 *
 * ## Naming a role, deliberately
 *
 * `SINGLE_BRANCH_ROLE` comes from the permission matrix and is the one place in
 * this codebase that acts on a role name. The header on `permissions/catalog.js`
 * explains why that is not the anti-pattern it resembles: this asks "which role
 * is structurally limited to one branch?", not "may this role do X?", and a role
 * added later is simply unconstrained, which fails safe.
 */

/**
 * Take a row lock on the two rows the invariant is about, so concurrent
 * assignments serialise instead of both reading a free branch.
 *
 * The project's second deliberate raw query, and for a reason Prisma has no API
 * for: there is no partial unique index that could express this. The constraint
 * is "at most one ACTIVE BranchAccess row per branch **whose membership's role
 * is CASHIER**", and the role lives on `memberships`, not on `branch_access` —
 * a Postgres unique index cannot reach across the join. `SELECT … FOR UPDATE`
 * on the branch is what makes the check-then-write atomic, and it costs a
 * primary-key lookup.
 *
 * Both rows are locked, always in this order — membership, then branch — so two
 * assignments that touch the same pair cannot deadlock by taking them in
 * opposite orders. The branch lock is what stops two cashiers landing on one
 * branch; the membership lock is what stops one cashier landing on two.
 *
 * No `::uuid` cast, unlike the token allocator next door: Prisma maps
 * `String @id @default(uuid())` to a **text** column, so the allocator's cast
 * survives only because an INSERT assignment-casts uuid to text. In a comparison
 * there is no `text = uuid` operator at all, and the query fails outright.
 */
async function lockForAssignment(tx, membershipId, branchId) {
  await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${membershipId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM branches WHERE id = ${branchId} FOR UPDATE`;
}

/** What to call someone in a message. The name if they gave one, else the email. */
const personName = (user) => user.name || user.email;

const HOLDER_INCLUDE = {
  membership: { include: { user: { select: { id: true, name: true, email: true } } } },
  branch: { select: { id: true, name: true, code: true } },
};

/**
 * The cashier currently holding this branch, if any.
 *
 * ACTIVE memberships only, and that matters: `revokeMembership` deliberately
 * leaves BranchAccess rows in place so re-inviting someone restores the scope
 * they had. A revoked cashier's row must therefore not keep their old branch
 * occupied forever — the branch is free the moment they lose access.
 */
function cashierHolding(client, businessId, branchId, exceptMembershipId = null) {
  return client.branchAccess.findFirst({
    where: {
      branchId,
      membership: {
        businessId,
        role: SINGLE_BRANCH_ROLE,
        status: 'ACTIVE',
        ...(exceptMembershipId ? { id: { not: exceptMembershipId } } : {}),
      },
    },
    include: HOLDER_INCLUDE,
  });
}

/** Every branch this membership already holds, except the one being assigned. */
function branchesHeldBy(client, membershipId, exceptBranchId) {
  return client.branchAccess.findMany({
    where: { membershipId, ...(exceptBranchId ? { branchId: { not: exceptBranchId } } : {}) },
    include: HOLDER_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Decide whether this assignment may go ahead, and what has to be given up for
 * it to hold. Returns the BranchAccess rows to delete.
 *
 * `confirmed` is the admin having been told and having said yes. Both refusals
 * are 409 rather than 400 or 403: nothing about the request is malformed and
 * nothing about the caller is unauthorised — the world is in a state that
 * conflicts with it, and the same request repeated after a confirmation
 * succeeds. That is what 409 means.
 *
 * The messages carry the blocker's **name** as a param, never baked into the
 * sentence, because the admin's next action depends on knowing who is being
 * displaced (requirement 19). It leaks nothing: an admin who can assign
 * branches can already list the whole team.
 */
async function planAssignment(tx, { businessId, membership, branch, confirmed = false }) {
  if (membership.role !== SINGLE_BRANCH_ROLE) return { release: [] };

  await lockForAssignment(tx, membership.id, branch.id);

  // Sequential, not Promise.all: these run on an interactive transaction client,
  // which is one connection, so concurrency buys nothing and only makes the order
  // of two statements inside a locked transaction less obvious than it should be.
  const holder = await cashierHolding(tx, businessId, branch.id, membership.id);
  const alreadyHeld = await branchesHeldBy(tx, membership.id, branch.id);

  if (!confirmed) {
    // The occupied branch is reported first, because it is the refusal that is
    // about somebody else. `currentBranch` rides along when the move also
    // vacates a branch, so one confirmation can state both consequences — the
    // app renders the second clause from its own key rather than the server
    // composing a two-clause sentence it cannot translate.
    if (holder) {
      throw fail('BRANCH_ALREADY_HAS_CASHIER', 409, {
        branch: branch.name,
        cashier: personName(holder.membership.user),
        ...(alreadyHeld.length ? { currentBranch: alreadyHeld.map((a) => a.branch.name).join(', ') } : {}),
      });
    }
    if (alreadyHeld.length) {
      throw fail('CASHIER_ALREADY_HAS_BRANCH', 409, {
        branch: branch.name,
        currentBranch: alreadyHeld.map((a) => a.branch.name).join(', '),
      });
    }
  }

  // Everything the assignment displaces, deleted in the same transaction as the
  // grant — so there is never an instant with two cashiers on a branch, and
  // never one with a cashier holding none.
  return { release: [...(holder ? [holder] : []), ...alreadyHeld] };
}

/**
 * Door 2's softer question: may this claim take the branch its invite named?
 *
 * Returns the branch ids that are still free. No throw, because the caller is
 * in the middle of creating somebody's account.
 */
async function claimableBranchIds(tx, businessId, membership, branchIds) {
  if (membership.role !== SINGLE_BRANCH_ROLE) return branchIds;
  // An invite for a cashier carries exactly one branch (the validator enforces
  // it), but an invite written before this rule existed may carry several. Take
  // the first that is free and drop the rest, rather than granting two.
  for (const branchId of branchIds) {
    const holder = await cashierHolding(tx, businessId, branchId, membership.id);
    if (!holder) return [branchId];
  }
  return [];
}

/**
 * Drop a single-branch member's BranchAccess rows before a fresh grant.
 *
 * For the re-invite path only. `revokeMembership` deliberately leaves
 * BranchAccess rows in place so re-inviting somebody restores the scope they
 * had — which is right for a manager or a staff member and wrong for a cashier,
 * whose "scope" is one branch that the re-invite is explicitly naming. Without
 * this, re-inviting a revoked cashier to a *different* branch would be refused
 * for conflicting with a branch they do not currently hold: `cashierHolding`
 * filters on ACTIVE, so the row was occupying nothing.
 *
 * Not a silent rewrite. An admin has just typed this person's email and chosen
 * their branch; that is the decision, and the comment on the re-invite path
 * already said so — "re-adding someone is a fresh decision about their access,
 * not an undo".
 */
async function clearBranches(tx, membership) {
  if (membership.role !== SINGLE_BRANCH_ROLE) return;
  await tx.branchAccess.deleteMany({ where: { membershipId: membership.id } });
}

/**
 * Memberships that already break the rule.
 *
 * Requirement 18 is explicit that these are **reported, not silently
 * rewritten**: an admin decides who keeps which branch, because the app cannot
 * know which cashier is the one still turning up. Two shapes of conflict, and a
 * branch with two cashiers is the one that needs settling — a cashier with no
 * branch is a real, recoverable state rather than damage.
 *
 * Computed on demand, like `listExpenseCompliance`, so it is exact at the
 * moment the admin reads it rather than as of some snapshot.
 */
async function listCashierConflicts(businessId) {
  const rows = await prisma.branchAccess.findMany({
    where: { membership: { businessId, role: SINGLE_BRANCH_ROLE, status: 'ACTIVE' } },
    include: HOLDER_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });

  const cashiers = await prisma.membership.findMany({
    where: { businessId, role: SINGLE_BRANCH_ROLE, status: 'ACTIVE' },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  });

  const byBranch = new Map();
  const byMembership = new Map();
  for (const row of rows) {
    if (!byBranch.has(row.branchId)) byBranch.set(row.branchId, { branch: row.branch, cashiers: [] });
    byBranch.get(row.branchId).cashiers.push({
      membershipId: row.membershipId,
      name: row.membership.user.name,
      email: row.membership.user.email,
    });
    byMembership.set(row.membershipId, (byMembership.get(row.membershipId) ?? 0) + 1);
  }

  return {
    // More than one cashier on one branch.
    sharedBranches: [...byBranch.values()].filter((entry) => entry.cashiers.length > 1),
    // A cashier holding none, or more than one.
    misassignedCashiers: cashiers
      .map((membership) => ({
        membershipId: membership.id,
        name: membership.user.name,
        email: membership.user.email,
        branchCount: byMembership.get(membership.id) ?? 0,
      }))
      .filter((entry) => entry.branchCount !== 1),
  };
}

module.exports = {
  SINGLE_BRANCH_ROLE,
  planAssignment,
  clearBranches,
  claimableBranchIds,
  cashierHolding,
  listCashierConflicts,
};
