const fs = require('fs');
const path = require('path');

/**
 * The image-size override only works together with its patch.
 *
 * image-size's only patched line (2.x) changed the interface its consumer
 * calls: it exports `imageSize` instead of a default, and measures bytes only.
 * The metro that Expo bundles with — the copy pinned inside `@expo/metro`,
 * 0.83.3 on SDK 54, not the newer one react-native's CLI pulls in at the top
 * level — still does `require("image-size").default(...)`, with a Buffer in one
 * place and a file path in the other. So the override in package.json is paired
 * with `patches/@expo+metro++metro+0.83.3.patch` — see "Dependency overrides"
 * in CLAUDE.md. patch-package fails the install when a patch stops applying,
 * but nothing notices one that applies and no longer works, and a broken
 * measurer breaks every bundle that contains an image.
 *
 * So this calls the patched code itself, offline, through the same entry
 * point Expo uses: metro's two image measurers, on the app icon.
 *
 * (Up to SDK 51 this also proved a tar patch for @expo/cli's template
 * extraction. SDK 54's @expo/cli asks for tar 7 itself, so that override and
 * its patch are gone.)
 */

const Assets = require('@expo/metro/metro/Assets');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

const failures = [];
function expect(label, ok) {
  if (!ok) failures.push(label);
}

async function checkImageSize() {
  // A PNG carries its size in the IHDR chunk, which gives an answer that owes
  // nothing to image-size.
  const png = fs.readFileSync(ICON);
  const want = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
  const fromBuffer = Assets.getAssetSize('png', png, ICON);
  const fromPath = await Assets.getAssetData(ICON, 'assets/icon.png', [], null, '/assets');
  expect(`metro getAssetSize (Buffer) measures icon.png as ${want}`, `${fromBuffer.width}x${fromBuffer.height}` === want);
  expect(`metro getAssetData (path) measures icon.png as ${want}`, `${fromPath.width}x${fromPath.height}` === want);
}

async function main() {
  try {
    await checkImageSize();
  } catch (error) {
    failures.push(`image-size threw: ${error.stack}`);
  }

  if (failures.length) {
    console.error('Patched dependency check FAILED:\n');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      '\nThe image-size override needs the patch in patches/ to keep metro\n' +
        'working. See "Dependency overrides" in CLAUDE.md.\n'
    );
    process.exit(1);
  }
  console.log('Patched dependencies OK — metro (inside @expo/metro) measures images on image-size 2.');
}

main();
