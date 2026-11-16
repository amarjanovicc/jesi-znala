// Admin API: pisma, igrači i obavijesti. Sve osim prijave traži token koji se dobije lozinkom (ADMIN_PASSWORD).
const crypto = require('crypto');
const { redis, isObj, summary, deviceOf, todayOf, todayIndex, zagrebDay, baseFacts, config, getFacts, cleanLetter, passwordOk, makeToken, tokenOk, bearer, tooManyLogins, channels, notify } = require('./_lib');

const L = require('./_league');
const P = require('./_push');
const push = require('./push');

const MAX_LETTERS = 400;

async function loadPlayers() {
  const keys = [];
  let cursor = '0';
  for (let i = 0; i < 30; i++) {
    const r = await redis(['SCAN', cursor, 'MATCH', 'jz:p:*', 'COUNT', 200]);
    cursor = String(r[0]); keys.push(...r[1]);
    if (cursor === '0') break;
  }
  if (!keys.length) return [];
  const raws = await redis(['MGET', ...keys.slice(0, 200)]);
  const out = [];
  raws.forEach((raw, i) => {
    try {
      const rec = JSON.parse(raw), code = keys[i].slice(5);
      out.push({ code, rec, id: rec.watch || 'x' + crypto.createHash('sha256').update(code).digest('hex').slice(0, 16) });
    } catch (e) { /* preskoči neispravan zapis */ }
  });
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const q = req.query || {}, body = isObj(req.body) ? req.body : {}, action = String(q.action || '');
  const send = (s, o) => res.status(s).json(o);
  try {
    if (action === 'login') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      if (!String(process.env.ADMIN_PASSWORD || '').trim()) return send(503, { error: 'notconfigured' });
      if (await tooManyLogins(req)) return send(429, { error: 'toomany' });
      if (!passwordOk(body.password)) return send(401, { error: 'password' });
      return send(200, { token: makeToken() });
    }
    if (!tokenOk(bearer(req))) return send(401, { error: 'auth' });

    if (action === 'status') {
      let storage = true;
      try { await redis(['PING']); } catch (e) { storage = false; }
      const { facts, source } = await getFacts();
      return send(200, { storage, push: P.configured(), channels: channels(), start: config().start, base: baseFacts().length, count: facts.length, source });
    }

    if (action === 'letters') {
      const { facts, source } = await getFacts();
      return send(200, { letters: facts, source, base: baseFacts().length, start: config().start });
    }

    if (action === 'saveLetters') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const list = body.letters;
      if (!Array.isArray(list) || list.length > MAX_LETTERS) return send(400, { error: 'bad', message: 'Popis pisama nije ispravan.' });
      const cur = await getFacts();
      // indeks pisma je ujedno ključ napretka, pa se pisma smiju mijenjati i dodavati, ali ne brisati
      if (list.length < cur.facts.length) return send(400, { error: 'shorter', message: 'Pisma se ne smiju brisati jer bi se pokvario napredak igrača. Možeš ih urediti ili dodati nova.' });
      const clean = [];
      for (let i = 0; i < list.length; i++) {
        const r = cleanLetter(list[i]);
        if (r.error) return send(400, { error: 'invalid', index: i, message: 'Pismo № ' + String(i + 1).padStart(2, '0') + ': ' + r.error });
        clean.push(r.letter);
      }
      if (cur.source === 'db') await redis(['SET', 'jz:letters:backup', JSON.stringify(cur.facts)]);
      await redis(['SET', 'jz:letters', JSON.stringify(clean)]);
      return send(200, { ok: true, count: clean.length });
    }

    if (action === 'restoreLetters') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const raw = await redis(['GET', 'jz:letters:backup']);
      if (!raw) return send(404, { error: 'nobackup', message: 'Nema spremljene prethodne verzije.' });
      await redis(['SET', 'jz:letters', raw]);
      return send(200, { ok: true });
    }

    if (action === 'players') {
      const { facts } = await getFacts(), titles = facts.map(f => f.title);
      const subs = new Set(((await redis(['SCAN', '0', 'MATCH', 'jz:ps:*', 'COUNT', 500]))[1] || []).map(k => k.slice(6)));
      const list = (await loadPlayers()).map(p => {
        const s = summary(p.rec.state, titles);
        const last = s.letters.filter(l => l.msg).sort((a, b) => String(b.mt).localeCompare(String(a.mt)))[0];
        s.likeCats = {}; s.letters.filter(l => l.lk).forEach(l => { const c = facts[l.i] && facts[l.i].cat; if (c) s.likeCats[c] = (s.likeCats[c] || 0) + 1; });
        s.today = todayOf(p.rec.state, titles); s.ua = p.rec.ua || ''; s.push = subs.has(p.code);
        const gf = (s.fb || []).slice(-1)[0];
        s.lastMsg = last ? { i: last.i, title: last.title, msg: last.msg, mt: last.mt } : null;
        if (gf && (!last || gf.d > String(last.mt))) s.lastMsg = { i: -1, title: 'Općenito', msg: gf.t, mt: gf.d };
        s.messages = s.letters.filter(l => l.msg).length + (s.fb || []).length; delete s.letters;
        return Object.assign({ id: p.id, label: p.rec.label || '', created: p.rec.created || null, seen: p.rec.seen || null }, s);
      }).sort((a, b) => String(b.seen).localeCompare(String(a.seen)));
      return send(200, { players: list });
    }

    if (action === 'player') {
      const p = (await loadPlayers()).find(x => x.id === q.id);
      if (!p) return send(404, { error: 'missing' });
      const { facts } = await getFacts();
      const titles = facts.map(f => f.title), sm = summary(p.rec.state, titles);
      sm.letters.forEach(l => { l.cat = facts[l.i] ? facts[l.i].cat : ''; });
      return send(200, Object.assign({ id: p.id, label: p.rec.label || '', created: p.rec.created || null, seen: p.rec.seen || null, ua: p.rec.ua || '', today: todayOf(p.rec.state, titles), push: !!(await redis(['GET', 'jz:ps:' + p.code])) }, sm));
    }

    if (action === 'createPlayer') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const A = 'abcdefghjkmnpqrstuvwxyz23456789', rnd = () => Array.from(crypto.randomBytes(16), x => A[x % A.length]).join('');
      const code = rnd(), watch = rnd(), now = new Date().toISOString();
      await redis(['SET', 'jz:p:' + code, JSON.stringify({ state: { f: {}, days: {}, week: {} }, watch, label: String(body.label || '').trim().slice(0, 30), created: now, seen: null })]);
      await redis(['SET', 'jz:w:' + watch, code]);
      await redis(['INCR', 'jz:count']);
      return send(200, { code, watch });
    }

    if (action === 'labelPlayer') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const p = (await loadPlayers()).find(x => x.id === body.id);
      if (!p) return send(404, { error: 'missing' });
      p.rec.label = String(body.label || '').trim().slice(0, 30);
      await redis(['SET', 'jz:p:' + p.code, JSON.stringify(p.rec)]);
      return send(200, { ok: true, label: p.rec.label });
    }

    if (action === 'deletePlayer') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const p = (await loadPlayers()).find(x => x.id === body.id);
      if (!p) return send(404, { error: 'missing' });
      await redis(['DEL', 'jz:p:' + p.code]);
      await redis(['DEL', 'jz:seen:' + p.code]); await redis(['DEL', 'jz:ps:' + p.code]);
      await L.dropFromLeagues(p.code);
      if (p.rec.watch) await redis(['DEL', 'jz:w:' + p.rec.watch]);
      if ((await redis(['DECR', 'jz:count'])) < 0) await redis(['SET', 'jz:count', 0]);
      return send(200, { ok: true });
    }

    if (action === 'resetToday') {   // briše današnje pismo samo tom uređaju; uređaj to preuzme pri sljedećoj sinkronizaciji
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const p = (await loadPlayers()).find(x => x.id === body.id);
      if (!p) return send(404, { error: 'missing' });
      const { facts } = await getFacts(), i = todayIndex(facts.length), day = zagrebDay();
      if (i < 0) return send(400, { error: 'noletter', message: 'Danas nema pisma.' });
      delete p.rec.state.f[i]; delete p.rec.state.days[day];
      p.rec.rv = (p.rec.rv | 0) + 1; p.rec.rst = [i]; p.rec.rstDay = day;
      await redis(['SET', 'jz:p:' + p.code, JSON.stringify(p.rec)]);
      return send(200, { ok: true });
    }

    if (action === 'leagues') {   // sve lige: ime, kod, članovi s bodovima ovog tjedna
      const out = []; let cursor = '0';
      for (let i = 0; i < 10; i++) { const r = await redis(['SCAN', cursor, 'MATCH', 'jz:lg:*', 'COUNT', 100]); cursor = String(r[0]); for (const k of r[1]) { const l = await L.load(k.slice(6)); if (l) out.push(Object.assign(await L.board(l, ''), { created: l.created })); } if (cursor === '0') break; }
      return send(200, { leagues: out });
    }

    if (action === 'deleteLeague') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const id = String(body.id || '');
      if (!L.inviteOk(id)) return send(400, { error: 'bad' });
      const l = await L.load(id);
      if (!l) return send(404, { error: 'missing' });
      for (const m of l.members) await L.saveMine(m.code, (await L.mine(m.code)).filter(x => x !== id));
      await redis(['DEL', 'jz:lg:' + id]);
      if ((await redis(['DECR', 'jz:lgcount'])) < 0) await redis(['SET', 'jz:lgcount', 0]);
      return send(200, { ok: true });
    }

    if (action === 'testPush') {   // pošalje podsjetnik odmah jednom uređaju, da admin provjeri da stvarno stiže
      if (req.method !== 'POST') return send(405, { error: 'method' });
      if (!P.configured()) return send(400, { error: 'notconfigured', message: 'Podsjetnici nisu postavljeni (VAPID ključevi u Vercelu).' });
      const p = (await loadPlayers()).find(x => x.id === body.id);
      if (!p) return send(404, { error: 'missing' });
      const r = await push.remind(p.code, true);
      return send(200, { result: r });
    }

    if (action === 'export') {   // sigurnosna kopija: pisma i napredak igrača (bez tajnih kodova za sinkronizaciju)
      const { facts } = await getFacts();
      const players = (await loadPlayers()).map(p => ({ label: p.rec.label || '', created: p.rec.created || null, seen: p.rec.seen || null, state: p.rec.state }));
      return send(200, { exportedAt: new Date().toISOString(), letters: facts, players });
    }

    if (action === 'testNotify') {
      if (req.method !== 'POST') return send(405, { error: 'method' });
      const sent = await notify('Jesi znala? Probna obavijest', 'Ako ovo vidiš, obavijesti rade.');
      return send(200, { sent, channels: channels() });
    }

    return send(404, { error: 'action' });
  } catch (e) {
    return send(e && e.code === 'nostore' ? 503 : 500, { error: e && e.code === 'nostore' ? 'nostore' : 'error' });
  }
};
