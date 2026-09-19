import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS ? '/totk-map/' : '/'),
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 4096,
  },
});
