import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { route as ziggyRoute } from 'ziggy-js';
import { NetworkStatusToast } from './components/network-status-toast';
import { LocationTracker } from './components/location-tracker';
import { Toaster } from './components/ui/sonner';
import { initializeTheme } from './hooks/use-appearance';
import type { SharedData } from './types';
import { registerSW } from 'virtual:pwa-register';
import { PwaInstallPrompt } from './components/pwa-install-prompt';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => title ? `${title} - ${appName}` : appName,
    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
    setup({ el, App, props }) {
        const ziggy = (props.initialPage.props.ziggy ?? globalThis.Ziggy) as SharedData['ziggy'] | undefined;
        const ziggyConfig =
            ziggy && typeof ziggy.location === 'string'
                ? {
                      ...ziggy,
                      location: new URL(ziggy.location),
                  }
                : ziggy;

        globalThis.route = ((name, params, absolute) => ziggyRoute(name, params, absolute, ziggyConfig)) as typeof ziggyRoute;

        const root = createRoot(el);

        root.render(
            <>
                <App {...props} />
                <Toaster />
                <NetworkStatusToast />
                <LocationTracker auth={props.initialPage.props.auth as SharedData['auth'] | undefined} />
                <PwaInstallPrompt />
            </>,
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();

// In dev, register a lightweight service worker so Chrome can show the
// install prompt (beforeinstallprompt only fires when a SW is active).
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('SW registration failed:', error);
    });
}

// Register the real (Workbox) service worker only in production and force
// stale shells to refresh.
if (import.meta.env.PROD) {
    let hasReloadedForUpdate = false;

    registerSW({
        immediate: true,
        onNeedRefresh() {
            if (!hasReloadedForUpdate) {
                hasReloadedForUpdate = true;
                window.location.reload();
            }
        },
        onOfflineReady() {
            // Keep silent here; the app already has its own install/status UI.
        },
    });
}
