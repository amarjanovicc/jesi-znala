const C = 'jesi-znala-202611161831';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
// podsjetnik: push bez sadržaja, tekst se dohvaća sa servera (kolačić jz_id prepozna uređaj)
self.addEventListener('push', e => e.waitUntil((async () => {
  let m = { title: 'Jesi znala?', body: 'Danas te čeka novo pismo.' };
  try { const r = await fetch('/api/push?msg=1', { credentials: 'include' }); if (r.ok) m = await r.json(); } catch (x) {}
  await self.registration.showNotification(m.title, { body: m.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'jz-podsjetnik', renotify: false });
})()));
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : clients.openWindow('./'))); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/') && u.pathname !== '/api/facts') return;
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    const net = fetch(e.request).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(e.request, r.clone()); return r; });
    if (e.request.mode === 'navigate') return net.catch(() => hit || c.match('index.html'));
    return hit || net;
  }));
});
