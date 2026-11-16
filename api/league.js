// Lige: napravi, pridruži se, izađi, ljestvice. Ulaz je javan, pa vrijede ista pravila kao za sinkronizaciju
// (posebno zaglavlje, ista adresa, ograničenje učestalosti) i samo igrač s postojećim zapisom smije išta.
const crypto = require('crypto');
const { redis, valid, isObj, notify } = require('./_lib');
const L = require('./_league');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (s, error, message) => res.status(s).json({ error, message });
  if (req.method !== 'POST') return fail(405, 'method');
  const origin = req.headers.origin;
  if (req.headers['x-jz'] !== '1' || (origin && origin.replace(/^https?:\/\//, '') !== req.headers.host)) return fail(403, 'forbidden');
  const body = isObj(req.body) ? req.body : {}, action = String(body.action || ''), code = body.code;
  try {
    if (!valid(code)) return fail(400, 'bad');
    const raw = await redis(['GET', 'jz:p:' + code]);
    if (!raw) return fail(404, 'missing', 'Uređaj još nije povezan. Otvori igru i probaj opet.');
    const label = (JSON.parse(raw).label) || 'Ona';
    const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim(), rk = 'jz:rl:lg:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
    const n = await redis(['INCR', rk]); if (n === 1) await redis(['EXPIRE', rk, 3600]);
    if (n > 120) return fail(429, 'toomany', 'Previše pokušaja. Probaj kasnije.');
    const ids = await L.mine(code), done = async () => res.status(200).json({ leagues: await Promise.all((await L.mine(code)).map(async id => { const l = await L.load(id); return l && L.board(l, code); })).then(a => a.filter(Boolean)) });

    if (action === 'mine') {
      const keep = [];
      for (const id of ids) if (await L.load(id)) keep.push(id);
      if (keep.length !== ids.length) await L.saveMine(code, keep);
      return done();
    }
    if (action === 'create') {
      const nick = L.cleanNick(body.nick), name = L.cleanName(body.name);
      if (nick.length < 2) return fail(400, 'nick', 'Upiši svoj nadimak (barem dva slova).');
      if (name.length < 2) return fail(400, 'name', 'Upiši ime lige (barem dva slova).');
      if (ids.length >= L.PER_PLAYER) return fail(400, 'many', 'Možeš biti u najviše ' + L.PER_PLAYER + ' lige.');
      const total = await redis(['INCR', 'jz:lgcount']);
      if (total > L.MAX_LEAGUES) { await redis(['DECR', 'jz:lgcount']); return fail(429, 'full', 'Dosegnut je najveći broj liga.'); }
      let id = null;
      for (let i = 0; i < 8 && !id; i++) { const c = L.newInvite(); if ((await redis(['SET', 'jz:lg:' + c, JSON.stringify({ id: c, name, created: new Date().toISOString(), members: [{ code, nick, j: new Date().toISOString() }] }), 'NX'])) === 'OK') id = c; }
      if (!id) { await redis(['DECR', 'jz:lgcount']); return fail(500, 'error'); }
      await L.saveMine(code, ids.concat(id));
      try { await notify('Jesi znala? Nova liga', label + ' je napravila ligu „' + name + '” kao „' + nick + '”.'); } catch (e) {}
      return done();
    }
    if (action === 'join') {
      const invite = String(body.invite || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), nick = L.cleanNick(body.nick);
      if (nick.length < 2) return fail(400, 'nick', 'Upiši svoj nadimak (barem dva slova).');
      if (!L.inviteOk(invite)) return fail(400, 'invite', 'Kod lige ima 6 znakova.');
      const l = await L.load(invite);
      if (!l) return fail(404, 'invite', 'Te lige nema. Provjeri kod.');
      const me = l.members.find(m => m.code === code);
      if (!me) {
        if (ids.length >= L.PER_PLAYER) return fail(400, 'many', 'Možeš biti u najviše ' + L.PER_PLAYER + ' lige.');
        if (l.members.length >= L.MEMBERS) return fail(400, 'full', 'Liga je puna (' + L.MEMBERS + ').');
      }
      if (l.members.some(m => m.code !== code && m.nick.toLowerCase() === nick.toLowerCase())) return fail(400, 'nick', 'Taj nadimak je već u ligi. Odaberi drugi.');
      if (me) me.nick = nick; else l.members.push({ code, nick, j: new Date().toISOString() });
      await L.save(l);
      if (!ids.includes(invite)) await L.saveMine(code, ids.concat(invite));
      if (!me) try { await notify('Jesi znala? Liga', label + ' se pridružila ligi „' + l.name + '” kao „' + nick + '”.'); } catch (e) {}
      return done();
    }
    if (action === 'leave') {
      const invite = String(body.invite || '').toUpperCase();
      if (!L.inviteOk(invite)) return fail(400, 'invite');
      const l = await L.load(invite);
      if (l) {
        l.members = l.members.filter(m => m.code !== code);
        if (l.members.length) await L.save(l); else { await redis(['DEL', 'jz:lg:' + invite]); if ((await redis(['DECR', 'jz:lgcount'])) < 0) await redis(['SET', 'jz:lgcount', 0]); }
      }
      await L.saveMine(code, ids.filter(x => x !== invite));
      return done();
    }
    return fail(404, 'action');
  } catch (e) {
    return fail(e && e.code === 'nostore' ? 503 : 500, e && e.code === 'nostore' ? 'nostore' : 'error');
  }
};
