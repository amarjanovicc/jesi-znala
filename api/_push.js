// Web push bez vanjskih paketa: VAPID potpis (ES256) i prazna poruka. Tekst podsjetnika servis worker dohvaća s /api/push?msg=1.
const crypto = require('crypto');

const configured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const subject = () => process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
// samo poznati push servisi: pretplata je javni unos, a server na tu adresu šalje zahtjev
const HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;
function endpointOk(e) {
  if (typeof e !== 'string' || e.length > 700) return false;
  try { const u = new URL(e); return u.protocol === 'https:' && !u.port && HOST.test(u.hostname); } catch (x) { return false; }
}
function jwt(aud) {
  const pub = Buffer.from(process.env.VAPID_PUBLIC_KEY, 'base64url'), b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = b({ typ: 'JWT', alg: 'ES256' }) + '.' + b({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject() });
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url'), d: process.env.VAPID_PRIVATE_KEY }, format: 'jwk' });
  return data + '.' + crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
// vraća HTTP status push servisa (201 = prihvaćeno, 404/410 = pretplata više ne vrijedi)
async function send(endpoint) {
  const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '43200', Urgency: 'normal', Authorization: 'vapid t=' + jwt(new URL(endpoint).origin) + ', k=' + process.env.VAPID_PUBLIC_KEY }, signal: AbortSignal.timeout(6000) });
  return r.status;
}
module.exports = { configured, endpointOk, jwt, send };
