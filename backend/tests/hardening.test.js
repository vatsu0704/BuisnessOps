const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { problemsWith, MIN_SECRET_LENGTH } = require('../src/config/env');
const supplyOrderService = require('../src/services/supplyOrder.service');

jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `hard-owner.${RUN_ID}@test.buisnessops.dev`;

/**
 * The production-readiness fixes, each of which covers something that was
 * silently wrong rather than visibly broken — which is exactly the kind of
 * thing that comes back if nothing pins it down.
 */
describe('Hardening', () => {
  let ownerToken;
  let ownerUserId;
  let businessId;
  let branchId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Hardening Owner',
      businessName: `Hardening ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(res.statusCode).toBe(201);
    ownerToken = res.body.token;
    ownerUserId = res.body.user.id;
    businessId = res.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(ownerUserId);

    const branch = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set(auth(ownerToken))
      .send({ name: 'Hardening Branch', code: `HRD${RUN_ID}`, timezone: 'Asia/Kolkata' });
    branchId = branch.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  /**
   * The server used to start with no JWT_SECRET at all and only fail at the
   * first login, as a 500 from inside jsonwebtoken — and it would start just as
   * happily with the `change-me` published in .env.example, signing tokens
   * anybody who read the repository could forge.
   */
  describe('the environment is checked before the server serves', () => {
    const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(MIN_SECRET_LENGTH) };

    it('accepts a good production environment', () => {
      expect(problemsWith({ ...base, NODE_ENV: 'production' })).toEqual([]);
    });

    it('refuses a missing secret or database, in any environment', () => {
      expect(problemsWith({ NODE_ENV: 'development' })).toHaveLength(2);
      expect(problemsWith({ ...base, JWT_SECRET: undefined }).join(' ')).toMatch(/JWT_SECRET/);
    });

    it('refuses the example placeholder in production', () => {
      const problems = problemsWith({ ...base, JWT_SECRET: 'change-me', NODE_ENV: 'production' });
      expect(problems.join(' ')).toMatch(/placeholder/i);
    });

    it('refuses a short secret in production', () => {
      const problems = problemsWith({ ...base, JWT_SECRET: 'short', NODE_ENV: 'production' });
      expect(problems.join(' ')).toMatch(/at least/i);
    });

    /**
     * CI runs with `ci-test-secret` and every developer's .env.test has its own
     * short value. A guard that broke both on the day it landed is a guard that
     * gets deleted rather than satisfied — outside production the value only
     * has to exist.
     */
    it('allows a short secret outside production, so CI and local checkouts still run', () => {
      expect(problemsWith({ ...base, JWT_SECRET: 'ci-test-secret', NODE_ENV: 'test' })).toEqual([]);
    });
  });

  /**
   * `User.status` existed from Phase 0 and was read nowhere: disabling an
   * account did nothing at all, at login or on any request afterwards.
   */
  describe('a disabled account cannot act', () => {
    const disabledEmail = `hard-disabled.${RUN_ID}@test.buisnessops.dev`;
    let disabledToken;

    beforeAll(async () => {
      const res = await request(app).post('/api/auth/signup').send({
        email: disabledEmail,
        password,
        name: 'Disabled Person',
        businessName: `Disabled Solo ${RUN_ID}`,
        industry: 'RETAIL',
        country: 'IN',
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
      });
      disabledToken = res.body.token;
      businessIdsToClean.push(res.body.business.id);
      userIdsToClean.push(res.body.user.id);

      await prisma.user.update({
        where: { id: res.body.user.id },
        data: { status: 'DISABLED' },
      });
    });

    it('refuses the token they already held, rather than waiting for it to expire', async () => {
      // The whole reason this is checked on the request and not only at login:
      // a token lasts seven days and carries no state, so someone disabled on
      // Monday would still be working on Sunday.
      const res = await request(app).get('/api/auth/me').set(auth(disabledToken));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('AUTH_ACCOUNT_DISABLED');
    });

    it('refuses a fresh sign-in with the right password', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: disabledEmail, password });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('AUTH_ACCOUNT_DISABLED');
    });

    it('still says only "invalid" for a wrong password, so the code leaks nothing', async () => {
      // Checked AFTER the password comparison on purpose: answering before it
      // would tell anybody who asked whether an account exists for an address.
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: disabledEmail, password: 'WrongPass123!' });
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('AUTH_CREDENTIALS_INVALID');
    });

    it('lets them back in once the account is restored', async () => {
      const user = await prisma.user.findUnique({ where: { email: disabledEmail } });
      await prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });

      const res = await request(app).post('/api/auth/login').send({ email: disabledEmail, password });
      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeTruthy();
    });

    it('leaves an ACTIVE account working exactly as before', async () => {
      const res = await request(app).get('/api/auth/me').set(auth(ownerToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.user.id).toBe(ownerUserId);
    });
  });

  /**
   * The cart is the BRANCH's, shared by everyone who works there, so two people
   * in it at once is the normal case. `getOrCreateCart` was check-then-write
   * with no lock: both found nothing, both created one, and from then on they
   * were filling different carts.
   */
  describe('a branch has one supply cart, however many people open it', () => {
    async function freshBranch(label) {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/branches`)
        .set(auth(ownerToken))
        .send({ name: label, code: `${label}${RUN_ID}`.slice(0, 20), timezone: 'Asia/Kolkata' });
      expect(res.statusCode).toBe(201);
      return res.body.id;
    }

    /**
     * The one assertion here with real teeth, and it is worth explaining why
     * the obvious test is not it.
     *
     * Firing N concurrent `getOrCreateCart` calls and checking only one cart
     * comes back passes against the BROKEN code most of the time: whether the
     * reads overlap depends on how Prisma happens to dispatch them, and in a
     * quiet test process the first create usually commits before the others
     * read. Held past their reads deliberately, six callers produced six carts
     * — so the race is real, and a test that cannot reproduce it is not a
     * regression guard, it is decoration.
     *
     * What IS deterministic is whether the read happens under a lock, and the
     * lock MODE is what makes it observable. `FOR KEY SHARE` below is chosen
     * precisely because it does not conflict with the lock an INSERT takes on
     * its parent row — inserting a supply order already takes `FOR KEY SHARE`
     * on `branches` to hold the foreign key still. So:
     *
     *  - the fixed service asks for `FOR UPDATE`, which **conflicts** with the
     *    lock held here, and waits;
     *  - the old service takes no lock of its own and its insert's `FOR KEY
     *    SHARE` is **compatible**, so it sails straight through and creates a
     *    second cart.
     *
     * Holding `FOR UPDATE` here instead would block both of them — the first
     * attempt at this test did exactly that and passed against code with the
     * lock deleted, which is worse than no test at all.
     */
    it('waits for the branch lock instead of racing another opener', async () => {
      const lonelyBranch = await freshBranch('LOCK');

      let settled = false;
      let pending;

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM branches WHERE id = ${lonelyBranch} FOR KEY SHARE`;

        // Runs on its own connection, so it blocks on the lock above rather
        // than deadlocking with it.
        pending = supplyOrderService.getOrCreateCart(businessId, lonelyBranch).then((cart) => {
          settled = true;
          return cart;
        });

        await new Promise((resolve) => setTimeout(resolve, 400));
        // Still waiting. Without the lock it would have read "no cart",
        // created one and resolved long before now.
        expect(settled).toBe(false);
      });

      const cart = await pending;
      expect(cart.branchId).toBe(lonelyBranch);

      const drafts = await prisma.supplyOrder.count({
        where: { businessId, branchId: lonelyBranch, status: 'DRAFT' },
      });
      expect(drafts).toBe(1);
    });

    it('hands every simultaneous caller the same cart', async () => {
      const opened = await Promise.all(
        Array.from({ length: 6 }, () => supplyOrderService.getOrCreateCart(businessId, branchId))
      );

      expect(new Set(opened.map((cart) => cart.id)).size).toBe(1);
      const drafts = await prisma.supplyOrder.count({
        where: { businessId, branchId, status: 'DRAFT' },
      });
      expect(drafts).toBe(1);
    });

    it('does not serialise two different branches against each other', async () => {
      // The lock is per branch, so two shops opening their carts at once must
      // not queue behind one another.
      const other = await freshBranch('PAR');
      const [a, b] = await Promise.all([
        supplyOrderService.getOrCreateCart(businessId, branchId),
        supplyOrderService.getOrCreateCart(businessId, other),
      ]);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('health reports whether it can actually serve', () => {
    it('checks the database rather than only that Node is running', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('ok');
    });
  });
});
