import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'demo',
  // The runtime has no external dependencies; avoid an optimizer reload during a live scene.
  optimizeDeps: { noDiscovery: true },
  build: {
    outDir: '../site-dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        home: fileURLToPath(new URL('./demo/index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./demo/privacy/index.html', import.meta.url)),
      },
    },
  },
  server: { fs: { allow: ['..'] } },
});
