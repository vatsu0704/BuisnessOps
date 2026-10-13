#!/usr/bin/env node
/**
 * Put a business on a paid plan by hand, after its owner has paid by UPI or
 * bank transfer (requirement 28, stage 1).
 *
 * Until a payment gateway exists this is the only way a plan changes, and it is
 * deliberately a script rather than an API endpoint: an endpoint would need a
 * "platform operator" above every business's owner, and that is a role this
 * API does not have and should not grow for the sake of a form. Whoever can run
 * this already holds DATABASE_URL.
 *
 * Writes through subscription.service's setPlan / cancel, so the rules are the
 * ones the app enforces — most importantly, it refuses a branch count below the
 * branches already trading, so it never has to choose which shop to shut.
 * Every change is recorded as a BillingEvent with --actor, the amount and the
 * payment reference, so a plan can always be traced back to the money.
 *
 *   node scripts/set-plan.js --business <id> --plan GROWTH --branches 3 \
 *     --interval YEARLY --until 2027-10-13 \
 *     --amount 35964 --currency INR --reference <UTR> --actor vatsal
 *
 *   node scripts/set-plan.js --business <id> --cancel --actor vatsal --note "refunded"
 *
 *   node scripts/set-plan.js --business <id> --show
 *
 * Reads DATABASE_URL from the environment, or from backend/.env when run on
 * this machine. On a host, run it in the service's shell, where the variable is
 * already set — see Docs/DEPLOYMENT.md.
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const USAGE = `Usage:
  node scripts/set-plan.js --business <id> --plan STARTER|GROWTH|FRANCHISE --branches <n>
      --until <YYYY-MM-DD> --actor <name>
      [--interval MONTHLY|YEARLY] [--amount <n>] [--currency INR] [--reference <UTR>] [--note <text>]
  node scripts/set-plan.js --business <id> --cancel --actor <name> [--note <text>]
  node scripts/set-plan.js --business <id> --show`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument "${token}"`);
    const key = token.slice(2);
    if (key === 'cancel' || key === 'show') {
      args[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value`);
    args[key] = value;
    i += 1;
  }
  return args;
}

// The end of the given day, so "--until 2027-10-13" means the plan covers all of
// the 13th rather than stopping at its first second.
function endOfDay(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText ?? '')) throw new Error('--until must be a date like 2027-10-13');
  const date = new Date(`${dateText}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`--until "${dateText}" is not a real date`);
  return date;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.business) throw new Error('--business is required');

  // Required here, after argument checking, so a typo is reported without
  // waiting for a database connection.
  const prisma = require('../src/config/db');
  const subscriptionService = require('../src/services/subscription.service');

  try {
    if (args.show) {
      const summary = await subscriptionService.getSubscriptionSummary(args.business);
      const { plans, ...rest } = summary;
      console.log(JSON.stringify(rest, null, 2));
      return;
    }

    if (args.cancel) {
      const subscription = await subscriptionService.cancel(args.business, { note: args.note, actor: args.actor });
      console.log(`Cancelled: business ${args.business} is read-only from now on (plan was ${subscription.plan}).`);
      return;
    }

    const paidBranchCount = Number(args.branches);
    const amount = args.amount === undefined ? undefined : Number(args.amount);
    if (amount !== undefined && !(amount >= 0)) throw new Error('--amount must be a number');

    const subscription = await subscriptionService.setPlan(args.business, {
      plan: args.plan,
      paidBranchCount,
      interval: args.interval,
      periodEnd: endOfDay(args.until),
      amount,
      currency: args.currency ?? (amount !== undefined ? 'INR' : undefined),
      reference: args.reference,
      note: args.note,
      actor: args.actor,
    });
    console.log(
      `Business ${args.business} is on ${subscription.plan} for ${subscription.paidBranchCount} branch(es) ` +
        `until ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  console.error(`\n${USAGE}`);
  process.exit(1);
});
