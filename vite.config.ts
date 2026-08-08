import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Nazwa repozytorium na GitHubie (ścieżka Pages: /<repo>/)
const REPO_NAME = 'Gra-Karier'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? `/${REPO_NAME}/` : '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Gra Kariery — Zawodnik',
        short_name: 'Kariera',
        description: 'Symulator kariery piłkarza z decyzjami tygodniowymi',
        theme_color: '#0b3d2e',
        background_color: '#071a14',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'pl',
        start_url: './',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
})
