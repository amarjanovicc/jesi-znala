#!/usr/bin/env python3
"""Slaže public/ i data/ iz src/jesi-znala.html.

Pokreni nakon svake promjene igre:  python3 src/build.py   (ili: npm run build)
Zatim u korijenu projekta:           npx vercel deploy --prod
"""
import json, os, re, struct, subprocess, time, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)          # mapa projekta (vercel/)
OUT = os.path.join(ROOT, 'public')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)

# ---------- index.html ----------
src = open(os.path.join(HERE, 'jesi-znala.html'), encoding='utf8').read()
src = src.replace("const BUILD = 'dev';", "const BUILD = '%s';" % time.strftime('%d.%m. %H:%M'))
# pisma u JSON za API (isti izvor kao u igri)
m = re.search(r'let FACTS = (\[.*?\n\]);\n', src, re.S)
facts = subprocess.run(['node', '-e', 'process.stdout.write(JSON.stringify(eval(process.argv[1])))', m.group(1)], capture_output=True, text=True, check=True).stdout
open(os.path.join(ROOT, 'data', 'facts.json'), 'w', encoding='utf8').write(facts)
start = re.search(r"const START = '(\d{4}-\d{2}-\d{2})'", src).group(1)
rm = re.search(r'const RANKS = (\[.*?\n\]);', src, re.S)
ranks = json.loads(subprocess.run(['node', '-e', 'process.stdout.write(JSON.stringify(eval(process.argv[1])))', rm.group(1)], capture_output=True, text=True, check=True).stdout)
json.dump({'start': start, 'ranks': ranks}, open(os.path.join(ROOT, 'data', 'config.json'), 'w'), ensure_ascii=False)

