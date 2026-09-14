const XLSX = require('xlsx');
const prisma = require('../config/db');

// Expected columns in an uploaded CSV/Excel file. One row = one line item;
// rows sharing the same transaction_external_id are grouped into a single
// Transaction (matching how POS exports typically flatten order + line
// items into one sheet). Rows with no transaction_external_id each become
// their own single-line-item transaction.
const REQUIRED_COLUMNS = ['occurred_at', 'product_name', 'quantity', 'unit_price', 'payment_method'];
const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER', 'MIXED'];

function parseFileToRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

// +2: 1 for the header row, 1 to convert a 0-based array index to a 1-based
// line number a spreadsheet user actually sees.
function rowLabel(index) {
  return `Row ${index + 2}`;
}

function validateRow(row, index) {
  const errors = [];

  for (const col of REQUIRED_COLUMNS) {
    if (row[col] === undefined || row[col] === null || String(row[col]).trim() === '') {
      errors.push(`${rowLabel(index)}: missing ${col}`);
    }
  }
  if (row.quantity !== undefined && row.quantity !== '' && Number.isNaN(Number(row.quantity))) {
    errors.push(`${rowLabel(index)}: quantity is not a number`);
  }
  if (row.unit_price !== undefined && row.unit_price !== '' && Number.isNaN(Number(row.unit_price))) {
    errors.push(`${rowLabel(index)}: unit_price is not a number`);
  }
  if (row.payment_method && !VALID_PAYMENT_METHODS.includes(String(row.payment_method).toUpperCase())) {
    errors.push(`${rowLabel(index)}: payment_method must be one of ${VALID_PAYMENT_METHODS.join(', ')}`);
  }
  if (row.occurred_at && Number.isNaN(Date.parse(row.occurred_at))) {
    errors.push(`${rowLabel(index)}: occurred_at is not a valid date`);
  }

  return errors;
}

async function resolveProduct(businessId, row) {
  const name = String(row.product_name).trim();
  const sku = row.sku ? String(row.sku).trim() : null;

  let product = null;
  if (sku) {
    product = await prisma.product.findFirst({ where: { businessId, sku } });
  }
  if (!product) {
    product = await prisma.product.findFirst({ where: { businessId, name } });
  }
  if (!product) {
    product = await prisma.product.create({
      data: { businessId, name, sku, unit: row.unit ? String(row.unit).trim() : 'unit' },
    });
  }
  return product;
}

// Not wrapped in a single DB transaction: a large file where most rows are
// good and a few are bad should still commit the good ones (that's what
// SyncRunStatus.PARTIAL means) rather than all-or-nothing rolling back.
async function ingestRows(rows, { businessId, branchId, currency, dataSourceConnectionId }) {
  const errors = [];
  const validRows = [];

  rows.forEach((row, index) => {
    const rowErrors = validateRow(row, index);
    if (rowErrors.length) {
      errors.push(...rowErrors);
    } else {
      validRows.push({ ...row, __rowIndex: index });
    }
  });

  const groups = new Map();
  for (const row of validRows) {
    const key =
      row.transaction_external_id && String(row.transaction_external_id).trim()
        ? String(row.transaction_external_id).trim()
        : `__row_${row.__rowIndex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let transactionsCreated = 0;
  let transactionsUpdated = 0;

  for (const [key, groupRows] of groups) {
    const externalId = key.startsWith('__row_') ? null : key;
    const first = groupRows[0];

    const totalAmount = groupRows.reduce((sum, r) => sum + Number(r.quantity) * Number(r.unit_price), 0);
    const taxAmount = groupRows.reduce((sum, r) => sum + Number(r.tax_amount || 0), 0);
    const discountAmount = groupRows.reduce((sum, r) => sum + Number(r.discount_amount || 0), 0);

    let transaction = externalId
      ? await prisma.transaction.findUnique({ where: { branchId_externalId: { branchId, externalId } } })
      : null;

    const transactionData = {
      businessId,
      branchId,
      dataSourceConnectionId,
      externalId,
      occurredAt: new Date(first.occurred_at),
      totalAmount,
      taxAmount,
      discountAmount,
      currency: first.currency ? String(first.currency).trim() : currency,
      paymentMethod: String(first.payment_method).toUpperCase(),
      status: 'COMPLETED',
    };

    if (transaction) {
      await prisma.lineItem.deleteMany({ where: { transactionId: transaction.id } });
      transaction = await prisma.transaction.update({ where: { id: transaction.id }, data: transactionData });
      transactionsUpdated += 1;
    } else {
      transaction = await prisma.transaction.create({ data: transactionData });
      transactionsCreated += 1;
    }

    for (const row of groupRows) {
      const product = await resolveProduct(businessId, row);
      await prisma.lineItem.create({
        data: {
          transactionId: transaction.id,
          productId: product.id,
          productNameSnapshot: product.name,
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.quantity) * Number(row.unit_price),
        },
      });
    }
  }

  return {
    recordsProcessed: rows.length,
    recordsValid: validRows.length,
    recordsFailed: rows.length - validRows.length,
    transactionsCreated,
    transactionsUpdated,
    errors,
  };
}

module.exports = { parseFileToRows, ingestRows, REQUIRED_COLUMNS, VALID_PAYMENT_METHODS };
