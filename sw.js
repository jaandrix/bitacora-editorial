// Service worker de Bitácora Editorial: guarda la página, la lógica de Bitácora que carga desde appbitacora.es, la
// librería de Supabase y las fuentes, para abrirla sin conexión. Los datos sin conexión ya los lleva loadData con su
// copia en IndexedDB. Al cambiar algún archivo propio, subir VERSION (la misma ?v= de index.html).
const VERSION = '25';
const CASCARON = 'editorial-' + VERSION;
const COPIAS = 'editorial-copias';
const PROPIOS = ['./', 'index.html', 'manifest.json', 'favicon-32.png', 'img/paisaje.webp', 'img/icono-192.png',
  'css/editorial.css?v=' + VERSION, 'js/logica.js?v=' + VERSION, 'js/fondo.js?v=' + VERSION, 'js/capa.js?v=' + VERSION,
  'js/propuestas.js?v=' + VERSION, 'js/apartados.js?v=' + VERSION, 'js/finanzas.js?v=' + VERSION, 'js/portada.js?v=' + VERSION];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CASCARON).then(c => Promise.all(PROPIOS.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('editorial-') && k !== CASCARON && k !== COPIAS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Lo que lleva versión en la dirección no cambia nunca: se sirve de la copia.
function fijo(url) {
  if (url.hostname === 'appbitacora.es' && url.pathname.startsWith('/js/') && url.searchParams.has('v')) return true;
  if (url.hostname === 'cdn.jsdelivr.net' && /@\d/.test(url.pathname)) return true;
  if (url.hostname === 'fonts.gstatic.com') return true;
  return url.origin === self.location.origin && url.searchParams.has('v');
}
function conTiempo(promesa, ms) {
  return Promise.race([promesa, new Promise((_, mal) => setTimeout(() => mal(new Error('tarde')), ms))]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (fijo(url)) {
    e.respondWith(caches.match(req).then(g => g || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const copia = r.clone(); caches.open(COPIAS).then(c => c.put(req, copia)); }
      return r;
    })));
    return;
  }
  // La página, las fuentes de Google (su CSS) y el index de appbitacora.es (de donde sale la versión de la lógica):
  // red primero y, si no llega en 4 s, la copia.
  const propio = url.origin === self.location.origin;
  if (req.mode === 'navigate' || (propio && !url.search) || url.hostname === 'fonts.googleapis.com' || (url.hostname === 'appbitacora.es' && url.pathname === '/index.html')) {
    e.respondWith(conTiempo(fetch(req), 4000).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(COPIAS).then(c => c.put(req.mode === 'navigate' ? 'index.html' : req, copia)); }
      return r;
    }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: req.mode === 'navigate' }).then(g => g || caches.match('index.html')).then(g => g || Response.error())));
  }
});
