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
 */
function canViewStaffMember(ctx, staffMember) {
  // Your own record, always — this is what lets the self-service screens reuse
  // the manager-facing routes.
  if (staffMember.userId && staffMember.userId === ctx.userId) return true;
  // The hole, closed: STAFF sees nobody but themself, whatever branches they
  // have data access to.
  if (ctx.role === 'STAFF') return false;
  // OWNER / ADMIN — business-wide by definition.
  if (ctx.branchAccess === null) return true;
  // MANAGER — only their own branches.
  return ctx.branchAccess.includes(staffMember.branchId);
}

/** Managing (marking attendance, editing, payroll) is never a STAFF action. */
function canManageStaffMember(ctx, staffMember) {
  if (ctx.role === 'STAFF') return false;
  if (ctx.branchAccess === null) return true;
  return ctx.branchAccess.includes(staffMember.branchId);
}

/** Pay figures are OWNER/ADMIN-only; a MANAGER runs attendance, not payroll. */
function canViewPayroll(ctx) {
  return ctx.role === 'OWNER' || ctx.role === 'ADMIN';
}

/** Convenience for controllers, which all build the same shape. */
function scopeOf(req) {
  return { role: req.tenant.role, branchAccess: req.branchAccess, userId: req.userId };
}

module.exports = { canViewStaffMember, canManageStaffMember, canViewPayroll, scopeOf };
