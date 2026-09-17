const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

// A plain Western thousands grouping, not the Indian lakh/crore convention —
// this is a stopgap until the locale-aware formatting pass (Phase 3 leftover;
// Hermes has no dependable Intl) replaces it.
export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const rounded = Math.round(amount);
  const grouped = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${rounded < 0 ? '-' : ''}${symbol}${grouped}`;
}
