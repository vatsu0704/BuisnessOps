const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const soleOwnerEmail = `del-sole.${RUN_ID}@test.buisnessops.dev`;
const teamOwnerEmail = `del-team.${RUN_ID}@test.buisnessops.dev`;
const staffEmail = `del-staff.${RUN_ID}@test.buisnessops.dev`;

// The Play Store and the App Store both require an app that lets people sign up
// to let them delete their account from inside it. These pin what deleting one
// actually does, and — as importantly — what it refuses to do.
describe('Deleting your own account', () => {
  const businessIdsToClean = [];
  const userIdsToClean = [];
  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  async function signUpOwnBusiness(email, businessName) {
    const res = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name: 'Delete Test',
      businessName,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(res.statusCode).toBe(201);
    businessIdsToClean.push(res.body.business.id);
    userIdsToClean.push(res.body.user.id);
    return res.body;
  }

  async function addBranch(token, businessId, code) {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set(auth(token))
      .send({ name: `Branch ${code}`, code, timezone: 'Asia/Kolkata' });
    expect(res.statusCode).toBe(201);
    return res.body.id;
  }

  const deleteAccount = (token, body) => request(app).post('/api/auth/me/delete').set(auth(token)).send(body);

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('a business owned alone', () => {
    let owner;
    let businessId;
    let branchId;

    beforeAll(async () => {
      owner = await signUpOwnBusiness(soleOwnerEmail, `Sole Owner ${RUN_ID}`);
      businessId = owner.business.id;
      branchId = await addBranch(owner.token, businessId, 'DSO');

      // Months of trading are what make a real cascade hard, so the business
      // gets one of each thing that hangs off it — including the two relations
      // that do not simply cascade: an expense's category is ON DELETE
      // RESTRICT, and a vendor is referenced with NO ACTION.
      const category = await prisma.expenseCategory.create({ data: { businessId, name: `Deletion test ${RUN_ID}` } });
      await prisma.expense.create({
        data: { businessId, branchId, categoryId: category.id, amount: 1200, currency: 'INR', expenseDate: new Date('2026-09-01') },
      });
      const vendor = await prisma.vendor.create({ data: { businessId, name: 'Milk Supplier' } });
      await prisma.inventoryItem.create({ data: { businessId, name: 'Milk', unit: 'L', vendorId: vendor.id } });
      await prisma.supplyOrder.create({
        data: {
          businessId,
          branchId,
          vendorId: vendor.id,
          totalAmount: 500,
          currency: 'INR',
          items: {
            create: [{ itemNameSnapshot: 'Milk', unitSnapshot: 'L', quantity: 10, unitPrice: 50, lineTotal: 500 }],
          },
        },
      });
      await prisma.counterOrder.create({
        data: { businessId, branchId, tokenNumber: 1, tokenDate: new Date('2026-09-01'), totalAmount: 90, currency: 'INR' },
      });
      const staff = await prisma.staffMember.create({ data: { businessId, branchId, name: 'Cook', role: 'Kitchen' } });
      await prisma.attendance.create({
        data: { businessId, branchId, staffMemberId: staff.id, date: new Date('2026-09-01') },
      });
    });

    it('refuses a wrong password and changes nothing', async () => {
      const res = await deleteAccount(owner.token, { password: 'not-the-password' });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_DELETE_PASSWORD_INCORRECT');

      expect(await prisma.business.findUnique({ where: { id: businessId } })).not.toBeNull();
      const me = await request(app).get('/api/auth/me').set(auth(owner.token));
      expect(me.statusCode).toBe(200);
    });

    it('asks for the password at all', async () => {
      const res = await deleteAccount(owner.token, {});
      expect(res.statusCode).toBe(400);
    });

    it('deletes the account, the business and everything in it', async () => {
      const res = await deleteAccount(owner.token, { password });
      expect(res.statusCode).toBe(200);
      expect(res.body.deletedBusinessIds).toEqual([businessId]);

      expect(await prisma.business.findUnique({ where: { id: businessId } })).toBeNull();
      expect(await prisma.expense.count({ where: { businessId } })).toBe(0);
      expect(await prisma.supplyOrder.count({ where: { businessId } })).toBe(0);
      expect(await prisma.attendance.count({ where: { businessId } })).toBe(0);

      const user = await prisma.user.findUnique({ where: { id: owner.user.id } });
      expect(user.status).toBe('DISABLED');
      expect(user.name).toBeNull();
      expect(user.email).toBe(`deleted+${owner.user.id}@deleted.invalid`);
    });

    it('kills the token that was in the app at once', async () => {
      const res = await request(app).get('/api/auth/me').set(auth(owner.token));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('AUTH_ACCOUNT_DISABLED');
    });

    it('cannot be signed into, and frees the address to sign up again', async () => {
      const login = await request(app).post('/api/auth/login').send({ email: soleOwnerEmail, password });
      expect(login.statusCode).toBe(401);
      expect(login.body.code).toBe('AUTH_CREDENTIALS_INVALID');

      await signUpOwnBusiness(soleOwnerEmail, `Sole Owner Again ${RUN_ID}`);
    });
  });

  describe('a business with a team, and someone who works in it', () => {
    let owner;
    let businessId;
    let branchId;
    let staff;
    let staffMemberId;
    let attendanceId;

    beforeAll(async () => {
      owner = await signUpOwnBusiness(teamOwnerEmail, `Team Owner ${RUN_ID}`);
      businessId = owner.business.id;
      branchId = await addBranch(owner.token, businessId, 'DTO');

      // Invited before they have an account, so signing up joins this business
      // instead of creating one of their own — a person who only works here.
      const invited = await request(app)
        .post(`/api/businesses/${businessId}/memberships`)
        .set(auth(owner.token))
        .send({ email: staffEmail, role: 'STAFF', branchIds: [branchId] });
      expect(invited.statusCode).toBe(201);
      const signup = await request(app)
        .post('/api/auth/signup')
        .send({ email: staffEmail, password, name: 'Team Staff' });
      expect(signup.statusCode).toBe(201);
      staff = signup.body;
      userIdsToClean.push(staff.user.id);

      const record = await prisma.staffMember.create({
        data: { businessId, branchId, name: 'Team Staff', role: 'Waiter', userId: staff.user.id },
      });
      staffMemberId = record.id;
      const day = await prisma.attendance.create({
        data: {
          businessId,
          branchId,
          staffMemberId,
          date: new Date('2026-09-02'),
          markedByMembershipId: owner.user.memberships[0].id,
        },
      });
      attendanceId = day.id;
    });

    it('refuses the owner while anybody else is still active, and says where', async () => {
      const res = await deleteAccount(owner.token, { password });
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('ACCOUNT_DELETE_OWNER_HAS_TEAM');
      expect(res.body.params).toEqual({ business: `Team Owner ${RUN_ID}`, count: 1 });

      // The check runs before any write, so nothing at all has changed.
      expect(await prisma.business.findUnique({ where: { id: businessId } })).not.toBeNull();
      const user = await prisma.user.findUnique({ where: { id: owner.user.id } });
      expect(user.status).toBe('ACTIVE');
      expect(user.email).toBe(teamOwnerEmail);
    });

    it("ends a worker's account but leaves the employer's records alone", async () => {
      const res = await deleteAccount(staff.token, { password });
      expect(res.statusCode).toBe(200);
      expect(res.body.deletedBusinessIds).toEqual([]);

      const membership = await prisma.membership.findFirst({ where: { userId: staff.user.id, businessId } });
      expect(membership.status).toBe('REVOKED');

      // The day they worked is the employer's record of paying them.
      expect(await prisma.attendance.findUnique({ where: { id: attendanceId } })).not.toBeNull();
      const record = await prisma.staffMember.findUnique({ where: { id: staffMemberId } });
      expect(record).not.toBeNull();
      expect(record.userId).toBeNull();

      expect(await prisma.business.findUnique({ where: { id: businessId } })).not.toBeNull();
    });

    it('lets the owner go once nobody else is active', async () => {
      const res = await deleteAccount(owner.token, { password });
      expect(res.statusCode).toBe(200);
      expect(res.body.deletedBusinessIds).toEqual([businessId]);
      expect(await prisma.business.findUnique({ where: { id: businessId } })).toBeNull();
    });
  });
});
