// electron.vite.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';

// The strict Content-Security-Policy is applied to the built app only; the dev server needs inline scripts for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

// Payments stay on the web: the web's two payment pop-ups load a card-checkout script, so they are swapped for pop-ups that open the web instead.
const webOnlyPayments = (): Plugin => ({
  name: 'parasync-web-only-payments',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !importer.includes('/renderer/src/web/app/')) return null;
    if (/(^|\/)AddFundsModal$/.test(source)) return resolve(__dirname, 'src/renderer/src/shims/addFundsModal.tsx');
    if (/(^|\/)SubscribeAgentModal$/.test(source)) return resolve(__dirname, 'src/renderer/src/shims/subscribeAgentModal.tsx');
    return null;
  },
});

const cspPlugin = (): Plugin => ({
  name: 'parasync-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    // The web app's screens are copied into src/renderer/src/web and import each other as "@/...". The few things they take from Next.js
    // or the web's own Supabase client are answered by small adapters in src/renderer/src/shims. Desktop-only code imports as "~/...".
    publicDir: resolve(__dirname, 'src/renderer/src/web/public'),
    resolve: {
      alias: [
        { find: 'next/link', replacement: resolve(__dirname, 'src/renderer/src/shims/nextLink.tsx') },
        { find: 'next/navigation', replacement: resolve(__dirname, 'src/renderer/src/shims/nextNavigation.tsx') },
        { find: 'next/image', replacement: resolve(__dirname, 'src/renderer/src/shims/nextImage.tsx') },
        { find: '@/lib/supabase/client', replacement: resolve(__dirname, 'src/renderer/src/shims/supabaseClient.ts') },
        { find: '@uiw/react-codemirror', replacement: resolve(__dirname, 'src/renderer/src/shims/codemirror.tsx') },
        { find: '@codemirror/lang-python', replacement: resolve(__dirname, 'src/renderer/src/shims/langPython.ts') },
        { find: '@/components/local-copy/LocalCopy', replacement: resolve(__dirname, 'src/renderer/src/shims/localCopy.tsx') },
        { find: '@shared', replacement: resolve(__dirname, 'src/shared') },
        { find: /^~\//, replacement: `${resolve(__dirname, 'src/renderer/src')}/` },
        { find: /^@\//, replacement: `${resolve(__dirname, 'src/renderer/src/web')}/` },
      ],
    },
    // The web's screens read a few build-time settings from process.env (all payment related, and unused here); keep the page from crashing on them.
    define: { 'process.env': {} },
    plugins: [webOnlyPayments(), react(), cspPlugin()],
  },
});
