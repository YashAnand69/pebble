import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

// Pebble executes entirely in the browser; Netlify and Vercel serve static assets.
// Keep the original Sites/Cloudflare build available in vite.config.ts.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/ecosystem/llm': { target: 'https://pebble-llm.vercel.app', changeOrigin: true, rewrite: (path) => path.replace('/api/ecosystem/llm', '/api') },
      '/api/ecosystem/sentinel': { target: 'https://pebble-sentinel.vercel.app', changeOrigin: true, rewrite: (path) => path.replace('/api/ecosystem/sentinel', '/api') },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: 'dist-netlify' },
});
