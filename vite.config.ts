import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// VITE_BASE: en GitHub Pages es "/nombre-del-repo/"; en dominio propio, "/".
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    {
      // Política de seguridad: solo se ejecuta código propio y solo se habla con el proyecto de Supabase.
      name: 'csp',
      transformIndexHtml(html) {
        const sb = process.env.VITE_SUPABASE_URL || '';
        const ws = sb.replace(/^http/, 'ws');
        const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' ${sb} ${ws}; img-src 'self' data: blob: ${sb}; media-src 'self' blob: ${sb}; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'`;
        return html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="strict-origin-when-cross-origin">`);
      },
    },
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: false, // cada app instalable tiene su propio manifiesto en public/<app>/
      injectManifest: { globPatterns: ['**/*.{js,css,html,woff2}', 'icons/*.png', 'logos/*.png'], globIgnores: ['**/exceljs*', '**/jspdf*', '**/html2canvas*', '**/purify*', '**/index.es-*', '**/tus*'], maximumFileSizeToCacheInBytes: 2 * 1024 * 1024 },
    }),
  ],
  build: {
    target: 'es2022',
    // Las letras nunca se incrustan como data: (la política de seguridad solo permite font-src 'self').
    assetsInlineLimit: (archivo: string) => (archivo.endsWith('.woff2') ? false : undefined),
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        campus: resolve(__dirname, 'campus/index.html'),
        chat: resolve(__dirname, 'chat/index.html'),
        notas: resolve(__dirname, 'notas/index.html'),
        matricula: resolve(__dirname, 'matricula/index.html'),
      },
    },
  },
});