cut = src.index('<div class="app">')
head, body = src[:cut], src[cut:]
head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
DIAG = r'''<script>
/* dijagnostika: ako igra ne krene, na zaslonu se ispiše razlog */
(function () {
  function show(msg) { var v = document.getElementById('view'); if (v && !v.querySelector('.head')) v.innerHTML = '<p style="padding:20px 4px;font:15px/1.5 monospace;color:#7a1d1d">Igra se nije učitala.<br><br>' + String(msg).replace(/</g, '&lt;') + '</p>'; }
  window.addEventListener('error', function (e) { show((e.message || 'greška') + ' (' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ')'); });
  function report() {
    var v = document.getElementById('view'), f = v && v.firstElementChild, cs = f && getComputedStyle(f), r = f && f.getBoundingClientRect(), anims = 0;
    try { anims = document.getAnimations().length; } catch (e) { anims = 'nema API'; }
    var info = ['stanje: ' + document.readyState, 'js: ' + (typeof go) + ' view: ' + (typeof V !== 'undefined' ? V.name : '?'), 'djece: ' + (v ? v.children.length : '?') + ' tekst: ' + (v ? v.innerText.length : '?'),
      'prvo: ' + (f ? (f.className || f.tagName) + ' op=' + cs.opacity + ' vis=' + cs.visibility + ' disp=' + cs.display + ' anim=' + cs.animationName + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top) : 'nema'),
      'animacija: ' + anims, 'fx klasa: ' + document.documentElement.classList.contains('fx'),
      'prozor: ' + innerWidth + 'x' + innerHeight + ' scrollY=' + scrollY + ' docH=' + document.documentElement.scrollHeight,
      'reduce: ' + matchMedia('(prefers-reduced-motion: reduce)').matches + ' dark: ' + matchMedia('(prefers-color-scheme: dark)').matches, 'ua: ' + navigator.userAgent];
    var ok = f && r.height > 0 && +cs.opacity > 0.5 && cs.visibility !== 'hidden';
    // ekran koji se upravo animira nije greška: provjeri ponovno, a pokaži dijagnostiku samo ako je i tada neispravan
    if (!ok && !report.again && document.getAnimations && document.getAnimations().length) { report.again = 1; return setTimeout(report, 1800); }
    var old = document.getElementById('dbg'); if (old) old.remove();
    if (/[?&]debug/.test(location.search) || !ok) {
      var d = document.createElement('pre'); d.id = 'dbg'; d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;margin:0;padding:10px;background:#111;color:#9f9;font:11px/1.4 monospace;white-space:pre-wrap;word-break:break-all';
      d.textContent = info.join('\n'); document.documentElement.appendChild(d);
    }
  }
  setTimeout(report, 1800);
  window.addEventListener('unhandledrejection', function (e) { show(e.reason && e.reason.message || e.reason); });
})();
</script>
'''
html = f"""<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#CBD9E5">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Jesi znala?">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<script>window.__API__ = true;</script>
{DIAG}<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-180.png">
<style>:root{{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head}</head>
<body>
{body}
<script>if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {{}}));</script>
</body>
</html>
"""
html = html.replace('<main class="view" id="view"></main>', '<main class="view" id="view"><p style="padding:20px 4px;font:15px/1.5 monospace">Učitavam…</p><noscript><p style="padding:20px 4px">Za igru je potreban JavaScript.</p></noscript></main>')
# fontovi ne smiju blokirati iscrtavanje: učitavaju se u pozadini, a do tada vrijede rezervni fontovi
html, n = re.subn(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com[^"]+)">', r'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="\1" media="print" onload="this.media=&quot;all&quot;"><noscript><link rel="stylesheet" href="\1"></noscript>', html)
assert n == 1, 'link za fontove nije pronađen'
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8').write(html)

# ---------- manifest ----------
manifest = {
    "name": "Jesi znala?", "short_name": "Jesi znala?", "lang": "hr",
    "description": "Svaki dan jedno pismo s pričom, tri pitanja i marka za album.",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
    "background_color": "#CBD9E5", "theme_color": "#CBD9E5",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
    ],
}
json.dump(manifest, open(os.path.join(OUT, 'manifest.webmanifest'), 'w', encoding='utf8'), ensure_ascii=False, indent=2)

# ---------- service worker: stranica s mreže kad je ima, inače iz spremnika; ostalo iz spremnika pa osvježi ----------
sw = """const C = 'jesi-znala-%s';
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
""" % time.strftime('%Y%m%d%H%M')
open(os.path.join(OUT, 'sw.js'), 'w', encoding='utf8').write(sw)

# ---------- ikona: marka s upitnikom, nacrtana bez vanjskih biblioteka ----------
BG, PAPER, RED = (203, 217, 229), (252, 251, 246), (163, 64, 46)

def colour(x, y):
    """Boja točke (x, y) u jediničnom kvadratu."""
    if not (0.22 <= x <= 0.78 and 0.15 <= y <= 0.85):
        return BG
    step, r = 0.056, 0.021                      # zupci: rupe duž ruba marke
    for edge_x in (0.22, 0.78):
        k = round((y - 0.15) / step)
        if (x - edge_x) ** 2 + (y - (0.15 + k * step)) ** 2 < r * r:
            return BG
    for edge_y in (0.15, 0.85):
        k = round((x - 0.22) / step)
        if (x - (0.22 + k * step)) ** 2 + (y - edge_y) ** 2 < r * r:
            return BG
    if not (0.275 <= x <= 0.725 and 0.205 <= y <= 0.795):
        return PAPER
    if abs(x - 0.275) < 0.006 or abs(x - 0.725) < 0.006 or abs(y - 0.205) < 0.006 or abs(y - 0.795) < 0.006:
        return RED
    if 0.288 <= x <= 0.712 and 0.218 <= y <= 0.782 and not (0.296 <= x <= 0.704 and 0.226 <= y <= 0.774):
        return PAPER                            # tanki unutarnji okvir
    dx, dy = x - 0.5, y - 0.41                  # upitnik: luk, stup i točka
    d = (dx * dx + dy * dy) ** 0.5
    if 0.07 <= d <= 0.125 and not (dx < 0 and dy > 0.01):
        return PAPER
    if abs(x - 0.5) <= 0.0275 and 0.48 <= y <= 0.6:
        return PAPER
    if (x - 0.5) ** 2 + (y - 0.685) ** 2 <= 0.036 ** 2:
        return PAPER
    return RED

def png(path, n, ss=3):
    rows = []
    for py in range(n):
        row = bytearray([0])
        for px in range(n):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = colour((px + (sx + 0.5) / ss) / n, (py + (sy + 0.5) / ss) / n)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            row += bytes(v // (ss * ss) for v in acc)
        rows.append(bytes(row))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

for size in (512, 192, 180):
    png(os.path.join(OUT, f'icon-{size}.png'), size)

print('Gotovo: public/ i data/ (facts.json, config.json) osvježeni')
