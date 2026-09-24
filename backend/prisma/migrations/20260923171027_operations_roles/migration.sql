/*
  Branch-operations roles.

  Adds WAREHOUSE (the central order desk), CASHIER (the branch operator) and
  DELIVERY_AGENT, per Docs/REQUIREMENTS.md. What each one is allowed to do is
  NOT in the database: it lives in backend/src/permissions/catalog.js, mirrored
  to frontend/src/permissions/matrix.json and gated by a CI parity check. This
  enum is only the vocabulary.

  Two things about this file are deliberate.

  1. NOTHING HERE USES THE NEW VALUES. Postgres allows ALTER TYPE ... ADD VALUE
     inside a transaction (PG12+), but the added value cannot be USED in that
     same transaction, and Prisma Migrate wraps each migration file in one. So
     any later data work that writes 'CASHIER' into a row must go in its own
     migration directory, after this one, or it fails with
     "unsafe use of new value CASHIER of enum type MembershipRole". There is no
     such data work today, which is why this is one file and not two.

  2. The values are APPENDED, not inserted in order of seniority. Nothing sorts
     by this column (listMemberships orders by createdAt), and relying on enum
     declaration order is a trap worth never setting.

  Prisma's own warning about PostgreSQL 11 and earlier is left in place below.
  It does not apply here — CI runs Postgres 16 — but removing a generated
  warning is how the next person stops trusting the generated output.

  Landing alongside this, in code rather than SQL: MANAGER becomes
  admin-equivalent and business-wide (requirement 14). That is a change to how
  EXISTING manager rows behave, not a schema change, so it has no statement
  here — but it is the reason two tests in tenant-isolation.test.js and the
  Phase 0 exit criterion in Docs/PROJECT_FLOW.md changed in the same commit.
*/

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MembershipRole" ADD VALUE 'WAREHOUSE';
ALTER TYPE "MembershipRole" ADD VALUE 'CASHIER';
ALTER TYPE "MembershipRole" ADD VALUE 'DELIVERY_AGENT';

-- AlterEnum
-- A counter order has no payment step, but Transaction.paymentMethod is
-- required. UNSPECIFIED exists so that fact can be recorded honestly instead of
-- being written as OTHER, which would corrupt the cash-vs-digital mix metric.
ALTER TYPE "PaymentMethod" ADD VALUE 'UNSPECIFIED';
