// Zajednički dio API-ja. Datoteke s _ na početku Vercel ne izlaže kao rute.
const crypto = require('crypto');

const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  if (!URL_() || !TOKEN()) { const e = new Error('nostore'); e.code = 'nostore'; throw e; }
  const r = await fetch(URL_(), { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'redis');
  return j.result;
}

const valid = s => typeof s === 'string' && /^[a-z0-9]{12,32}$/.test(s);
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);

/* ---------- stanje igrača ---------- */

// Zadržava samo očekivani oblik stanja, da korisnik ne može spremiti proizvoljne podatke.
function clean(st) {
  const out = { f: {}, days: {}, week: {}, fb: [] };
  if (!isObj(st)) return out;
  if (isObj(st.f)) for (const k of Object.keys(st.f).slice(0, 500)) {
    const x = st.f[k];
    if (!/^\d{1,3}$/.test(k) || !isObj(x) || !Array.isArray(x.r) || x.r.length !== 3) continue;
    const o = { r: x.r.map(Boolean), d: /^\d{4}-\d{2}-\d{2}$/.test(x.d) ? x.d : '', box: Math.min(9, Math.max(0, x.box | 0)), due: x.due == null ? null : (x.due | 0), rev: Math.min(999, Math.max(0, x.rev | 0)) };
    if (['z', 'k', 'n'].includes(x.re)) o.re = x.re;                                   // reakcija: zanimljivo, već znala, nisam znala
    if (typeof x.msg === 'string' && x.msg.trim()) {                                    // poruka adminu
      o.msg = x.msg.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 280);
      o.mt = typeof x.mt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(x.mt) ? x.mt : new Date().toISOString();
    }
    if (typeof x.lt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(x.lt)) { o.lk = x.lk ? 1 : 0; o.lt = x.lt; }   // "sviđa mi se" (zadnja promjena pobjeđuje)
    out.f[k] = o;
  }
  if (isObj(st.days)) for (const k of Object.keys(st.days).slice(0, 4000)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) out.days[k] = 1;
  if (isObj(st.week)) for (const k of Object.keys(st.week).slice(0, 400)) {
    const w = st.week[k];
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(w)) out.week[k] = { r: w.r | 0, n: w.n | 0 };
  }
  out.fb = cleanFb(st.fb);
  const it = st.int;                                                                       // interesi: područja i prijedlozi tema
  if (isObj(it) && typeof it.cu === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(it.cu)) {
    const c = {}; if (isObj(it.c)) for (const k of INTERESTS) if (it.c[k]) c[k] = 1;
    const ideas = Array.isArray(it.ideas) ? it.ideas.filter(t => typeof t === 'string').map(t => t.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(t => t.length >= 2).slice(0, 8) : [];
    out.int = { cu: it.cu, c, ideas };
  }
  out.bm = cleanBm(st.bm) || undefined; if (!out.bm) delete out.bm;
  return out;
}

