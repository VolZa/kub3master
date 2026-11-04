'use strict';
const { createGoogleVerifier, requireBrowserProof, random, hash, hex, deny } = require('./security.cjs');

/**
 * Isolated Node component; not imported by server.cjs, GAS or production authorization.
 * Reuses the Google library verifier and broker browser-proof/atomic-transition pattern.
 * No Users, sessions, cookies, assertions, channel, HTTP endpoint or permission grants.
 *
 * @typedef {{environment: 'PRODUCTION'|'TEST', applicationAudience: string, expectedScriptId: string}} Context
 * @typedef {{profile: 'KUB_ERP_SESSION_BD2_V1', clientId: string, context: Context, attemptTtlMs: number}} Configuration
 * @typedef {{profile: string, clientId: string, context: Context, attemptId: string, nonceHash: string,
 *   proofHash: string, createdAtMs: number, expiresAtMs: number, phase: 'NEW'|'CONSUMED'}} Attempt
 * @typedef {{verify(token: string, nonce: string): Promise<{issuer: string, subject: string, expiresAt: number}>}} VerificationPort
 * @typedef {{createOnce(id: string, record: Readonly<Attempt>): Promise<void>,
 *   transition(id: string, phase: 'NEW', update: (record: Readonly<Attempt>) => Readonly<Attempt>): Promise<Readonly<Attempt>>}} AttemptPort
 *
 * AttemptPort is TRUSTED SERVER INJECTION, not a browser DTO. createOnce must refuse overwrite.
 * transition must atomically compare phase AND commit update, returning that committed record.
 * It may retry only the synchronous update; never invoke Google/network code inside it.
 * Normal return means confirmed persistence; missing/unavailable/conflict/UNKNOWN must throw.
 * CONSUMED is terminal, including verification failure/timeout/crash; no delete-and-recreate.
 * Firestore adapter is isolated; distributed clock/production/retention acceptance remains OPEN.
 */
const { PROFILE, data, configuration, record: readAttempt, AttemptStoreError } = require('./bd2-attempt-contract.cjs');
/** Explicit ports are trusted composition inputs. No default store or permissive verifier.
 * @param {{configuration: Configuration, attempts: AttemptPort, verifier: VerificationPort, now?: () => number}} options
 */
function createLoginProofValidator(options) {
  const o = data(options, ['configuration', 'attempts', 'verifier'], ['now']);
  const c = configuration(o.configuration), now = o.now ?? Date.now;
  if (typeof now !== 'function' || typeof o.attempts?.createOnce !== 'function' ||
    typeof o.attempts?.transition !== 'function' || typeof o.verifier?.verify !== 'function') deny();
  const createOnce = o.attempts.createOnce.bind(o.attempts);
  const transition = o.attempts.transition.bind(o.attempts);
  const verify = o.verifier.verify.bind(o.verifier);
  let highWater = 0;
  function time() {
    const t = now();
    if (!Number.isSafeInteger(t) || t < 1 || t < highWater) deny();
    highWater = t;
    return t; // Local sanity check only, not a distributed trusted-clock proof.
  }
  function attempt(value, phase, id, at) {
    const row = readAttempt(value, c, id);
    if (row.phase !== phase || row.createdAtMs > at || row.expiresAtMs <= at) deny();
    return row;
  }
  return Object.freeze({
    async begin(request) {
      try {
        const { browserProofHash } = data(request, ['browserProofHash']);
        if (!hex(browserProofHash)) deny();
        const createdAtMs = time(), expiresAtMs = createdAtMs + c.attemptTtlMs;
        if (!Number.isSafeInteger(expiresAtMs)) deny();
        const nonce = random();
        const record = Object.freeze({ profile: PROFILE, clientId: c.clientId, context: c.context,
          attemptId: random(), nonceHash: hash(nonce), proofHash: browserProofHash, createdAtMs, expiresAtMs, phase: 'NEW' });
        await createOnce(record.attemptId, record);
        attempt(record, 'NEW', record.attemptId, time());
        return Object.freeze({ attemptId: record.attemptId, nonce, expiresAtMs });
      } catch (error) {
        if (error instanceof AttemptStoreError) throw error;
        return deny();
      }
    },
    async verify(request) {
      try {
        const { attemptId, browserProof, nonce, idToken } = data(request, ['attemptId', 'browserProof', 'nonce', 'idToken']);
        if (!hex(attemptId) || !hex(browserProof) || !hex(nonce) || typeof idToken !== 'string' || !idToken || idToken.length > 32768) deny();
        time();
        // Consume before the external verifier. Races/replays/failures cannot repeat verification.
        const claimed = await transition(attemptId, 'NEW', value => {
          const row = attempt(value, 'NEW', attemptId, time());
          requireBrowserProof(row, browserProof);
          if (row.nonceHash !== hash(nonce)) deny();
          return Object.freeze({ ...row, phase: 'CONSUMED' });
        });
        const bound = attempt(claimed, 'CONSUMED', attemptId, time());
        requireBrowserProof(bound, browserProof);
        if (bound.nonceHash !== hash(nonce)) deny();
        const verified = await verify(idToken, nonce);
        const at = time();
        attempt(bound, 'CONSUMED', attemptId, at); // No stale pre-I/O freshness check.
        const identity = data(verified, ['issuer', 'subject', 'expiresAt']);
        if (identity.issuer !== 'https://accounts.google.com' || typeof identity.subject !== 'string' ||
          !/^[A-Za-z0-9._-]{1,255}$/.test(identity.subject) || !Number.isSafeInteger(identity.expiresAt) ||
          identity.expiresAt <= at) deny();
        return Object.freeze({ profile: PROFILE, attemptId, context: c.context,
          principal: Object.freeze({ issuer: identity.issuer, sub: identity.subject }),
          verifiedAtMs: at, googleTokenExpiresAtMs: identity.expiresAt });
      } catch (error) {
        if (error instanceof AttemptStoreError) throw error;
        return deny();
      }
    },
  });
}

/** Google-backed factory: no client, cert/key or verifier override, fixture flag or fallback.
 * @param {{configuration: Configuration, attempts: AttemptPort, now?: () => number}} options
 */
function createGoogleLoginProofValidator(options) {
  const o = data(options, ['configuration', 'attempts'], ['now']);
  const c = configuration(o.configuration);
  return createLoginProofValidator({ configuration: c, attempts: o.attempts, now: o.now ?? Date.now,
    verifier: createGoogleVerifier({ clientId: c.clientId, now: o.now ?? Date.now }) });
}
module.exports = { createGoogleLoginProofValidator, createLoginProofValidator };
