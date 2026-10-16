/*
  Counter checkout, offline billing and the counter's UPI ID — requirements 29
  to 32 in Docs/REQUIREMENTS.md (Task 14).

  - counter_orders.clientRef: the UUID the phone gives a paid sale, so a sale
    synced twice is found rather than recorded twice. Unique per business;
    Postgres lets the existing rows' NULLs share it, so nothing is backfilled.
  - counter_orders.deviceTokenNumber: the token the phone printed, kept only
    when the server had to renumber the sale.
  - counter_orders.syncedAt: when a phone-made sale reached the server.
  - branches.phone: printed on the branch's receipts.
  - businesses.counterUpi* and branches.counterUpi*: where counter customers'
    money goes — the business's ID, and a shop's own override — stamped with who
    changed it and when, like every payee.

  Additive only: every column is nullable, so every existing row means exactly
  what it meant before.
*/

-- AlterTable
ALTER TABLE "counter_orders" ADD COLUMN     "clientRef" TEXT,
ADD COLUMN     "deviceTokenNumber" INTEGER,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "counterUpiId" TEXT,
ADD COLUMN     "counterUpiName" TEXT,
ADD COLUMN     "counterUpiUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "counterUpiUpdatedByMembershipId" TEXT;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "counterUpiId" TEXT,
ADD COLUMN     "counterUpiName" TEXT,
ADD COLUMN     "counterUpiUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "counterUpiUpdatedByMembershipId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "counter_orders_businessId_clientRef_key" ON "counter_orders"("businessId", "clientRef");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_counterUpiUpdatedByMembershipId_fkey" FOREIGN KEY ("counterUpiUpdatedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_counterUpiUpdatedByMembershipId_fkey" FOREIGN KEY ("counterUpiUpdatedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
