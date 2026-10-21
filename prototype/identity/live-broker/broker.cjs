'use strict';
const { createGoogleVerifier, hash, random, hex, deny } = require('./security.cjs');
/** Store is a durable atomic port. transition(id, phase, fn) invokes synchronous fn once per committed
 * update (or retries only pure calculation) and commits fn's returned record. No in-memory fallback.
 * Store must encrypt PKCE verifier at rest, apply TTL/admission bounds, and never log record values.
 */
function createBroker({ store, oauth, clientId, redirectUri, users, signAssertion, now = Date.now }) {
  const verifier = createGoogleVerifier({ clientId, client: oauth, now });
  const live = record => { if (!record || record.expiresAt <= now()) deny(); };
  return {
    async begin({ id, nonce, proofHash }) {
      if (![id, nonce, proofHash].every(hex)) deny();
      await store.createOnce(id, { phase: 'NEW', nonce, proofHash, expiresAt: now() + 120000 });
      return { transactionId: id };
    },
    async bind({ id, proof }) {
      if (![id, proof].every(hex)) deny();
      const cookie = random(), state = id + '.' + random(), verifier = random();
      await store.transition(id, 'NEW', record => {
        live(record); if (record.proofHash !== hash(proof)) deny();
        return { ...record, phase: 'BOUND', cookieHash: hash(cookie), stateHash: hash(state), pkce: verifier };
      });
      const url = oauth.generateAuthUrl({ scope: ['openid', 'email', 'profile'], access_type: 'online',
        prompt: 'select_account', redirect_uri: redirectUri, state, nonce: (await store.read(id)).nonce,
        code_challenge: Buffer.from(hash(verifier), 'hex').toString('base64url'), code_challenge_method: 'S256' });
      return { cookie, url };
    },
    async callback({ state, cookie, code }) {
      if (typeof state !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(state) || !hex(cookie) ||
        typeof code !== 'string' || !code || code.length > 8192) deny();
      const id = state.split('.')[0];
      const claimed = await store.transition(id, 'BOUND', record => {
        live(record); if (record.stateHash !== hash(state) || record.cookieHash !== hash(cookie)) deny();
        return { ...record, phase: 'PROCESSING' };
      });
      try {
        const response = await oauth.getToken({ code, codeVerifier: claimed.pkce, redirect_uri: redirectUri });
        const identity = await verifier.verify(response.tokens.id_token, claimed.nonce);
        // Enrollment is stable issuer+subject only. Email/browser role is never sufficient.
        if (!await users.isActive(identity.issuer, identity.subject)) deny();
        await store.transition(id, 'PROCESSING', record => {
          live(record); return { phase: 'VERIFIED', nonce: record.nonce, proofHash: record.proofHash,
            expiresAt: record.expiresAt, identity };
        });
        return { status: 'VERIFIED' };
      } catch {
        // PROCESSING is terminal on errors/unknown outcomes. Never repeat code exchange automatically.
        return deny();
      }
    },
    async redeem({ id, proof }) {
      if (![id, proof].every(hex)) deny();
      const current = await store.read(id); live(current);
      if (current.proofHash !== hash(proof)) deny();
      if (['NEW', 'BOUND', 'PROCESSING'].includes(current.phase)) return { status: 'PENDING' };
      const record = await store.transition(id, 'VERIFIED', row => {
        live(row); if (row.proofHash !== hash(proof)) deny(); return { ...row, phase: 'REDEEMED' };
      });
      const { identity } = record;
      if (!await users.isActive(identity.issuer, identity.subject)) deny();
      return { status: 'OK', assertion: signAssertion({ ...identity, transactionId: id, nonce: record.nonce, proofHash: record.proofHash }) };
    },
  };
}
module.exports = { createBroker };
