/**
 * Canonical import template for the ingestion pipeline
 * (backend/src/services/ingestion.service.js).
 *
 * Required columns: occurred_at, product_name, quantity, unit_price, payment_method
 * Optional columns: transaction_external_id, sku, unit, tax_amount, discount_amount
 *
 * Header names must match exactly — the parser reads the first sheet's header row
 * verbatim. payment_method must be one of CASH, CARD, UPI, WALLET, OTHER, MIXED.
 *
 * The two TXN-1001 rows are deliberate: rows sharing a transaction_external_id are
 * grouped into a single multi-item transaction, which is the one rule people get
 * wrong when they build an export by hand.
 */
export const SALES_TEMPLATE_FILENAME = 'biziq-sales-template.csv';

export const SALES_TEMPLATE_CSV = `transaction_external_id,occurred_at,product_name,sku,unit,quantity,unit_price,tax_amount,discount_amount,payment_method
TXN-1001,2026-09-01T10:15:00Z,Masala Chai,CHAI-01,cup,2,30,3,0,CASH
TXN-1001,2026-09-01T10:15:00Z,Samosa,SAM-01,piece,3,20,3,5,CASH
TXN-1002,2026-09-01T11:05:00Z,Filter Coffee,COF-01,cup,1,45,2.25,0,UPI
TXN-1003,2026-09-02T09:30:00Z,Veg Sandwich,SAND-01,piece,2,80,8,10,CARD
TXN-1004,2026-09-02T18:45:00Z,Bottled Water,WTR-01,bottle,1,20,1,0,WALLET
`;
