/**
 * Who is allowed to do what, as data.
 *
 * Authorization used to be a role *name* checked at the point of use:
 * `requireRole('OWNER', 'ADMIN')` written out 27 times, plus four hand-written
 * checks. Three of those four were deny-lists — `if (role === 'STAFF') return
 * false` — which fail CLOSED for the roles that existed and fail OPEN for any
 * role added later. A DELIVERY_AGENT is not STAFF, so it would have fallen
 * straight through and read every colleague's HR record.
 *
 * So the question code asks is now "does this membership hold
 * `staff:viewOthers`?" rather than "is this role one of these strings?".
 * Default-deny: a capability nobody was granted is denied.
 *
 * --------------------------------------------------------------------------
 * THIS FILE MUST NOT REQUIRE ANYTHING.
 * --------------------------------------------------------------------------
 * `frontend/scripts/check-permission-parity.js` does a bare `require()` of this
 * file from the *frontend's* node process, exactly the way
 * check-error-parity.js loads errors/catalog.js. That only works because the
 * error catalog imports nothing. Adding `require('../config/db')` or
 * `require('../errors')` here makes the parity script try to boot Prisma from
 * inside frontend/ and the CI gate dies with an unrelated error.
 *
 * The English below is a description for humans reading this file and for the
 * parity script's output. It is NEVER sent to a client — a refused request is
 * still `fail('PERMISSION_DENIED', 403)`, rendered from the error catalog and
 * translated on the device like every other message.
 */

// Capability names read `resource:action`. The colon rather than a dot is
// deliberate: these strings end up in log lines and in an ApiError's params,
// next to i18n keys like `errors.api.PERMISSION_DENIED`, and a dot would make
// them look like translation paths they are not.
const CAPABILITIES = {
  // --- Business, branches and team ---
  'business:create':
    'Start another business under the same account. FRONTEND VISIBILITY ONLY — the POST /businesses endpoint is deliberately ungated, because it runs before the business exists and has no tenant to check a capability against. See the note in business.controller.js',
  'branch:create': 'Add a branch to the business',
  'branch:update': 'Change a branch: timezone, coordinates, punch-in geofence',
  'branch:allAccess':
    'Act across every branch without a BranchAccess row. This is the DATA scope only — see the note on staff:viewAllBranches',
  'team:view': 'See who belongs to this business, and the pending invites',
  'team:invite': "Invite someone and choose their role and branches",
  'team:revoke': "End someone's access, or withdraw a pending invite",
  'team:manageBranchAccess': "Widen or narrow which branches a member can reach",

  // --- Staff and attendance ---
  'staff:create': 'Add an employee record',
  'staff:update': 'Edit, deactivate or reactivate an employee record',
  'staff:viewOthers': "Read a colleague's employee record, not just your own",
  'staff:viewAllBranches':
    "Read any branch's employees. Deliberately SEPARATE from branch:allAccess: the warehouse desk ships to every branch and has no business reading their HR records",
  'staff:setPay': "Set or change someone's base salary",
  'attendance:markOthers': "Mark a colleague present, absent, half-day or on leave",
  'attendance:viewRoster': "See a branch's attendance roster for a day",
  'attendance:punchAnywhere':
    'Punch in and out away from any branch. For a job with no fixed location: the geofence is not applied, and in exchange the coordinates become REQUIRED rather than optional, so where and when is always on the record',

  // --- Payroll ---
  'payroll:view': "See generated payslips other than your own",
  'payroll:run': 'Generate, finalize and bulk-run payroll',

  // --- Configuration ---
  'workCalendar:manage': 'Change the weekly off and the holiday list — these set the payroll divisor',
  'dataSource:manage': 'Connect a data source and upload sales files',

  // --- Products (Task 3) ---
  'product:view': "See a branch's product catalog",
  'product:manage': 'Add, edit and deactivate products, and price them per branch',

  // --- Counter billing (Task 4) ---
  'counterOrder:create': 'Open a counter order and issue a token',
  'counterOrder:edit': 'Change a counter order after it was placed',
  'counterOrder:void': 'Void a counter order, removing it from the day’s sales',
  'counterOrder:closeDay': "Close a branch's day, after which its orders can no longer be edited",

  // --- Supply orders (Task 5) ---
  'supplyItem:view': 'See the raw-material catalog and what the warehouse charges for it',
  'supplyItem:manage': 'Add, price and withdraw raw material. The warehouse decides what it stocks, so a cashier who orders from the catalog deliberately cannot edit it',
  'supplyOrder:view':
    'See supply orders. WHAT is seen depends on the role and is enforced separately: the warehouse desk sees every branch (requirement 3), a delivery agent sees the run they are carrying, a cashier sees their own branches',
  'supplyOrder:create': 'Cart raw material and place an order on the warehouse; cancel it while the warehouse has not accepted it yet',
  'supplyOrder:fulfil':
    'Accept, pack and dispatch a supply order; hand it to a delivery agent and see who is free to take it; verify its payment; reject one the warehouse cannot fill',
  'supplyOrder:deliver': 'Carry a supply order and mark it delivered',
  'supplyOrder:delay': 'Post a delay against an order, with a reason',

  // --- Expenses (Task 6) ---
  'expense:log': "Record what a branch spent, by category",
  'expense:viewAllBranches':
    "See every branch's expenses, and which ones have logged nothing today",

  // --- Analytics and export (Tasks 8, 9) ---
  'analytics:viewBranch': "See a branch's own sales, costs and totals",
  'analytics:viewBusiness': 'See every branch compared, month by month, with net profit',
  'export:dayEnd': "Export everything entered on a given day",
  'export:monthEnd': "Export everything entered in a given month",
};

