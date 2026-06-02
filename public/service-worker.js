/**
 * service-worker.js
 * Caching offline completo dei file dell'app e dei CDN esterni (Tesseract.js, PDF.js, jsPDF, Material Symbols).
 * Utilizza una strategia Stale-While-Revalidate per garantire il funzionamento 100% offline.
 */

const CACHE_NAME = 'parking-tracker-cache-v1';

// Asset locali di base da pre-cacheare
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/db.js',
  '/app.js',
  '/manifest.json',
  '/icon.svg'
];

// Installa il service worker e metti in pre-cache gli asset locali
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Archiviazione degli asset locali in pre-cache');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Attivazione del service worker e rimozione di vecchi cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Rimuovo vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercettazione delle richieste fetch per supportare il funzionamento offline
self.addEventListener('fetch', (event) => {
  // Ignora le richieste non HTTP/HTTPS (es. chrome-extension://)
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Ignora le chiamate API di Gemini (non metterle in cache)
  if (event.request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // Gestiamo solo le richieste GET
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Strategia: Stale-While-Revalidate per tutti gli asset locali e anche per i CDN delle librerie.
  // Questo assicura che se l'utente è offline l'app risponda all'istante con la cache,
  // e al contempo se è online la cache si aggiorni in background.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Avviamo la richiesta in rete (revalidate) indipendentemente dal fatto di aver trovato una corrispondenza
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Se la risposta è valida, la salviamo nella cache
          if (networkResponse && networkResponse.status === 200) {
            // Cloniamo la risposta da salvare nella cache
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[Service Worker] Errore di rete (probabilmente offline), uso la cache se disponibile.', err);
          // Se non c'è corrispondenza in cache e la rete fallisce, restituiamo un errore gestito
          if (!cachedResponse) {
            throw err;
          }
        });

        // Restituiamo la risposta della cache (se esiste) o aspettiamo quella di rete
        return cachedResponse || fetchPromise;
      });
    })
  );
});
