const { html, raw, render } = require('./escape');

/**
 * The shared A4 document shell.
 *
 * Replaces the pdfmake generator, which physically could not render `₹` or any
 * Indic script: it was configured with base-14 Helvetica and embedded no font,
 * and Helvetica is WinAnsi-only. Rendering HTML instead means the *device*
 * rasterises it with its own system fonts, so a Gujarati payslip works with
 * zero embedded font bytes.
 *
 * Constraints this stylesheet is written against, all of them learned the hard
 * way with Android's print renderer:
 *
 *  - No remote resources of any kind. `expo-print` may run with no network, and
 *    a failed webfont fetch falls back silently — which is precisely the
 *    failure being escaped. No @font-face, no images by URL.
 *  - No `position: fixed`: it breaks pagination in Android's print renderer.
 *  - No CSS grid; tables and flexbox only.
 *  - Page margins set BOTH via @page and via body padding, because some
 *    expo-print versions ignore @page.
 *  - `font-variant-numeric: tabular-nums` on money so columns line up.
 */

const BRAND = '#4F46E5';
const INK = '#18181B';
const MUTED = '#71717A';
const LINE = '#E4E4E7';

// Devanagari and Gujarati come from the device's own Noto faces on Android and
// from the system fonts on iOS/desktop. Order matters: the Latin faces first so
// English text keeps its intended look, the Indic faces as fallbacks for the
// codepoints the Latin faces lack.
const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans',
      'Noto Sans Devanagari', 'Noto Sans Gujarati', system-ui, sans-serif`;

const STYLES = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    padding: 14mm;
    font-family: ${FONT_STACK};
    font-size: 12px;
    line-height: 1.5;
    color: ${INK};
    background: #FFFFFF;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-head { border-bottom: 3px solid ${BRAND}; padding-bottom: 12px; margin-bottom: 18px; }
  .doc-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .biz-name { font-size: 20px; font-weight: 700; letter-spacing: -0.2px; }
  .biz-sub { font-size: 11px; color: ${MUTED}; margin-top: 2px; }
  .doc-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: ${BRAND}; }
  .doc-period { font-size: 11px; color: ${MUTED}; margin-top: 2px; }
  .chip {
    display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 999px;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
  }
  .chip-draft { background: #FEF3C7; color: #92400E; }
  .chip-final { background: #DCFCE7; color: #166534; }

  .section { margin-top: 18px; }
  .section-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
    color: ${MUTED}; margin-bottom: 8px;
  }

  table { width: 100%; border-collapse: collapse; }
  .kv td { padding: 4px 0; vertical-align: top; font-size: 11.5px; }
  .kv td.k { color: ${MUTED}; width: 34%; }
  .kv td.v { font-weight: 600; }

  .grid { width: 100%; }
  .grid td { width: 50%; vertical-align: top; padding-right: 18px; }

  .cards { width: 100%; margin-top: 4px; }
  .cards td { width: 33.33%; padding: 0 6px; }
  .cards td:first-child { padding-left: 0; }
  .cards td:last-child { padding-right: 0; }
  .card { border: 1px solid ${LINE}; border-radius: 10px; padding: 10px 12px; }
  .card-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.7px; color: ${MUTED}; }
  .card-value { font-size: 16px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card-net { border-color: ${BRAND}; border-width: 2px; }
  .card-net .card-value { color: ${BRAND}; font-size: 19px; }

  .data { font-size: 11.5px; }
  .data th {
    text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.7px;
    color: ${MUTED}; font-weight: 700; padding: 0 0 6px; border-bottom: 1px solid ${LINE};
  }
  .data td { padding: 6px 0; border-bottom: 1px solid #F4F4F5; }
  .data td.num, .data th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .data tr.total td { border-top: 2px solid ${INK}; border-bottom: none; font-weight: 700; padding-top: 8px; }
  .data tr.total td.num { font-size: 14px; }
  .muted { color: ${MUTED}; }
  .workings { font-size: 10px; color: ${MUTED}; padding-top: 2px !important; border-bottom: none !important; }
  .note { font-size: 10.5px; color: ${MUTED}; font-style: italic; }

  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid ${LINE}; font-size: 9.5px; color: ${MUTED}; }
  .foot-row { display: flex; justify-content: space-between; gap: 12px; }
`;

/**
 * `lang` and `dir` are set on <html> so the WebView picks the right font
 * fallbacks and line-breaking for Devanagari/Gujarati text.
 */
function renderDocument({ lang = 'en', title, body }) {
  return render(html`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${raw(STYLES)}</style>
</head>
<body>
${body}
</body>
</html>`);
}

/** A labelled block with a small uppercase heading. */
function section(title, body) {
  return html`<div class="section"><div class="section-title">${title}</div>${body}</div>`;
}

/** Two-column definition list. `rows` is [[label, value], …]; empty values drop out. */
function keyValues(rows) {
  const cells = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => html`<tr><td class="k">${label}</td><td class="v">${value}</td></tr>`);
  return html`<table class="kv">${cells}</table>`;
}

/** The three-across summary strip, mirroring the POS report's summary block. */
function statCards(cards) {
  const cells = cards.map(
    (card) => html`<td>
      <div class="card ${card.emphasis ? 'card-net' : ''}">
        <div class="card-label">${card.label}</div>
        <div class="card-value">${card.value}</div>
      </div>
    </td>`
  );
  return html`<table class="cards"><tr>${cells}</tr></table>`;
}

/**
 * An itemised table. `columns` is [{ label, numeric }]; `rows` is an array of
 * { cells: [...], total?, workings? }.
 */
function dataTable(columns, rows) {
  const head = columns.map((c) => html`<th class="${c.numeric ? 'num' : ''}">${c.label}</th>`);
  const body = rows.map((row) => {
    const cells = row.cells.map(
      (cell, i) => html`<td class="${columns[i]?.numeric ? 'num' : ''}">${cell}</td>`
    );
    const main = html`<tr class="${row.total ? 'total' : ''}">${cells}</tr>`;
    if (!row.workings) return main;
    // The arithmetic, spelled out under the row it explains — the product's
    // traceability principle applied to pay.
    return html`${main}<tr><td class="workings" colspan="${columns.length}">${row.workings}</td></tr>`;
  });
  return html`<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

module.exports = { renderDocument, section, keyValues, statCards, dataTable, BRAND };
