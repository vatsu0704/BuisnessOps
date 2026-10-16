import { RECEIPT_LABELS as L } from '../constants/receiptLabels';
import { EscPosBuilder, isReceiptPrintable, toReceiptAscii, type EscPosAlign, type EscPosScale } from './escpos';

/**
 * The counter's token slip, laid out once and rendered two ways: as ESC/POS
 * bytes for the printer, and as plain lines for the on-screen preview — so what
 * the printer settings screen shows is exactly what comes out of the printer.
 *
 * Pure and shared (no React Native), for the web counter later and for Vitest.
 */

/** Characters per line in the printer's normal font: 58mm paper and 80mm paper. */
export type ReceiptColumns = 32 | 48;

export type PaperWidth = 58 | 80;

export function columnsFor(paper: PaperWidth): ReceiptColumns {
  return paper === 80 ? 48 : 32;
}

export type ReceiptHeader = {
  businessName: string;
  branchName: string;
  branchCode: string;
  addressLine: string | null;
  phone: string | null;
};

export type ReceiptLine = {
  name: string;
  /** Printed instead of a name the printer cannot draw. */
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/** The branch's own wall-clock time, already converted — this file does no time zones. */
export type ReceiptClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type ReceiptInput = {
  header: ReceiptHeader;
  tokenNumber: number;
  at: ReceiptClock;
  lines: ReceiptLine[];
  total: number;
  currency: string;
  /** Null for an order from before the counter took payments, which has no method to print. */
  paymentMethod: 'CASH' | 'UPI' | null;
  columns: ReceiptColumns;
  /** A reprint says so, so two slips for one order are never mistaken for two orders. */
  copy?: boolean;
};

/** One printed line: its text and how the printer draws it. */
export type ReceiptRow = {
  text: string;
  align?: EscPosAlign;
  bold?: boolean;
  /** Character width multiplier; each step halves how many characters fit. */
  wide?: EscPosScale;
  /** Character height multiplier. */
  tall?: EscPosScale;
};

/** Rows are separate from bytes so the preview and the printer cannot disagree. */
function layoutReceipt(input: ReceiptInput): ReceiptRow[] {
  const width = input.columns;
  const rows: ReceiptRow[] = [];
  const rule: ReceiptRow = { text: '-'.repeat(width) };

  for (const row of headerRows(input.header, width)) rows.push(row);
  rows.push(rule);

  rows.push({ text: L.token, align: 'center', bold: true });
  rows.push({ text: String(input.tokenNumber), align: 'center', bold: true, wide: 3, tall: 3 });
  if (input.copy) rows.push({ text: `*** ${L.copy} ***`, align: 'center', bold: true });
  rows.push({ text: `${L.date}: ${formatClock(input.at)}` });
  rows.push(rule);

  const cols = columnWidths(width);
  rows.push({
    text:
      fit(L.item, cols.name) +
      pad(L.qty, cols.qty) +
      pad(L.rate, cols.rate) +
      pad(width === 32 ? L.total : L.amount, cols.amount),
    bold: true,
  });
  input.lines.forEach((line, index) => {
    for (const row of itemRows(line, index, cols)) rows.push({ text: row });
  });
  rows.push(rule);

  const totalText = `${L.total}: ${money(input.total, input.currency)}`;
  // Double height only, so the figure keeps the full width of the paper.
  rows.push({ text: totalText, align: 'right', bold: true, tall: 2 });
  if (input.paymentMethod) {
    rows.push({ text: input.paymentMethod === 'UPI' ? L.paidUpi : L.paidCash, align: 'right' });
  }
  rows.push({ text: '' });
  rows.push({ text: L.thankYou, align: 'center' });
  return rows;
}

/**
 * The shop's name, address and phone. Whatever the printer cannot draw is left
 * out rather than printed as question marks; the name falls back from the
 * business to the branch to the branch's code, which is always ASCII-safe enough.
 */
function headerRows(header: ReceiptHeader, width: number): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const name = [header.businessName, header.branchName, header.branchCode].find(isReceiptPrintable) ?? '';
  if (name) {
    for (const part of wrap(name, Math.floor(width / 2))) {
      rows.push({ text: part, align: 'center', bold: true, wide: 2, tall: 2 });
    }
  }
  if (header.branchName && header.branchName !== name && isReceiptPrintable(header.branchName)) {
    rows.push({ text: header.branchName, align: 'center' });
  }
  if (header.addressLine && isReceiptPrintable(header.addressLine.replace(/\s+/g, ' '))) {
    for (const part of wrap(header.addressLine.replace(/\s+/g, ' '), width)) {
      rows.push({ text: part, align: 'center' });
    }
  }
  if (header.phone && isReceiptPrintable(header.phone)) {
    rows.push({ text: `${L.phone}: ${header.phone.trim()}`, align: 'center' });
  }
  return rows;
}