const ALL = Object.keys(CAPABILITIES);

// Requirement 14: "manager will also have all the access that admin has".
// MANAGER is therefore DERIVED from ADMIN rather than copied, so a capability
// added to one reaches the other automatically and the two cannot silently
// drift. The exclusion lists are the seam for narrowing either role, in one
// visible place.
//
// MANAGER is NOT free of limits — it just has no *capability* limits. The
// record-level rule in business.service.js stops a manager revoking the admin
// or owner who issued their account, the same way an admin already cannot
// revoke the owner.
// `attendance:punchAnywhere` is the first entry either of these has ever had,
// and it is an exemption rather than a privilege — which is why an admin does
// NOT get it by holding everything else. It exists for a job with no fixed
// place of work, and it comes with a cost: coordinates stop being optional. An
// admin forced to supply a location before every punch would be paying that
// cost for a job that happens at a desk, and they can already record their own
// attendance directly through `attendance:markOthers`.
//
// `business:create` is here because starting a NEW business is the owner's act,
// not a delegated one: an admin runs the business they were given, and this is
// the one entry in Settings that is about the account rather than about the
// business being administered. Excluding it here is what makes "owner only"
// true without anyone checking a role name.
const ADMIN_EXCLUDES = new Set(['attendance:punchAnywhere', 'business:create']);
const MANAGER_EXCLUDES = new Set([]);

const ADMIN = ALL.filter((capability) => !ADMIN_EXCLUDES.has(capability));
const MANAGER = ADMIN.filter((capability) => !MANAGER_EXCLUDES.has(capability));

const ROLE_CAPABILITIES = {
  // The only wildcard, and the one place implicit grant is right: a new
  // capability reaches the owner by default because it is their business. It
  // reaches nobody else until someone writes it down.
  OWNER: '*',

  ADMIN,
  MANAGER,

  // The central order desk. All-branch DATA scope, because it ships to every
  // branch — but deliberately none of the staff:* capabilities. This split is
  // the entire reason branch:allAccess and staff:viewAllBranches are two
  // capabilities and not one; collapsing them hands the order desk every
  // branch's HR records.
  WAREHOUSE: [
    'branch:allAccess',
    // The desk owns the raw-material catalog: it is the thing being shipped,
    // and its prices are what the warehouse charges.
    'supplyItem:view',
    'supplyItem:manage',
    'supplyOrder:view',
    'supplyOrder:fulfil',
    'supplyOrder:delay',
    // Requirement 10: the back-office person calls the branches that have not
    // logged today's expenses, so they need to see which ones those are.
    'expense:viewAllBranches',
  ],

  // The branch operator. Branch-scoped: everything here is limited to the
  // branches their BranchAccess rows grant, enforced separately.
  //
  // Requirement 14 gives a cashier staff:setPay, which used to be OWNER/ADMIN
  // only. It deliberately does NOT give them payroll:run — the requirement says
  // a cashier decides the salary, not that they generate the payslips. If that
  // turns out to be half a feature in use, payroll:run is the line to add.
  CASHIER: [
    'counterOrder:create',
    'counterOrder:edit',
    'counterOrder:void',
    'counterOrder:closeDay',
    // Orders from the catalog and tracks what happens next (requirement 11),
    // but does not get supplyItem:manage — the warehouse sets the prices it
    // is charging.
    'supplyItem:view',
    'supplyOrder:view',
    'supplyOrder:create',
    'expense:log',
    'staff:create',
    'staff:update',
    'staff:viewOthers',
    'staff:setPay',
    'attendance:markOthers',
    'attendance:viewRoster',
    'product:view',
    'product:manage',
    'analytics:viewBranch',
    'export:dayEnd',
    'export:monthEnd',
  ],

  // Carries orders to EVERY branch, so this role is business-wide, not
  // branch-scoped: `branch:allAccess` is what puts every branch's dispatched
  // order in their queue instead of only the ones they were granted.
  //
  // It is the DATA scope and nothing more. Deliberately no `staff:*` here —
  // the same split that keeps the warehouse desk out of HR records keeps a
  // delivery agent out of them. `supplyOrder:view` is narrowed to the run they
  // are actually carrying by the query itself, not by this list.
  //
  // Their work has no fixed location, so they punch from wherever they are and
  // the coordinates are recorded in place of a geofence.
  DELIVERY_AGENT: [
    'branch:allAccess',
    'attendance:punchAnywhere',
    'supplyOrder:view',
    'supplyOrder:deliver',
    'supplyOrder:delay',
  ],

  // Own attendance and own payslips only. Those are reached by self-checks
  // ("is this my own record?"), not by capabilities, which is why this list is
  // empty rather than containing a `self:*` family.
  STAFF: [],
};

module.exports = { CAPABILITIES, ROLE_CAPABILITIES };
