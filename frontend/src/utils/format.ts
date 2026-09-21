const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/**
 * Indian 2-2-3 grouping: 340000 -> 3,40,000. Everything else gets plain
 * 3-digit grouping.
 *
 * Hand-rolled because Hermes has no dependable Intl. The payslip document does
 * use Intl — it renders on the server, where Node has full ICU — so without
 * this the app and the payslip would disagree about the same number on the same
 * screen.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

function groupWestern(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const rounded = Math.round(amount);
  const digits = Math.abs(rounded).toString();
  const grouped = currency === 'INR' ? groupIndian(digits) : groupWestern(digits);
  return `${rounded < 0 ? '-' : ''}${symbol}${grouped}`;
}

/**
 * Two decimals, for payroll figures where rounding to whole rupees would hide
 * the cents the payslip shows. Decimal values arrive from the API as strings.
 */
export function formatAmountPrecise(amount: number | string, currency: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return formatAmount(0, currency);
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const [whole, fraction] = Math.abs(value).toFixed(2).split('.');
  const grouped = currency === 'INR' ? groupIndian(whole) : groupWestern(whole);
  return `${value < 0 ? '-' : ''}${symbol}${grouped}.${fraction}`;
}

/** Day counts: 22 rather than 22.00, 22.5 rather than 22.50. */
export function formatDays(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
