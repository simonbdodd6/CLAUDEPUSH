import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api':      { target: 'http://localhost:3001', changeOrigin: true },
      '/twin':     { target: 'http://localhost:3002', changeOrigin: true },
      '/fixtures': { target: 'http://localhost:3003', changeOrigin: true },
      '/season':   { target: 'http://localhost:3003', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
});
