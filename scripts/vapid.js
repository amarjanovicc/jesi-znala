// Pokreni jednom na svom računalu: node scripts/vapid.js
// Ispisuje tri vrijednosti koje sam upišeš u Vercel (Settings > Environment Variables). Privatni ključ nikad ne ide u Git.
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' }), prv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');
console.log('VAPID_PUBLIC_KEY=' + raw);
console.log('VAPID_PRIVATE_KEY=' + prv.d);
console.log('VAPID_SUBJECT=mailto:tvoj@email.com   (zamijeni svojom adresom)');
