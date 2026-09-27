import { roleHas } from './index';

/**
 * Where a person's attendance and payslip are filed — asked of the matrix.
 *
 * `StaffMember.branchId` is required, so every employee record names a
 * location. That location is **not** a permission: what someone may reach is
 * decided by their role. But it is not free-form either, because two things
 * read it:
 *
 *  - the payroll calendar, which takes the weekly off, the holidays and the
 *    geofence from that branch;
 *  - `listStaffMembers`, which hands a branch-scoped caller every employee
 *    record at their branches. A CASHIER holds `staff:viewOthers` **and**
 *    `staff:setPay`, so filing the warehouse desk at a shop puts the desk on
 *    that shop's roster with their salary visible to, and editable by, its
 *    cashier.
 *
 * So the question has three shapes, and which one is asked is read off the
 * capability matrix rather than off a role name.
 *
 * ## Why `supplyOrder:fulfil` draws the line, and not `branch:allAccess`
 *
 * The obvious test — "reaches every branch" — is wrong, and the attendance
 * suite says so out loud: *"the rider is employed by this branch, that is their
 * payroll home, but their work happens at every other branch."* A delivery
 * agent holds `branch:allAccess` and `attendance:punchAnywhere` precisely
 * because they have **no** fixed place of work, so any branch is a legitimate
 * payroll home for them and the app must not refuse one.
 *
 * What ties the warehouse desk to the warehouse is not reach, it is the work:
 * `supplyOrder:fulfil` is accepting, packing and dispatching goods, and
 * `supplyItem:manage` is stocking the shelves they come off. Those happen where
 * the goods are. So that capability is the test — the mirror image of the agent
 * picker in `supplyOrder.service.js`, which is `supplyOrder:deliver` **and not**
 * `supplyOrder:fulfil` for the same reason.
 *
 * ## The three shapes
 *
 *  - **`NONE`** — holds authority over people at every branch: the owner, an
 *    admin, a manager. They run the business rather than a place, so the screen
 *    does not ask; it states where the record will be filed.
 *  - **`PREMISES`** — runs the warehouse without that authority: the warehouse
 *    desk. Only a warehouse is offered.
 *  - **`ANY`** — everybody else, and anybody with no account at all. A cashier,
 *    a cook, a delivery agent. Every location is offered.
 *
 * Order matters: the owner, an admin and a manager hold *every* capability, so
 * `staff:viewAllBranches` is tested first. That is the `{ holds, unless }` shape
 * CLAUDE.md prescribes, and it stays an allow-list — a role added later that
 * runs a warehouse lands in `PREMISES` by itself, and one that does not is
 * simply unconstrained.
 */
export type StaffBaseQuestion = 'NONE' | 'PREMISES' | 'ANY';

export interface StaffBase {
  /** Which locations the screen offers, if it asks at all. */
  question: StaffBaseQuestion;
  /**
   * Whether this person's work covers every branch rather than one.
   *
   * Changes what the card *says* and which location it defaults to, never what
   * it allows — which is the distinction a delivery agent needs: the warehouse
   * is the base they would usually name, and a shop is still theirs to pick.
   */
  spansEveryBranch: boolean;
}

/**
 * @param role The membership role this person already holds in this business,
 *   or undefined when they have no account here — most staff never do, and
 *   somebody the screen cannot identify is asked the ordinary question.
 */
export function staffBase(role: string | undefined): StaffBase {
  if (!role) return { question: 'ANY', spansEveryBranch: false };

  const spansEveryBranch = roleHas(role, 'branch:allAccess');
  if (roleHas(role, 'staff:viewAllBranches')) return { question: 'NONE', spansEveryBranch };
  if (roleHas(role, 'supplyOrder:fulfil')) return { question: 'PREMISES', spansEveryBranch };
  return { question: 'ANY', spansEveryBranch };
}
