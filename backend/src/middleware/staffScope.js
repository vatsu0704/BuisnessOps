const { roleHas } = require('../permissions');

/**
 * Who may see or manage a given StaffMember row.
 *
 * Closes a real hole: `GET /staff/:id/attendance` and the branch roster used to
 * gate on `req.branchAccess` alone. BranchAccess grants scope over a branch's
 * *business data* — it was never meant to be permission to read a colleague's
 * HR record. A STAFF-role membership that happened to carry BranchAccess rows
 * could therefore read every colleague's attendance in that branch. The
 * existing tests never caught it because their STAFF fixture is created with no
 * branchIds, so `req.branchAccess` is `[]` and the check failed by accident.
 *
 * `ctx` is `{ role, branchAccess, userId }`, i.e. `req.tenant.role`,
 * `req.branchAccess` and `req.userId`.
 *
 * ---------------------------------------------------------------------------
 * These checks used to be DENY-lists: `if (ctx.role === 'STAFF') return false`.
 * That is safe only while STAFF is the only role that should be refused. The
 * moment MembershipRole grew, every unnamed role — DELIVERY_AGENT, WAREHOUSE —
 * fell straight through to the `branchAccess === null` line and was granted
 * business-wide authority over people. A deny-list fails OPEN.
 *
 * They are allow-lists off the capability matrix now, so a role holds these
 * rights only by being written down as holding them.
 * ---------------------------------------------------------------------------
 */
/**
 * Authority over the PEOPLE at a branch — the second meaning of what used to be
 * the single `branchAccess === null` sentinel.
 *
 * `staff:viewAllBranches` is business-wide authority over people.
 * `branch:allAccess` (which drives the sentinel) is all-branch scope over data.
 * WAREHOUSE holds the second and not the first, which is exactly why this is
 * its own function rather than a null check inlined four times.
 *
 * The `!== null` guard is load-bearing. Before the split, a role with
 * branchAccess === null always returned true above, so the `.includes` line was
 * unreachable with null. WAREHOUSE now reaches it, and `.includes` on null is a
 * TypeError — a 500 where a 403 belongs.
 */
function hasBranchAuthority(ctx, branchId) {
  if (roleHas(ctx.role, 'staff:viewAllBranches')) return true;
  return ctx.branchAccess !== null && ctx.branchAccess.includes(branchId);
}

function canViewStaffMember(ctx, staffMember) {
  // Your own record, always — this is what lets the self-service screens reuse
  // the manager-facing routes.
  if (staffMember.userId && staffMember.userId === ctx.userId) return true;
  if (!roleHas(ctx.role, 'staff:viewOthers')) return false;
  return hasBranchAuthority(ctx, staffMember.branchId);
}

/** Editing, deactivating or reactivating an employee record. */
function canManageStaffMember(ctx, staffMember) {
  if (!roleHas(ctx.role, 'staff:update')) return false;
  return hasBranchAuthority(ctx, staffMember.branchId);
}

/**
 * Marking someone else's attendance.
 *
 * Separate from canManageStaffMember, which it used to share. Marking a day is
 * not editing an employee record, and requirement 14's cashier does the first
 * far more often than the second — gating attendance on `staff:update` would
 * tie two permissions together that a business may well want apart.
 */
function canMarkAttendanceFor(ctx, staffMember) {
  if (!roleHas(ctx.role, 'attendance:markOthers')) return false;
  return hasBranchAuthority(ctx, staffMember.branchId);
}

/**
 * Seeing payslips that are not your own.
 *
 * This used to be `role === 'OWNER' || role === 'ADMIN'` and did double duty as
 * the gate on setting someone's pay. Those are two different permissions and
 * requirement 14 pulls them apart: a CASHIER sets their branch's salaries but
 * does not run payroll. They are two capabilities now — and as a side effect
 * the comment in payroll.controller.js claiming "MANAGER can now be allowed
 * through" finally becomes true, which it was not before.
 */
function canViewPayroll(ctx) {
  return roleHas(ctx.role, 'payroll:view');
}

/** Setting or changing a base salary. Requirement 14 gives this to CASHIER. */
function canSetPay(ctx) {
  return roleHas(ctx.role, 'staff:setPay');
}

/**
 * Is this branch inside the caller's scope?
 *
 * Replaces `req.tenant.role === 'MANAGER' && ...` in staff.controller, which
 * named one role and therefore skipped the containment check entirely for every
 * other branch-scoped role — a CASHIER could have created staff in a branch
 * they had no access to. Keyed on the scope itself, it holds for any role.
 */
function canReachBranch(ctx, branchId) {
  return ctx.branchAccess === null || ctx.branchAccess.includes(branchId);
}

/** Convenience for controllers, which all build the same shape. */
function scopeOf(req) {
  return { role: req.tenant.role, branchAccess: req.branchAccess, userId: req.userId };
}

module.exports = {
  canViewStaffMember,
  canManageStaffMember,
  canMarkAttendanceFor,
  canViewPayroll,
  canSetPay,
  canReachBranch,
  scopeOf,
};
