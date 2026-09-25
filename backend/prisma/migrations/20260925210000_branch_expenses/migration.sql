-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "expenseDate" DATE NOT NULL,
    "note" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'UNSPECIFIED',
    "recordedByMembershipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_categories_businessId_isActive_idx" ON "expense_categories"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_businessId_code_key" ON "expense_categories"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_businessId_name_key" ON "expense_categories"("businessId", "name");

-- CreateIndex
CREATE INDEX "expenses_businessId_branchId_expenseDate_idx" ON "expenses"("businessId", "branchId", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_businessId_expenseDate_idx" ON "expenses"("businessId", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recordedByMembershipId_fkey" FOREIGN KEY ("recordedByMembershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Seed the starting categories for every business that already exists.
--
-- New businesses get these from createBusinessForUser, which is the single
-- seam both signup and POST /businesses go through. That covers every business
-- created from here on and none of the ones already in the database — so
-- without this backfill, an existing business would open the expense screen to
-- an empty category list and be unable to log anything at all.
--
-- `code` is the contract and `name` is the English fallback, exactly as in
-- errors/catalog.js: the device renders t('expenseCategory.<code>'), so these
-- names are only ever seen by curl and the logs.
--
-- There is deliberately no raw-material category. A supply order is already a
-- cost in supply_orders, and a category inviting someone to log it again by
-- hand would subtract it twice from net profit (REQUIREMENTS.md §5).
-- ---------------------------------------------------------------------------
INSERT INTO "expense_categories" ("id", "businessId", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."id", seed."code", seed."name", true, seed."sortOrder", NOW(), NOW()
FROM "businesses" b
CROSS JOIN (VALUES
  ('MILK',        'Milk',        10),
  ('GAS',         'Gas',         20),
  ('ELECTRICITY', 'Electricity', 30),
  ('RENT',        'Rent',        40),
  ('REPAIRS',     'Repairs',     50),
  ('TRANSPORT',   'Transport',   60),
  ('PETTY',       'Petty cash',  70),
  ('OTHER',       'Other',       80)
) AS seed("code", "name", "sortOrder")
ON CONFLICT ("businessId", "code") DO NOTHING;
