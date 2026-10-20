import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { searchForWorkspaceRoot, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * `@shared` is the mobile app's source, read in place rather than copied.
 *
 * The web app imports only files that are pure data or pure functions — the
 * locale files, the permission matrix, the brand mark and name, and the number
 * formatter — so there is one copy of each and the two apps cannot disagree
 * about a translation, a capability or the logo. web/README.md lists them and
 * the rule that keeps it safe: a shared file may import nothing but its siblings.
 */
const SHARED = path.resolve(import.meta.dirname, '../frontend/src');

/**
 * The packages a shared file may import. A bare import inside frontend/src
 * resolves from frontend/node_modules — a second copy of i18next the web never
 * initialised (refusals came back empty), and in CI, where the app's
 * node_modules is not installed, no copy at all. `dedupe` makes the bundler use
 * the web's own; tsconfig.app.json's `paths` does the same for the type-checker,
 * and scripts/check-shared-imports.js refuses any package not on this list.
 */
const SHARED_PACKAGES = ['i18next', 'react', 'react-dom', 'react-i18next'];

/** Every file under a directory, as site paths ('/assets/x.js'). */
async function siteFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? siteFiles(path.join(dir, entry.name), `${prefix}/${entry.name}`)
        : Promise.resolve([`${prefix}/${entry.name}`])
    )
  );
  return nested.flat();
}

/** What `VITE_SERVICE_WORKER=off` publishes instead: a worker that removes itself and its caches. */
const SELF_REMOVING_WORKER = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('kitnapay-') || key.startsWith('hisabkitab-')) await caches.delete(key);
  await self.registration.unregister();
  for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
})()));
`;

/**
 * Writes `dist/sw.js` (requirement 30): `sw/service-worker.js` with this build's
 * file list and a version from their names and the page itself, so a new build is
 * a new worker. Fails the build if the worker's marker has gone, rather than
 * publishing a worker that keeps nothing — the counter would then not open
 * offline, and nobody would know until a shop lost its connection.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'kitnapay-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      if (process.env.VITE_SERVICE_WORKER === 'off') {
        await writeFile(path.join(outDir, 'sw.js'), SELF_REMOVING_WORKER);
        return;
      }
      const template = await readFile(path.resolve(import.meta.dirname, 'sw/service-worker.js'), 'utf8');
      const marker = /\/\* @hk-build \*\/[\s\S]*?\/\* @end \*\//;
      if (!marker.test(template)) throw new Error('sw/service-worker.js has lost its /* @hk-build */ … /* @end */ marker');
      const files = (await siteFiles(outDir)).filter((file) => file !== '/sw.js' && !file.endsWith('.map')).sort();
      const hash = createHash('sha256').update(template).update(files.join('\n'));
      hash.update(await readFile(path.join(outDir, 'index.html')));
      const build = { version: hash.digest('hex').slice(0, 12), files };
      await writeFile(path.join(outDir, 'sw.js'), template.replace(marker, () => JSON.stringify(build)));
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': SHARED,
    },
    dedupe: SHARED_PACKAGES,
  },
  build: {
    rolldownOptions: {
      output: {
        // React and the router change far less often than the app. In their own
        // chunk they stay cached across deploys, and the app's chunk stays small.
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ }],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Vite refuses to serve modules outside the project root unless told, and
    // `@shared` resolves to ../frontend/src.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), SHARED] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
