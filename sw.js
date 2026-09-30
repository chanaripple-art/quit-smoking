/* Service worker — offline-first app shell cache for the quit-smoking PWA. */

const VERSION = 'v1';
const CACHE = `quit-smoking-${VERSION}`;

/* Everything the app needs to boot with zero network. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './static/css/styles.css',
  './static/js/app.js',
  './static/js/store.js',
  './static/js/content.js',
  './static/js/charts.js',
  './static/js/util.js',
  './static/js/sos.js',
  './static/icons/apple-touch-icon.png',
  './static/icons/icon-192.png',
  './static/icons/icon-512.png',
  './static/icons/icon-512-maskable.png',
  './static/icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is all-or-nothing; add individually so one 404 can't brick install
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so updates land, fall back to cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Static assets: cache first, revalidate in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* --- Local notifications requested by the page --- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'NOTIFY') {
    self.registration.showNotification(data.title || '戒烟提醒', {
      body: data.body || '',
      icon: './static/icons/icon-192.png',
      badge: './static/icons/icon-192.png',
      tag: data.tag || 'quit-reminder',
      data: { url: data.url || './index.html' },
    });
  }
});
