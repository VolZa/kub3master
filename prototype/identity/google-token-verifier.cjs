'use strict';
// External Node-only POC. Never import into GAS. Keys must be independently trusted Google JWKS
// in a future production adapter; tests use local RSA fixtures, never self-supplied token keys.
const { verify, createPublicKey } = require('node:crypto');
function createVerifier({ audience, keys, now = () => Date.now() }) {
  return { verify(token) {
    const deny = () => { throw new Error('ACCESS_DENIED'); };
    if (!audience || typeof token !== 'string' || token.length > 32768) return deny();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return deny();
    let header, claims;
    try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { return deny(); }
    if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object' || Array.isArray(claims)) return deny();
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !Object.hasOwn(keys, header.kid) || header.crit || header.jku || header.jwk || header.x5u) return deny();
    const key = createPublicKey(keys[header.kid]);
    if (key.asymmetricKeyType !== 'rsa' || !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'))) return deny();
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== audience ||
      typeof claims.sub !== 'string' || !claims.sub || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now() ||
      typeof claims.nonce !== 'string' || !claims.nonce || typeof claims.iat !== 'number' || claims.iat * 1000 > now() + 60000) return deny();
    return { iss: claims.iss, sub: claims.sub, aud: claims.aud, exp: claims.exp, nonce: claims.nonce };
  } };
}
module.exports = { createVerifier };
