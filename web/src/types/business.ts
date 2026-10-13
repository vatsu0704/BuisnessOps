/** The app's own definitions, shared rather than copied — see web/README.md. */
export type * from '@shared/types/business';

/** One currency's takings. The app declares this beside its API call, not with its types. */
export interface SalesSummaryByCurrency {
  currency: string;
  /** A Decimal, serialised as a string. */
  totalSales: string;
  transactionCount: number;
}
