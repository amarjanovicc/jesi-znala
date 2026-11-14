// Sinkronizacija napretka. Pristup ima samo tko zna dugi nasumični kod; "watch" kod daje samo pregled.
// Uz to evidentira igrača i šalje adminu obavijest kad igrač uđe u igru ili odigra pismo.
const { redis, valid, clean, merge, summary, rankOf, getFacts, notify } = require('./_lib');

const pad = n => String(n).padStart(2, '0');
const plural = (n, one, few, many) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 12 || h > 14) ? few : many; };

const RE = { z: 'Zanimljivo!', k: 'Već je znala.', n: 'Nije znala.' };

// Vraća [naslov, poruka] ili null ako nema ničeg za javiti.
async function describe({ created, cur, merged, label }) {
  const { facts } = await getFacts();
  const titles = facts.map(f => f.title);
  const who = label || 'Ona';
  const before = cur ? cur.state : { f: {}, days: {}, week: {} };
  const keys = Object.keys(merged.f).map(Number).sort((a, b) => a - b);
  const fresh = keys.filter(k => !before.f[k]);
  const weeks = Object.keys(merged.week).filter(k => !before.week[k]);
  const msgs = keys.filter(k => merged.f[k].msg && merged.f[k].mt !== (before.f[k] || {}).mt);
  const reacts = keys.filter(k => merged.f[k].re && merged.f[k].re !== (before.f[k] || {}).re);
  const sum = summary(merged, titles);
  const r0 = rankOf(before), r1 = rankOf(merged), up = r1.index > r0.index ? ' Novi čin: ' + r1.name + '!' : '';
  const tail = ' (' + sum.n + ' ' + plural(sum.n, 'pismo', 'pisma', 'pisama') + ' ukupno, ' + sum.streak + ' ' + plural(sum.streak, 'dan', 'dana', 'dana') + ' zaredom)' + up;
  const ref = i => '№ ' + pad(i + 1) + ' „' + (titles[i] || '?') + '”';
  if (created) return ['Jesi znala? Novi uređaj', who + ': uređaj je povezan.' + (sum.n ? ' Već ima ' + sum.n + ' ' + plural(sum.n, 'pismo', 'pisma', 'pisama') + '.' : '')];
  const lines = [];
  msgs.slice(0, 2).forEach(i => lines.push(who + ' o pismu ' + ref(i) + ': „' + merged.f[i].msg + '”'));
  if (fresh.length) lines.push(who + ': ' + fresh.slice(0, 3).map(i => ref(i) + ' ' + merged.f[i].r.filter(Boolean).length + '/3').join(', ') + (fresh.length > 3 ? ' i još ' + (fresh.length - 3) : '') + tail);
  reacts.filter(i => !msgs.includes(i)).slice(0, 2).forEach(i => lines.push(who + ' o pismu ' + ref(i) + ': ' + RE[merged.f[i].re]));
  if (weeks.length && !fresh.length) { const w = merged.week[weeks[0]]; lines.push(who + ': nedjeljna razglednica ' + w.r + '/' + w.n + tail); }
  if (up && !fresh.length && !weeks.length) lines.push(who + ':' + up);
  if (!lines.length) return null;
  const title = msgs.length ? 'Jesi znala? Poruka' : fresh.length ? 'Jesi znala? Odigrano' : reacts.length ? 'Jesi znala? Reakcija' : weeks.length ? 'Jesi znala? Nedjeljna razglednica' : 'Jesi znala? Novi čin';
  return [title, lines.join('\n')];
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (s, error) => res.status(s).json({ error });
  try {
    if (req.method === 'GET') {
      const { code, watch } = req.query || {};
      if (watch) {
        if (!valid(watch)) return fail(400, 'bad');
        const c = await redis(['GET', 'jz:w:' + watch]);
        const raw = c && await redis(['GET', 'jz:p:' + c]);
        if (!raw) return fail(404, 'missing');
        const { facts } = await getFacts();
        return res.status(200).json(summary(JSON.parse(raw).state, facts.map(f => f.title)));
      }
      if (code) {
        if (!valid(code)) return fail(400, 'bad');
        const raw = await redis(['GET', 'jz:p:' + code]);
        if (!raw) return fail(404, 'missing');
        return res.status(200).json({ watch: JSON.parse(raw).watch || null });
      }
      return fail(400, 'bad');
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { code, watch } = body;
      if (!valid(code) || (watch != null && !valid(watch))) return fail(400, 'bad');
      if (JSON.stringify(body.state || {}).length > 80000) return fail(413, 'big');
      const raw = await redis(['GET', 'jz:p:' + code]);
      const cur = raw ? JSON.parse(raw) : null;
      if (!cur) {   // novi zapis: najviše 10 na sat po IP-u, da se obavijesti i baza ne mogu zatrpati
        const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
        const key = 'jz:rl:new:' + require('crypto').createHash('sha256').update(ip).digest('hex').slice(0, 16);
        const n = await redis(['INCR', key]);
        if (n === 1) await redis(['EXPIRE', key, 3600]);
        if (n > 10) return fail(429, 'toomany');
      }
      const incoming = clean(body.state);
      const state = cur ? merge(cur.state, incoming) : incoming;
      const w = (cur && cur.watch) || watch || null;
      const now = new Date().toISOString();
      await redis(['SET', 'jz:p:' + code, JSON.stringify({ state, watch: w, label: (cur && cur.label) || '', created: (cur && cur.created) || now, seen: now })]);
      if (w && !(cur && cur.watch)) await redis(['SET', 'jz:w:' + w, code]);

      // obavijest adminu: nikad ne smije srušiti sinkronizaciju
      try {
        const first = await redis(['SET', 'jz:seen:' + code, '1', 'EX', 1800, 'NX']);   // "ušla je" najviše jednom u 30 minuta
        const msg = await describe({ created: !cur, cur, merged: state, label: cur && cur.label });
        if (msg) await notify(msg[0], msg[1]);
        else if (first === 'OK' && cur) await notify('Jesi znala? Ušla je', (cur.label || 'Ona') + ' je otvorila igru.');
      } catch (e) { /* ignoriraj */ }
      return res.status(200).json({ state, watch: w });
    }
    return fail(405, 'method');
  } catch (e) {
    return fail(e && e.code === 'nostore' ? 503 : 500, e && e.code === 'nostore' ? 'nostore' : 'error');
  }
};
