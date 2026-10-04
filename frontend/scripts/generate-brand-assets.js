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
 *                          The Android 12+ system splash shows this same layer.
 *   splash-icon.png        1024², transparent. Expo scales it to the screen's width, and
 *                          the mark spans `splashShare` of it — the share AnimatedSplash
 *                          draws at, so the hand-over does not jump.
 *   favicon.png            196², white, for the web build.
 *   notification-icon.png  96², white silhouette on transparent. Android draws only a
 *                          notification icon's alpha, so colour would be thrown away.
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
const WHITE = '#FFFFFF';

// Drawing order matters: the ribbon paints over the top of the right stem's lower piece.
const PATHS = ['leftStem', 'rightStem', 'ribbon', 'arm'].flatMap((name) => art.parts[name].paths);

function gradients() {
  return Object.entries(art.paints)
    .map(([name, p]) => {
      const units = p.userSpace ? 'userSpaceOnUse' : 'objectBoundingBox';
      const stops = p.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
      return `<linearGradient id="${name}" gradientUnits="${units}" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}">${stops}</linearGradient>`;
    })
    .join('');
}

/** A square canvas with the mark `markWidth` wide, centred. */
function svg({ size, markWidth, background = null, silhouette = false }) {
  const scale = markWidth / art.width;
  const x = (size - markWidth) / 2;
  const y = (size - art.height * scale) / 2;
  const fill = (p) => (silhouette ? WHITE : p.paint ? `url(#${p.paint})` : art.blue);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '',
    `<defs>${gradients()}</defs>`,
    `<g transform="translate(${x} ${y}) scale(${scale})">`,
    ...PATHS.map((p) => `<path d="${p.d}" fill="${fill(p)}"/>`),
    '</g></svg>',
  ].join('');
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

function render(file, options) {
  const image = new Resvg(svg(options)).render();
  // An opaque image's pixels are the same premultiplied or not, so dropping alpha is exact.
  const png = options.background ? opaquePng(image.width, image.height, image.pixels) : image.asPng();
  fs.writeFileSync(path.join(ASSETS, file), png);
  console.log(`  ${file.padEnd(23)} ${options.size}×${options.size}, mark ${Math.round(options.markWidth)} wide`);
}

console.log('Rendering brand assets from src/constants/brandMark.json:');
render('icon.png', { size: 1024, markWidth: 600, background: WHITE });
// 500 wide puts the mark's corners 299px from the centre, inside the 313px safe radius.
render('adaptive-icon.png', { size: 1024, markWidth: 500 });
render('splash-icon.png', { size: 1024, markWidth: 1024 * art.splashShare });
render('favicon.png', { size: 196, markWidth: 156, background: WHITE });
// 80 of 96: Android's 24dp notification icon keeps its artwork inside the middle 20dp.
render('notification-icon.png', { size: 96, markWidth: 80, silhouette: true });
