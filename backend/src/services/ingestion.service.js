const XLSX = require('xlsx');
const prisma = require('../config/db');
const { fail, fieldError, renderMessage } = require('../errors');
const { writeTransaction } = require('./salesProjection.service');
const { instantOfLocalTime, isRealDateKey } = require('../utils/datetime');

// Expected columns in an uploaded CSV/Excel file. One row = one line item;
// rows sharing the same transaction_external_id are grouped into a single
// Transaction (matching how POS exports typically flatten order + line
// items into one sheet). Rows with no transaction_external_id each become
// their own single-line-item transaction.
const REQUIRED_COLUMNS = ['occurred_at', 'product_name', 'quantity', 'unit_price', 'payment_method'];
const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER', 'MIXED'];

// The template ships with sample rows so people can see the formats, and the
// usual way to fill it in is to add real rows underneath them. Without this
// the samples would be booked as real sales in the owner's reports.
const EXAMPLE_ID = /^example/i;

// Bills written at once. Small enough to sit inside Prisma's default pool
// (2 × CPUs + 1) with room left for every other request the server is serving.
const WRITE_CONCURRENCY = 5;

// A POS export often puts a title or a date range above the real header row.
// Looking a few rows down finds it without guessing at anything else.
const HEADER_SEARCH_ROWS = 10;

/**
 * "Product Name", "unit price", "Quantity " → the names the importer uses.
 * Case, stray spaces and a spreadsheet's byte-order mark are how a header gets
 * "wrong" without anyone changing it, and each of those used to reject every
 * row in the file.
 */
function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * A spreadsheet file is a binary container (a zip, or the legacy OLE file) and
 * declares its own text encoding; so does UTF-16 text, by its byte-order mark.
 * Anything else is text, and has to be decoded as UTF-8 here: handed the raw
 * bytes, SheetJS assumes Windows-1252, and "मसाला चाय" arrives as "à¤®à¤¸…" —
 * from every CSV without a byte-order mark, which includes every Google Sheets
 * export.
 */
function carriesOwnEncoding(buffer) {
  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const ole = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  const utf16 = (buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff);
  return zip || ole || utf16;
}

function readWorkbook(buffer) {
  // raw: text stays the text that was typed, so "01/09/2026" is read below,
  // where the file's date order and the branch's timezone are known. cellNF:
  // keep each cell's number format, which is the only thing that says a
  // number in an Excel file is a date.
  const options = { raw: true, cellNF: true };
  if (carriesOwnEncoding(buffer)) return XLSX.read(buffer, { ...options, type: 'buffer' });
  return XLSX.read(buffer.toString('utf8').replace(/^﻿/, ''), { ...options, type: 'string' });
}

/**
 * What one cell holds. An Excel date is a number with a date format; it comes
 * back as the wall-clock time the sheet shows, so no timezone gets involved
 * until the branch's own is applied.
 */
function cellValue(cell) {
  if (!cell || cell.t === 'z' || cell.t === 'e') return '';
  if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
    const { y, m, d, H, M, S } = XLSX.SSF.parse_date_code(cell.v);
    return { wallClock: { year: y, month: m, day: d, hour: H, minute: M, second: S } };
  }
  return cell.v;
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function headerRowOf(sheet, range) {
  const last = Math.min(range.e.r, range.s.r + HEADER_SEARCH_ROWS - 1);
  for (let r = range.s.r; r <= last; r += 1) {
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      headers.push(normalizeHeader(cellValue(sheet[XLSX.utils.encode_cell({ r, c })])));
    }
    if (REQUIRED_COLUMNS.every((column) => headers.includes(column))) return { r, headers };
  }
  return null;
}

/**
 * The sheet and header row that hold the sales. A workbook whose first sheet is
 * a cover page or instructions still imports, as does a POS export with a title
 * above its header. With none that fits, the first sheet's first row is used,
 * so the error can say which columns it lacks.
 */
function locateTable(workbook) {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const header = headerRowOf(sheet, range);
    if (header) return { sheet, range, ...header };
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet['!ref']) return null;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    headers.push(normalizeHeader(cellValue(sheet[XLSX.utils.encode_cell({ r: range.s.r, c })])));
  }
  return { sheet, range, r: range.s.r, headers };
}

