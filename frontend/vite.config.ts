import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 4318,
    // In development the backend runs on its own port; in production it serves these assets itself
    // (ADR-0002), so the app always talks to a same-origin /api and /ws regardless of mode.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:4317', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
