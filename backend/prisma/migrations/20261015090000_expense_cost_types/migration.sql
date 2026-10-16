/*
  Expense cost types — requirement 34 in Docs/REQUIREMENTS.md.

  Every expense category is VARIABLE, FIXED or DAILY, which is how Reports splits
  a branch's costs. Raw material (supply orders) is always variable and wages
  always fixed; those are not categories.

  The seeded categories are classed as Vatsal chose (2026-10-14): Milk and Gas
  VARIABLE, Rent and Electricity FIXED, the rest DAILY — the column default, so a
  category somebody typed is DAILY until the owner says otherwise. Kept identical
  to SEEDED_CATEGORIES in src/services/expense.service.js, which seeds a new
  business the same way.

  The type is CREATED here rather than altered, so its values may be used in this
  same migration.
*/

-- CreateEnum
CREATE TYPE "ExpenseCostType" AS ENUM ('VARIABLE', 'FIXED', 'DAILY');

-- AlterTable
ALTER TABLE "expense_categories" ADD COLUMN     "costType" "ExpenseCostType" NOT NULL DEFAULT 'DAILY';

-- Backfill the seeded categories of every existing business
UPDATE "expense_categories" SET "costType" = 'VARIABLE' WHERE "code" IN ('MILK', 'GAS');
UPDATE "expense_categories" SET "costType" = 'FIXED' WHERE "code" IN ('RENT', 'ELECTRICITY');
