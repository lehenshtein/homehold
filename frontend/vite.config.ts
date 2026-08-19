import { defineConfig } from 'vite';

// Dev-only: proxies /api/* to the local backend, stripping the /api prefix,
// so frontend code can call the same /api/... paths in dev and prod (prod
// does the equivalent stripping in nginx, see CLAUDE.md).
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:6101',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
