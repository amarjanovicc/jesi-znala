// Privatne lige: soba s pozivnim kodom, do 8 igrača, tjedna ljestvica. Bez računa i bez javnog popisa.
const { redis, isObj, zagrebDay, weekBounds, weekPoints, streakInfo, rankOf } = require('./_lib');

const MAX_LEAGUES = 30, MEMBERS = 8, PER_PLAYER = 3;
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inviteOk = s => typeof s === 'string' && /^[A-Z2-9]{6}$/.test(s);
const cleanNick = s => String(s == null ? '' : s).replace(/[\u0000-\u001f<>&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 16);
const cleanName = s => String(s == null ? '' : s).replace(/[\u0000-\u001f<>&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
const newInvite = () => Array.from(require('crypto').randomBytes(6), x => A[x % A.length]).join('');

async function mine(code) { try { const a = JSON.parse(await redis(['GET', 'jz:lgm:' + code]) || '[]'); return Array.isArray(a) ? a.filter(inviteOk) : []; } catch (e) { return []; } }
const saveMine = (code, ids) => redis(['SET', 'jz:lgm:' + code, JSON.stringify(ids.slice(0, PER_PLAYER))]);
async function load(id) { const raw = await redis(['GET', 'jz:lg:' + id]); try { const l = raw && JSON.parse(raw); return l && Array.isArray(l.members) ? l : null; } catch (e) { return null; } }
const save = l => redis(['SET', 'jz:lg:' + l.id, JSON.stringify(l)]);

// ljestvica jedne lige: tekući tjedan i pobjednik prošlog tjedna
async function board(l, me) {
  const keys = l.members.map(m => 'jz:p:' + m.code), raws = keys.length ? await redis(['MGET', ...keys]) : [];
  const today = zagrebDay(), wk = weekBounds(0), last = weekBounds(1);
  const rows = l.members.map((m, i) => {
    let st = null; try { st = raws[i] && JSON.parse(raws[i]).state; } catch (e) {}
    if (!st) return { nick: m.nick, wk: 0, n: 0, pts: 0, streak: 0, best: 0, rank: '', today: false, prev: 0, me: m.code === me, gone: true };
    const w = weekPoints(st, wk), s = streakInfo(st.days, today);
    return { nick: m.nick, wk: w.p, n: w.n, pts: rankOf(st).points, streak: s.cur, best: s.best, rank: rankOf(st).name, today: s.playedToday, prev: weekPoints(st, last).p, me: m.code === me };
  });
  const order = (a, b) => b.wk - a.wk || b.pts - a.pts || a.nick.localeCompare(b.nick, 'hr');
  const prevTop = rows.filter(r => r.prev > 0).sort((a, b) => b.prev - a.prev || a.nick.localeCompare(b.nick, 'hr'))[0];
  const champ = prevTop && rows.filter(r => r.prev === prevTop.prev).length === 1 ? { nick: prevTop.nick, pts: prevTop.prev } : null;   // izjednačeno = nema pobjednika
  rows.sort(order);
  return { id: l.id, name: l.name, members: l.members.length, max: MEMBERS, week: wk, board: rows.map(({ prev, gone, ...r }) => r), champion: champ };
}

// kad igrač nestane (admin ga obriše), izlazi iz svih liga
async function dropFromLeagues(code) {
  for (const id of await mine(code)) {
    const l = await load(id); if (!l) continue;
    l.members = l.members.filter(m => m.code !== code);
    if (l.members.length) await save(l); else { await redis(['DEL', 'jz:lg:' + id]); await redis(['DECR', 'jz:lgcount']); }
  }
  await redis(['DEL', 'jz:lgm:' + code]);
}

module.exports = { MAX_LEAGUES, MEMBERS, PER_PLAYER, inviteOk, cleanNick, cleanName, newInvite, mine, saveMine, load, save, board, dropFromLeagues };
