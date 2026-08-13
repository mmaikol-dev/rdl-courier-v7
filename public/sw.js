// Lightweight service worker used during local development only.
// Chrome only fires the `beforeinstallprompt` event when a service worker
// with a fetch handler controls the page. This one never caches anything;
// every request is passed straight through to the network so the dev
// experience is unchanged. It is never registered in production builds.
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
