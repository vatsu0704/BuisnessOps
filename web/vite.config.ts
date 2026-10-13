import path from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
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

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': SHARED,
    },
  },
  server: {
    port: 5173,
    // Vite refuses to serve modules outside the project root unless told, and
    // `@shared` resolves to ../frontend/src.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), SHARED] },
  },
});
