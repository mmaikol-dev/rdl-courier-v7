import { cp, mkdir } from 'node:fs/promises';
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
        {
            name: 'copy-pwa-icons-to-build',
            async closeBundle() {
                const sourceDir = resolve(__dirname, 'public/icons');
                const targetDir = resolve(__dirname, 'public/build/icons');
                await mkdir(targetDir, { recursive: true });
                await cp(sourceDir, targetDir, { recursive: true });
            },
        },
        react(),
        tailwindcss(),
        VitePWA({
            buildBase: '/build/',
            registerType: 'autoUpdate',
            devOptions: {
                enabled: false,
            },
            workbox: {
                cleanupOutdatedCaches: true,
                clientsClaim: true,
                skipWaiting: true,
                globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
                manifestTransforms: [
                    async (entries) => ({
                        manifest: entries.map((entry) => ({
                            ...entry,
                            url: entry.url.startsWith('icons/') ? `/${entry.url}` : entry.url,
                        })),
                        warnings: [],
                    }),
                ],
                navigateFallback: null,
                navigateFallbackDenylist: [/^\/.*$/],
            },
            includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
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
        }),
    ],
    esbuild: {
        jsx: 'automatic',
    },
    server: {
        watch: {
            ignored: [
                '**/.git/**',
                '**/node_modules/**',
                '**/vendor/**',
                '**/storage/**',
                '**/bootstrap/cache/**',
                '**/build/**',
                '**/public/build/**',
                '**/realdealsystem/**',
            ],
        },
    },
    resolve: {
        alias: {
            'ziggy-js': resolve(__dirname, 'vendor/tightenco/ziggy'),
        },
    },
});