/**
 * The file's data rows, keyed by normalized header. Each carries `__row`, the
 * line number the spreadsheet itself shows, so an error still points at the
 * right line when blank rows or a title above the header are skipped.
 *
 * Throws FILE_MISSING_COLUMNS rather than returning rows that would each fail
 * on the same missing column — one sentence naming the column beats one error
 * per row per column.
 */
function parseFileToRows(buffer) {
  const table = locateTable(readWorkbook(buffer));
  if (!table) return [];

  const missing = REQUIRED_COLUMNS.filter((column) => !table.headers.includes(column));
  if (missing.length) {
    throw fail('FILE_MISSING_COLUMNS', 400, { columns: missing.join(', ') });
  }

  const rows = [];
  for (let r = table.r + 1; r <= table.range.e.r; r += 1) {
    const row = { __row: r + 1 };
    let blank = true;
    table.headers.forEach((header, i) => {
      // A second column with the same header does not overwrite the first.
      if (!header || header in row) return;
      const value = cellValue(table.sheet[XLSX.utils.encode_cell({ r, c: table.range.s.c + i })]);
      if (!isBlank(value)) blank = false;
      row[header] = value;
    });
    if (!blank) rows.push(row);
  }
  return rows;
}

/**
 * "1,200", "₹1,200.50", "Rs. 30", " 45 " — a price after a spreadsheet has
 * formatted it or a person has typed it. A comma is only ever digit grouping
 * here (1,20,000 as much as 120,000); a decimal comma is not a convention this
 * product's market uses. Returns null for an empty cell and NaN for anything
 * that is not a number.
 */
function parseAmount(value) {
  if (isBlank(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  let text = value.trim();
  const negative = text.startsWith('-');
  if (negative) text = text.slice(1).trim();
  text = text.replace(/^(?:₹|rs\.?|inr|\$)\s*/i, '').replace(/,/g, '');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return NaN;
  return negative ? -Number(text) : Number(text);
}

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([ap])?\.?\s*(?:m\.?)?\s*(z|[+-]\d{2}:?\d{2})?$/i;
// Year first is never ambiguous, whatever separates the parts.
const ISO_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s]+(.*))?$/i;
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s+(.*))?$/;

/** '14:30', '2:30 PM', '10:15:00Z', '09:00+05:30' → its parts, or null. */
function readTime(text) {
  if (!text) return { hour: 0, minute: 0, second: 0, offset: null };
  const match = TIME.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offset = null;
  if (match[5]) {
    const zone = match[5].toUpperCase();
    if (zone === 'Z') offset = 0;
    else {
      const sign = zone.startsWith('-') ? -1 : 1;
      const digits = zone.slice(1).replace(':', '');
      offset = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
    }
  }
  return { hour, minute, second, offset };
}

/**
 * One occurred_at cell, read as far as it can be without knowing the rest of
 * the file. 01/09/2026 is 1 September or 9 January depending on who typed it,
 * so a slashed date comes back with its two numbers unassigned; `dateOrderOf`
 * decides for the whole file.
 */
function readDate(value) {
  if (value && typeof value === 'object' && value.wallClock) {
    return { kind: 'wall', ...value.wallClock };
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();

  const iso = ISO_DATE.exec(text);
  if (iso) {
    const time = readTime(iso[4]);
    if (!time) return null;
    return { kind: 'wall', year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), ...time };
  }

  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) {
    const time = readTime(numeric[4]);
    if (!time) return null;
    const year = Number(numeric[3]) + (numeric[3].length === 2 ? 2000 : 0);
    return { kind: 'numeric', leading: Number(numeric[1]), trailing: Number(numeric[2]), year, ...time };
  }
  return null;
}

/**
 * Day-first or month-first, for the whole file. A 13 or higher in the first
 * position can only be a day, and in the second only a day too; a file that
 * never exceeds 12 is read day-first, the way dates are written in India. The
 * result travels back to the app so the person can see which reading was used.
 */
function dateOrderOf(readings) {
  const numeric = readings.filter((reading) => reading?.kind === 'numeric');
  if (!numeric.length) return null;
  const dayFirst = numeric.some((reading) => reading.leading > 12);
  const monthFirst = numeric.some((reading) => reading.trailing > 12);
  return monthFirst && !dayFirst ? 'MONTH_FIRST' : 'DAY_FIRST';
}

