import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/demo',
  build: {
    outDir: '../../public/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        demo: 'src/demo/index.html'
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});