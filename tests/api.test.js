// Testovi API-ja (liga, serija, podsjetnik, admin) s lažnim Redisom i lažnim push servisom. Pokretanje: npm test
const root = require('path').join(__dirname, '..'), crypto = require('crypto'), assert = require('assert');
const D = new Map(), pushCalls = []; let pushStatus = 201;
process.env.KV_REST_API_URL = 'http://mock'; process.env.KV_REST_API_TOKEN = 't'; process.env.ADMIN_PASSWORD = 'pw';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pj = publicKey.export({ format: 'jwk' }), vj = privateKey.export({ format: 'jwk' });
process.env.VAPID_PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.from(pj.x, 'base64url'), Buffer.from(pj.y, 'base64url')]).toString('base64url');
process.env.VAPID_PRIVATE_KEY = vj.d; process.env.VAPID_SUBJECT = 'mailto:t@example.com';
global.fetch = async (u, o) => {
  if (u === 'http://mock') {
    const [op, k, ...a] = JSON.parse(o.body); let res = null;
    if (op === 'GET') res = D.has(k) ? D.get(k) : null;
    else if (op === 'SET') { if (a.includes('NX') && D.has(k)) res = null; else { D.set(k, String(a[0])); res = 'OK'; } }
    else if (op === 'INCR') { D.set(k, (+D.get(k) || 0) + 1); res = +D.get(k); } else if (op === 'DECR') { D.set(k, (+D.get(k) || 0) - 1); res = +D.get(k); }
    else if (op === 'EXPIRE') res = 1; else if (op === 'DEL') { res = D.delete(k) ? 1 : 0; } else if (op === 'PING') res = 'PONG';
    else if (op === 'SCAN') { const m = a[a.indexOf('MATCH') + 1].replace('*', ''); res = ['0', [...D.keys()].filter(x => x.startsWith(m))]; }
    else if (op === 'MGET') res = [k, ...a].map(x => D.has(x) ? D.get(x) : null);
    return { ok: true, json: async () => ({ result: res }) };
  }
  pushCalls.push({ u, o }); return { status: pushStatus };
};
const lib = require(root + '/api/_lib'), league = require(root + '/api/league'), push = require(root + '/api/push'), admin = require(root + '/api/admin'), P = require(root + '/api/_push');
const call = async (h, req) => { let out; const res = { setHeader() {}, status(s) { this.s = s; return this; }, json(o) { out = { s: this.s || 200, j: o }; return this; } }; await h(Object.assign({ headers: {}, query: {} }, req), res); return out; };
const J = { 'x-jz': '1', host: 'h' };
const lg = (code, body) => call(league, { method: 'POST', headers: J, body: Object.assign({ code }, body) });
const today = lib.zagrebDay(), dayOff = n => new Date(new Date(today + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const rec = (days, f, label) => JSON.stringify({ state: { f, days: Object.fromEntries(days.map(d => [d, 1])), week: {}, fb: [] }, watch: null, label: label || '', created: 'x', seen: 'x' });
const L = (d, r) => ({ r: r || [true, true, true], d, box: 0, due: 3, rev: 0 });
const codes = n => 'abcdefghijk' + 'lmnopqrstu'.slice(0, 1) + String(n).padStart(2, '0') + 'zz';
let ok = 0; const t = (name, fn) => fn().then(() => { ok++; console.log('ok  ', name); }).catch(e => { console.log('FAIL', name, '\n    ', e.message); process.exitCode = 1; });
(async () => {
  const A = codes(1), B = codes(2), C = codes(3);
  D.set('jz:p:' + A, rec([dayOff(-2), dayOff(-1), today], { 0: L(today), 1: L(dayOff(-1)), 2: L(dayOff(-2), [true, false, true]) }, 'Ana'));
  D.set('jz:p:' + B, rec([dayOff(-5)], { 0: L(dayOff(-5)) }, 'Bruno'));
  D.set('jz:p:' + C, rec([], {}, 'Cili'));
  await t('VAPID JWT ima ispravan potpis', async () => {
    const j = P.jwt('https://fcm.googleapis.com'), [h, c, s] = j.split('.'); const claims = JSON.parse(Buffer.from(c, 'base64url'));
    assert.strictEqual(claims.aud, 'https://fcm.googleapis.com'); assert(claims.exp > Date.now() / 1000);
    assert(crypto.verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
  });
  await t('serija: živa, prekinuta, najdulja', async () => {
    const s = lib.streakInfo({ [dayOff(-2)]: 1, [dayOff(-1)]: 1, [today]: 1, [dayOff(-6)]: 1, [dayOff(-7)]: 1, [dayOff(-8)]: 1, [dayOff(-9)]: 1 }, today);
    assert.deepStrictEqual([s.cur, s.best, s.playedToday], [3, 4, true]);
    assert.strictEqual(lib.streakInfo({ [dayOff(-1)]: 1 }, today).cur, 1); assert.strictEqual(lib.streakInfo({ [dayOff(-2)]: 1 }, today).cur, 0);
  });
  await t('tjedan: pon-ned i bodovi', async () => {
    const w = lib.weekBounds(0); assert.strictEqual(new Date(w.from + 'T12:00:00Z').getUTCDay(), 1); assert.strictEqual(new Date(w.to + 'T12:00:00Z').getUTCDay(), 0);
    assert.strictEqual(lib.weekPoints({ f: { 0: L(w.from), 1: L(w.to, [true, false, true]) }, week: { [w.to]: { r: 4, n: 5 } } }, w).p, 3 + 2 + 4);
    assert.strictEqual(lib.weekPoints({ f: { 0: L('2000-01-01') }, week: {} }, w).p, 0);
  });
  let invite;
  await t('zaštita: bez zaglavlja 403, nepoznat uređaj 404, loš kod 400', async () => {
    assert.strictEqual((await call(league, { method: 'POST', headers: { host: 'h' }, body: { code: A, action: 'mine' } })).s, 403);
    assert.strictEqual((await lg(codes(9), { action: 'mine' })).s, 404); assert.strictEqual((await lg('x', { action: 'mine' })).s, 400);
    assert.strictEqual((await call(league, { method: 'GET', headers: J })).s, 405);
  });
  await t('napravi ligu: validacija nadimka i imena', async () => {
    assert.strictEqual((await lg(A, { action: 'create', nick: 'A', name: 'Liga' })).j.error, 'nick'); assert.strictEqual((await lg(A, { action: 'create', nick: 'Ana', name: 'L' })).j.error, 'name');
    const r = await lg(A, { action: 'create', nick: '<b>Ana</b>', name: 'Obitelj' }); assert.strictEqual(r.s, 200);
    const l = r.j.leagues[0]; invite = l.id; assert(/^[A-Z2-9]{6}$/.test(invite)); assert(!/[<>]/.test(l.board[0].nick)); assert.strictEqual(l.board[0].streak, 3); assert.strictEqual(l.board[0].today, true);
  });
  await t('pridruživanje: kod, duplikat nadimka, ljestvica poredana', async () => {
    assert.strictEqual((await lg(B, { action: 'join', invite: 'ZZZZZZ', nick: 'Bruno' })).s, 404); assert.strictEqual((await lg(B, { action: 'join', invite: 'abc', nick: 'Bruno' })).j.error, 'invite');
    const dup = await lg(B, { action: 'join', invite: invite.toLowerCase(), nick: D.get('jz:lg:' + invite) && JSON.parse(D.get('jz:lg:' + invite)).members[0].nick }); assert.strictEqual(dup.j.error, 'nick');
    const r = await lg(B, { action: 'join', invite: invite.toLowerCase(), nick: 'Bruno' }); assert.strictEqual(r.s, 200);
    const b = r.j.leagues[0].board; assert.deepStrictEqual(b.map(x => x.me), [false, true]); assert(b[0].wk >= b[1].wk);
    await lg(C, { action: 'join', invite, nick: 'Cili' }); assert.strictEqual(JSON.parse(D.get('jz:lg:' + invite)).members.length, 3);
  });
  await t('privatnost: ljestvica ne sadrži kodove niti oznake', async () => {
    const s = JSON.stringify((await lg(B, { action: 'mine' })).j); assert(!s.includes(A)); assert(!/"code"|"label"|watch/.test(s));
  });
  await t('liga puna na 8, najviše 3 lige po igraču', async () => {
    for (let i = 10; i < 15; i++) { D.set('jz:p:' + codes(i), rec([], {})); assert.strictEqual((await lg(codes(i), { action: 'join', invite, nick: 'N' + i })).s, 200); }
    D.set('jz:p:' + codes(20), rec([], {})); const full = await lg(codes(20), { action: 'join', invite, nick: 'Kasni' }); assert.strictEqual(full.j.error, 'full');
    for (let i = 1; i <= 2; i++) assert.strictEqual((await lg(B, { action: 'create', nick: 'Bruno', name: 'Druga' + i })).s, 200);
    assert.strictEqual((await lg(B, { action: 'create', nick: 'Bruno', name: 'Treca' })).j.error, 'many');
  });
  await t('izlazak: prazna liga se briše, brojač pada', async () => {
    const before = +D.get('jz:lgcount'); const r = await lg(C, { action: 'leave', invite }); assert.strictEqual(r.s, 200); assert.strictEqual(r.j.leagues.length, 0);
    const solo = (await lg(codes(20), { action: 'create', nick: 'Solo', name: 'Samo ja' })).j.leagues[0].id; await lg(codes(20), { action: 'leave', invite: solo });
    assert.strictEqual(D.has('jz:lg:' + solo), false); assert.strictEqual(+D.get('jz:lgcount'), before);
  });
  await t('push: samo poznati servisi, spremanje i odjava', async () => {
    const sub = (code, e) => call(push, { method: 'POST', headers: J, body: { code, sub: { endpoint: e } } });
    assert.strictEqual((await sub(A, 'https://evil.example.com/x')).s, 400); assert.strictEqual((await sub(A, 'http://fcm.googleapis.com/x')).s, 400);
    assert.strictEqual((await sub(A, 'https://fcm.googleapis.com/fcm/send/AAA')).s, 200); assert(D.has('jz:ps:' + A));
    assert.strictEqual((await call(push, { method: 'POST', headers: { host: 'h' }, body: { code: A } })).s, 403);
    assert.strictEqual((await call(push, { method: 'GET', query: { key: '1' } })).j.key, process.env.VAPID_PUBLIC_KEY);
  });
  await t('tekst podsjetnika po kolačiću: serija u opasnosti', async () => {
    D.set('jz:p:' + B, rec([dayOff(-1), dayOff(-2), dayOff(-3)], { 0: L(dayOff(-1)) }));
    const m = await call(push, { method: 'GET', query: { msg: '1' }, headers: { cookie: 'x=1; jz_id=' + B } }); assert(/3 dana zaredom/.test(m.j.body), m.j.body);
    const a = await call(push, { method: 'GET', query: { msg: '1' }, headers: { cookie: 'jz_id=' + A } }); assert(/već u albumu/.test(a.j.body));
    assert(/novo pismo/.test((await call(push, { method: 'GET', query: { msg: '1' }, headers: {} })).j.body));
  });
  await t('cron: samo navečer, preskače odigrane, jednom dnevno, čisti 410', async () => {
    await call(push, { method: 'POST', headers: J, body: { code: B, sub: { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/BBB' } } });
    const real = Date.prototype.toLocaleString; let hr = '10'; Date.prototype.toLocaleString = function (l, o) { return o && o.hour ? hr : real.call(this, l, o); };
    try {
      assert.strictEqual((await call(push, { method: 'GET', query: { cron: '1' } })).j.skipped, 'hour');
      hr = '18'; pushCalls.length = 0; const r = await call(push, { method: 'GET', query: { cron: '1' } }); assert.deepStrictEqual([r.j.sent, r.j.played], [1, 1]);
      assert.strictEqual(pushCalls.length, 1); assert(pushCalls[0].u.includes('mozilla')); assert(/^vapid t=.+, k=.+/.test(pushCalls[0].o.headers.Authorization));
      pushCalls.length = 0; const r2 = await call(push, { method: 'GET', query: { cron: '1' } }); assert.strictEqual(pushCalls.length, 0); assert.strictEqual(r2.j.sent, 0);
      D.delete('jz:rem:' + B + ':' + today); pushStatus = 410; await call(push, { method: 'GET', query: { cron: '1' } }); assert.strictEqual(D.has('jz:ps:' + B), false);
    } finally { Date.prototype.toLocaleString = real; pushStatus = 201; }
  });
  const auth = { authorization: 'Bearer ' + lib.makeToken() };
  await t('admin: lige, probni podsjetnik, status, brisanje igrača i lige', async () => {
    const al = await call(admin, { method: 'GET', query: { action: 'leagues' }, headers: auth }); assert(al.j.leagues.length >= 1);
    assert.strictEqual((await call(admin, { method: 'GET', query: { action: 'leagues' }, headers: {} })).s, 401);
    assert.strictEqual((await call(admin, { method: 'GET', query: { action: 'status' }, headers: auth })).j.push, true);
    const pl = (await call(admin, { method: 'GET', query: { action: 'players' }, headers: auth })).j.players; const a = pl.find(p => p.label === 'Ana'); assert.strictEqual(a.push, true);
    const tp = await call(admin, { method: 'POST', query: { action: 'testPush' }, headers: auth, body: { id: a.id } }); assert.strictEqual(tp.j.result, 'sent');
    const inv2 = al.j.leagues.find(l => l.id === invite); const before = inv2.members;
    const del = await call(admin, { method: 'POST', query: { action: 'deletePlayer' }, headers: auth, body: { id: a.id } }); assert.strictEqual(del.s, 200);
    assert.strictEqual(D.has('jz:ps:' + A), false); assert.strictEqual(D.has('jz:lgm:' + A), false); assert.strictEqual(JSON.parse(D.get('jz:lg:' + invite)).members.length, before - 1);
    assert.strictEqual((await call(admin, { method: 'POST', query: { action: 'deleteLeague' }, headers: auth, body: { id: invite } })).s, 200); assert.strictEqual(D.has('jz:lg:' + invite), false);
    assert.strictEqual((await lg(B, { action: 'mine' })).j.leagues.every(l => l.id !== invite), true);
  });
  console.log(ok + ' testova prošlo' + (process.exitCode ? ', ima grešaka' : ''));
})();
