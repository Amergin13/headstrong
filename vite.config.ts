import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'headstrong-icon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
        'screenshot-mobile-1.png',
        'screenshot-mobile-2.png',
        'privacy.html',
        'terms.html',
        '.well-known/assetlinks.json',
      ],
      manifest: {
        id: '/',
        name: 'HeadStrong: Hypertrophy & Strength Tracker',
        short_name: 'HeadStrong',
        description:
          'Gamified hypertrophy workout tracker with international strength standards, cross-equipment progression, and Google Pixel Watch biometrics.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        theme_color: '#060709',
        background_color: '#060709',
        categories: ['health', 'fitness', 'sports'],
        prefer_related_applications: false,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: 'screenshot-mobile-1.png',
            sizes: '540x960',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Live Workout Tracker with 1-Tap Equipment Conversion & Pixel Watch Recovery',
          },
          {
            src: 'screenshot-mobile-2.png',
            sizes: '540x960',
            type: 'image/png',
            form_factor: 'narrow',
            label: '7-Pillar Strength Radar, Volume Landmarks & Personal Knowledge Graph',
          },
        ],
        shortcuts: [
          {
            name: 'Start Workout',
            short_name: 'Workout',
            description: 'Open today’s hypertrophy session',
            url: '/?tab=train',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Sync Pixel Watch',
            short_name: 'Watch Sync',
            description: 'Sync HRV, Resting HR & Sleep from Google Pixel Watch',
            url: '/?tab=program&action=watch-sync',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Log Bodyweight',
            short_name: 'Log Weight',
            description: 'Record today’s scale weight and update 7-Day EMA',
            url: '/?tab=analytics&action=log-weight',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-charts': ['recharts'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
