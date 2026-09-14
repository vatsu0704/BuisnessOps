import type { Locale } from './user';

export type Industry = 'RETAIL' | 'FOOD_BEVERAGE' | 'SERVICES' | 'FRANCHISE_OTHER';

export interface Business {
  id: string;
  name: string;
  industry: Industry;
  country: string;
  defaultCurrency: string;
  defaultLocale: Locale;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}