type Columns = { name: number; qty: number; rate: number; amount: number };

function columnWidths(width: ReceiptColumns): Columns {
  // 58mm: 12 + 5 + 7 + 8 = 32. 80mm: 24 + 6 + 8 + 10 = 48.
  return width === 48 ? { name: 24, qty: 6, rate: 8, amount: 10 } : { name: 12, qty: 5, rate: 7, amount: 8 };
}

/**
 * One item. A name that fits sits beside its figures; a longer one takes its
 * own lines above them, so a long menu name wraps instead of being cut off.
 */
function itemRows(line: ReceiptLine, index: number, cols: Columns): string[] {
  const name = itemName(line, index);
  const qty = formatQuantity(line.quantity);
  const rate = line.unitPrice.toFixed(2);
  const amount = line.lineTotal.toFixed(2);
  const figuresFit = qty.length < cols.qty && rate.length < cols.rate && amount.length < cols.amount;
  const width = cols.name + cols.qty + cols.rate + cols.amount;

  if (!figuresFit) {
    // A figure too long for its column (a five-figure rate) gets a line of its own.
    return [...wrap(name, width), padStart(`${qty} x ${rate} = ${amount}`, width)];
  }
  const figures = pad(qty, cols.qty) + pad(rate, cols.rate) + pad(amount, cols.amount);
  if (name.length <= cols.name - 1) return [fit(name, cols.name) + figures];
  return [...wrap(name, width), ' '.repeat(cols.name) + figures];
}

function itemName(line: ReceiptLine, index: number): string {
  if (isReceiptPrintable(line.name)) return toReceiptAscii(line.name.trim());
  if (line.sku && isReceiptPrintable(line.sku)) return toReceiptAscii(line.sku.trim());
  return `${L.itemFallback} ${index + 1}`;
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function money(amount: number, currency: string): string {
  const prefix = currency === 'INR' ? 'Rs.' : `${toReceiptAscii(currency)} `;
  return `${prefix}${amount.toFixed(2)}`;
}

/** DD-MM-YYYY hh:mm AM — 12-hour, like every clock time in the app. */
export function formatClock(at: ReceiptClock): string {
  const hour12 = at.hour % 12 === 0 ? 12 : at.hour % 12;
  const marker = at.hour < 12 ? 'AM' : 'PM';
  return `${two(at.day)}-${two(at.month)}-${at.year} ${two(hour12)}:${two(at.minute)} ${marker}`;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** Left-aligned in a column, with at least one space before the next column. */
function fit(text: string, width: number): string {
  const clipped = text.length > width - 1 ? text.slice(0, width - 1) : text;
  return clipped.padEnd(width, ' ');
}

/** Right-aligned in a column. */
function pad(text: string, width: number): string {
  return text.padStart(width, ' ');
}

function padStart(text: string, width: number): string {
  return text.length >= width ? text : text.padStart(width, ' ');
}

/** Word-wraps to a width, breaking a single over-long word only when it must. */
function wrap(text: string, width: number): string[] {
  const words = toReceiptAscii(text).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let word of words) {
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function encode(rows: ReceiptRow[]): Uint8Array {
  const out = new EscPosBuilder().init();
  for (const row of rows) {
    out.align(row.align ?? 'left').bold(row.bold ?? false).size(row.wide ?? 1, row.tall ?? 1).line(row.text);
  }
  return out.size(1).bold(false).align('left').feed(2).cut().build();
}


export function buildReceipt(input: ReceiptInput): Uint8Array {
  return encode(layoutReceipt(input));
}

/**
 * The same rows the printer gets, with their text reduced to what it can draw,
 * for the settings screen to render in a monospace font at the same sizes.
 */
export function previewReceipt(input: ReceiptInput): ReceiptRow[] {
  return layoutReceipt(input).map((row) => ({ ...row, text: toReceiptAscii(row.text) }));
}

/**
 * The settings screen's test slip: a ruler to prove the column count, each
 * size, and the cutter. Everything a new printer has to get right, on one slip.
 */
export function buildTestReceipt(columns: ReceiptColumns): Uint8Array {
  const ruler = '1234567890'.repeat(Math.ceil(columns / 10)).slice(0, columns);
  const out = new EscPosBuilder().init();
  out.align('center').bold(true).size(2).line(L.testTitle).size(1).bold(false);
  out.align('left').line(L.testRuler).line(ruler).line('-'.repeat(columns));
  out.line(`${L.testSizes}:`);
  out.size(1).line('1x Aa 123');
  out.size(2).line('2x Aa 123');
  out.size(3).line('3x 123');
  out.size(1).line('-'.repeat(columns)).line(L.testCutter);
  return out.feed(2).cut().build();
}
