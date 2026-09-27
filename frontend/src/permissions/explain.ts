import i18n from '@/i18n';
import matrix from './matrix.json';
import { CAPABILITIES, ROLES, roleHas, type Capability, type Role } from './index';

/**
 * Requirement 19 — a refusal says what the rule is, not that a rule exists.
 *
 * The server sends `PERMISSION_DENIED` with `{ capability }` and no prose, which
 * is the only thing it can honestly do: it does not know which of the four
 * languages this device is set to. What it *has* sent is enough to build the
 * whole sentence here, because the app already mirrors the capability matrix —
 * so from one capability string this file can say what the refused action is and
 * which roles hold it, and "Insufficient permissions" becomes "Only the
 * warehouse desk can accept, pack and dispatch a supply order."
 *
 * ## The action names are a Record, not a lookup
 *
 * `ACTION_KEYS` is a `Record<Capability, …>`, so adding a capability to the
 * backend catalog fails `tsc` here until somebody writes its sentence — the same
 * trick `ROLE_ICONS` uses on the invite screen. The alternative is a map that
 * silently returns undefined and shows somebody a refusal that explains nothing,
 * which is the exact defect this requirement exists to fix.
 *
 * ## Why the i18n keys are not the capability strings
 *
 * A capability reads `supplyOrder:fulfil`, and i18next treats `:` as its
 * namespace separator — `t('permissions.actions.supplyOrder:fulfil')` would be
 * parsed as the key `fulfil` in a namespace called `permissions.actions.supplyOrder`
 * and quietly resolve to nothing. So the keys are camelCase and this Record is
 * the mapping. It is also why `CLAUDE.md` says the colon was chosen to stop these
 * strings looking like translation paths: they are not.
 */

type ActionKey = `permissions.actions.${string}`;

const ACTION_KEYS: Record<Capability, ActionKey> = {
  'business:create': 'permissions.actions.businessCreate',
  'branch:create': 'permissions.actions.branchCreate',
  'branch:update': 'permissions.actions.branchUpdate',
  'branch:allAccess': 'permissions.actions.branchAllAccess',
  'team:view': 'permissions.actions.teamView',
  'team:invite': 'permissions.actions.teamInvite',
  'team:revoke': 'permissions.actions.teamRevoke',
  'team:manageBranchAccess': 'permissions.actions.teamManageBranchAccess',
  'staff:create': 'permissions.actions.staffCreate',
  'staff:update': 'permissions.actions.staffUpdate',
  'staff:viewOthers': 'permissions.actions.staffViewOthers',
  'staff:viewAllBranches': 'permissions.actions.staffViewAllBranches',
  'staff:setPay': 'permissions.actions.staffSetPay',
  'attendance:markOthers': 'permissions.actions.attendanceMarkOthers',
  'attendance:viewRoster': 'permissions.actions.attendanceViewRoster',
  'attendance:punchAnywhere': 'permissions.actions.attendancePunchAnywhere',
  'payroll:view': 'permissions.actions.payrollView',
  'payroll:run': 'permissions.actions.payrollRun',
  'workCalendar:manage': 'permissions.actions.workCalendarManage',
  'dataSource:manage': 'permissions.actions.dataSourceManage',
  'product:view': 'permissions.actions.productView',
  'product:manage': 'permissions.actions.productManage',
  'counterOrder:create': 'permissions.actions.counterOrderCreate',
  'counterOrder:edit': 'permissions.actions.counterOrderEdit',
  'counterOrder:void': 'permissions.actions.counterOrderVoid',
  'counterOrder:closeDay': 'permissions.actions.counterOrderCloseDay',
  'supplyItem:view': 'permissions.actions.supplyItemView',
  'supplyItem:manage': 'permissions.actions.supplyItemManage',
  'supplyOrder:view': 'permissions.actions.supplyOrderView',
  'supplyOrder:create': 'permissions.actions.supplyOrderCreate',
  'supplyOrder:fulfil': 'permissions.actions.supplyOrderFulfil',
  'supplyOrder:deliver': 'permissions.actions.supplyOrderDeliver',
  'supplyOrder:delay': 'permissions.actions.supplyOrderDelay',
  'expense:view': 'permissions.actions.expenseView',
  'expense:log': 'permissions.actions.expenseLog',
  'expense:viewAllBranches': 'permissions.actions.expenseViewAllBranches',
  'analytics:viewBranch': 'permissions.actions.analyticsViewBranch',
  'analytics:viewBusiness': 'permissions.actions.analyticsViewBusiness',
  'export:dayEnd': 'permissions.actions.exportDayEnd',
  'export:monthEnd': 'permissions.actions.exportMonthEnd',
};

/** Is this string one of the capabilities this build knows about? */
export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as string[]).includes(value);
}

/**
 * The roles that hold a capability, read off the mirrored matrix.
 *
 * Derived rather than written down, which is what makes the sentence stay true:
 * move a capability between roles in the backend catalog, regenerate the mirror,
 * and every refusal that mentions it says the new answer. An allow-list by
 * construction — a role added later appears here only if it was actually granted.
 */
export function rolesHolding(capability: Capability): Role[] {
  return ROLES.filter((role) => roleHas(role, capability));
}

/**
 * Requirement 18 — the role that is limited to a single branch.
 *
 * Mirrored from the backend catalog and compared by `lint:permissions`, so the
 * branch picker cannot offer a choice the server refuses. Typed as `Role` because
 * the gate proves it is one.
 */
export const SINGLE_BRANCH_ROLE = matrix.singleBranchRole as Role;

/**
 * The refusal, as a sentence: what the rule is, and whom to ask.
 *
 * Returns null for a capability this build has never heard of — an app older
 * than the server — so the caller falls back to the server's own English, which
 * is a true sentence in the wrong language rather than a guess in the right one.
 */
export function explainPermissionDenied(capability: unknown): string | null {
  if (!isCapability(capability)) return null;

  const action = i18n.t(ACTION_KEYS[capability] as 'errors.unexpected', { defaultValue: '' });
  if (!action) return null;

  const holders = rolesHolding(capability).map((role) => i18n.t(`role.${role}` as 'errors.unexpected'));
  // A capability nobody holds is a matrix mistake, not something to explain
  // away: say the action is not available rather than "only  can do it".
  if (!holders.length) return i18n.t('permissions.deniedNobody', { action });

  // No `count` here on purpose: passing one makes i18next look for a plural
  // variant of the key, and this sentence has none. The role list reads the same
  // however long it is.
  return i18n.t('permissions.denied', {
    action,
    roles: holders.join(i18n.t('permissions.roleJoin')),
  });
}
