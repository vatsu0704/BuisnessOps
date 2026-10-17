import { columnsFor, type PaperWidth, type ReceiptRow } from '@shared/utils/receipt';

/**
 * A token as a page for the browser's print dialog (requirement 31) — the
 * fallback where Web Serial is missing (Safari, Firefox) or the printer is a USB
 * one the system already has a driver for.
 *
 * Built from the same rows the Bluetooth printer prints (`previewReceipt`), so
 * the slip says exactly what a printed token says: English, the printer's own
 * column count, the same lines. The page is the paper's width, in a fixed-width
 * font sized so a full line fits.
 *
 * Every row is escaped: the printable-ASCII rule keeps `<` and `&`, and this page
 * is written into a frame of the app's own origin, where a product name must
 * never be able to run anything.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The printable width of each roll, in mm — what a 58 or 80mm printer actually covers. */
const PRINTABLE_MM: Record<PaperWidth, number> = { 58: 48, 80: 72 };
/** A monospace glyph is about 0.6 of its size wide. */
const GLYPH_WIDTH = 0.6;

export function receiptHtml(rows: ReceiptRow[], paper: PaperWidth): string {
  const columns = columnsFor(paper);
  const width = PRINTABLE_MM[paper];
  const fontMm = width / columns / GLYPH_WIDTH;
  const lines = rows
    .map((row) => {
      const wide = row.wide ?? 1;
      const tall = row.tall ?? 1;
      const style = [
        `text-align:${row.align ?? 'left'}`,
        row.bold ? 'font-weight:700' : '',
        // Wide characters take more room; the font grows with the larger of the two.
        `font-size:${(fontMm * Math.max(wide, tall)).toFixed(2)}mm`,
      ]
        .filter(Boolean)
        .join(';');
      return `<div style="${style}">${escapeHtml(row.text) || '&nbsp;'}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Token</title><style>
@page { size: ${paper}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${width}mm; padding: 2mm ${(paper - width) / 2}mm 6mm; font-family: "Courier New", Courier, monospace; line-height: 1.25; }
div { white-space: pre; overflow: hidden; }
</style></head><body>${lines}</body></html>`;
}
