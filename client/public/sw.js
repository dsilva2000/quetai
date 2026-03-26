// QUETAI Service Worker v3.6
// Maneja notificaciones push aunque el browser esté cerrado

const CACHE_NAME = 'quetai-v3.6';

// ── Instalación ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Notificaciones Push ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'QUETAI', body: event.data.text() };
  }

  const title = payload.title || 'QUETAI 💊';
  const options = {
    body: payload.body || 'Tienes un recordatorio pendiente.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'quetai-reminder',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || '/',
      sessionId: payload.sessionId,
    },
    actions: [
      { action: 'open', title: 'Abrir QUETAI' },
      { action: 'dismiss', title: 'Cerrar' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Click en la notificación ─────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const sessionId = event.notification.data?.sessionId;
  const url = sessionId ? `/#/?sid=${sessionId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Si no, abrir una nueva
      return clients.openWindow(url);
    })
  );
});

// ── Fetch: red primero, caché como fallback ───────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Solo manejar peticiones GET del mismo origen
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  // No cachear las rutas de API
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
