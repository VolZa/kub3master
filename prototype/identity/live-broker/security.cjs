'use strict';
const { OAuth2Client } = require('google-auth-library');
const { createHmac, createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const deny = () => { throw new Error('ACCESS_DENIED'); };
const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function key(value) { if (!Buffer.isBuffer(value) || value.length !== 32) deny(); return value; }
function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function createGoogleVerifier({ clientId, client = new OAuth2Client(clientId), now = Date.now }) {
  if (typeof clientId !== 'string' || !clientId.endsWith('.apps.googleusercontent.com')) deny();
  return { async verify(token, nonce) {
    if (typeof token !== 'string' || token.length > 32768 || !hex(nonce)) deny();
    try {
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
      if (header.alg !== 'RS256' || !header.kid || header.jku || header.jwk || header.x5u || header.crit) deny();
      const ticket = await client.verifyIdToken({ idToken: token, audience: clientId });
      const c = ticket.getPayload(), time = now() / 1000;
      if (!c || !['https://accounts.google.com', 'accounts.google.com'].includes(c.iss) || c.aud !== clientId ||
        typeof c.sub !== 'string' || !c.sub || c.nonce !== nonce ||
        !Number.isFinite(c.exp) || c.exp <= time || !Number.isFinite(c.iat) || c.iat > time + 30 ||
        c.iat >= c.exp || (c.azp !== undefined && c.azp !== clientId)) deny();
      return Object.freeze({ issuer: 'https://accounts.google.com', subject: c.sub, expiresAt: c.exp * 1000 });
    } catch { return deny(); }
  } };
}
function createAssertionSigner({ secret, issuer, audience, now = Date.now }) {
  key(secret); if (!issuer?.startsWith('https://') || !audience) deny();
  return ({ subject, expiresAt, transactionId, nonce, proofHash }) => {
    if (!subject || !Number.isFinite(expiresAt) || expiresAt <= now() || ![transactionId, nonce, proofHash].every(hex)) deny();
    const claims = { iss: issuer, aud: audience, googleIssuer: 'https://accounts.google.com', sub: subject,
      iat: Math.floor(now() / 1000), exp: Math.min(Math.floor(expiresAt / 1000), Math.floor(now() / 1000) + 20),
      jti: random(), transactionId, nonce, proofHash };
    const encoded = [ { alg: 'HS256', typ: 'JWT' }, claims ].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    return encoded + '.' + createHmac('sha256', secret).update(encoded).digest('base64url');
  };
}
/** Signature-only port for isolated GAS consumer tests; claims are validated by BrokerAssertionPrototype. */
function assertionSignatureVerifier(secret) {
  key(secret);
  return { verify(assertion) {
    if (typeof assertion !== 'string' || assertion.length > 8192) deny();
    const parts = assertion.split('.'); if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) deny();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || Object.keys(header).length !== 2) deny();
    const mac = createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (!equal(mac, parts[2])) deny();
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } };
}
/** replay.consume must atomically create-if-absent, with expiry, in a durable shared store. */
function createChannelGuard({ secret, replay, now = Date.now }) {
  key(secret);
  return async ({ method, path, body, timestamp, requestId, mac }) => {
    if (method !== 'POST' || !['/private/begin', '/private/redeem'].includes(path) || !hex(requestId) ||
      !/^\d{13}$/.test(timestamp || '') || Math.abs(now() - Number(timestamp)) > 30_000 ||
      !Buffer.isBuffer(body) || body.length > 32768 || !hex(mac)) deny();
    const message = [method, path, timestamp, requestId, hash(body)].join('\n');
    const expected = createHmac('sha256', secret).update(message).digest('hex');
    if (!equal(expected, mac) || !await replay.consume(requestId, now() + 60_000)) deny();
  };
}
module.exports = { createGoogleVerifier, createAssertionSigner, assertionSignatureVerifier, createChannelGuard, hash, random, hex, deny };
