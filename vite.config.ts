import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the site from /<repo-name>/
const base = process.env.VITE_BASE ?? '/lexo/'

// https://vite.dev/config/
export default defineConfig({
  base,
  build: {
    // The grammar chunk is all 100+ articles and 2000+ exercises as text; it loads only with the grammar section.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Libraries change rarely: keeping them in their own chunks means a deploy re-downloads only the app code.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'data', test: /node_modules[\\/](@tanstack|framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lexo',
        short_name: 'Lexo',
        description: 'Тренажер слів з інтервальним повторенням',
        lang: 'uk',
        theme_color: '#0A0B0F',
        background_color: '#0A0B0F',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
