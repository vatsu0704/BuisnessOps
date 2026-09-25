/*
  A warehouse is a location too.

  Requirement 23: a warehouse employee has to be able to punch in and out, and
  attendance is keyed on a branch. Before this there was nowhere to file them —
  the only locations a business had were the places it sells from.

  Modelled as a KIND on Branch rather than as its own table, deliberately.
  Attendance, geofencing, payroll, rosters and staff records are every one of
  them already keyed on `branchId`; a separate Warehouse table would mean
  teaching all five about a second kind of place, and would leave a warehouse
  with no geofence on the day it was created. As a Branch it works immediately,
  and what it may NOT do — take counter orders, or order raw material from
  itself — is enforced in the two services where goods move.

  The column defaults to BRANCH, so every location that already exists stays
  exactly what it was. There is no backfill.

  Creating the type and using its value as a default in the same transaction is
  fine: Postgres only refuses that for values ADDED to an existing type, which
  is what 20260923171027_operations_roles and
  20260925104500_supply_assignment_and_branch_address both had to work around.
*/

-- CreateEnum
CREATE TYPE "BranchKind" AS ENUM ('BRANCH', 'WAREHOUSE');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "kind" "BranchKind" NOT NULL DEFAULT 'BRANCH';
