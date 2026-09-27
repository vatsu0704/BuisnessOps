/*
  The warehouse desk hands a run to a delivery agent, and the agent is told
  where to take it.

  Two unrelated-looking changes, in one migration because they are one feature:
  the desk assigns, and the person assigned needs the address.

  1. SupplyOrderEventType gains ASSIGNMENT. "This run is now Ravi's" is not a
     STATUS_CHANGE — handing a run to a different agent moves nothing along the
     status machine, and recording it as one would put a row in the order's
     timeline claiming a transition that never happened. The event's `note`
     carries the agent's NAME, snapshotted the way an order line snapshots its
     item name, so the history still reads correctly after that person is
     renamed or leaves.

     NOTHING HERE USES THE NEW VALUE. Postgres allows ALTER TYPE ... ADD VALUE
     inside a transaction (PG12+) but refuses to let the value be USED in that
     same transaction, and Prisma Migrate wraps each migration file in one — so
     any later data work writing 'ASSIGNMENT' into a row needs its own migration
     directory after this one. There is none today, which is why this is one
     file. See 20260923171027_operations_roles for the same note about roles.

  2. branches gains addressLine and postalCode. city/region/country describe
     where a branch IS, for reporting; they are not an address anybody can ride
     to. addressLine is free text and multi-line on purpose — an Indian address
     is not a fixed set of fields, and forcing one drops the half that actually
     finds the place ("behind the old post office").

     Both nullable: every branch that already exists has neither, and a branch
     whose own staff know where it is never needs one. A delivery order to a
     branch with no address shows "No address saved for this branch" rather
     than failing.
*/

-- AlterEnum
ALTER TYPE "SupplyOrderEventType" ADD VALUE 'ASSIGNMENT';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "postalCode" TEXT;
