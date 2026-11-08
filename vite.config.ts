import { defineConfig } from 'vite';
export default defineConfig({
  root: 'demo',
  build: { outDir: '../site-dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
});
