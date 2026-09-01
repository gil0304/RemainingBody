import { defineConfig } from 'vite';

// base './' so the production build runs from any local path / local HTTP server,
// fully offline (no CDN, no absolute paths).
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 6000,
  },
});
