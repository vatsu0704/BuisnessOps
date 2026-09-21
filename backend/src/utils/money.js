const { Prisma } = require('@prisma/client');

/**
 * Decimal arithmetic for payroll.
 *
 * `Prisma.Decimal` *is* decimal.js, re-exported wholesale by @prisma/client, so
 * this needs no new dependency — and Prisma accepts a Decimal directly as the
 * write value for a Decimal column, which means money never round-trips through
 * a float at any point. Before this, payroll did
 * `(Number(baseSalary) / workingDays) * daysWorked` and wrote the result into
 * DECIMAL(12,2), letting Postgres round away whatever IEEE-754 had done to it.
 *
 * RULE: `Number()` is banned inside payroll arithmetic. It may appear only at
 * the two edges — validating client input, and formatting for display, which
 * takes a string. If you find yourself reaching for it in between, the value
 * you want is already a Decimal and has the method you need.
 */
const D = Prisma.Decimal;
const HALF_UP = D.ROUND_HALF_UP;

/** Anything (string from Prisma, number from JSON, Decimal) to a Decimal. */
const dec = (v) => (v instanceof D ? v : new D(v ?? 0));

/** Currency amounts: 2 places, half-up, matching the DECIMAL(12,2) columns. */
const money = (v) => dec(v).toDecimalPlaces(2, HALF_UP);

/** Day counts: 2 places to carry a half-day, matching DECIMAL(5,2). */
const days = (v) => dec(v).toDecimalPlaces(2, HALF_UP);

/** Floors at zero. Deductions larger than gross must not produce negative pay. */
const atLeastZero = (v) => (dec(v).isNegative() ? new D(0) : dec(v));

/**
 * gross = baseSalary ÷ workingDays × daysWorked
 *
 * Division first, then multiplication, so a full month recovers the salary
 * exactly: base ÷ 22 × 22 === base. decimal.js carries enough significant
 * digits that the intermediate quotient doesn't lose the cent.
 */
function proRate(baseSalary, workingDays, daysWorked) {
  const divisor = dec(workingDays);
  if (divisor.isZero() || divisor.isNegative()) {
    const err = new Error('This month has no working days at this branch');
    err.status = 400;
    throw err;
  }
  return money(dec(baseSalary).div(divisor).mul(dec(daysWorked)));
}

module.exports = { D, dec, money, days, atLeastZero, proRate };
