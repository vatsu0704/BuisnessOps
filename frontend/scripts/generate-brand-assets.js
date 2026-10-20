#!/usr/bin/env node
/**
 * Renders every piece of brand artwork in assets/ from src/constants/brandMark.json —
 * the same geometry BrandMark.tsx draws in the app — so the launcher icon and the
 * in-app logo are one drawing and cannot drift apart. Re-run it whenever that file
 * changes, then rebuild the native app: the icon and the splash are compiled in.
 *
 *   icon.png               1024², white, full-colour mark. iOS, Android 7 and older,
 *                          and the stores. Opaque RGB: Apple rejects an icon with alpha.
 *   adaptive-icon.png      1024², transparent foreground for Android 8+. The mark sits
 *                          inside the 66/108 safe circle that every launcher mask keeps;
 *                          the white behind it is app.json's adaptiveIcon.backgroundColor.
 *                          It is also the launch splash's icon (app.json's
 *                          expo-splash-screen plugin) at 288dp: Android 12+ masks that
 *                          icon to its middle 192dp circle, and the safe circle sits
 *                          inside it, so the whole mark shows.
 *   favicon.png            196², white, for the web build.
 *   notification-icon.png  96², white silhouette on transparent. Android draws only a
 *                          notification icon's alpha, so colour would be thrown away.
 *
 * And, into store-listing/ — artwork for the store pages, never bundled into the app:
 *
 *   play-icon-512.png      512², white, opaque. The Play Store's listing icon, composed
 *                          like icon.png; Play rounds the corners itself.
 *   feature-graphic.png    1024×500, white, opaque. The banner across the top of the Play
 *                          listing: the mark and the wordmark, "Hisab" in ink and "Kitab"
 *                          in the brand blue, as `Wordmark` sets them. The two words come
 *                          from src/constants/brand.ts, the name's one source.
 *
 * Rendering needs @resvg/resvg-js, which is deliberately not a dependency: the app
 * never uses it, and it ships a native binary per platform that every `npm ci` would
 * then download. Install it outside the project and point NODE_PATH at it:
 *
 *   npm install --prefix "$TMPDIR/resvg" @resvg/resvg-js
 *   NODE_PATH="$TMPDIR/resvg/node_modules" node scripts/generate-brand-assets.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const art = require('../src/constants/brandMark.json');

let Resvg;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch {
  console.error(
    'generate-brand-assets needs @resvg/resvg-js, which is not a project dependency.\n' +
      'Install it outside the project and point NODE_PATH at it:\n\n' +
      '  npm install --prefix "$TMPDIR/resvg" @resvg/resvg-js\n' +
      '  NODE_PATH="$TMPDIR/resvg/node_modules" node scripts/generate-brand-assets.js\n'
  );
  process.exit(1);
}

const ASSETS = path.join(__dirname, '..', 'assets');
const STORE = path.join(__dirname, '..', 'store-listing');
const WHITE = '#FFFFFF';
// The wordmark's two colours — theme/index.ts's colors.primary and colors.accent,
// which are brandMark.json's navy and coral. Read from the drawing, not retyped.
// Text needs a font, which a bare SVG renderer does not have; the system's will
// do for a store banner. Segoe UI on Windows, Roboto on Linux, Arial elsewhere.
const FONT_FAMILY = "'Segoe UI', Roboto, Arial, sans-serif";
const RESVG_OPTIONS = { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } };

// The name's two words, read from the app's one source of it rather than typed
// again here. brand.ts is TypeScript, so it is matched rather than required.
const APP_NAME_PARTS = (() => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'constants', 'brand.ts'), 'utf8');
  const match = /APP_NAME_PARTS\s*=\s*\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/.exec(source);
  if (!match) throw new Error('Could not read APP_NAME_PARTS from src/constants/brand.ts');
  return [match[1], match[2]];
})();

// Drawing order matters: the P paints over the tip of the K's arm, which is what
// makes the two letters interlock.
const PART_ORDER = ['speedLine1', 'speedLine2', 'speedLine3', 'kLetter', 'pLetter'];
const PATHS = PART_ORDER.flatMap((name) => {
  const part = art.parts[name];
  if (!part) throw new Error(`brandMark.json has no part named ${name} — PART_ORDER is out of date.`);
  return part.paths;
});

function gradients() {
  return Object.entries(art.paints)
    .map(([name, p]) => {
      const units = p.userSpace ? 'userSpaceOnUse' : 'objectBoundingBox';
      const stops = p.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
      return `<linearGradient id="${name}" gradientUnits="${units}" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}">${stops}</linearGradient>`;
    })
    .join('');
}

/**
 * A canvas with the mark `markWidth` wide — centred, unless `markX` places it —
 * and anything in `extra` drawn over it. `size` is shorthand for a square.
 */
