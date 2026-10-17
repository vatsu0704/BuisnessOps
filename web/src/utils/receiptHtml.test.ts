import { describe, expect, it } from 'vitest';
import { receiptHtml } from './receiptHtml';

/** The print-dialog token (requirement 31): the paper's width, the printer's rows, nothing that runs. */
describe('receiptHtml', () => {
  const rows = [
    { text: 'APEX RETAIL STORES', align: 'center' as const, bold: true },
    { text: '14', align: 'center' as const, wide: 3 as const, tall: 3 as const },
    { text: 'Chai & <b>Samosa</b>  2  15.00' },
    { text: '' },
  ];

  it('is a page as wide as the roll, one line per row', () => {
    const html = receiptHtml(rows, 58);
    expect(html).toContain('@page { size: 58mm auto');
    expect(html.match(/<div /g)).toHaveLength(rows.length);
    expect(receiptHtml(rows, 80)).toContain('@page { size: 80mm auto');
  });

  it('writes a name as text, never as markup', () => {
    const html = receiptHtml(rows, 58);
    expect(html).toContain('Chai &amp; &lt;b&gt;Samosa&lt;/b&gt;');
    expect(html).not.toContain('<b>Samosa');
  });

  it('draws the token large, as the printer does', () => {
    const html = receiptHtml(rows, 58);
    const sizes = [...html.matchAll(/font-size:([\d.]+)mm/g)].map((m) => Number(m[1]));
    expect(sizes[1]).toBeCloseTo(sizes[0] * 3, 1);
  });
});
