import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

// Pebble executes entirely in the browser; Netlify needs only static assets.
// Keep the original Sites/Cloudflare build available in vite.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: 'dist-netlify' },
});
