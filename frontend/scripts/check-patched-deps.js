const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * The tar and image-size overrides only work together with their patches.
 *
 * Each package's only patched line changed the interface its one consumer
 * calls, so each override in package.json is paired with a patch in patches/
 * that adapts the consumer — see "Dependency overrides" in CLAUDE.md.
 * patch-package fails the install when a patch stops applying, but nothing
 * notices one that applies and no longer works. The tar patch in particular
 * sits on a path only `expo prebuild` reaches, which no other check runs, so
 * a regression there would first show up as `npm run android` failing on a
 * fresh clone.
 *
 * So this calls the patched code itself, offline: @expo/cli's two template
 * extractors, on a tarball with HelloWorld paths that prebuild must rename,
 * and metro's two image measurers, on the app icon. One limit: extractAsync
 * prefers the system `tar` binary everywhere but Windows, so on CI's Linux
 * only the stream extractor proves the tar patch. Windows, where this runs
 * locally, is the platform that always takes the JS path.
 */

const EXPO_CLI = path.dirname(require.resolve('@expo/cli/package.json'));
const tar = require(require.resolve('tar', { paths: [EXPO_CLI] }));
const { extractNpmTarballAsync } = require('@expo/cli/build/src/utils/npm');
const { extractAsync } = require('@expo/cli/build/src/utils/tar');
const Assets = require('metro/src/Assets');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

const failures = [];
function expect(label, ok) {
  if (!ok) failures.push(label);
}

async function checkTar(work) {
  // Shaped like a template: npm packs everything under package/, and prebuild
  // renames HelloWorld as it extracts — lower-cased on Android paths.
  const src = path.join(work, 'src');
  const javaDir = path.join(src, 'package', 'android', 'com', 'helloworld');
  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(path.join(src, 'package', 'HelloWorld.txt'), 'ios\n');
  fs.writeFileSync(path.join(javaDir, 'MainActivity.kt'), 'android\n');
  const tgz = path.join(work, 'template.tgz');
  await tar.create({ gzip: true, file: tgz, cwd: src }, ['package']);

  const streamed = path.join(work, 'streamed');
  await extractNpmTarballAsync(fs.createReadStream(tgz), { cwd: streamed, name: 'PatchCheck' });
  expect(
    '@expo/cli extractNpmTarballAsync (prebuild) extracts and renames HelloWorld',
    fs.existsSync(path.join(streamed, 'PatchCheck.txt')) &&
      fs.existsSync(path.join(streamed, 'android', 'com', 'patchcheck', 'MainActivity.kt'))
  );

  const unpacked = path.join(work, 'unpacked');
  fs.mkdirSync(unpacked);
  await extractAsync(tgz, unpacked);
  expect('@expo/cli extractAsync extracts', fs.existsSync(path.join(unpacked, 'package', 'HelloWorld.txt')));
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

// Each check runs whatever the other did, so a run with both broken says so.
async function run(label, check) {
  try {
    await check();
  } catch (error) {
    failures.push(`${label} threw: ${error.stack}`);
  }
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'biziq-patched-deps-'));
  await run('tar', () => checkTar(work));
  // A failed extract leaves its read stream open and Windows will not delete
  // a file with an open handle; that must not replace the error that caused it.
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {}
  await run('image-size', checkImageSize);

  if (failures.length) {
    console.error('Patched dependency check FAILED:\n');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      '\nThe tar and image-size overrides need the patches in patches/ to keep\n' +
        '@expo/cli and metro working. See "Dependency overrides" in CLAUDE.md.\n'
    );
    process.exit(1);
  }
  console.log('Patched dependencies OK — @expo/cli extracts templates on tar 7, metro measures images on image-size 2.');
}

main();
