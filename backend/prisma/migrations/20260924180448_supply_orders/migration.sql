/*
  Supply orders end to end — requirements 3, 5, 5.1, 9, 11 and 12.

  All additive, and a single file: the "a new enum value cannot be used in the
  transaction that added it" rule applies to ALTER TYPE ... ADD VALUE, not to
  CREATE TYPE, and every enum here is created rather than altered.

  ## The one decision worth reading before changing anything

  A supply order is deliberately NOT projected into transactions/line_items the
  way a counter order is. That looks inconsistent and is the point: a counter
  order is a SALE (revenue), and a supply order is an internal transfer and a
  COST. Writing it into the sales fact table would inflate every sales figure in
  the product by the value of the flour a branch bought from its own warehouse.
  Task 8 reads it from here as a cost input to net profit instead.

  ## Notes on the columns

  `supply_orders.orderNumber` is nullable because a DRAFT is the cart. Numbering
  carts would burn numbers on orders that never happened and leave gaps the
  warehouse would ask about. It is allocated at PLACED from
  `supply_order_counters`, by the same atomic INSERT ... ON CONFLICT DO UPDATE
  ... RETURNING as the token counter, and unlike a token it never resets — an
  order number is quoted days later, so it must stay unique over time rather
  than staying small.

  `inventory_items` gains `unitPrice` (nullable) and `isActive`. Nullable price
  is meaningful: the table has existed since Phase 1 to track usage, so items
  in it may well have no price yet, and an unpriced item must be un-orderable
  rather than orderable at zero.

  `supply_order_items` carries a UNIQUE on (supplyOrderId, inventoryItemId) so
  adding the same item twice raises the quantity instead of producing two lines
  a picker has to reconcile. `counter_order_items` deliberately has no such
  constraint — a till roll is not a cart.

  Only TWO membership columns are on supply_orders: who placed it, and who is
  carrying it. Both exist because a query filters on them. Who accepted, packed,
  dispatched or verified the payment is in `supply_order_events`, which is the
  audit trail; four more actor columns on the order would be a second record of
  the same fact, free to disagree with the first.
*/

-- CreateEnum
CREATE TYPE "SupplyOrderStatus" AS ENUM ('DRAFT', 'PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplyPaymentMode" AS ENUM ('ONLINE', 'COD');

-- CreateEnum
CREATE TYPE "SupplyPaymentStatus" AS ENUM ('PENDING', 'PAID', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupplyOrderEventType" AS ENUM ('STATUS_CHANGE', 'DELAY', 'PAYMENT');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitPrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "supply_orders" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderNumber" INTEGER,
    "status" "SupplyOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMode" "SupplyPaymentMode",
    "paymentStatus" "SupplyPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentReference" TEXT,
    "paymentVerifiedAt" TIMESTAMP(3),
    "promisedAt" TIMESTAMP(3),
    "placedByMembershipId" TEXT,
    "deliveryAgentMembershipId" TEXT,
    "placedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_order_items" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "itemNameSnapshot" TEXT NOT NULL,
    "unitSnapshot" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_order_events" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "type" "SupplyOrderEventType" NOT NULL,
    "fromStatus" "SupplyOrderStatus",
    "toStatus" "SupplyOrderStatus",
    "delayMinutes" INTEGER,
    "reasonCode" TEXT,
    "note" TEXT,
    "actorMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supply_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_order_counters" (
    "businessId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "supply_order_counters_pkey" PRIMARY KEY ("businessId")
);

-- CreateIndex
CREATE INDEX "supply_orders_businessId_status_idx" ON "supply_orders"("businessId", "status");

-- CreateIndex
CREATE INDEX "supply_orders_businessId_branchId_status_idx" ON "supply_orders"("businessId", "branchId", "status");

-- CreateIndex
CREATE INDEX "supply_orders_deliveryAgentMembershipId_status_idx" ON "supply_orders"("deliveryAgentMembershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "supply_orders_businessId_orderNumber_key" ON "supply_orders"("businessId", "orderNumber");

-- CreateIndex
CREATE INDEX "supply_order_items_supplyOrderId_idx" ON "supply_order_items"("supplyOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "supply_order_items_supplyOrderId_inventoryItemId_key" ON "supply_order_items"("supplyOrderId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "supply_order_events_supplyOrderId_createdAt_idx" ON "supply_order_events"("supplyOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_items_businessId_isActive_idx" ON "inventory_items"("businessId", "isActive");

-- AddForeignKey
ALTER TABLE "supply_orders" ADD CONSTRAINT "supply_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_orders" ADD CONSTRAINT "supply_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_orders" ADD CONSTRAINT "supply_orders_placedByMembershipId_fkey" FOREIGN KEY ("placedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_orders" ADD CONSTRAINT "supply_orders_deliveryAgentMembershipId_fkey" FOREIGN KEY ("deliveryAgentMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_order_items" ADD CONSTRAINT "supply_order_items_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "supply_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_order_items" ADD CONSTRAINT "supply_order_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_order_events" ADD CONSTRAINT "supply_order_events_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "supply_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_order_events" ADD CONSTRAINT "supply_order_events_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_order_counters" ADD CONSTRAINT "supply_order_counters_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
