/**
 * Canonical import template for the ingestion pipeline
 * (backend/src/services/ingestion.service.js). The Upload screen explains each
 * column in the reader's language; this file is what they fill in.
 *
 * Required columns come first, in the order a bill is read: which bill, when,
 * what, how many, at what price, paid how. Optional ones follow, so the file
 * itself shows what can be left blank — and the last row leaves them blank.
 *
 * Every sample row's bill number starts with EXAMPLE, and the importer leaves
 * those rows out. People add their own rows under the samples rather than
 * deleting them, and without that rule the samples would be booked as real
 * sales in the owner's reports.
 *
 * The rows also show the formats that matter: a local 12-hour time with no
 * timezone (it is read in the branch's own clock), a bill of two lines sharing
 * one number, a fractional quantity, and each common payment method.
 *
 * backend/tests/ingestion.test.js imports this exact text, so a template that
 * the importer would reject fails the backend suite rather than a shop owner.
 */
export const SALES_TEMPLATE_FILENAME = 'hisabkitab-sales-template.csv';

export const SALES_TEMPLATE_CSV = `transaction_external_id,occurred_at,product_name,quantity,unit_price,payment_method,tax_amount,discount_amount,sku,unit
EXAMPLE-1001,2026-09-01 9:15 AM,Masala Chai,2,30,CASH,3,0,CHAI-01,cup
EXAMPLE-1001,2026-09-01 9:15 AM,Samosa,3,20,CASH,3,5,SAM-01,piece
EXAMPLE-1002,2026-09-01 1:40 PM,Veg Thali,1,180,UPI,9,0,THALI-01,plate
EXAMPLE-1003,2026-09-01 7:05 PM,Paneer,0.5,320,CARD,,,,kg
`;
