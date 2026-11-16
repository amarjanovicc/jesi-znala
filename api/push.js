// Podsjetnik: pretplata uređaja, tekst obavijesti i dnevni cron (jednom dnevno, navečer po zagrebačkom vremenu).
const { redis, valid, isObj, zagrebDay, todayIndex, getFacts, streakInfo } = require('./_lib');
const P = require('./_push');

const cookieCode = req => { const m = /(?:^|;\s*)jz_id=([a-z0-9]{12,32})(?:;|$)/.exec(String((req.headers || {}).cookie || '')); return m ? m[1] : null; };
const hourZagreb = () => +new Date().toLocaleString('en-GB', { timeZone: 'Europe/Zagreb', hour: '2-digit', hour12: false }).slice(0, 2);

// tekst za jedan uređaj: spominje seriju ako je u opasnosti
async function messageFor(code) {
  const raw = await redis(['GET', 'jz:p:' + code]), rec = raw && JSON.parse(raw);
  if (!rec) return { title: 'Jesi znala?', body: 'Danas te čeka novo pismo.' };
  const s = streakInfo(rec.state.days, zagrebDay());
  if (s.playedToday) return { title: 'Jesi znala?', body: 'Današnje pismo je već u albumu. Vidimo se sutra.' };
  return { title: 'Jesi znala?', body: s.cur > 1 ? 'Imaš ' + s.cur + ' dana zaredom. Danas te čeka pismo, nemoj prekinuti seriju.' : 'Danas te čeka novo pismo.' };
}

async function remind(code, force) {
  const sub = JSON.parse(await redis(['GET', 'jz:ps:' + code]) || 'null');
  if (!sub || !P.endpointOk(sub.endpoint)) return 'nosub';
  if (!force && (await redis(['SET', 'jz:rem:' + code + ':' + zagrebDay(), '1', 'EX', 90000, 'NX'])) !== 'OK') return 'dup';
  const st = await P.send(sub.endpoint);
  if (st === 404 || st === 410) { await redis(['DEL', 'jz:ps:' + code]); return 'gone'; }
  return st >= 200 && st < 300 ? 'sent' : 'fail';
}

async function cron() {
  const h = hourZagreb();
  if (h < 17 || h > 22) return { skipped: 'hour', h };
  const { facts } = await getFacts(), out = { sent: 0, played: 0, other: 0 }, day = zagrebDay();
  if (todayIndex(facts.length) < 0) return { skipped: 'noletter' };
  const keys = []; let cur = '0';
  for (let i = 0; i < 10; i++) { const r = await redis(['SCAN', cur, 'MATCH', 'jz:ps:*', 'COUNT', 200]); cur = String(r[0]); keys.push(...r[1]); if (cur === '0') break; }
  for (const k of keys.slice(0, 100)) {
    const code = k.slice(6), raw = await redis(['GET', 'jz:p:' + code]);
    let rec = null; try { rec = raw && JSON.parse(raw); } catch (e) {}
    if (!rec) { await redis(['DEL', k]); continue; }
    if (rec.state.days[day]) { out.played++; continue; }
    try { (await remind(code, false)) === 'sent' ? out.sent++ : out.other++; } catch (e) { out.other++; }
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (s, error) => res.status(s).json({ error });
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.key) return P.configured() ? res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY }) : fail(404, 'notconfigured');
      if (q.cron) return res.status(200).json(P.configured() ? await cron() : { skipped: 'notconfigured' });
      if (q.msg) { const c = cookieCode(req); return res.status(200).json(c ? await messageFor(c) : { title: 'Jesi znala?', body: 'Danas te čeka novo pismo.' }); }
      return fail(400, 'bad');
    }
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (req.headers['x-jz'] !== '1' || (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host)) return fail(403, 'forbidden');
      const b = isObj(req.body) ? req.body : {};
      if (!valid(b.code) || !P.configured()) return fail(P.configured() ? 400 : 404, P.configured() ? 'bad' : 'notconfigured');
      if (!(await redis(['GET', 'jz:p:' + b.code]))) return fail(404, 'missing');
      if (b.off) { await redis(['DEL', 'jz:ps:' + b.code]); return res.status(200).json({ ok: true, on: false }); }
      const e = b.sub && b.sub.endpoint;
      if (!P.endpointOk(e)) return fail(400, 'endpoint');
      await redis(['SET', 'jz:ps:' + b.code, JSON.stringify({ endpoint: e, t: new Date().toISOString() })]);
      return res.status(200).json({ ok: true, on: true });
    }
    return fail(405, 'method');
  } catch (e) {
    return fail(e && e.code === 'nostore' ? 503 : 500, e && e.code === 'nostore' ? 'nostore' : 'error');
  }
};
module.exports.remind = remind;
