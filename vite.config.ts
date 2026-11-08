import { defineConfig } from 'vite';
export default defineConfig({
  root: 'demo',
  build: {
    outDir: '../site-dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        home: 'demo/index.html',
        dashboard: 'demo/dashboard/index.html',
        privacy: 'demo/privacy/index.html',
      },
    },
  },
  server: { fs: { allow: ['..'] } },
});
