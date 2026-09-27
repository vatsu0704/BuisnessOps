/*
  Counter billing and tokens — requirement 1, plus the floor requirement 17
  needs for its day-end export.

  All additive. `transactions.source` is NOT NULL with a default, which
  backfills every existing row correctly: everything in there today arrived
  through CSV upload, which is exactly what POS_IMPORT means.

  Two enums are created here rather than altered, so unlike the roles migration
  this one is free to be a single file — the "cannot use a new enum value in the
  transaction that added it" rule applies to ALTER TYPE ... ADD VALUE, not to
  CREATE TYPE.

  ## The parts worth understanding

  `counter_orders` is NOT a second sales fact table. Every mutation projects the
  order into transactions/line_items through salesProjection.service.js, which
  is why `transactionId` is here and why it is UNIQUE — one order, one
  transaction. Reporting keeps reading one table, and because that projection is
  idempotent, "editable after it is placed" costs nothing.

  `branch_token_counters` is the token allocator, and its composite primary key
  is what makes the allocation atomic:

      INSERT INTO branch_token_counters ... VALUES (branch, date, 1)
      ON CONFLICT ("branchId", "tokenDate")
      DO UPDATE SET "lastNumber" = branch_token_counters."lastNumber" + 1
      RETURNING "lastNumber"

  One statement, no read-then-write window, no retry loop that degrades exactly
  when the counter is busiest. The UNIQUE on
  (branchId, tokenDate, tokenNumber) over counter_orders is NOT the allocator —
  it is the assertion that the allocator is correct, the same posture attendance
  takes with its no-double-punch key.

  `tokenDate` and `day_closes.date` are DATE, and always the BRANCH's local
  date. A branch in Asia/Kolkata keyed on UTC would restart its token numbering
  at 05:30 local, in the middle of breakfast service.

  `day_closes` is the floor on editing. Requirement 1 wants orders editable
  after they are placed; requirement 17 exports the day. Without a floor, an
  edit after the export silently restates a number someone has already been
  shown — the exact failure salary_slips' FINALIZED rule exists to prevent.
*/

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('POS_IMPORT', 'COUNTER');

-- CreateEnum
CREATE TYPE "CounterOrderStatus" AS ENUM ('OPEN', 'CLOSED', 'VOID');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "source" "TransactionSource" NOT NULL DEFAULT 'POS_IMPORT';

-- CreateTable
CREATE TABLE "counter_orders" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tokenNumber" INTEGER NOT NULL,
    "tokenDate" DATE NOT NULL,
    "status" "CounterOrderStatus" NOT NULL DEFAULT 'OPEN',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UNSPECIFIED',
    "placedByMembershipId" TEXT,
    "transactionId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counter_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counter_order_items" (
    "id" TEXT NOT NULL,
    "counterOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameSnapshot" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "counter_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_token_counters" (
    "branchId" TEXT NOT NULL,
    "tokenDate" DATE NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "branch_token_counters_pkey" PRIMARY KEY ("branchId","tokenDate")
);

-- CreateTable
CREATE TABLE "day_closes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByMembershipId" TEXT,

    CONSTRAINT "day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counter_orders_transactionId_key" ON "counter_orders"("transactionId");

-- CreateIndex
CREATE INDEX "counter_orders_businessId_branchId_tokenDate_idx" ON "counter_orders"("businessId", "branchId", "tokenDate");

-- CreateIndex
CREATE INDEX "counter_orders_businessId_branchId_status_idx" ON "counter_orders"("businessId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "counter_orders_branchId_tokenDate_tokenNumber_key" ON "counter_orders"("branchId", "tokenDate", "tokenNumber");

-- CreateIndex
CREATE INDEX "counter_order_items_counterOrderId_idx" ON "counter_order_items"("counterOrderId");

-- CreateIndex
CREATE INDEX "day_closes_businessId_date_idx" ON "day_closes"("businessId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "day_closes_branchId_date_key" ON "day_closes"("branchId", "date");

-- AddForeignKey
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_placedByMembershipId_fkey" FOREIGN KEY ("placedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_orders" ADD CONSTRAINT "counter_orders_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_order_items" ADD CONSTRAINT "counter_order_items_counterOrderId_fkey" FOREIGN KEY ("counterOrderId") REFERENCES "counter_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counter_order_items" ADD CONSTRAINT "counter_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_token_counters" ADD CONSTRAINT "branch_token_counters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_closes" ADD CONSTRAINT "day_closes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_closes" ADD CONSTRAINT "day_closes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_closes" ADD CONSTRAINT "day_closes_closedByMembershipId_fkey" FOREIGN KEY ("closedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