function svg({ size, width = size, height = size, markWidth, markX, background = null, silhouette = false, extra = '' }) {
  const scale = markWidth / art.width;
  const x = markX ?? (width - markWidth) / 2;
  const y = (height - art.height * scale) / 2;
  const fill = (p) => (silhouette ? WHITE : p.paint ? `url(#${p.paint})` : art.navy);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    background ? `<rect width="${width}" height="${height}" fill="${background}"/>` : '',
    `<defs>${gradients()}</defs>`,
    `<g transform="translate(${x} ${y}) scale(${scale})">`,
    ...PATHS.map((p) => `<path d="${p.d}" fill="${fill(p)}"/>`),
    '</g>',
    extra,
    '</svg>',
  ].join('');
}

/** The two-colour wordmark as SVG text, its baseline at (x, y). */
function wordmark(x, y, fontSize) {
  const [first, second] = APP_NAME_PARTS;
  return (
    `<text x="${x}" y="${y}" font-family="${FONT_FAMILY}" font-weight="800" font-size="${fontSize}" ` +
    `letter-spacing="${(-fontSize * 0.018).toFixed(2)}">` +
    `<tspan fill="${art.navy}">${first}</tspan><tspan fill="${art.coral}">${second}</tspan></text>`
  );
}

/**
 * Where the wordmark's ink actually falls, relative to its baseline origin.
 * A font's advance widths and its painted pixels differ, and centring a mark
 * and a word together needs the painted ones — so it is rendered once, alone,
 * and measured.
 */
function measureWordmark(fontSize) {
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${fontSize * 12}" height="${fontSize * 3}">${wordmark(0, fontSize * 2, fontSize)}</svg>`;
  const box = new Resvg(probe, RESVG_OPTIONS).getBBox();
  if (!box) throw new Error('The wordmark rendered nothing — is a system font available?');
  return { left: box.x, top: box.y - fontSize * 2, width: box.width, height: box.height };
}

// PNG writer for the opaque icons, which must not carry an alpha channel.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function opaquePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      rgba.copy(raw, row + 1 + x * 3, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolour, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(file, options, dir = ASSETS) {
  const image = new Resvg(svg(options), RESVG_OPTIONS).render();
  // An opaque image's pixels are the same premultiplied or not, so dropping alpha is exact.
  const png = options.background ? opaquePng(image.width, image.height, image.pixels) : image.asPng();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), png);
  const width = options.width ?? options.size;
  const height = options.height ?? options.size;
  console.log(`  ${file.padEnd(23)} ${width}×${height}, mark ${Math.round(options.markWidth)} wide`);
}

// Android masks the adaptive icon to a circle. 544 wide puts the mark's corners
// 292px from the centre, inside the 313px safe radius — and 288 × 544/1024 is
// exactly 153, which is brandMark.json's splashMarkWidth. The KP mark is wider
// and shorter than the mark before it, so all three had to be re-solved.
const ADAPTIVE_MARK_WIDTH = 544;

