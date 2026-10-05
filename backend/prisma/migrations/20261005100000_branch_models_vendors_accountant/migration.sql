/*
  Branch operating models, third-party vendors, UPI payees, and the Accountant
  role — requirements 24 to 27 in Docs/REQUIREMENTS.md (Task 12).

  - branches.operatingModel: FOCO (the business pays for raw material
    centrally) or FM (the branch pays for itself). Defaults to FM, which is the
    flow every branch already had, so no existing row needs a backfill.
  - vendors: third-party suppliers. An inventory item may name one, and a cart
    is split into one order per supplier when it is placed.
  - businesses.supplyUpi* and vendors.upi*: where a payment goes. A UPI QR is
    generated from these on the device, with the order's exact amount in it.
    Who last changed each, and when, is recorded beside it.
  - supply_orders.vendorId / operatingModel / placementId: the supplier, the
    branch's model snapshotted at placement, and the cart it was split from.
  - MembershipRole ACCOUNTANT, SupplyPaymentMode ACCOUNTS.

  NOTHING HERE USES THE NEW ENUM VALUES, for the reason the operations-roles
  migration records: Postgres cannot use a value added by ALTER TYPE ... ADD
  VALUE in the transaction that added it, and Prisma wraps each migration file
  in one. Both new columns default to 'FM', which belongs to a type CREATED
  here rather than altered, and that is allowed.

  The vendor references are ON DELETE NO ACTION rather than RESTRICT so that
  deleting a whole business, which cascades to its vendors, items and orders in
  one statement, is checked at the end of that statement and not part-way
  through it. See the note on the Vendor model.
*/

-- CreateEnum
CREATE TYPE "BranchOperatingModel" AS ENUM ('FOCO', 'FM');

-- AlterEnum
ALTER TYPE "MembershipRole" ADD VALUE 'ACCOUNTANT';

-- AlterEnum
ALTER TYPE "SupplyPaymentMode" ADD VALUE 'ACCOUNTS';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "operatingModel" "BranchOperatingModel" NOT NULL DEFAULT 'FM';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "supplyUpiId" TEXT,
ADD COLUMN     "supplyUpiName" TEXT,
ADD COLUMN     "supplyUpiUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "supplyUpiUpdatedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "supply_orders" ADD COLUMN     "operatingModel" "BranchOperatingModel" NOT NULL DEFAULT 'FM',
ADD COLUMN     "placementId" TEXT,
ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "upiId" TEXT,
    "upiName" TEXT,
    "upiUpdatedAt" TIMESTAMP(3),
    "upiUpdatedByMembershipId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_businessId_isActive_idx" ON "vendors"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_businessId_name_key" ON "vendors"("businessId", "name");

-- CreateIndex
CREATE INDEX "inventory_items_vendorId_idx" ON "inventory_items"("vendorId");

-- CreateIndex
CREATE INDEX "supply_orders_businessId_paymentMode_paymentStatus_idx" ON "supply_orders"("businessId", "paymentMode", "paymentStatus");

-- CreateIndex
CREATE INDEX "supply_orders_vendorId_idx" ON "supply_orders"("vendorId");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_supplyUpiUpdatedByMembershipId_fkey" FOREIGN KEY ("supplyUpiUpdatedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_upiUpdatedByMembershipId_fkey" FOREIGN KEY ("upiUpdatedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_orders" ADD CONSTRAINT "supply_orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

