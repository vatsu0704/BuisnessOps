const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/config/db');

jest.setTimeout(20000);

const RUN_ID = Date.now();
const password = 'TestPass123!';
const ownerEmail = `ingest-owner.${RUN_ID}@test.buisnessops.dev`;
const cashierEmail = `ingest-cashier.${RUN_ID}@test.buisnessops.dev`;

const VALID_CSV = [
  'transaction_external_id,occurred_at,product_name,sku,quantity,unit_price,payment_method,tax_amount,discount_amount',
  'TXN-1,2026-01-05T10:00:00Z,Masala Chai,CHAI-001,2,25,CASH,2,0',
  'TXN-1,2026-01-05T10:00:00Z,Samosa,SAM-001,1,15,CASH,0,0',
  'TXN-2,2026-01-05T11:30:00Z,Masala Chai,CHAI-001,3,25,UPI,3,5',
  ',2026-01-06T09:00:00Z,Cold Coffee,,1,60,CARD,0,0',
  'TXN-3,2026-01-06T12:00:00Z,Bad Row Item,,,60,CARD,0,0', // missing quantity — should fail validation
].join('\n');

describe('CSV ingestion (Phase 1)', () => {
  let ownerToken;
  let cashierToken;
  let businessId;
  let branchId;
  let dataSourceId;
  const businessIdsToClean = [];
  const userIdsToClean = [];

  beforeAll(async () => {
    const ownerSignup = await request(app).post('/api/auth/signup').send({
      email: ownerEmail,
      password,
      name: 'Ingest Owner',
      businessName: `Ingest Business ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    expect(ownerSignup.statusCode).toBe(201);
    ownerToken = ownerSignup.body.token;
    businessId = ownerSignup.body.business.id;
    businessIdsToClean.push(businessId);
    userIdsToClean.push(ownerSignup.body.user.id);

    const cashierSignup = await request(app).post('/api/auth/signup').send({
      email: cashierEmail,
      password,
      name: 'Ingest Cashier',
      businessName: `Ingest Cashier Solo ${RUN_ID}`,
      industry: 'FOOD_BEVERAGE',
      country: 'IN',
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    businessIdsToClean.push(cashierSignup.body.business.id);
    userIdsToClean.push(cashierSignup.body.user.id);

    const branch = await request(app)
      .post(`/api/businesses/${businessId}/branches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Main Branch', code: 'MAIN', timezone: 'Asia/Kolkata' });
    expect(branch.statusCode).toBe(201);
    branchId = branch.body.id;

    const membership = await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: cashierEmail, role: 'CASHIER' });
    await request(app)
      .post(`/api/businesses/${businessId}/memberships/${membership.body.id}/branch-access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ branchId });
    const cashierLogin = await request(app).post('/api/auth/login').send({ email: cashierEmail, password });
    cashierToken = cashierLogin.body.token;

    const dataSource = await request(app)
      .post(`/api/businesses/${businessId}/data-sources`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ provider: 'CSV_UPLOAD', displayName: 'Manual CSV import', branchId });
    expect(dataSource.statusCode).toBe(201);
    dataSourceId = dataSource.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIdsToClean } } });
    await prisma.user.deleteMany({ where: { id: { in: userIdsToClean } } });
    await prisma.$disconnect();
  });

  it('rejects data source creation from a branch-scoped role without dataSource:manage', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/data-sources`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ provider: 'CSV_UPLOAD', displayName: 'Should be blocked', branchId });
    expect(res.statusCode).toBe(403);
  });

  it('imports valid rows, groups line items by transaction_external_id, and reports the bad row', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/data-sources/${dataSourceId}/upload`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from(VALID_CSV), 'sales.csv');

    expect(res.statusCode).toBe(201);
    expect(res.body.recordsProcessed).toBe(5);
    expect(res.body.recordsValid).toBe(4);
    expect(res.body.recordsFailed).toBe(1);
    expect(res.body.transactionsCreated).toBe(3); // TXN-1 group, TXN-2 group, the standalone row
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatch(/quantity/);

    // The same rejection as a code, so the upload screen can show it in the
    // reader's language rather than in the server's English. The row number
    // travels as a parameter because the sentence around it is translated.
    expect(res.body.errorDetails).toHaveLength(1);
    expect(res.body.errorDetails[0]).toMatchObject({
      code: 'ROW_MISSING_COLUMN',
      field: 'quantity',
      params: { row: expect.any(Number), column: 'quantity' },
    });

    expect(res.body.syncRun.status).toBe('PARTIAL');
  });

  it('computes correct transaction totals and reuses the same product across groups', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchId}/transactions`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(3);

    const txn1 = res.body.find((t) => t.externalId === 'TXN-1');
    expect(Number(txn1.totalAmount)).toBeCloseTo(65); // 2*25 + 1*15
    expect(Number(txn1.taxAmount)).toBeCloseTo(2);
    expect(txn1.paymentMethod).toBe('CASH');
    expect(txn1.lineItems).toHaveLength(2);

    const txn2 = res.body.find((t) => t.externalId === 'TXN-2');
    expect(Number(txn2.totalAmount)).toBeCloseTo(75);
    expect(Number(txn2.discountAmount)).toBeCloseTo(5);
    expect(txn2.paymentMethod).toBe('UPI');

    const standalone = res.body.find((t) => t.externalId === null);
    expect(Number(standalone.totalAmount)).toBeCloseTo(60);
    expect(standalone.paymentMethod).toBe('CARD');

    // "Masala Chai" appears in both TXN-1 and TXN-2 — should resolve to the
    // same Product both times, not create a duplicate.
    const chaiProductIds = new Set(
      res.body.flatMap((t) => t.lineItems.filter((li) => li.productNameSnapshot === 'Masala Chai').map((li) => li.productId))
    );
    expect(chaiProductIds.size).toBe(1);
  });

  it('re-uploading the same grouped rows updates existing transactions instead of duplicating them', async () => {
    const res = await request(app)
      .post(`/api/businesses/${businessId}/data-sources/${dataSourceId}/upload`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from(VALID_CSV), 'sales-again.csv');

    expect(res.statusCode).toBe(201);
    expect(res.body.transactionsUpdated).toBe(2); // TXN-1 and TXN-2 matched by (branchId, externalId)
    expect(res.body.transactionsCreated).toBe(1); // the externalId-less row always creates a new one

    const list = await request(app)
      .get(`/api/businesses/${businessId}/branches/${branchId}/transactions?limit=200`)
      .set('Authorization', `Bearer ${ownerToken}`);
    // 3 from the first upload + 1 new standalone from this upload = 4
    // (TXN-1/TXN-2 were updated in place, not duplicated).
    expect(list.body).toHaveLength(4);
  });

  it('returns an aggregated sales summary respecting branch access', async () => {
    const ownerRes = await request(app)
      .get(`/api/businesses/${businessId}/sales-summary`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerRes.statusCode).toBe(200);
    const inr = ownerRes.body.byCurrency.find((row) => row.currency === 'INR');
    expect(inr).toBeDefined();
    expect(Number(inr.totalSales)).toBeCloseTo(260); // 65 + 75 + 60 + 60 across the 4 transactions
    expect(inr.transactionCount).toBe(4);

    // The cashier's BranchAccess covers this same (only) branch, so they see the same totals.
    const cashierRes = await request(app)
      .get(`/api/businesses/${businessId}/sales-summary`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(cashierRes.statusCode).toBe(200);
    expect(cashierRes.body.byCurrency).toEqual(ownerRes.body.byCurrency);
  });

  it('lists the sync run history for the data source', async () => {
    const res = await request(app)
      .get(`/api/businesses/${businessId}/data-sources/${dataSourceId}/sync-runs`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0].status).toBe('PARTIAL'); // most recent first
  });
});