// AnimatedSplash draws the mark at brandMark.json's splashMarkWidth so the
// system splash hands over without a jump. That is only true while it equals
// what the system splash actually shows: this file's adaptive mark, at the
// imageWidth app.json gives expo-splash-screen. Changing either here or there
// without the other is a jump nobody would notice until a launch.
{
  const plugins = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo.plugins;
  const splash = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  const imageWidth = splash?.[1]?.imageWidth;
  const expected = (imageWidth * ADAPTIVE_MARK_WIDTH) / 1024;
  if (art.splashMarkWidth !== expected) {
    throw new Error(
      `brandMark.json splashMarkWidth is ${art.splashMarkWidth}, but the system splash shows the mark ` +
        `${expected}dp wide (imageWidth ${imageWidth} × ${ADAPTIVE_MARK_WIDTH}/1024). Make them agree.`
    );
  }
}

console.log('Rendering brand assets from src/constants/brandMark.json:');
render('icon.png', { size: 1024, markWidth: 600, background: WHITE });
render('adaptive-icon.png', { size: 1024, markWidth: ADAPTIVE_MARK_WIDTH });
render('favicon.png', { size: 196, markWidth: 156, background: WHITE });
// 80 of 96: Android's 24dp notification icon keeps its artwork inside the middle 20dp.
render('notification-icon.png', { size: 96, markWidth: 80, silhouette: true });

// Android 13+ themed icon: one colour, masked by the launcher into whatever the
// wallpaper suggests. Drawn as the silhouette, so the shape carries it alone.
render('monochrome-icon.png', { size: 1024, markWidth: ADAPTIVE_MARK_WIDTH, silhouette: true });

// The web set, written straight into web/public/. favicon.png had been a hand
// copy of the one in assets/, with nothing keeping the two in step.
const WEB = path.join(__dirname, '..', '..', 'web', 'public');
console.log('\nRendering the web icon set into web/public/:');
render('favicon-16.png', { size: 16, markWidth: 15, background: WHITE }, WEB);
render('favicon-32.png', { size: 32, markWidth: 29, background: WHITE }, WEB);
render('favicon.png', { size: 196, markWidth: 156, background: WHITE }, WEB);
// Apple adds the rounded corners itself and refuses transparency.
render('apple-touch-icon.png', { size: 180, markWidth: 140, background: WHITE }, WEB);
render('pwa-192.png', { size: 192, markWidth: 150, background: WHITE }, WEB);
render('pwa-512.png', { size: 512, markWidth: 400, background: WHITE }, WEB);
// Maskable: a launcher may crop to the circle inscribed in the middle 80%, so
// the mark is drawn small enough to survive that.
render('pwa-maskable-512.png', { size: 512, markWidth: 272, background: WHITE }, WEB);

console.log('\nRendering store artwork into store-listing/:');
render('play-icon-512.png', { size: 512, markWidth: 300, background: WHITE }, STORE);
{
  // The mark and the wordmark side by side, centred as one group, with the
  // word's ink vertically centred on the mark. Play crops nothing from this
  // banner, but some surfaces overlay it near the edges, so the group keeps
  // well inside them.
  const width = 1024;
  const height = 500;
  const markWidth = 230;
  const gap = 44;
  const fontSize = 100;
  const word = measureWordmark(fontSize);
  const markX = (width - (markWidth + gap + word.width)) / 2;
  const textX = markX + markWidth + gap - word.left;
  const baseline = height / 2 - word.top - word.height / 2;
  render(
    'feature-graphic.png',
    { width, height, markWidth, markX, background: WHITE, extra: wordmark(textX, baseline, fontSize) },
    STORE
  );
}

{
  // The Open Graph card. Deliberately NOT in web/public/: the service worker
  // precaches everything in dist/, so a 1200x630 image there becomes a mandatory
  // download for every visitor. It is uploaded and referenced by absolute URL.
  const width = 1200;
  const height = 630;
  const markWidth = 300;
  const gap = 52;
  const fontSize = 118;
  const word = measureWordmark(fontSize);
  const markX = (width - (markWidth + gap + word.width)) / 2;
  const textX = markX + markWidth + gap - word.left;
  const baseline = height / 2 - word.top - word.height / 2;
  render(
    'og-card.png',
    { width, height, markWidth, markX, background: WHITE, extra: wordmark(textX, baseline, fontSize) },
    STORE
  );
}
