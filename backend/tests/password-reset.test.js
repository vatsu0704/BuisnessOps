const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `reset-owner.${RUN_ID}@test.buisnessops.dev`;
const disabledEmail = `reset-disabled.${RUN_ID}@test.buisnessops.dev`;

const hashOf = (token) => crypto.createHash('sha256').update(token).digest('hex');
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Forgetting a password, and changing one.
 *
 * There was no way to do either until 2026-10-19, so a forgotten password meant
 * a lost account and the business inside it.
 */
describe('Password reset', () => {
  const userIds = [];
  const businessIds = [];
  let ownerToken;
  let ownerId;

  async function signUp(email, businessName) {
    const res = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name: 'Reset Test',
      businessName,
      industry: 'RETAIL',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(res.statusCode).toBe(201);
    userIds.push(res.body.user.id);
    businessIds.push(res.body.business.id);
    return res.body;
  }

  /** The token only ever exists in the email, so a test has to mint its own. */
  async function linkFor(userId) {
    const row = await prisma.passwordResetToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return row;
  }

  /** Put a known token on a user, bypassing the one-a-minute floor. */
  async function giveToken(userId, { expiresInMinutes = 60 } = {}) {
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashOf(token),
        expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
      },
    });
    return token;
  }

  beforeAll(async () => {
    const owner = await signUp(ownerEmail, `Reset Co ${RUN_ID}`);
    ownerToken = owner.token;
    ownerId = owner.user.id;
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    for (const businessId of businessIds) {
      await prisma.business.deleteMany({ where: { id: businessId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe('asking for a link', () => {
    it('mints one for a real address', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: ownerEmail });
      expect(res.statusCode).toBe(204);

      const row = await linkFor(ownerId);
      expect(row).not.toBeNull();
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    /**
     * The one that matters. `GET /invites?email=` is already an existence oracle
     * for invited addresses; this must not add a second. "Does this person bank
     * here" is exactly what an attacker wants from a business app.
     */
    it('answers the same for an address with no account', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: `nobody.${RUN_ID}@test.buisnessops.dev` });
      expect(res.statusCode).toBe(204);
    });

    it('answers the same for a disabled account, and mints nothing', async () => {
      const disabled = await signUp(disabledEmail, `Reset Off ${RUN_ID}`);
      await prisma.user.update({ where: { id: disabled.user.id }, data: { status: 'DISABLED' } });

      const res = await request(app).post('/api/auth/forgot-password').send({ email: disabledEmail });
      expect(res.statusCode).toBe(204);
      expect(await linkFor(disabled.user.id)).toBeNull();
    });

    it('refuses something that is not an address', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'not-an-email' });
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0].code).toBe('EMAIL_REQUIRED');
    });

    it('stops the previous link working as soon as a new one is asked for', async () => {
      const old = await giveToken(ownerId);
      // Past the one-a-minute floor, which exists so nobody can fill an inbox.
      await prisma.passwordResetToken.updateMany({
        where: { userId: ownerId, usedAt: null },
        data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
      });

      await request(app).post('/api/auth/forgot-password').send({ email: ownerEmail });

      const stale = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashOf(old) } });
      expect(stale.usedAt).not.toBeNull();
    });
  });

  describe('spending a link', () => {
    it('refuses a token nobody issued', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'made-up', password: 'BrandNew123!' });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
    });

    it('refuses one that has expired', async () => {
      const token = await giveToken(ownerId, { expiresInMinutes: -1 });
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'BrandNew123!' });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('PASSWORD_RESET_TOKEN_EXPIRED');
    });

    it('refuses a password shorter than signup would accept', async () => {
      const token = await giveToken(ownerId);
      const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'short' });
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0].code).toBe('PASSWORD_TOO_SHORT');
    });

    it('sets the new password, spends the token, and signs the old sessions out', async () => {
      const token = await giveToken(ownerId);
      const newPassword = 'AfterReset123!';

      // The session held before the reset works right up to the moment it does not.
      expect((await request(app).get('/api/auth/me').set(auth(ownerToken))).statusCode).toBe(200);

      const res = await request(app).post('/api/auth/reset-password').send({ token, password: newPassword });
      expect(res.statusCode).toBe(204);

      // Seven-day tokens are stateless, so without `passwordChangedAt` the
      // device this reset was meant to shut out would stay signed in all week.
      const after = await request(app).get('/api/auth/me').set(auth(ownerToken));
      expect(after.statusCode).toBe(401);
      expect(after.body.code).toBe('AUTH_TOKEN_INVALID');

      // The old password is gone and the new one works.
      expect((await request(app).post('/api/auth/login').send({ email: ownerEmail, password })).statusCode).toBe(401);
      const signedIn = await request(app)
        .post('/api/auth/login')
        .send({ email: ownerEmail, password: newPassword });
      expect(signedIn.statusCode).toBe(200);
      ownerToken = signedIn.body.token;

      // Single use.
      const again = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, password: 'YetAnother123!' });
      expect(again.statusCode).toBe(400);
      expect(again.body.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
    });
  });

  describe('changing it while signed in', () => {
    it('refuses the wrong current password', async () => {
      const res = await request(app)
        .post('/api/auth/me/password')
        .set(auth(ownerToken))
        .send({ currentPassword: 'NotTheOne123!', newPassword: 'Changed123!' });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('PASSWORD_CHANGE_CURRENT_INCORRECT');
    });

    it('needs a session at all', async () => {
      const res = await request(app)
        .post('/api/auth/me/password')
        .send({ currentPassword: 'AfterReset123!', newPassword: 'Changed123!' });
      expect(res.statusCode).toBe(401);
    });

    it('changes it and hands back a token that still works', async () => {
      const res = await request(app)
        .post('/api/auth/me/password')
        .set(auth(ownerToken))
        .send({ currentPassword: 'AfterReset123!', newPassword: 'Changed123!' });

      expect(res.statusCode).toBe(200);
      expect(typeof res.body.token).toBe('string');

      // The fresh token is what stops "change my password" meaning "sign me out".
      expect((await request(app).get('/api/auth/me').set(auth(res.body.token))).statusCode).toBe(200);
      expect(
        (await request(app).post('/api/auth/login').send({ email: ownerEmail, password: 'Changed123!' })).statusCode
      ).toBe(200);
    });
  });
});
