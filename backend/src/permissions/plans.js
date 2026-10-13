/**
 * What each subscription plan unlocks, as data (requirement 28, Task 13).
 *
 * A plan is a SECOND allow-list beside the role matrix in ./catalog. What
 * somebody may do is what their role holds AND what their business's plan
 * unlocks — `tenantCan` in ./index asks both — so an owner's `'*'` is narrowed by
 * the plan like everyone else's. Nothing anywhere asks "is this business on
 * Growth?": code asks for a capability, and the plan is one of the two places
 * that answer it.
 *
 * Prices are deliberately NOT here. The app knows plan codes and what each one
 * unlocks; what a plan costs is a commercial decision recorded in
 * Docs/REQUIREMENTS.md R28, and changing it must never need a release.
 *
 * --------------------------------------------------------------------------
 * THIS FILE MAY REQUIRE ./catalog AND NOTHING ELSE.
 * --------------------------------------------------------------------------
 * `frontend/scripts/check-permission-parity.js` loads it from the frontend's
 * node process to compare it with the mirror in matrix.json, exactly as it
 * loads the catalog. ./catalog requires nothing, so this stays loadable there;
 * a `require('../config/db')` here would make that CI gate try to boot Prisma.
 */
const { CAPABILITIES } = require('./catalog');

/**
 * Starter: running one or more shops — the till, the catalog, the team, the
 * staff and their pay, what was spent, each branch's own figures, and exports.
 *
 * An explicit list rather than "everything except", so a capability added
 * later lands on the top plan only until somebody decides it belongs lower.
 * That is the same fail-closed default the role matrix has, for the same
 * reason: an unconsidered grant is the mistake that costs something.
 */
const STARTER = [
  'business:create',
  'branch:create',
  'branch:update',
  'branch:allAccess',
  'team:view',
  'team:invite',
  'team:revoke',
  'team:manageBranchAccess',
  'staff:create',
  'staff:update',
  'staff:viewOthers',
  'staff:viewAllBranches',
  'staff:setPay',
  'attendance:markOthers',
  'attendance:viewRoster',
  'attendance:punchAnywhere',
  'payroll:view',
  'payroll:run',
  'workCalendar:manage',
  'dataSource:manage',
  'product:view',
  'product:manage',
  'counterOrder:create',
  'counterOrder:edit',
  'counterOrder:void',
  'counterOrder:closeDay',
  'expense:view',
  'expense:log',
  'analytics:viewBranch',
  'export:dayEnd',
  'export:monthEnd',
  // Every plan can see its own bill, or a lapsed Starter owner could not find
  // out why the app had gone read-only.
  'billing:manage',
];

/**
 * Growth: a central warehouse supplying the branches — the raw-material
 * catalog, ordering, the desk, delivery, confirming a branch's payment reached
 * the warehouse — and the owner's view across every branch.
 *
 * `paymentAccount:manage` is here, not on Franchise, because a franchise (FM)
 * branch pays the warehouse by UPI (requirement 26) and somebody has to be able
 * to set the warehouse's UPI ID. Vendors' UPI IDs are reached only through the
 * vendor routes, which the `vendors` feature below keeps on Franchise.
 *
 * `supplyOrder:receive` is here too. Receiving is how a vendor order ends; if it
 * were Franchise-only, a business that made vendor orders during its trial and
 * then chose Growth would have orders in flight that nobody could ever close.
 * Creating vendors is what Franchise keeps, not finishing what is already open.
 */
const GROWTH = [
  ...STARTER,
  'supplyItem:view',
  'supplyItem:manage',
  'supplyOrder:view',
  'supplyOrder:create',
  'supplyOrder:fulfil',
  'supplyOrder:deliver',
  'supplyOrder:delay',
  'supplyOrder:receive',
  'supplyPayment:verify',
  'paymentAccount:manage',
  'expense:viewAllBranches',
  'analytics:viewBusiness',
];

// Franchise holds every capability, as OWNER does in the role matrix: a
// capability added later reaches the top plan by default and no lower one.
const PLAN_CAPABILITIES = {
  STARTER,
  GROWTH,
  FRANCHISE: '*',
};

/**
 * Gates no capability can express, because the same capability covers both the
 * plan-limited and the unlimited case.
 *
 * - `vendors`: adding or editing a third-party vendor, or naming one as an
 *   item's supplier. Vendors otherwise sit under `supplyItem:manage`, which
 *   Growth's warehouse desk needs for its own stock.
 * - `focoBranches`: making a branch company-operated. Its orders are paid by
 *   accounts (`supplyPayment:settle`), which only Franchise holds, so a FOCO
 *   branch on a lower plan would place orders nobody could pay for.
 *
 * Checked where the request names them, never by removing anything that
 * already exists: a business that moves down a plan keeps its vendors and its
 * FOCO branches, and can no longer create more.
 */
const FEATURES = ['vendors', 'focoBranches'];

const PLAN_FEATURES = {
  STARTER: [],
  GROWTH: [],
  FRANCHISE: [...FEATURES],
};

/**
 * Which roles a business on each plan may invite.
 *
 * Names roles, as SINGLE_BRANCH_ROLE in ./catalog does, and for the same kind
 * of reason: it is a fact about what the plan contains — a Starter business has
 * no warehouse desk, so there is nobody to be one — not a permission check. It
 * is an allow-list, so a role added later is invitable on no plan until it is
 * written here, which is the safe direction. Members already in a business keep
 * their role when it moves down a plan; what their plan does not unlock simply
 * refuses, with a sentence saying so.
 */
const PLAN_ROLES = {
  STARTER: ['ADMIN', 'MANAGER', 'CASHIER', 'STAFF'],
  GROWTH: ['ADMIN', 'MANAGER', 'CASHIER', 'STAFF', 'WAREHOUSE', 'DELIVERY_AGENT'],
  FRANCHISE: ['ADMIN', 'MANAGER', 'CASHIER', 'STAFF', 'WAREHOUSE', 'DELIVERY_AGENT', 'ACCOUNTANT'],
};

// Cheapest first. The order is what "the cheapest plan that unlocks X" means
// when a refusal names the plan to move to.
const PLANS = ['STARTER', 'GROWTH', 'FRANCHISE'];

// A new business starts on the top plan for TRIAL_DAYS, so the owner has seen
// supply orders and net profit before choosing what to pay for. When a trial or
// a paid period ends, GRACE_DAYS of full access follow before the business goes
// read-only — nobody is locked out of their till on the day a payment fails.
const TRIAL_PLAN = 'FRANCHISE';
const TRIAL_DAYS = 30;
const GRACE_DAYS = 7;

// Fail at load, in every process that requires this file, rather than letting
// a typo deny a capability on one plan forever.
for (const [plan, held] of Object.entries(PLAN_CAPABILITIES)) {
  if (held === '*') continue;
  for (const capability of held) {
    if (!CAPABILITIES[capability]) {
      throw new Error(`Plan ${plan} unlocks unknown capability "${capability}" (permissions/plans.js)`);
    }
  }
}

module.exports = {
  PLANS,
  PLAN_CAPABILITIES,
  PLAN_FEATURES,
  PLAN_ROLES,
  FEATURES,
  TRIAL_PLAN,
  TRIAL_DAYS,
  GRACE_DAYS,
};
