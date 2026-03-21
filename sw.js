// Service Worker pour Route Note PWA
const CACHE_NAME = 'route-note-v1.0.0';
const STATIC_CACHE = 'route-note-static-v1';
const DYNAMIC_CACHE = 'route-note-dynamic-v1';

// Fichiers à mettre en cache
const STATIC_FILES = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installation...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Mise en cache des fichiers statiques');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map((name) => {
              console.log('[SW] Suppression ancien cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Stratégie de cache : Cache First, puis Network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;
  
  // Ignorer les requêtes chrome-extension
  if (request.url.startsWith('chrome-extension://')) return;
  
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Si trouvé en cache, retourner
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Sinon, fetch depuis le réseau
        return fetch(request)
          .then((networkResponse) => {
            // Mettre en cache dynamique si c'est notre domaine
            if (request.url.startsWith(self.location.origin)) {
              return caches.open(DYNAMIC_CACHE)
                .then((cache) => {
                  cache.put(request, networkResponse.clone());
                  return networkResponse;
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // Si offline et pas en cache, retourner page offline basique
            if (request.destination === 'document') {
              return new Response(
                '<html><body><h1>Mode hors ligne</h1><p>Route Note fonctionne en mode hors ligne. Vos données sont sauvegardées localement.</p></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
          });
      })
  );
});

// Gestion des messages depuis l'app
self.addEventListener('message', (event) => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data.action === 'clearCache') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      })
    );
  }
});

// Synchronisation en arrière-plan (futur)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-deliveries') {
    console.log('[SW] Synchronisation des livraisons...');
    // TODO: Implémenter la sync avec Firebase
  }
});

// Notifications Push (futur)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Nouvelle notification Route Note',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: data.url || '/'
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Route Note', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});
