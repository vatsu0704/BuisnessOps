-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE');

-- CreateEnum
CREATE TYPE "SalarySlipStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "geofenceRadiusMeters" INTEGER;

-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN     "baseSalary" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "punchInAt" TIMESTAMP(3),
    "punchInLat" DECIMAL(9,6),
    "punchInLng" DECIMAL(9,6),
    "punchOutAt" TIMESTAMP(3),
    "punchOutLat" DECIMAL(9,6),
    "punchOutLng" DECIMAL(9,6),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_slips" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffMemberId" TEXT NOT NULL,
    "monthYear" TEXT NOT NULL,
    "totalDaysWorked" DECIMAL(5,2) NOT NULL,
    "grossPay" DECIMAL(12,2) NOT NULL,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "SalarySlipStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_slips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_businessId_branchId_date_idx" ON "attendance"("businessId", "branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_staffMemberId_date_key" ON "attendance"("staffMemberId", "date");

-- CreateIndex
CREATE INDEX "salary_slips_businessId_monthYear_idx" ON "salary_slips"("businessId", "monthYear");

-- CreateIndex
CREATE UNIQUE INDEX "salary_slips_staffMemberId_monthYear_key" ON "salary_slips"("staffMemberId", "monthYear");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
