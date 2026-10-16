import type { CounterReceiptHeader } from '../types/counter';
import { branchClock, type DisplayBill } from './counterQueue';
import { columnsFor, type PaperWidth, type ReceiptInput } from './receipt';

/**
 * A bill from the counter's list, as the receipt the printer gets (requirement
 * 31). Pure and shared, like the two files it joins.
 *
 * The time printed is the branch's wall clock at the moment the bill was paid,
 * from the offset the server reported — not the phone's own time zone, which
 * is whatever the phone happens to be set to.
 */
export function receiptForBill(
  bill: DisplayBill,
  {
    header,
    utcOffsetMinutes,
    currency,
    paperWidth,
    copy = false,
  }: {
    header: CounterReceiptHeader;
    utcOffsetMinutes: number;
    currency: string;
    paperWidth: PaperWidth;
    copy?: boolean;
  }
): ReceiptInput {
  return {
    header,
    tokenNumber: bill.printedNumber ?? bill.tokenNumber,
    at: branchClock(bill.at, utcOffsetMinutes),
    lines: bill.lines.map((line) => ({
      name: line.name,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    total: bill.total,
    currency,
    paymentMethod: bill.paymentMethod === 'UPI' ? 'UPI' : bill.paymentMethod === 'CASH' ? 'CASH' : null,
    columns: columnsFor(paperWidth),
    copy,
  };
}
