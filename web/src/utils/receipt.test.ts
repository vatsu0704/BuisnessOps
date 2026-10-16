import { describe, expect, it } from 'vitest';
import { EscPosBuilder, isReceiptPrintable, toReceiptAscii } from '@shared/utils/escpos';
import {
  buildReceipt,
  buildTestReceipt,
  formatClock,
  previewReceipt,
  type ReceiptInput,
} from '@shared/utils/receipt';

/**
 * The counter's token slip (requirement 31). These run here because the web is
 * where the app's pure code is tested, and because the web counter (W12) will
 * print through the same two files.
 */

const BASE: ReceiptInput = {
  header: {
    businessName: 'Suprasiddh Tea',
    branchName: 'Dhanakwadi',
    branchCode: 'DHK',
    addressLine: 'Shop 4, Dhankawadi Colony,\nPune 411038',
    phone: '9552250150',
  },
  tokenNumber: 20,
  at: { year: 2026, month: 10, day: 14, hour: 12, minute: 37 },
  lines: [{ name: 'Full Tea', quantity: 2, unitPrice: 15, lineTotal: 30 }],
  total: 30,
  currency: 'INR',
  paymentMethod: 'UPI',
  columns: 32,
};

/** How many printer columns a row really takes: double width takes twice. */
function widthOf(row: { text: string; wide?: number }) {
  return row.text.length * (row.wide ?? 1);
}

describe('escpos', () => {
  it('spells the rupee and smart punctuation in ASCII and marks what it cannot draw', () => {
    expect(toReceiptAscii('₹30 – “Tea”')).toBe("Rs.30 - \"Tea\"");
    expect(toReceiptAscii('ચા')).toBe('??');
  });

  it('calls a Gujarati name unprintable and an English one printable', () => {
    expect(isReceiptPrintable('Masala Chai')).toBe(true);
    expect(isReceiptPrintable('મસાલા ચા')).toBe(false);
    expect(isReceiptPrintable('   ')).toBe(false);
  });

  it('starts from defaults and ends with a cut', () => {
    const bytes = Array.from(new EscPosBuilder().init().line('A').cut().build());
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(bytes.slice(-4)).toEqual([0x1d, 0x56, 66, 3]);
  });
});

describe('receipt', () => {
  it('fits every row inside the paper at 58mm and at 80mm', () => {
    for (const columns of [32, 48] as const) {
      const rows = previewReceipt({
        ...BASE,
        columns,
        lines: [
          { name: 'Paneer Butter Masala with Extra Butter', quantity: 1, unitPrice: 260, lineTotal: 260 },
          { name: 'Tea', quantity: 12, unitPrice: 15, lineTotal: 180 },
          { name: 'Party tray', quantity: 1, unitPrice: 12500, lineTotal: 12500 },
        ],
        total: 12940,
      });
      for (const row of rows) expect(widthOf(row)).toBeLessThanOrEqual(columns);
    }
  });

  it('prints the token number large, the figures, and how it was paid', () => {
    const rows = previewReceipt(BASE);
    const token = rows.find((row) => row.text === '20');
    expect(token).toMatchObject({ wide: 3, tall: 3, align: 'center' });
    expect(rows.some((row) => row.text.includes('Full Tea') && row.text.trimEnd().endsWith('30.00'))).toBe(true);
    expect(rows.some((row) => row.text === 'TOTAL: Rs.30.00')).toBe(true);
    expect(rows.some((row) => row.text === 'Paid: UPI')).toBe(true);
    expect(rows.some((row) => row.text === 'Ph: 9552250150')).toBe(true);
  });

  it('falls back from a Gujarati name to the code, then to a numbered item', () => {
    const rows = previewReceipt({
      ...BASE,
      lines: [
        { name: 'મસાલા ચા', sku: 'MCHAI', quantity: 1, unitPrice: 20, lineTotal: 20 },
        { name: 'સમોસા', quantity: 1, unitPrice: 15, lineTotal: 15 },
      ],
      total: 35,
    });
    const text = rows.map((row) => row.text).join('\n');
    expect(text).toContain('MCHAI');
    expect(text).toContain('Item 2');
    expect(text).not.toContain('?');
  });

  it('leaves out a header it cannot draw rather than printing question marks', () => {
    const rows = previewReceipt({
      ...BASE,
      header: { ...BASE.header, businessName: 'સુપ્રસિદ્ધ', addressLine: 'ધનકવડી, પુણે' },
    });
    const text = rows.map((row) => row.text).join('\n');
    expect(text).not.toContain('?');
    // The name falls back to the branch.
    expect(rows[0]).toMatchObject({ text: 'Dhanakwadi', bold: true });
  });

  it('marks a reprint as a copy', () => {
    expect(previewReceipt({ ...BASE, copy: true }).some((row) => row.text.includes('COPY'))).toBe(true);
  });

  it('writes the clock in 12-hour time', () => {
    expect(formatClock({ year: 2026, month: 10, day: 4, hour: 0, minute: 5 })).toBe('04-10-2026 12:05 AM');
    expect(formatClock({ year: 2026, month: 10, day: 4, hour: 13, minute: 7 })).toBe('04-10-2026 01:07 PM');
  });

  it('sends only bytes the printer understands', () => {
    const bytes = buildReceipt(BASE);
    expect(bytes[0]).toBe(0x1b);
    expect(Array.from(bytes).every((byte) => byte >= 0 && byte <= 255)).toBe(true);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 66, 3]);
  });

  it('prints a ruler exactly one line wide on the test slip', () => {
    const text = String.fromCharCode(...buildTestReceipt(32));
    expect(text).toContain('12345678901234567890123456789012\n');
    expect(text).not.toContain('123456789012345678901234567890123');
  });
});
