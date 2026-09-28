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
 * ## The three shapes
 *
 *  - **`ANY`** — their work happens at one place, so the screen asks which:
 *    a cashier, a cook, a helper, and anybody with no account at all. Every
 *    location is offered and **nothing is preselected**, because filing someone
 *    at the wrong shop silently is worse than a tap.
 *  - **`PREMISES`** — the warehouse desk. Only a warehouse is offered.
 *  - **`NONE`** — everyone else whose work spans the business: the owner, an
 *    admin, a manager, a delivery agent. Asking them "which branch?" invites the
 *    reading that they belong to it, which is the defect this exists to fix, so
 *    the question is not asked at all — a line names where the record will be
 *    filed instead, because attendance and a payslip still have to land
 *    somewhere and hiding the choice must not hide the outcome.
 *
 * ## Which capabilities draw the lines
 *
 * `branch:allAccess` separates "works at a place" from "works across the
 * business" — CASHIER and STAFF hold it and nobody else does not, so it is
 * exactly the `ANY` boundary.
 *
 * Inside that, the warehouse desk is the one branch-spanning role with premises
 * of its own, and what ties it there is the **work** rather than the reach:
 * `supplyOrder:fulfil` is accepting, packing and dispatching goods, which
 * happens where the goods are. The owner, an admin and a manager hold every
 * capability, so `staff:viewAllBranches` — authority over people, which the desk
 * deliberately lacks — is what keeps them out of it. That is the mirror image of
 * the agent picker in `supplyOrder.service.js`, which is `supplyOrder:deliver`
 * **and not** `supplyOrder:fulfil` for the same reason.
 *
 * It stays an allow-list off the matrix with no role named anywhere, so a role
 * added later lands on the right side of each line by itself.
 */
export type StaffBaseQuestion = 'NONE' | 'PREMISES' | 'ANY';

/**
 * @param role The membership role this person already holds in this business,
 *   or undefined when they have no account here — most staff never do, and
 *   somebody the screen cannot identify is asked the ordinary question.
 */
export function staffBase(role: string | undefined): StaffBaseQuestion {
  if (!role || !roleHas(role, 'branch:allAccess')) return 'ANY';

  const runsTheWarehouse =
    roleHas(role, 'supplyOrder:fulfil') && !roleHas(role, 'staff:viewAllBranches');

  return runsTheWarehouse ? 'PREMISES' : 'NONE';
}
