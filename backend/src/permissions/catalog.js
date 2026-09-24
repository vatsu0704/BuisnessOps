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
  'supplyOrder:create': 'Cart raw material and place an order on the warehouse',
  'supplyOrder:fulfil': 'Accept, pack and dispatch a supply order; verify its payment',
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
// drift. Both exclusion lists are deliberately empty today; they exist as the
// seam for narrowing either role later, in one visible place.
//
// MANAGER is NOT free of limits — it just has no *capability* limits. The
// record-level rule in business.service.js stops a manager revoking the admin
// or owner who issued their account, the same way an admin already cannot
// revoke the owner.
const ADMIN_EXCLUDES = new Set([]);
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

  DELIVERY_AGENT: ['supplyOrder:deliver', 'supplyOrder:delay'],

  // Own attendance and own payslips only. Those are reached by self-checks
  // ("is this my own record?"), not by capabilities, which is why this list is
  // empty rather than containing a `self:*` family.
  STAFF: [],
};

module.exports = { CAPABILITIES, ROLE_CAPABILITIES };