// pojmovi koje je označila "za kasnije": cijeli popis, zadnja promjena pobjeđuje
function cleanBm(b) {
  if (!isObj(b) || typeof b.u !== 'string' || !ISO.test(b.u) || !Array.isArray(b.l)) return null;
  const l = b.l.filter(x => isObj(x) && typeof x.t === 'string' && typeof x.d === 'string' && ISO.test(x.d) && /^\d{1,3}$/.test(String(x.i)))
    .map(x => ({ t: x.t.replace(/[\u0000-\u001f<>&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60), i: x.i | 0, d: x.d })).filter(x => x.t.length >= 2).slice(-60);
  return { u: b.u, l };
}

// opće poruke adminu, bilo kad (nisu vezane uz pismo)
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
function cleanFb(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(x => isObj(x) && typeof x.t === 'string' && typeof x.d === 'string' && ISO.test(x.d))
    .map(x => ({ t: x.t.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 280), d: x.d })).filter(x => x.t).slice(-20);
}
const INTERESTS = ['pov', 'ant', 'geo', 'inf'];
const rank = s => (s.rev || 0) * 100 + (s.box || 0);
function merge(a, b) {
  const out = { f: {}, days: Object.assign({}, a.days, b.days), week: Object.assign({}, a.week, b.week) };
  const seen = new Set(), fb = [...(a.fb || []), ...(b.fb || [])].filter(x => { const k = x.d + x.t; if (seen.has(k)) return false; seen.add(k); return true; });
  out.fb = fb.sort((x, y) => x.d.localeCompare(y.d)).slice(-20);
  const ia = a.int, ib = b.int; if (ia || ib) out.int = !ia ? ib : !ib ? ia : (ib.cu >= ia.cu ? ib : ia);
  const ma = a.bm, mb = b.bm; if (ma || mb) out.bm = !ma ? mb : !mb ? ma : (mb.u >= ma.u ? mb : ma);
  for (const k of new Set([...Object.keys(a.f), ...Object.keys(b.f)])) {
    const x = a.f[k], y = b.f[k];
    out.f[k] = !x ? y : !y ? x : withReply(x, y, rank(x) >= rank(y) ? x : y);
  }
  return out;
}
// reakcija i poruka ne ovise o napretku: novija poruka pobjeđuje, a nova reakcija zamjenjuje staru
function withReply(x, y, winner) {
  const o = Object.assign({}, winner); delete o.re; delete o.msg; delete o.mt;
  const m = ((y && y.mt) || '') >= ((x && x.mt) || '') ? y : x;
  if (m && m.msg) { o.msg = m.msg; o.mt = m.mt; }
  const re = (y && y.re) || (x && x.re); if (re) o.re = re;
  const l = ((y && y.lt) || '') >= ((x && x.lt) || '') ? y : x; delete o.lk; delete o.lt;
  if (l && l.lt) { o.lk = l.lk; o.lt = l.lt; }
  return o;
}

// Isti izračun kao u igri: pismo 2 boda, čisti žig +1, zapamćeno +2. Popis činova dolazi iz data/config.json.
function pointsOf(st) { return Object.values(st.f).reduce((p, s) => p + 2 + (s.r.every(Boolean) ? 1 : 0) + (s.due == null ? 2 : 0), 0); }
function rankOf(st) {
  const ranks = (config().ranks || []), p = pointsOf(st);
  let i = 0; ranks.forEach((r, k) => { if (p >= r.min) i = k; });
  return { points: p, index: i, name: ranks[i] ? ranks[i].name : '' };
}

// serija: niz dana zaredom do zadnjeg odigranog dana; "živa" je samo ako je taj dan danas ili jučer
function streakInfo(days, today) {
  const keys = Object.keys(days || {}).sort(), prev = d => new Date(new Date(d + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  let best = 0, run = 0, last = null;
  for (const k of keys) { run = last && prev(k) === last ? run + 1 : 1; last = k; if (run > best) best = run; }
  const alive = last && (last === today || last === prev(today));
  return { cur: alive ? run : 0, best, last, playedToday: last === today };
}
// tjedan od ponedjeljka do nedjelje (zagrebsko vrijeme); off = koliko tjedana unatrag
function weekBounds(off = 0) {
  const [y, m, d] = zagrebDay().split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d - 7 * off)), mon = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400000), f = x => x.toISOString().slice(0, 10);
  return { from: f(mon), to: f(new Date(mon.getTime() + 6 * 86400000)) };
}
// bodovi tjedna: pismo 2, čisti žig +1, nedjeljna razglednica +1 po točnom odgovoru
function weekPoints(st, b) {
  let p = 0, n = 0;
  for (const x of Object.values(st.f)) if (x.d >= b.from && x.d <= b.to) { n++; p += 2 + (x.r.every(Boolean) ? 1 : 0); }
  for (const [k, w] of Object.entries(st.week || {})) if (k >= b.from && k <= b.to) p += Math.min(5, w.r | 0);
  return { p, n };
}

function summary(st, titles) {
  const letters = Object.keys(st.f).map(Number).sort((a, b) => a - b).map(i => {
    const s = st.f[i];
    return { i, title: titles[i] || '', score: s.r.filter(Boolean).length, d: s.d, due: s.due, learned: s.due == null, re: s.re || '', msg: s.msg || '', mt: s.mt || '', lk: s.lk ? 1 : 0 };
  });
  const days = Object.keys(st.days).sort();
  let streak = 0, cursor = days.length ? new Date(days[days.length - 1] + 'T12:00:00Z') : null;
  while (cursor && st.days[cursor.toISOString().slice(0, 10)]) { streak++; cursor = new Date(cursor.getTime() - 86400000); }
  return {
    n: letters.length, total: titles.length, perfect: letters.filter(l => l.score === 3).length, learned: letters.filter(l => l.learned).length,
    streak, best: streakInfo(st.days, zagrebDay()).best, last: days.length ? days[days.length - 1] : null, weeks: Object.keys(st.week).length, letters,
    points: pointsOf(st), rank: rankOf(st).name, likes: letters.filter(l => l.lk).length, int: st.int || null, fb: st.fb || [], bm: st.bm ? st.bm.l : [],
  };
}

