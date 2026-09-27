/*
  Product catalog — requirement 4.

  "After login, show the products on the home page by default. And every branch
  can add their own separate products too."

  Four additive columns on `products`, all nullable or defaulted, so this is
  safe on a table that already has rows and needs no backfill:

  - `branchId` — NULL means the product belongs to the whole business and every
    branch sees it; a value means only that branch does. Every product that
    exists today was created by CSV ingestion and is business-wide, which NULL
    already says correctly.
  - `costPrice` / `sellPrice` — the business-wide default. `product_branch_details`
    already carried a per-branch price and keeps doing so; it is now an override
    rather than the only place a price can live, so a product priced the same
    everywhere needs one row instead of one per branch. Nullable because
    ingestion discovers products from sales rows, which carry a line's unit
    price but no catalog price.
  - `isActive` — withdraw a product from sale without deleting it. Deleting is
    not available once line_items reference it: a past sale has to keep naming
    what was sold.

  The foreign key is ON DELETE SET NULL, not CASCADE. Deleting a branch must not
  silently delete products; a branch-only product outliving its branch by
  becoming business-wide is a visible state someone can correct. Branches are
  closed through BranchStatus rather than deleted in practice, so this is a
  backstop rather than a path anyone takes.
*/

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "costPrice" DECIMAL(12,2),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sellPrice" DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "products_businessId_branchId_idx" ON "products"("businessId", "branchId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
