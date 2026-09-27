const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

// Branch expenses — requirement 10.
//
// What is worth proving, because each of these is silently wrong rather than
// loudly broken when it fails:
//   1. Every business starts with the same categories, through BOTH creation
//      paths — signup and POST /businesses.
//   2. The day view compares spend against sales drawn from the SAME day, in
//      the branch's own timezone.
//   3. "Which branches logged nothing" is exact, and asks each branch about its
//      own local date rather than the server's.
//   4. The back-office desk reads every branch and records nothing; a cashier
//      records their own branch and cannot reach another's.
jest.setTimeout(45000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `exp-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `exp-cashier.${RUN_ID}@test.buisnessops.dev`;
const otherCashierEmail = `exp-other.${RUN_ID}@test.buisnessops.dev`;
const warehouseEmail = `exp-warehouse.${RUN_ID}@test.buisnessops.dev`;

describe('Branch expenses', () => {
  let ownerToken;
  let cashierToken;
  let otherCashierToken;
  let warehouseToken;
  let businessId;
  let branchAId;
  let branchBId;
  let categories;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });
  const url = (suffix) => `/api/businesses/${businessId}${suffix}`;
  const codeOf = (code) => categories.find((category) => category.code === code).id;

  async function joinAs(email, label, role, branchIds) {
    const signup = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name: label,
      businessName: `${label} Solo ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(signup.statusCode).toBe(201);
    businessIdsToClean.push(signup.body.business.id);
    userIdsToClean.push(signup.body.user.id);

    const membership = await request(app)
      .post(url('/memberships'))
      .set(auth(ownerToken))
      .send({ email, role, branchIds });
    expect(membership.statusCode).toBe(201);

    const login = await request(app).post('/api/auth/login').send({ email, password });
    return login.body.token;
  }

  function log(token, body) {
    return request(app).post(url('/expenses')).set(auth(token)).send(body);
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Expense Owner',
      businessName: `Expense Business ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(owner.statusCode).toBe(201);
    ownerToken = owner.body.token;
    businessId = owner.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(owner.body.user.id);

    for (const [name, code] of [
      ['Expense Branch A', 'EXA'],
      ['Expense Branch B', 'EXB'],
    ]) {
      const branch = await request(app)
        .post(url('/branches'))
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata' });
      expect(branch.statusCode).toBe(201);
      if (code === 'EXA') branchAId = branch.body.id;
      else branchBId = branch.body.id;
    }

    cashierToken = await joinAs(cashierEmail, 'Expense Cashier', 'CASHIER', [branchAId]);
    otherCashierToken = await joinAs(otherCashierEmail, 'Other Expense Cashier', 'CASHIER', [branchBId]);
    warehouseToken = await joinAs(warehouseEmail, 'Expense Warehouse', 'WAREHOUSE', []);

    const list = await request(app).get(url('/expense-categories')).set(auth(ownerToken));
    expect(list.statusCode).toBe(200);
    categories = list.body;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('categories', () => {
    it('seeds every business with the same starting set', () => {
      const codes = categories.map((category) => category.code);
      expect(codes).toEqual(
        expect.arrayContaining(['MILK', 'GAS', 'ELECTRICITY', 'RENT', 'REPAIRS', 'TRANSPORT', 'PETTY', 'OTHER'])
      );
      expect(categories.every((category) => category.isActive)).toBe(true);
    });

    // The seeded categories exist so a business can log something the moment
    // it is created. A second business created through POST /businesses rather
    // than signup must get them too, or requirement 16's businesses differ by
    // the door they came through.
    it('seeds a business created through POST /businesses, not only through signup', async () => {
      const created = await request(app)
        .post('/api/businesses')
        .set(auth(ownerToken))
        .send({
          name: `Second Expense Business ${RUN_ID}`,
          industry: 'RETAIL',
          country: 'IN',
          defaultCurrency: 'INR',
          timezone: 'Asia/Kolkata',
        });
      expect(created.statusCode).toBe(201);
      businessIdsToClean.push(created.body.business.id);

      const list = await request(app)
        .get(`/api/businesses/${created.body.business.id}/expense-categories`)
        .set(auth(ownerToken));
      expect(list.statusCode).toBe(200);
      expect(list.body.map((category) => category.code)).toEqual(expect.arrayContaining(['MILK', 'OTHER']));
    });

    // Without this the breakdown requirement 10 asks for collapses: everything
    // specific lands in Other with a note, and "₹2,000 of milk" cannot be
    // asked of anything but milk.
    it('lets a branch add one of its own, and refuses a duplicate name', async () => {
      const created = await request(app)
        .post(url('/expense-categories'))
        .set(auth(cashierToken))
        .send({ name: 'Vegetables' });
      expect(created.statusCode).toBe(201);
      expect(created.body.code).toBeNull();

      const again = await request(app)
        .post(url('/expense-categories'))
        .set(auth(cashierToken))
        .send({ name: 'Vegetables' });
      expect(again.statusCode).toBe(409);
      expect(again.body.code).toBe('EXPENSE_CATEGORY_DUPLICATE');
    });

    // A seeded category's name is never shown — the device renders it from the
    // code — so accepting a rename would be an edit that appears to work and
    // changes nothing anyone can see.
    it('refuses to rename a standard category but allows withdrawing it', async () => {
      const renamed = await request(app)
        .patch(url(`/expense-categories/${codeOf('GAS')}`))
        .set(auth(cashierToken))
        .send({ name: 'Cooking gas' });
      expect(renamed.statusCode).toBe(400);
      expect(renamed.body.code).toBe('EXPENSE_CATEGORY_IS_STANDARD');

      const withdrawn = await request(app)
        .patch(url(`/expense-categories/${codeOf('RENT')}`))
        .set(auth(cashierToken))
        .send({ isActive: false });
      expect(withdrawn.statusCode).toBe(200);
      expect(withdrawn.body.isActive).toBe(false);

      const blocked = await log(cashierToken, {
        branchId: branchAId,
        categoryId: codeOf('RENT'),
        amount: 100,
      });
      expect(blocked.statusCode).toBe(400);
      expect(blocked.body.code).toBe('EXPENSE_CATEGORY_INACTIVE');

      // Put it back, so the order tests run in does not decide their outcome.
      await request(app)
        .patch(url(`/expense-categories/${codeOf('RENT')}`))
        .set(auth(cashierToken))
        .send({ isActive: true });
    });
  });

  describe('logging', () => {
    it('records an expense against the branch and the person who logged it', async () => {
      const res = await log(cashierToken, {
        branchId: branchAId,
        categoryId: codeOf('MILK'),
        amount: 2000,
        note: 'Two cans',
        paymentMethod: 'CASH',
      });

      expect(res.statusCode).toBe(201);
      expect(Number(res.body.amount)).toBe(2000);
      expect(res.body.branchId).toBe(branchAId);
      expect(res.body.currency).toBe('INR');
      expect(res.body.category.code).toBe('MILK');
      expect(res.body.recordedByMembership.user.name).toBe('Expense Cashier');
      // No date given means the BRANCH's today, not the server's.
      expect(res.body.expenseDate).toBeTruthy();
    });

    it('refuses an amount of zero or less', async () => {
      for (const amount of [0, -50]) {
        const res = await log(cashierToken, { branchId: branchAId, categoryId: codeOf('GAS'), amount });
        expect(res.statusCode).toBe(400);
      }
    });

    // The mistake this catches is a mistyped year, and the cost of not
    // catching it is a figure that never appears in any day anyone looks at.
    it('refuses a date the branch has not reached yet', async () => {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const res = await log(cashierToken, {
        branchId: branchAId,
        categoryId: codeOf('GAS'),
        amount: 500,
        date: nextYear.toISOString().slice(0, 10),
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('EXPENSE_DATE_IN_FUTURE');
    });

    it('lets a logged expense be corrected and removed', async () => {
      const created = await log(cashierToken, {
        branchId: branchAId,
        categoryId: codeOf('PETTY'),
        amount: 75,
      });
      expect(created.statusCode).toBe(201);

      const corrected = await request(app)
        .patch(url(`/expenses/${created.body.id}`))
        .set(auth(cashierToken))
        .send({ amount: 90, note: 'Tea for the shift' });
      expect(corrected.statusCode).toBe(200);
      expect(Number(corrected.body.amount)).toBe(90);

      const removed = await request(app)
        .delete(url(`/expenses/${created.body.id}`))
        .set(auth(cashierToken));
      expect(removed.statusCode).toBe(204);

      const gone = await request(app)
        .patch(url(`/expenses/${created.body.id}`))
        .set(auth(cashierToken))
        .send({ amount: 10 });
      expect(gone.statusCode).toBe(404);
      expect(gone.body.code).toBe('EXPENSE_NOT_FOUND');
    });
  });

  describe('the day and the month', () => {
    it("answers 'what did I spend today, and what did I sell today?' together", async () => {
      const day = await request(app)
        .get(url(`/branches/${branchAId}/expense-day`))
        .set(auth(cashierToken));

      expect(day.statusCode).toBe(200);
      expect(Number(day.body.totalSpent)).toBeGreaterThanOrEqual(2000);
      expect(day.body).toHaveProperty('totalSold');
      // difference = sold - spent, the two figures the requirement asks for
      // side by side.
      expect(Number(day.body.difference)).toBeCloseTo(
        Number(day.body.totalSold) - Number(day.body.totalSpent),
        2
      );
      expect(day.body.breakdown.find((row) => row.code === 'MILK')).toBeTruthy();
    });

    // The whole point of the breakdown: "today I took ₹2,000 of milk" has to
    // be answerable about milk specifically, not about spending in general.
    it('groups a month by category, biggest first', async () => {
      await log(cashierToken, { branchId: branchAId, categoryId: codeOf('GAS'), amount: 3500 });

      const now = new Date();
      const month = await request(app)
        .get(url(`/branches/${branchAId}/expense-month`))
        .query({ month: now.getMonth() + 1, year: now.getFullYear() })
        .set(auth(cashierToken));

      expect(month.statusCode).toBe(200);
      expect(month.body.breakdown.length).toBeGreaterThanOrEqual(2);
      const amounts = month.body.breakdown.map((row) => Number(row.amount));
      expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
      expect(month.body.days.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('who hasn’t logged', () => {
    it('lists every active branch and marks the ones with nothing today', async () => {
      const res = await request(app).get(url('/expense-compliance')).set(auth(warehouseToken));

      expect(res.statusCode).toBe(200);
      expect(res.body.branchCount).toBeGreaterThanOrEqual(2);

      const a = res.body.branches.find((row) => row.branchId === branchAId);
      const b = res.body.branches.find((row) => row.branchId === branchBId);
      expect(a.hasLogged).toBe(true);
      expect(Number(a.totalSpent)).toBeGreaterThan(0);
      // Branch B has logged nothing, which is exactly who the back office
      // rings. It is a computed answer, so it is right at the moment it is
      // asked rather than as of whenever a job last ran.
      expect(b.hasLogged).toBe(false);
      expect(res.body.missingCount).toBeGreaterThanOrEqual(1);
    });

    it('answers for a past date too, so "who missed Tuesday?" is askable', async () => {
      const res = await request(app)
        .get(url('/expense-compliance'))
        .query({ date: '2020-01-02' })
        .set(auth(warehouseToken));

      expect(res.statusCode).toBe(200);
      expect(res.body.branches.every((row) => row.hasLogged === false)).toBe(true);
    });
  });

  describe('who may do what', () => {
    // The desk chases branches; it does not spend their money. This is the
    // narrowing `expense:view` exists for — read every branch, record at none.
    it('lets the warehouse desk read a branch and refuses to let it log', async () => {
      const read = await request(app)
        .get(url(`/branches/${branchAId}/expense-day`))
        .set(auth(warehouseToken));
      expect(read.statusCode).toBe(200);

      const blocked = await log(warehouseToken, {
        branchId: branchAId,
        categoryId: codeOf('GAS'),
        amount: 100,
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.body.code).toBe('PERMISSION_DENIED');
    });

    it("refuses a cashier logging against another branch", async () => {
      const res = await log(otherCashierToken, {
        branchId: branchAId,
        categoryId: codeOf('GAS'),
        amount: 100,
      });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    // Knowing an id must not be enough to edit spending somewhere you cannot
    // reach — the id is not the permission.
    it('refuses a cashier editing an expense at another branch', async () => {
      const mine = await log(otherCashierToken, {
        branchId: branchBId,
        categoryId: codeOf('GAS'),
        amount: 250,
      });
      expect(mine.statusCode).toBe(201);

      const res = await request(app)
        .patch(url(`/expenses/${mine.body.id}`))
        .set(auth(cashierToken))
        .send({ amount: 1 });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('refuses a cashier the business-wide compliance list', async () => {
      const res = await request(app).get(url('/expense-compliance')).set(auth(cashierToken));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });
  });
});
