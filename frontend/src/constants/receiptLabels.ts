/**
 * The words printed on a counter receipt — English, and on purpose.
 *
 * This is the one place in the app allowed to hold user-facing prose outside
 * the locale files, fenced the way `notifications/labels.js` is on the backend.
 * The rule that every string goes through `t()` rests on the device being able
 * to draw the reader's language. The printer cannot: a 58mm printer's built-in
 * font is ASCII and has no Gujarati, Hindi or Marathi glyphs, so a translated
 * label would print as a row of question marks. (Drawing the receipt as an image
 * instead was offered and declined — it is slower per token.)
 *
 * Fenced by `npm run lint:receipt-prose`: only `utils/receipt.ts` may import
 * this file, and every value must be printable ASCII. Do not reach for it from
 * a screen — what the screen shows is translated like everything else.
 */
export const RECEIPT_LABELS = {
  token: 'TOKEN',
  date: 'Date',
  item: 'ITEM',
  qty: 'QTY',
  rate: 'RATE',
  amount: 'AMOUNT',
  total: 'TOTAL',
  paidCash: 'Paid: Cash',
  paidUpi: 'Paid: UPI',
  thankYou: 'Thank you! Visit again',
  phone: 'Ph',
  itemFallback: 'Item',
  copy: 'COPY',
  testTitle: 'Printer test',
  testRuler: 'Every column should fit one line:',
  testSizes: 'Sizes',
  testCutter: 'The paper is cut below this line',
} as const;
