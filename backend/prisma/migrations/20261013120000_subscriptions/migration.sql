/*
  Subscription plans — requirement 28 in Docs/REQUIREMENTS.md (Task 13).

  - subscriptions: one per business — its plan (STARTER / GROWTH / FRANCHISE),
    whether it is a trial, paid or cancelled, how many trading branches are paid
    for, and when the trial or the paid period ends. What each plan unlocks is
    code (src/permissions/plans.js); what it costs is not stored at all.
  - billing_events: every change to a subscription and the payment behind it,
    append-only, with who made it.

  Grace and read-only are deliberately NOT columns. They follow from a date
  passing and are derived at request time (src/billing/access.js), so no
  scheduled job has to flip them.

  BACKFILL: every business that already exists starts the same 30-day trial of
  the top plan that a new business gets, counted from the day this migration is
  applied. Without a row a business is treated as having no plan on record and
  goes read-only, which is the safe default for a row that is missing by mistake
  and exactly the wrong thing to do to every customer on the day this ships.
  The types used by the backfill are CREATED here rather than altered, so using
  them in this transaction is allowed.
*/

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'GROWTH', 'FRANCHISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BillingEventType" AS ENUM ('TRIAL_STARTED', 'PLAN_SET', 'CANCELLED');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "interval" "BillingInterval",
    "paidBranchCount" INTEGER,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "provider" TEXT,
    "providerSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "BillingEventType" NOT NULL,
    "plan" "SubscriptionPlan",
    "paidBranchCount" INTEGER,
    "interval" "BillingInterval",
    "periodEnd" TIMESTAMP(3),
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_businessId_key" ON "subscriptions"("businessId");

-- CreateIndex
CREATE INDEX "billing_events_businessId_createdAt_idx" ON "billing_events"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: a 30-day trial of the top plan for every existing business.
-- 30 matches TRIAL_DAYS in src/permissions/plans.js.
INSERT INTO "subscriptions" ("id", "businessId", "plan", "status", "trialEndsAt", "updatedAt")
SELECT gen_random_uuid()::text, b."id", 'FRANCHISE', 'TRIALING', CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP
FROM "businesses" b;

INSERT INTO "billing_events" ("id", "businessId", "type", "plan", "periodEnd", "note", "actor")
SELECT gen_random_uuid()::text, s."businessId", 'TRIAL_STARTED', s."plan", s."trialEndsAt",
       'Trial started for a business that existed before subscriptions', 'migration'
FROM "subscriptions" s;
