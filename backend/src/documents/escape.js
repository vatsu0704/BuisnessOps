/**
 * HTML escaping for the document templates.
 *
 * Not optional and not a formality: business names, staff names, roles and
 * deduction notes are all user-supplied, and the rendered document is handed to
 * a WebView (expo-print on the device, or the browser's print view). A business
 * named `Chai <script>…</script>` would otherwise execute. There is a test for
 * exactly that.
 *
 * This is why the templates are plain tagged-template functions rather than a
 * templating library: there is one escaping mode and no way to opt out of it by
 * accident, unlike handlebars' `{{ }}` versus `{{{ }}}`.
 */
const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/**
 * Tagged template that escapes every interpolated value.
 *
 * Values wrapped in `raw()` pass through untouched — that is how a template
 * composes an already-rendered fragment (a row, a section) without
 * double-escaping it.
 */
const RAW = Symbol('raw');

function raw(html) {
  return { [RAW]: String(html) };
}

function isRaw(value) {
  return value !== null && typeof value === 'object' && RAW in value;
}

function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (isRaw(value)) out += value[RAW];
    else if (Array.isArray(value)) out += value.map((v) => (isRaw(v) ? v[RAW] : escapeHtml(v))).join('');
    else out += escapeHtml(value);
    out += strings[i + 1];
  }
  return raw(out);
}

/** Unwrap for sending down the wire. */
function render(value) {
  return isRaw(value) ? value[RAW] : escapeHtml(value);
}

module.exports = { escapeHtml, html, raw, render, isRaw };
