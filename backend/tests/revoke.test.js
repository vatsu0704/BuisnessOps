const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(30000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `rev-owner.${RUN_ID}@test.buisnessops.dev`;
const adminEmail = `rev-admin.${RUN_ID}@test.buisnessops.dev`;
const managerEmail = `rev-manager.${RUN_ID}@test.buisnessops.dev`;
// Branch grants are exercised through a CASHIER, not the MANAGER: requirement
// 14 made MANAGER business-wide, so narrowing a manager's BranchAccess rows no
// longer narrows anything. CASHIER is the branch-scoped role now.
const cashierEmail = `rev-cashier.${RUN_ID}@test.buisnessops.dev`;
const neverSignedUpEmail = `rev-pending.${RUN_ID}@test.buisnessops.dev`;

// Access could only ever be granted before this: an invite could be sent but
// never withdrawn, and a branch grant never narrowed. These cover taking it
// away, and the guards that stop the same endpoints being used to seize a
// business from the person who owns it.
describe('Revoking access', () => {
  let ownerToken;
  let adminToken;
  let managerToken;
  let cashierToken;
  let businessId;
  let branchAId;
  let branchBId;
  let adminMembershipId;
  let managerMembershipId;
  let cashierMembershipId;
  let ownerMembershipId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  async function signUpOwnBusiness(email, name, businessName) {
    const res = await request(app).post('/api/auth/signup').send({
      email,
      password,
      name,
      businessName,
      industry: 'RETAIL',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(res.statusCode).toBe(201);
    businessIdsToClean.push(res.body.business.id);
    userIdsToClean.push(res.body.user.id);
    return res.body;
  }

  async function membershipIdFor(email) {
    const list = await request(app).get(`/api/businesses/${businessId}/memberships`).set(auth(ownerToken));
    return list.body.find((m) => m.user.email === email.toLowerCase())?.id;
  }

  beforeAll(async () => {
    const owner = await signUpOwnBusiness(ownerEmail, 'Revoke Owner', `Revoke Business ${RUN_ID}`);
    ownerToken = owner.token;
    businessId = owner.business.id;
    ownerMembershipId = owner.user.memberships[0].id;

    for (const [name, code] of [
      ['Branch A', 'RVA'],
      ['Branch B', 'RVB'],
    ]) {
      const branch = await request(app)
        .post(`/api/businesses/${businessId}/branches`)
        .set(auth(ownerToken))
        .send({ name, code, timezone: 'Asia/Kolkata' });
      if (code === 'RVA') branchAId = branch.body.id;
      else branchBId = branch.body.id;
    }

    // Both already have their own account, so inviting them joins them
    // immediately rather than creating a pending invite.
    const admin = await signUpOwnBusiness(adminEmail, 'Revoke Admin', `Admin Solo ${RUN_ID}`);
    adminToken = admin.token;
    const manager = await signUpOwnBusiness(managerEmail, 'Revoke Manager', `Manager Solo ${RUN_ID}`);
    managerToken = manager.token;
    const cashier = await signUpOwnBusiness(cashierEmail, 'Revoke Cashier', `Cashier Solo ${RUN_ID}`);
    cashierToken = cashier.token;

    await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set(auth(ownerToken))
      .send({ email: adminEmail, role: 'ADMIN' });
    await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set(auth(ownerToken))
      .send({ email: managerEmail, role: 'MANAGER', branchIds: [branchAId, branchBId] });
    await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set(auth(ownerToken))
      .send({ email: cashierEmail, role: 'CASHIER', branchIds: [branchAId, branchBId] });

    adminMembershipId = await membershipIdFor(adminEmail);
    managerMembershipId = await membershipIdFor(managerEmail);
    cashierMembershipId = await membershipIdFor(cashierEmail);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  describe('a pending invite', () => {
    let inviteId;

    it('can be withdrawn before it is ever claimed', async () => {
      const invited = await request(app)
        .post(`/api/businesses/${businessId}/memberships`)
        .set(auth(ownerToken))
        .send({ email: neverSignedUpEmail, role: 'STAFF', branchIds: [branchAId] });
      expect(invited.body.pending).toBe(true);
      inviteId = invited.body.id;

      const revoked = await request(app)
        .delete(`/api/businesses/${businessId}/invites/${inviteId}`)
        .set(auth(ownerToken));
      expect(revoked.statusCode).toBe(200);
      expect(revoked.body.status).toBe('REVOKED');

      const list = await request(app).get(`/api/businesses/${businessId}/invites`).set(auth(ownerToken));
      expect(list.body.find((i) => i.id === inviteId)).toBeUndefined();
    });

    it('stops being visible to the invitee, and no longer joins them at signup', async () => {
      const lookup = await request(app).get(
        `/api/invites/lookup?email=${encodeURIComponent(neverSignedUpEmail)}`
      );
      expect(lookup.statusCode).toBe(404);

      // The point of the whole feature: with the invite still live this signup
      // would have joined the inviting business. It must now create their own.
      const signup = await signUpOwnBusiness(
        neverSignedUpEmail,
        'Never Invited After All',
        `Their Own Business ${RUN_ID}`
      );
      expect(signup.business.id).not.toBe(businessId);
      expect(signup.user.memberships).toHaveLength(1);
      expect(signup.user.memberships[0].role).toBe('OWNER');
    });

    it('is 404 for an id that is not a pending invite in this business', async () => {
      const res = await request(app)
        .delete(`/api/businesses/${businessId}/invites/${ownerMembershipId}`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(404);
    });
  });

  describe('a branch grant', () => {
    it('can be narrowed without touching the rest of the membership', async () => {
      const before = await request(app)
        .get(`/api/businesses/${businessId}/branches`)
        .set(auth(cashierToken));
      expect(before.body.map((b) => b.id).sort()).toEqual([branchAId, branchBId].sort());

      const res = await request(app)
        .delete(`/api/businesses/${businessId}/memberships/${cashierMembershipId}/branch-access/${branchBId}`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      // Still a member of the business - they just see one branch now.
      const after = await request(app).get(`/api/businesses/${businessId}/branches`).set(auth(cashierToken));
      expect(after.statusCode).toBe(200);
      expect(after.body.map((b) => b.id)).toEqual([branchAId]);
    });

    it('404s when that member never had access to the branch', async () => {
      const res = await request(app)
        .delete(`/api/businesses/${businessId}/memberships/${cashierMembershipId}/branch-access/${branchBId}`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(404);
    });

    // The flip side of requirement 14, asserted so it is a decision on record
    // rather than a surprise: a manager's BranchAccess rows still exist and can
    // still be removed, but they no longer bound what the manager can reach.
    // The Team screen should therefore stop offering branch scoping for MANAGER.
    it('no longer narrows a MANAGER, whose reach is business-wide', async () => {
      const res = await request(app)
        .delete(`/api/businesses/${businessId}/memberships/${managerMembershipId}/branch-access/${branchBId}`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);

      const after = await request(app).get(`/api/businesses/${businessId}/branches`).set(auth(managerToken));
      expect(after.statusCode).toBe(200);
      expect(after.body.map((b) => b.id).sort()).toEqual([branchAId, branchBId].sort());
    });
  });

  describe('a membership', () => {
    it('cannot be revoked by its own holder', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/memberships/${ownerMembershipId}/revoke`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/your own access/i);
    });

    it('cannot be taken from the owner by an admin', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/memberships/${ownerMembershipId}/revoke`)
        .set(auth(adminToken));
      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/only an owner/i);
    });

    it('cannot be revoked by a member with no permission to manage the team', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/memberships/${adminMembershipId}/revoke`)
        .set(auth(managerToken));
      expect(res.statusCode).toBe(403);
    });

    it('ends that persons access to the business on their very next request', async () => {
      const beforeRevoke = await request(app)
        .get(`/api/businesses/${businessId}/branches`)
        .set(auth(managerToken));
      expect(beforeRevoke.statusCode).toBe(200);

      const res = await request(app)
        .post(`/api/businesses/${businessId}/memberships/${managerMembershipId}/revoke`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('REVOKED');

      // Same token as before. Revocation has to bite without waiting for the
      // token to expire, which is why resolveTenant re-checks status on every
      // single request rather than trusting what the token was issued against.
      const afterRevoke = await request(app)
        .get(`/api/businesses/${businessId}/branches`)
        .set(auth(managerToken));
      expect(afterRevoke.statusCode).toBe(403);
    });

    it('is idempotent, so a repeated tap is not an error', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/memberships/${managerMembershipId}/revoke`)
        .set(auth(ownerToken));
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('REVOKED');
    });

    it('keeps the row, so the team list still shows what happened', async () => {
      const list = await request(app).get(`/api/businesses/${businessId}/memberships`).set(auth(ownerToken));
      const revoked = list.body.find((m) => m.id === managerMembershipId);
      expect(revoked).toBeTruthy();
      expect(revoked.status).toBe('REVOKED');
    });

    it('can be granted again by re-inviting, which is the only way back', async () => {
      const res = await request(app)
        .post(`/api/businesses/${businessId}/memberships`)
        .set(auth(ownerToken))
        .send({ email: managerEmail, role: 'STAFF', branchIds: [branchAId] });
      expect(res.statusCode).toBe(201);
      expect(res.body.pending).toBe(false);
      expect(res.body.status).toBe('ACTIVE');
      // Re-adding is a fresh decision about access, not an undo: the role is
      // the one on this invite, not the MANAGER role they held before.
      expect(res.body.role).toBe('STAFF');

      const afterReinvite = await request(app)
        .get(`/api/businesses/${businessId}/branches`)
        .set(auth(managerToken));
      expect(afterReinvite.statusCode).toBe(200);
    });
  });

  describe('the session payload', () => {
    it('names every business a person belongs to, so the app can offer a switch', async () => {
      // This person owns their own business and was invited into another.
      const me = await request(app).get('/api/auth/me').set(auth(adminToken));
      expect(me.statusCode).toBe(200);
      expect(me.body.user.memberships.length).toBeGreaterThan(1);
      for (const membership of me.body.user.memberships) {
        expect(membership.business.name).toEqual(expect.any(String));
        expect(membership.business.id).toBe(membership.businessId);
      }
    });

    it('serves the full business record for any business the caller belongs to', async () => {
      const res = await request(app).get(`/api/businesses/${businessId}`).set(auth(adminToken));
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        id: businessId,
        defaultCurrency: 'INR',
        timezone: 'Asia/Kolkata',
      });
    });

    it('has no business at all for someone revoked from every one they were in', async () => {
      // Their own business, revoked directly - the API has no path to this,
      // by design, since an owner cannot revoke themselves.
      const them = await prisma.user.findUnique({
        where: { email: neverSignedUpEmail.toLowerCase() },
        include: { memberships: true },
      });
      await prisma.membership.update({
        where: { id: them.memberships[0].id },
        data: { status: 'REVOKED' },
      });

      const session = await request(app).post('/api/auth/login').send({ email: neverSignedUpEmail, password });
      expect(session.statusCode).toBe(200);
      // Not the revoked business with a friendly name on it: naming one here
      // would point the app at a businessId every request would then be
      // refused for, which reads as the app being broken.
      expect(session.body.business).toBeNull();
      expect(session.body.user.memberships.every((m) => m.status === 'REVOKED')).toBe(true);
    });

    it('refuses the business record to someone who does not belong to it', async () => {
      const outsiderBusinessId = businessIdsToClean.find((id) => id !== businessId);
      const res = await request(app).get(`/api/businesses/${outsiderBusinessId}`).set(auth(ownerToken));
      expect(res.statusCode).toBe(403);
    });
  });
});
