import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { protocolMediaDevPlugin } from './protocolMediaDevPlugin.js';

// Self-signed HTTPS is only for the local dev server (`pnpm start` / `pnpm dev`).
// `vite build` and `vite preview` must stay on plain HTTP so the production
// build does not load @vitejs/plugin-basic-ssl.
export default defineConfig(({ command }) => {
  const isPreview = process.argv.includes('preview');
  const httpsEnabled =
    command === 'serve' && !isPreview && process.env.HTTPS !== 'false';

  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({
        globals: {
          Buffer: true,
          stream: true,
          process: true,
        },
      }),
      ...(httpsEnabled ? [basicSsl()] : []),
      ...(command === 'serve' &&
      !isPreview &&
      process.env.VITE_PROTOCOL_DIRECT === '1'
        ? [protocolMediaDevPlugin()]
        : []),
    ],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
    server: {
      https: httpsEnabled,
    },
    // Local stand-in for the Vercel `/fc-api` rewrite. Production builds set
    // VITE_FC_API_BASE=/fc-api; `vite preview` has no vercel.json.
    preview: {
      proxy: {
        '/fc-api': {
          target: 'https://client.farcaster.xyz',
          changeOrigin: true,
          secure: true,
          rewrite: (requestPath) => requestPath.replace(/^\/fc-api/, '') || '/',
        },
        '/snap': {
          target: 'https://haatz.quilibrium.com',
          changeOrigin: true,
          secure: true,
          rewrite: (requestPath) => requestPath.replace(/^\/snap/, '') || '/',
        },
      },
    },
    build: {
      sourcemap: 'hidden',
      // Match browserslist config: chrome >= 111, edge >= 111, firefox >= 128, safari >= 16.4
      // These browsers all support ES2020 features natively (classes, async/await, spread, etc.)
      target: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
      rollupOptions: {
        output: {
          manualChunks: {
            // Split heavy vendor libraries into separate chunks
            'vendor-viem': ['viem'],
            'vendor-wagmi': ['wagmi', '@wagmi/core', '@wagmi/connectors'],
            'vendor-solana': ['@solana/web3.js'],
            'vendor-privy': ['@privy-io/react-auth'],
            'vendor-draftjs': [
              'draft-js',
              '@draft-js-plugins/editor',
              '@draft-js-plugins/mention',
              '@draft-js-plugins/emoji',
              '@draft-js-plugins/linkify',
            ],
            'vendor-emoji': [
              'emoji-mart',
              '@emoji-mart/data',
              '@emoji-mart/react',
            ],
            'vendor-charts': ['recharts'],
          },
        },
        plugins: [],
      },
    },
  };
});