/** A reading to an instant, or null when it is not a real date and time. */
function toInstant(reading, { dateOrder, timeZone }) {
  if (!reading) return null;
  let { year, month, day } = reading;
  if (reading.kind === 'numeric') {
    const dayFirst = dateOrder !== 'MONTH_FIRST';
    day = dayFirst ? reading.leading : reading.trailing;
    month = dayFirst ? reading.trailing : reading.leading;
  }
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!isRealDateKey(key)) return null;

  const { hour, minute, second, offset } = reading;
  // An explicit offset (…Z, …+05:30) is a statement about the instant and is
  // taken at its word. Anything else is the branch's own clock.
  if (offset !== null && offset !== undefined) {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60000);
  }
  return instantOfLocalTime(key, hour, minute, second, timeZone);
}

function textOf(value) {
  return isBlank(value) ? null : String(value).trim();
}

// Coded like every other message the API sends, so the upload screen can show
// them in the reader's language. The row number and the column name travel as
// parameters; the column name is the literal header in their file and stays
// as-is in every language, because that is the text they have to go and find.
function readRow(row, context) {
  const errors = [];
  const at = { row: row.__row };

  for (const col of REQUIRED_COLUMNS) {
    if (isBlank(row[col])) errors.push(fieldError('ROW_MISSING_COLUMN', col, { ...at, column: col }));
  }

  const quantity = parseAmount(row.quantity);
  if (Number.isNaN(quantity)) errors.push(fieldError('ROW_QUANTITY_NOT_A_NUMBER', 'quantity', at));
  else if (quantity !== null && quantity <= 0) errors.push(fieldError('ROW_QUANTITY_NOT_POSITIVE', 'quantity', at));

  const unitPrice = parseAmount(row.unit_price);
  if (Number.isNaN(unitPrice)) errors.push(fieldError('ROW_UNIT_PRICE_NOT_A_NUMBER', 'unit_price', at));
  else if (unitPrice !== null && unitPrice < 0) {
    errors.push(fieldError('ROW_AMOUNT_NEGATIVE', 'unit_price', { ...at, column: 'unit_price' }));
  }

  // Optional, but a value that is there has to be a number: NaN used to reach
  // the database as a Decimal and fail the whole upload with a 500.
  const optional = {};
  for (const col of ['tax_amount', 'discount_amount']) {
    const amount = parseAmount(row[col]);
    if (Number.isNaN(amount)) errors.push(fieldError('ROW_AMOUNT_NOT_A_NUMBER', col, { ...at, column: col }));
    else if (amount !== null && amount < 0) errors.push(fieldError('ROW_AMOUNT_NEGATIVE', col, { ...at, column: col }));
    optional[col] = amount ?? 0;
  }

  const paymentMethod = textOf(row.payment_method)?.toUpperCase() ?? null;
  if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    errors.push(
      fieldError('ROW_PAYMENT_METHOD_INVALID', 'payment_method', {
        ...at,
        options: VALID_PAYMENT_METHODS.join(', '),
      })
    );
  }

  const occurredAt = isBlank(row.occurred_at) ? null : toInstant(context.readings.get(row), context);
  if (!isBlank(row.occurred_at) && !occurredAt) {
    errors.push(fieldError('ROW_DATE_INVALID', 'occurred_at', at));
  }

  return {
    errors,
    line: {
      rowNumber: row.__row,
      externalId: textOf(row.transaction_external_id),
      occurredAt,
      productName: textOf(row.product_name),
      sku: textOf(row.sku),
      unit: textOf(row.unit),
      quantity,
      unitPrice,
      taxAmount: optional.tax_amount,
      discountAmount: optional.discount_amount,
      paymentMethod,
      currency: textOf(row.currency),
    },
  };
}

/**
 * Resolved once per (sku, name) per upload. Every row used to cost one or two
 * product queries, and a month of a café's sales repeats the same few dozen
 * products thousands of times. Keyed on the pair, so each row resolves exactly
 * as the uncached lookup did: by sku, then by name, else created.
 */
