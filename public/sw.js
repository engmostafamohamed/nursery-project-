/* XO Nursery — Service Worker. Bump CACHE_VERSION when caching behavior or precache list changes. */
const CACHE_VERSION = '2';
const CACHE_STATIC = `xo-static-v${CACHE_VERSION}`;
const CACHE_API = `xo-api-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

function isSupabaseRestGet(request) {
  return (
    request.method === 'GET' &&
    request.url.includes('/rest/v1/') &&
    !request.url.includes('rpc/')
  );
}

function isSameOriginAsset(request) {
  try {
    const u = new URL(request.url);
    return u.origin === self.location.origin && u.pathname.startsWith('/assets/');
  } catch {
    return false;
  }
}

function isGoogleFontRequest(request) {
  try {
    const u = new URL(request.url);
    return (
      request.method === 'GET' &&
      (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com')
    );
  } catch {
    return false;
  }
}

/** Offline-first for navigation: network first, then cached shell. */
async function navigateOfflineFirst(request) {
  try {
    const live = await fetch(request);
    if (live.ok) {
      const ct = live.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const cache = await caches.open(CACHE_STATIC);
        void cache.put('/index.html', live.clone());
      }
    }
    return live;
  } catch {
    const cache = await caches.open(CACHE_STATIC);
    const fallback = (await cache.match('/index.html')) || (await cache.match('/'));
    return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    void networkPromise;
    return cached;
  }
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response(JSON.stringify({ offline: true, message: 'Network unavailable' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_STATIC && key !== CACHE_API) {
              return caches.delete(key);
            }
            return undefined;
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigateOfflineFirst(request));
    return;
  }

  if (isSupabaseRestGet(request)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_API));
    return;
  }

  if (isSameOriginAsset(request) || isGoogleFontRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
    return;
  }
});

function isEgyptQuietHours() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Cairo',
    }).format(new Date()),
  );
  return hour >= 21 || hour < 7;
}

function parsePushPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  if (!event.data || isEgyptQuietHours()) return;

  const payload = parsePushPayload(event);
  const title = payload.title || 'XO Nursery';
  const targetUrl = typeof payload.url === 'string' ? payload.url : '/';
  const options = {
    body: payload.body || '',
    data: { url: targetUrl },
    tag: payload.tag || `xo-${Date.now()}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

function resolveNotificationUrl(data) {
  if (data == null) return '/';
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && 'url' in data && typeof data.url === 'string') {
    return data.url;
  }
  return '/';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = resolveNotificationUrl(event.notification.data);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = new URL(target, self.location.origin).href;
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          void client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            void client.navigate(url);
            return client;
          }
          void client.postMessage({ type: 'XO_NAVIGATE', url });
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
