/*
  Working-days payroll.

  Replaces the calendar-day salary divisor with a real work calendar: a weekly
  off per business (overridable per branch) plus a holiday table. Week-offs and
  holidays are paid by construction — they sit in neither the divisor nor the
  numerator — so someone present on every working day earns exactly their
  salary. Previously a person with Sundays off was paid about 87% of it.

  This file was hand-edited after generation. Prisma's three warnings are
  handled below rather than ignored:

  - `shifts` is dropped. It was never written to by any code path (verified 0
    rows); Attendance has always been the payroll record. A real rota feature
    would reintroduce it rather than overload Attendance.
  - salary_slips.branchId / baseSalary / workingDays were generated NOT NULL
    with no default, which fails on a non-empty table. They are added nullable,
    backfilled, then constrained — see the block below.
*/
-- DropForeignKey
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_branchId_fkey";

-- DropForeignKey
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_staffMemberId_fkey";

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "markedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "weeklyOffDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "weeklyOffOverride" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "unmarkedWorkingDayStatus" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
ADD COLUMN     "weeklyOffDays" INTEGER[] DEFAULT ARRAY[0]::INTEGER[];

-- AlterTable
-- Hand-edited: Prisma generated branchId/baseSalary/workingDays as NOT NULL
-- with no default, which fails outright on a non-empty salary_slips. Added
-- nullable, backfilled, then constrained.
--
-- The day buckets are deliberately left at 0 for pre-existing slips rather
-- than reconstructed. The attendance rows behind an old slip may since have
-- changed, so any "breakdown" invented here would be plausible and wrong; the
-- payslip renderer omits the breakdown table when every bucket is 0 and says
-- so in words instead.
ALTER TABLE "salary_slips" ADD COLUMN     "baseSalary" DECIMAL(12,2),
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "daysAbsent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "daysHalfDay" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "daysHoliday" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "daysLeave" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "daysPending" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "daysPresent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "daysWeeklyOff" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deductionNote" TEXT,
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "workingDays" DECIMAL(5,2);

-- Backfill: a slip's branch is its staff member's branch, and its basis is
-- that person's current salary. COALESCE guards a staff member whose
-- baseSalary was cleared after the slip was issued.
UPDATE "salary_slips" s
   SET "branchId"   = sm."branchId",
       "baseSalary" = COALESCE(sm."baseSalary", 0)
  FROM "staff_members" sm
 WHERE sm."id" = s."staffMemberId";

-- Reproduce the OLD calendar-day divisor for slips already issued. An
-- already-issued payslip must keep the arithmetic it was issued with, even
-- though every slip generated from here on uses working days instead.
UPDATE "salary_slips"
   SET "workingDays" = EXTRACT(DAY FROM (
         date_trunc('month', to_date("monthYear", 'YYYY-MM')) + INTERVAL '1 month - 1 day'))
 WHERE "workingDays" IS NULL;

-- Any slip whose staff member has since been deleted cannot be attributed to
-- a branch. There should be none (the FK cascades), but the constraint below
-- would fail obscurely rather than loudly, so remove them explicitly.
DELETE FROM "salary_slips" WHERE "branchId" IS NULL;

ALTER TABLE "salary_slips"
  ALTER COLUMN "branchId" SET NOT NULL,
  ALTER COLUMN "baseSalary" SET NOT NULL,
  ALTER COLUMN "workingDays" SET NOT NULL;

-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "exitedOn" DATE,
ADD COLUMN     "hiredOn" DATE,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT;

-- DropTable
DROP TABLE "shifts";

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holidays_businessId_date_idx" ON "holidays"("businessId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_businessId_branchId_date_key" ON "holidays"("businessId", "branchId", "date");

-- CreateIndex
CREATE INDEX "salary_slips_businessId_branchId_monthYear_idx" ON "salary_slips"("businessId", "branchId", "monthYear");

-- CreateIndex
CREATE INDEX "staff_members_businessId_status_idx" ON "staff_members"("businessId", "status");

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_markedByMembershipId_fkey" FOREIGN KEY ("markedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