/* ---------- pisma: izvorna iz datoteke, a admin ih može urediti i dodavati u bazi ---------- */

const baseFacts = () => require('../data/facts.json');
const config = () => require('../data/config.json');

async function getFacts() {
  try {
    const raw = await redis(['GET', 'jz:letters']);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a) && a.length >= baseFacts().length) return { facts: a, source: 'db' };
    }
  } catch (e) { /* bez baze vrijede izvorna pisma */ }
  return { facts: baseFacts(), source: 'base' };
}

const CATS = ['pov', 'ant', 'geo', 'inf'];
const txt = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const num = n => typeof n === 'number' && isFinite(n);

function cleanChoice(q) {
  if (!isObj(q) || !txt(q.q, 300) || !Array.isArray(q.opts) || q.opts.length < 2 || q.opts.length > 4 || !q.opts.every(o => txt(o, 160))) return null;
  const a = q.a | 0;
  if (a < 0 || a >= q.opts.length) return null;
  return { q: q.q.trim(), opts: q.opts.map(o => o.trim()), a };
}

// Vraća { letter } ili { error } s razumljivom porukom za admina.
function cleanLetter(f) {
  const bad = m => ({ error: m });
  if (!isObj(f)) return bad('Pismo nije ispravno.');
  if (!CATS.includes(f.cat)) return bad('Odaberi kategoriju.');
  if (!txt(f.title, 80)) return bad('Naslov je obavezan (do 80 znakova).');
  if (!txt(String(f.fig == null ? '' : f.fig), 10)) return bad('Marka mora imati broj ili znak (do 10 znakova).');
  if (!txt(f.story, 2000)) return bad('Priča je obavezna (do 2000 znakova).');
  const out = { cat: f.cat, title: f.title.trim(), fig: String(f.fig).trim(), figu: typeof f.figu === 'string' ? f.figu.trim().slice(0, 12) : '', story: f.story.trim() };
  if (isObj(f.num)) {
    const n = f.num;
    if (!txt(f.q, 300)) return bad('Prvo pitanje je obavezno.');
    if (![n.min, n.max, n.step, n.a, n.tol].every(num)) return bad('Brojevi kod procjene moraju biti ispravni.');
    if (!(n.min < n.max) || !(n.step > 0) || n.a < n.min || n.a > n.max || n.tol < 0) return bad('Procjena: najmanja vrijednost mora biti manja od najveće, a točan odgovor mora biti unutar raspona.');
    out.q = f.q.trim();
    out.num = { min: n.min, max: n.max, step: n.step, a: n.a, tol: n.tol, unit: typeof n.unit === 'string' ? n.unit.slice(0, 12) : '', du: typeof n.du === 'string' ? n.du.slice(0, 12) : '' };
    if (txt(n.real, 40)) out.num.real = n.real.trim();
  } else {
    const m = cleanChoice(f);
    if (!m) return bad('Prvo pitanje treba tekst i 2 do 4 odgovora, uz označen točan.');
    out.q = m.q; out.opts = m.opts; out.a = m.a;
  }
  if (!Array.isArray(f.quiz) || f.quiz.length !== 2) return bad('Potrebna su točno dva pitanja za provjeru.');
  const q1 = cleanChoice(f.quiz[0]), q2 = cleanChoice(f.quiz[1]);
  if (!q1 || !q2) return bad('Svako pitanje za provjeru treba tekst i 2 do 4 odgovora, uz označen točan.');
  out.quiz = [q1, q2];
  if (f.src != null && f.src !== '') {   // povijesni izvori: do 5, naziv i neobavezan https link
    if (!Array.isArray(f.src) || f.src.length > 5) return bad('Izvora može biti najviše 5.');
    const src = [];
    for (const x of f.src) {
      if (!isObj(x) || !txt(x.t, 140)) return bad('Svaki izvor treba naziv (do 140 znakova).');
      const o = { t: x.t.trim() };
      if (x.u != null && x.u !== '') { if (typeof x.u !== 'string' || !/^https:\/\/[^\s<>"']{3,300}$/.test(x.u)) return bad('Link izvora mora počinjati s https://'); o.u = x.u; }
      src.push(o);
    }
    if (src.length) out.src = src;
  }
  if (txt(f.note, 200)) out.note = f.note.trim();
  return { letter: out };
}

/* ---------- admin: prijava, token, ograničenje pokušaja ---------- */

const secret = () => String(process.env.ADMIN_PASSWORD || '').trim();   // razmaci uz lozinku ne smiju blokirati prijavu
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const sign = exp => crypto.createHmac('sha256', secret()).update('jz-admin.' + exp).digest('hex');

function passwordOk(p) { return !!secret() && crypto.timingSafeEqual(sha(String(p == null ? '' : p).trim()), sha(secret())); }
function makeToken() { const exp = Date.now() + 12 * 3600e3; return exp + '.' + sign(exp); }
function tokenOk(t) {
  const [exp, sig] = String(t || '').split('.');
  if (!secret() || !/^\d+$/.test(exp || '') || !sig || +exp < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function bearer(req) { return String((req.headers || {}).authorization || '').replace(/^Bearer\s+/i, ''); }

async function tooManyLogins(req) {
  const ip = String((req.headers || {})['x-forwarded-for'] || 'x').split(',')[0].trim();
  const key = 'jz:rl2:login:' + sha(ip).toString('hex').slice(0, 16);
  const n = await redis(['INCR', key]);
  if (n === 1) await redis(['EXPIRE', key, 900]);
  return n > 8;
}

/* ---------- obavijesti ---------- */

function channels() {
  return {
    ntfy: !!process.env.NTFY_TOPIC,
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    email: !!(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL),
  };
}

async function post(url, body, headers) {
  const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(String(r.status));
}

// Šalje na sve postavljene kanale; vraća popis kanala koji su uspjeli. Nikad ne baca grešku.
async function notify(title, message) {
  const sent = [], jobs = [];
  const run = (name, fn) => jobs.push(fn().then(() => sent.push(name)).catch(() => {}));
  if (process.env.NTFY_TOPIC) run('ntfy', () => post(process.env.NTFY_SERVER || 'https://ntfy.sh', { topic: process.env.NTFY_TOPIC, title, message, tags: ['love_letter'] }));
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) run('telegram', () => post('https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage', { chat_id: process.env.TELEGRAM_CHAT_ID, text: title + '\n' + message }));
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) run('email', () => post('https://api.resend.com/emails', { from: 'Jesi znala <onboarding@resend.dev>', to: [process.env.NOTIFY_EMAIL], subject: title, text: message }, { Authorization: 'Bearer ' + process.env.RESEND_API_KEY }));
  await Promise.all(jobs);
  return sent;
}

/* ---------- uređaji ---------- */

const MAX_DEVICES = 100;   // gornja granica zapisa, jer je ulaz za sinkronizaciju javan

function deviceOf(ua) {
  ua = String(ua || '');
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux|CrOS/.test(ua)) return 'Linux';
  return 'Nepoznato';
}

const zagrebDay = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zagreb' });
// Indeks današnjeg pisma prema datumu početka (isto kao u igri), ili -1 ako još nije počelo / nema više pisama.
function todayIndex(count) {
  const [y, m, d] = zagrebDay().split('-').map(Number), [sy, sm, sd] = String(config().start).split('-').map(Number);
  const i = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86400000);
  return i >= 0 && i < count ? i : -1;
}
// Sažetak današnjeg pisma za jedan uređaj: je li otvoreno, rezultat, reakcija.
function todayOf(st, titles) {
  const i = todayIndex(titles.length);
  if (i < 0) return null;
  const x = st.f[i];
  return { i, title: titles[i], played: !!x, score: x ? x.r.filter(Boolean).length : 0, re: (x && x.re) || '', msg: (x && x.msg) || '', learned: !!x && x.due == null };
}

module.exports = { streakInfo, weekBounds, weekPoints, MAX_DEVICES, deviceOf, zagrebDay, todayIndex, todayOf, redis, valid, isObj, clean, merge, summary, rankOf, baseFacts, config, getFacts, cleanLetter, passwordOk, makeToken, tokenOk, bearer, tooManyLogins, channels, notify };