async function resolveProduct(businessId, line, cache) {
  const key = `${line.sku ?? ''}\u0000${line.productName}`;
  if (cache.has(key)) return cache.get(key);

  let product = null;
  if (line.sku) {
    product = await prisma.product.findFirst({ where: { businessId, sku: line.sku } });
  }
  if (!product) {
    product = await prisma.product.findFirst({ where: { businessId, name: line.productName } });
  }
  if (!product) {
    product = await prisma.product.create({
      data: { businessId, name: line.productName, sku: line.sku, unit: line.unit ?? 'unit' },
    });
  }
  cache.set(key, product);
  return product;
}

// Not wrapped in a single DB transaction: a large file where most rows are
// good and a few are bad should still commit the good ones (that's what
// SyncRunStatus.PARTIAL means) rather than all-or-nothing rolling back.
async function ingestRows(rows, { businessId, branchId, currency, timeZone, dataSourceConnectionId }) {
  const examples = new Set(rows.filter((row) => EXAMPLE_ID.test(textOf(row.transaction_external_id) ?? '')));
  const dataRows = rows.filter((row) => !examples.has(row));

  const readings = new Map(dataRows.map((row) => [row, readDate(row.occurred_at)]));
  const dateOrder = dateOrderOf([...readings.values()]);
  const context = { readings, dateOrder, timeZone };

  const errors = [];
  const validLines = [];
  for (const row of dataRows) {
    const { errors: rowErrors, line } = readRow(row, context);
    if (rowErrors.length) errors.push(...rowErrors);
    else validLines.push(line);
  }

  const groups = new Map();
  for (const line of validLines) {
    const key = line.externalId ?? `__row_${line.rowNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }

  // Products first, one at a time: resolving one may create it, and two bills
  // racing to create the same new product would make two. The cache makes this
  // pass cheap — it touches the database once per distinct product.
  const productCache = new Map();
  const bills = [];
  for (const lines of groups.values()) {
    const items = [];
    for (const line of lines) {
      const product = await resolveProduct(businessId, line, productCache);
      items.push({
        productId: product.id,
        productNameSnapshot: product.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.quantity * line.unitPrice,
      });
    }
    bills.push({ lines, items });
  }

  // Shared with the counter (requirement 1) so both write a sale the same
  // way. No `client` argument: a file with some bad rows must still commit
  // its good ones, which is what SyncRunStatus.PARTIAL means.
  const writeBill = ({ lines, items }) => {
    const first = lines[0];
    return writeTransaction({
      branchId,
      externalId: first.externalId,
      header: {
        businessId,
        dataSourceConnectionId,
        occurredAt: first.occurredAt,
        totalAmount: items.reduce((sum, item) => sum + item.lineTotal, 0),
        taxAmount: lines.reduce((sum, line) => sum + line.taxAmount, 0),
        discountAmount: lines.reduce((sum, line) => sum + line.discountAmount, 0),
        currency: first.currency ?? currency,
        paymentMethod: first.paymentMethod,
        status: 'COMPLETED',
        source: 'POS_IMPORT',
      },
      items,
    });
  };

  // Bills share nothing once their products exist — each has its own external
  // id, or none — so a few are written at once. One at a time, a month of a
  // café's sales took longer than the app waits for an answer.
  let transactionsCreated = 0;
  let transactionsUpdated = 0;
  for (let i = 0; i < bills.length; i += WRITE_CONCURRENCY) {
    const results = await Promise.all(bills.slice(i, i + WRITE_CONCURRENCY).map(writeBill));
    for (const { created } of results) {
      if (created) transactionsCreated += 1;
      else transactionsUpdated += 1;
    }
  }

  return {
    recordsProcessed: dataRows.length,
    recordsValid: validLines.length,
    recordsFailed: dataRows.length - validLines.length,
    examplesSkipped: examples.size,
    // Which way round a slashed date was read, so the app can say so: a wrong
    // guess is otherwise a month of sales filed quietly in the wrong month.
    dateOrder,
    transactionsCreated,
    transactionsUpdated,
    // Same split as a validation failure: `errors` stays a plain list of
    // English strings so an older app build still renders something readable,
    // and it is rendered FROM errorDetails rather than written separately, so
    // the two cannot drift apart.
    errors: errors.map((detail) => renderMessage(detail.code, detail.params)),
    errorDetails: errors,
  };
}

module.exports = {
  parseFileToRows,
  ingestRows,
  parseAmount,
  readDate,
  dateOrderOf,
  toInstant,
  REQUIRED_COLUMNS,
  VALID_PAYMENT_METHODS,
};
