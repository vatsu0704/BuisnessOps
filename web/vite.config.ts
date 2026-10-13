import path from 'node:path';
import { searchForWorkspaceRoot } from 'vite';
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

export default defineConfig({
  plugins: [react()],
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
