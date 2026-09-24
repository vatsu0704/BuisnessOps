const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');
const { roleHas, capabilitiesOf, ROLES } = require('../src/permissions');
const { CAPABILITIES, ROLE_CAPABILITIES } = require('../src/permissions/catalog');

// The capability matrix, tested two ways.
//
// The first block is pure unit assertions on the matrix itself — cheap, and
// they pin the decisions that are easy to undo by accident.
//
// The second block drives real HTTP requests for the roles added in this task,
// because a matrix that is right and a route that is wired to the wrong
// capability look identical from the matrix alone.
jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `perm-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `perm-cashier.${RUN_ID}@test.buisnessops.dev`;
const warehouseEmail = `perm-warehouse.${RUN_ID}@test.buisnessops.dev`;
const deliveryEmail = `perm-delivery.${RUN_ID}@test.buisnessops.dev`;

describe('the capability matrix', () => {
  it('grants nothing to an unknown role', () => {
    expect(roleHas('NOT_A_ROLE', 'team:view')).toBe(false);
    expect(capabilitiesOf('NOT_A_ROLE')).toEqual([]);
  });

  it('grants every capability to OWNER through the wildcard', () => {
    expect(capabilitiesOf('OWNER').sort()).toEqual(Object.keys(CAPABILITIES).sort());
  });

  // Requirement 14, as a unit assertion so it fails loudly if someone narrows
  // MANAGER without meaning to.
  it('gives MANAGER exactly what ADMIN has', () => {
    expect(capabilitiesOf('MANAGER').sort()).toEqual(capabilitiesOf('ADMIN').sort());
  });

  // The split that WAREHOUSE exists to force. If these two ever agree, the
  // order desk has been handed every branch's HR records.
  it('gives WAREHOUSE all-branch DATA scope and no authority over people', () => {
    expect(roleHas('WAREHOUSE', 'branch:allAccess')).toBe(true);
    expect(roleHas('WAREHOUSE', 'staff:viewAllBranches')).toBe(false);
    expect(roleHas('WAREHOUSE', 'staff:viewOthers')).toBe(false);
    expect(roleHas('WAREHOUSE', 'payroll:view')).toBe(false);
  });

  it('keeps every branch-scoped role out of branch:allAccess', () => {
    for (const role of ['CASHIER', 'DELIVERY_AGENT', 'STAFF']) {
      expect(roleHas(role, 'branch:allAccess')).toBe(false);
    }
  });

  it('gives STAFF nothing — its access is self-checks, not capabilities', () => {
    expect(capabilitiesOf('STAFF')).toEqual([]);
  });

  it('names only capabilities that exist in the catalog', () => {
    const known = new Set(Object.keys(CAPABILITIES));
    for (const [role, granted] of Object.entries(ROLE_CAPABILITIES)) {
      if (granted === '*') continue;
      for (const capability of granted) {
        expect({ role, capability, known: known.has(capability) }).toEqual({
          role,
          capability,
          known: true,
        });
      }
    }
  });

  it('covers every role in the MembershipRole enum, and invents none', () => {
    // Prisma's generated enum is the schema's own word on what roles exist, so
    // this catches both directions: a role added to the database and forgotten
    // in the matrix (which would be granted nothing and read as a broken
    // login), and a role in the matrix that no migration ever created.
    const { MembershipRole } = require('@prisma/client');
    expect([...ROLES].sort()).toEqual(Object.keys(MembershipRole).sort());
  });
});

describe('the operations roles over HTTP', () => {
  let ownerToken;
  let cashierToken;
  let warehouseToken;
  let deliveryToken;
  let businessId;
  let branchAId;
  let branchBId;
  let staffInAId;
  let staffInBId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  async function joinAs(email, label, role, branchIds = []) {
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
      .post(`/api/businesses/${businessId}/memberships`)
      .set(auth(ownerToken))
      .send({ email, role, branchIds });
    expect(membership.statusCode).toBe(201);

    const login = await request(app).post('/api/auth/login').send({ email, password });
    expect(login.statusCode).toBe(200);
    return login.body.token;
  }

  beforeAll(async () => {
    const owner = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Perm Owner',
      businessName: `Perm Business ${RUN_ID}`,
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
      ['Perm Branch A', 'PMA'],
      ['Perm Branch B', 'PMB'],
    ]) {
      const branch = await request(app)
        .post(`/api/businesses/${businessId}/branches`)
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata' });
      expect(branch.statusCode).toBe(201);
      if (code === 'PMA') branchAId = branch.body.id;
      else branchBId = branch.body.id;
    }

    // The cashier is scoped to branch A only — every "other branch" assertion
    // below turns on that.
    cashierToken = await joinAs(cashierEmail, 'Perm Cashier', 'CASHIER', [branchAId]);
    warehouseToken = await joinAs(warehouseEmail, 'Perm Warehouse', 'WAREHOUSE');
    deliveryToken = await joinAs(deliveryEmail, 'Perm Delivery', 'DELIVERY_AGENT', [branchAId]);

    for (const [branchId, key] of [
      [branchAId, 'A'],
      [branchBId, 'B'],
    ]) {
      const staff = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set(auth(ownerToken))
        .send({ name: `Worker ${key}`, role: 'Helper', branchId });
      expect(staff.statusCode).toBe(201);
      if (key === 'A') staffInAId = staff.body.id;
      else staffInBId = staff.body.id;
    }
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('CASHIER', () => {
    // Requirement 14: "the cashier will decide their staff's salary". This was
    // OWNER/ADMIN-only before.
    it("sets a salary for staff at their own branch", async () => {
      const res = await request(app)
        .patch(`/api/businesses/${businessId}/staff/${staffInAId}`)
        .set(auth(cashierToken))
        .send({ baseSalary: 18000 });
      expect(res.statusCode).toBe(200);
      expect(Number(res.body.baseSalary)).toBe(18000);
    });

    it('is refused a salary change for staff at a branch they cannot reach', async () => {
      const res = await request(app)
        .patch(`/api/businesses/${businessId}/staff/${staffInBId}`)
        .set(auth(cashierToken))
        .send({ baseSalary: 18000 });
      expect(res.statusCode).toBe(403);
    });

    // The check in staff.controller used to read `role === 'MANAGER' && ...`,
    // so it was skipped entirely for a cashier and this returned 201.
    it('is refused creating a staff record in a branch they cannot reach', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff`)
        .set(auth(cashierToken))
        .send({ name: 'Smuggled In', role: 'Helper', branchId: branchBId });
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('does not run payroll', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/payroll/preview?month=9&year=2026`)
        .set(auth(cashierToken));
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELIVERY_AGENT', () => {
    // The sharpest regression the deny-lists would have caused: a delivery
    // agent is not STAFF, so `if (role === 'STAFF') return false` let them
    // straight through to a colleague's HR record.
    it("cannot read a colleague's staff record", async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/staff/${staffInAId}`)
        .set(auth(deliveryToken));
      expect(res.statusCode).toBe(403);
    });

    it("cannot read a colleague's attendance", async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/staff/${staffInAId}/attendance?month=9&year=2026`)
        .set(auth(deliveryToken));
      expect(res.statusCode).toBe(403);
    });

    it('cannot mark anyone present', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/staff/${staffInAId}/attendance/mark`)
        .set(auth(deliveryToken))
        .send({ date: '2026-09-01', status: 'PRESENT' });
      expect(res.statusCode).toBe(403);
    });

    it('sees an empty staff list rather than the branch roster', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/staff`)
        .set(auth(deliveryToken));
      expect(res.statusCode).toBe(200);
      // No StaffMember row is linked to this user, so "only my own" is empty.
      // Before the fix in staff.service.js this returned branch A's roster.
      expect(res.body).toEqual([]);
    });
  });

  describe('WAREHOUSE', () => {
    it('reads every branch without holding a single branch grant', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/branches`)
        .set(auth(warehouseToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.map((b) => b.id).sort()).toEqual([branchAId, branchBId].sort());
    });

    // branchAccess === null used to mean "business-wide authority over people"
    // as well as "all branches of data". This is the assertion that it no
    // longer does.
    it("cannot read any branch's staff record", async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/staff/${staffInAId}`)
        .set(auth(warehouseToken));
      expect(res.statusCode).toBe(403);
    });

    // The line that would have thrown a TypeError — and so returned 500 rather
    // than 403 — without the `branchAccess !== null` guard in staffScope.
    it('gets a clean 403 rather than a 500 on the staff path', async () => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/staff/${staffInBId}`)
        .set(auth(warehouseToken));
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('STAFF_ACCESS_DENIED');
    });

    it('cannot set anyone’s pay', async () => {
      const res = await request(app)
        .patch(`/api/businesses/${businessId}/staff/${staffInAId}`)
        .set(auth(warehouseToken))
        .send({ baseSalary: 99000 });
      expect(res.statusCode).toBe(403);
    });
  });
});
