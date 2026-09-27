const fs = require('fs');
const path = require('path');
const request = require('supertest');
const XLSX = require('xlsx');
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

    // The branch comes with the invite rather than as a follow-up call:
    // requirement 18 refuses a cashier invited with no branch, because a till
    // belongs to a shop and a cashier with none has nothing to do.
    const membership = await request(app)
      .post(`/api/businesses/${businessId}/memberships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: cashierEmail, role: 'CASHIER', branchIds: [branchId] });
    expect(membership.statusCode).toBe(201);
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

  // Files as people actually produce them: typed into the template, opened and
  // re-saved by Excel or Google Sheets, or exported by a POS. Each case below
  // was a real failure — a sale in the wrong month, every row rejected over a
  // header's capital letter, a Hindi product name turned to mojibake. Kept on a
  // branch of their own so the totals asserted above stay what they are.
  describe('real-world files', () => {
    let kolkataBranchId;
    let kolkataSourceId;

    const upload = (csvOrBuffer, name = 'sales.csv', sourceId = kolkataSourceId) =>
      request(app)
        .post(`/api/businesses/${businessId}/data-sources/${sourceId}/upload`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('file', Buffer.isBuffer(csvOrBuffer) ? csvOrBuffer : Buffer.from(csvOrBuffer, 'utf8'), name);

    const transactionsOf = async (externalIds) => {
      const res = await request(app)
        .get(`/api/businesses/${businessId}/branches/${kolkataBranchId}/transactions?limit=200`)
        .set('Authorization', `Bearer ${ownerToken}`);
      return res.body.filter((t) => externalIds.includes(t.externalId));
    };

    beforeAll(async () => {
      const branch = await request(app)
        .post(`/api/businesses/${businessId}/branches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Real Files Branch', code: 'REAL', timezone: 'Asia/Kolkata' });
      expect(branch.statusCode).toBe(201);
      kolkataBranchId = branch.body.id;

      const source = await request(app)
        .post(`/api/businesses/${businessId}/data-sources`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ provider: 'CSV_UPLOAD', displayName: 'Real files', branchId: kolkataBranchId });
      kolkataSourceId = source.body.id;
    });

    it('imports the template the app hands out, leaving its sample rows out', async () => {
      // The app's own template, read from its source, so the two cannot drift.
      const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'frontend', 'src', 'constants', 'salesTemplate.ts'),
        'utf8'
      );
      const template = /SALES_TEMPLATE_CSV = `([^`]*)`/.exec(source)[1];

      const untouched = await upload(template, 'biziq-sales-template.csv');
      expect(untouched.statusCode).toBe(201);
      expect(untouched.body.recordsFailed).toBe(0);
      expect(untouched.body.examplesSkipped).toBeGreaterThan(0);
      expect(untouched.body.transactionsCreated).toBe(0);

      // Filled in the way the samples show, every row is accepted.
      const filled = await upload(template.replace(/EXAMPLE-/g, 'TPL-'), 'filled.csv');
      expect(filled.body.recordsFailed).toBe(0);
      expect(filled.body.examplesSkipped).toBe(0);
      expect(filled.body.transactionsCreated).toBeGreaterThan(0);
    });

    it('reads a hand-typed Indian file: loose headers, Hindi names, formatted amounts, day-first dates', async () => {
      const csv = [
        // Title case, a trailing space, and no byte-order mark (a Google Sheets export).
        'Transaction External ID,Occurred At,Product Name,Quantity ,Unit Price,Payment Method,Tax Amount',
        'REAL-1,01/09/2026 10:30 PM,मसाला चाय,2,30,cash ,',
        'REAL-1,01/09/2026 10:30 PM,Samosa,1,"1,200",CASH,₹12',
        'REAL-2,13/09/2026 9:05 am,ખમણ ઢોકળા,0.5,Rs. 80,upi,0',
        'EXAMPLE-9,01/09/2026 10:30 PM,Sample row,1,10,CASH,0',
        ',,,,,,',
      ].join('\n');

      const res = await upload(csv);
      expect(res.statusCode).toBe(201);
      expect(res.body.recordsFailed).toBe(0);
      expect(res.body.examplesSkipped).toBe(1);
      expect(res.body.dateOrder).toBe('DAY_FIRST');
      expect(res.body.transactionsCreated).toBe(2);

      const [first, second] = await transactionsOf(['REAL-1', 'REAL-2']).then((list) =>
        ['REAL-1', 'REAL-2'].map((id) => list.find((t) => t.externalId === id))
      );
      // 1 September at 10:30 PM in Kolkata — not 9 January, and not the next
      // day, whatever timezone the server itself runs in.
      expect(new Date(first.occurredAt).toISOString()).toBe('2026-09-01T17:00:00.000Z');
      expect(Number(first.totalAmount)).toBeCloseTo(1260); // 2 × 30 + 1 × 1,200
      expect(Number(first.taxAmount)).toBeCloseTo(12);
      expect(first.paymentMethod).toBe('CASH');
      expect(first.lineItems.map((li) => li.productNameSnapshot)).toContain('मसाला चाय');

      expect(new Date(second.occurredAt).toISOString()).toBe('2026-09-13T03:35:00.000Z');
      expect(Number(second.totalAmount)).toBeCloseTo(40);
      expect(second.lineItems[0].productNameSnapshot).toBe('ખમણ ઢોકળા');
    });

    it('reads a month-first file month-first, and says so', async () => {
      const res = await upload(
        [
          'transaction_external_id,occurred_at,product_name,quantity,unit_price,payment_method',
          'US-1,9/1/2026 10:15,Chai,1,30,CASH',
          'US-2,9/13/2026 10:15,Chai,1,30,CASH',
        ].join('\n')
      );
      expect(res.body.dateOrder).toBe('MONTH_FIRST');
      expect(res.body.recordsFailed).toBe(0);
      const [first] = await transactionsOf(['US-1']);
      expect(new Date(first.occurredAt).toISOString()).toBe('2026-09-01T04:45:00.000Z');
    });

    it('reads an Excel workbook: a cover sheet first, a title above the header, date and currency cells', async () => {
      const cover = XLSX.utils.aoa_to_sheet([['How to fill this in'], ['One row per item sold']]);
      const sales = XLSX.utils.aoa_to_sheet([
        ['September sales export'],
        [],
        ['transaction_external_id', 'occurred_at', 'product_name', 'quantity', 'unit_price', 'payment_method'],
      ]);
      // How Excel stores what was typed: a date is a serial number with a date
      // format, a price is a number with a currency format.
      sales.A4 = { t: 's', v: 'XL-1' };
      sales.B4 = { t: 'n', v: 46266.9375, z: 'dd-mm-yyyy hh:mm' }; // 1 Sep 2026, 10:30 PM
      sales.C4 = { t: 's', v: 'Thali' };
      sales.D4 = { t: 'n', v: 1 };
      sales.E4 = { t: 'n', v: 1200, z: '"₹"#,##0.00' };
      sales.F4 = { t: 's', v: 'UPI' };
      sales['!ref'] = 'A1:F4';
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, cover, 'Instructions');
      XLSX.utils.book_append_sheet(book, sales, 'Sales');

      const res = await upload(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), 'sales.xlsx');
      expect(res.statusCode).toBe(201);
      expect(res.body.recordsFailed).toBe(0);
      const [row] = await transactionsOf(['XL-1']);
      expect(new Date(row.occurredAt).toISOString()).toBe('2026-09-01T17:00:00.000Z');
      expect(Number(row.totalAmount)).toBeCloseTo(1200);
    });

    it('names a missing column once, instead of failing every row over it', async () => {
      const res = await upload('occurred_at,product,quantity,unit_price,payment_method\n2026-09-01,Chai,1,30,CASH\n');
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('FILE_MISSING_COLUMNS');
      expect(res.body.params).toEqual({ columns: 'product_name' });
    });

    it('rejects a bad value in its own row, at the line the spreadsheet shows, without failing the upload', async () => {
      const res = await upload(
        [
          'transaction_external_id,occurred_at,product_name,quantity,unit_price,payment_method,tax_amount',
          '', // a blank line still counts in the spreadsheet's numbering
          'BAD-1,2026-09-02 10:00 AM,Chai,1,30,CASH,abc',
          'BAD-2,2026-09-02 10:00 AM,Chai,0,30,CASH,0',
          'BAD-3,31/02/2026,Chai,1,30,CASH,0',
          'OK-1,2026-09-02 10:00 AM,Chai,1,30,CASH,0',
        ].join('\n')
      );
      // An unreadable tax_amount used to reach the database as NaN and turn
      // the whole upload into a 500.
      expect(res.statusCode).toBe(201);
      expect(res.body.recordsFailed).toBe(3);
      expect(res.body.transactionsCreated).toBe(1);
      expect(res.body.errorDetails).toEqual([
        { code: 'ROW_AMOUNT_NOT_A_NUMBER', field: 'tax_amount', params: { row: 3, column: 'tax_amount' } },
        { code: 'ROW_QUANTITY_NOT_POSITIVE', field: 'quantity', params: { row: 4 } },
        { code: 'ROW_DATE_INVALID', field: 'occurred_at', params: { row: 5 } },
      ]);
    });

    it('refuses to import sales into a warehouse', async () => {
      const warehouse = await request(app)
        .post(`/api/businesses/${businessId}/branches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Central Warehouse', code: 'WH-REAL', kind: 'WAREHOUSE', timezone: 'Asia/Kolkata' });
      const source = await request(app)
        .post(`/api/businesses/${businessId}/data-sources`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ provider: 'CSV_UPLOAD', displayName: 'Warehouse', branchId: warehouse.body.id });

      const res = await upload(
        'occurred_at,product_name,quantity,unit_price,payment_method\n2026-09-01,Chai,1,30,CASH\n',
        'sales.csv',
        source.body.id
      );
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('BRANCH_IS_WAREHOUSE');
    });
  });
});
