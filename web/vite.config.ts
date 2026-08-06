import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    // Em desenvolvimento, encaminha as chamadas /api para o backend.
    proxy: {
      '/api': 'http://localhost:3333',
    },
  },
});
