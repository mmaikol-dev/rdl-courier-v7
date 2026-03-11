import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.tsx',
            refresh: true,
        }),
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'offline.html'],
            manifest: {
                name: 'RealDeal Ltd',
                short_name: 'RealDeal',
                description: 'RealDeal operations dashboard and order management.',
                theme_color: '#111827',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                icons: [
                    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: true,
                navigateFallbackDenylist: [/^\/(?:api|broadcasting|sanctum)\b/, /\/storage\//],
                runtimeCaching: [
                    {
                        urlPattern: ({ request, url }) => request.mode === 'navigate' && url.origin === self.location.origin,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'app-pages',
                            networkTimeoutSeconds: 3,
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 * 14,
                            },
                            precacheFallback: {
                                fallbackURL: '/offline.html',
                            },
                        },
                    },
                    {
                        urlPattern: ({ request, url }) =>
                            ['script', 'style', 'worker'].includes(request.destination) && url.origin === self.location.origin,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'app-shell-assets',
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                            expiration: {
                                maxEntries: 150,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },
                    {
                        urlPattern: ({ request, url }) =>
                            ['image', 'font'].includes(request.destination) && url.origin === self.location.origin,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'app-media',
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                        },
                    },
                ],
            },
        }),
    ],
    esbuild: {
        jsx: 'automatic',
    },
    resolve: {
        alias: {
            'ziggy-js': resolve(__dirname, 'vendor/tightenco/ziggy'),
        },
    },
});
