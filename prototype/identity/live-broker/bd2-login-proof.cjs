'use strict';
const { createGoogleVerifier, requireBrowserProof, random, hex, deny } = require('./security.cjs');

/**
 * Isolated Node component; not imported by server.cjs, GAS or production authorization.
 * Reuses the Google library verifier and broker browser-proof/atomic-transition pattern.
 * No Users, sessions, cookies, assertions, channel, HTTP endpoint or permission grants.
 *
 * @typedef {{environment: 'PRODUCTION'|'TEST', applicationAudience: string, expectedScriptId: string}} Context
 * @typedef {{profile: 'KUB_ERP_SESSION_BD2_V1', clientId: string, context: Context, attemptTtlMs: number}} Configuration
 * @typedef {{profile: string, clientId: string, context: Context, attemptId: string, nonce: string,
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
 * Shared durable adapter, retention/clock/UNKNOWN recovery evidence remain future work.
 */
const PROFILE = 'KUB_ERP_SESSION_BD2_V1';
const CONTEXT_KEYS = ['environment', 'applicationAudience', 'expectedScriptId'];
const ATTEMPT_KEYS = ['profile', 'clientId', 'context', 'attemptId', 'nonce', 'proofHash',
  'createdAtMs', 'expiresAtMs', 'phase'];

// Detach exact plain data before awaiting anything. Accessors/symbols/claimed identity fields deny.
function data(value, required, optional = []) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) deny();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (required.some(k => !Object.hasOwn(descriptors, k)) || keys.some(k =>
    ![...required, ...optional].includes(k) || !Object.hasOwn(descriptors[k], 'value') || !descriptors[k].enumerable)) deny();
  return Object.fromEntries(keys.map(k => [k, descriptors[k].value]));
}
function configuration(value) {
  const c = data(value, ['profile', 'clientId', 'context', 'attemptTtlMs']);
  const context = data(c.context, CONTEXT_KEYS);
  if (c.profile !== PROFILE || typeof c.clientId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com$/.test(c.clientId) ||
    !['PRODUCTION', 'TEST'].includes(context.environment) ||
    typeof context.applicationAudience !== 'string' || !/^[A-Za-z0-9._:/-]{1,200}$/.test(context.applicationAudience) ||
    typeof context.expectedScriptId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(context.expectedScriptId) ||
    !Number.isSafeInteger(c.attemptTtlMs) || c.attemptTtlMs < 1 || c.attemptTtlMs > 120_000) deny();
  return Object.freeze({ ...c, context: Object.freeze(context) });
}

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
    const row = data(value, ATTEMPT_KEYS), context = data(row.context, CONTEXT_KEYS);
    if (row.phase !== phase || row.profile !== PROFILE || row.clientId !== c.clientId || row.attemptId !== id ||
      CONTEXT_KEYS.some(k => context[k] !== c.context[k]) || !hex(row.nonce) || !hex(row.proofHash) ||
      !Number.isSafeInteger(row.createdAtMs) || row.createdAtMs < 1 || row.createdAtMs > at ||
      !Number.isSafeInteger(row.expiresAtMs) || row.expiresAtMs !== row.createdAtMs + c.attemptTtlMs ||
      row.expiresAtMs <= at) deny();
    return Object.freeze({ ...row, context: Object.freeze(context) });
  }
  return Object.freeze({
    async begin(request) {
      try {
        const { browserProofHash } = data(request, ['browserProofHash']);
        if (!hex(browserProofHash)) deny();
        const createdAtMs = time(), expiresAtMs = createdAtMs + c.attemptTtlMs;
        if (!Number.isSafeInteger(expiresAtMs)) deny();
        const record = Object.freeze({ profile: PROFILE, clientId: c.clientId, context: c.context,
          attemptId: random(), nonce: random(), proofHash: browserProofHash, createdAtMs, expiresAtMs, phase: 'NEW' });
        await createOnce(record.attemptId, record);
        attempt(record, 'NEW', record.attemptId, time());
        return Object.freeze({ attemptId: record.attemptId, nonce: record.nonce, expiresAtMs });
      } catch { return deny(); }
    },
    async verify(request) {
      try {
        const { attemptId, browserProof, idToken } = data(request, ['attemptId', 'browserProof', 'idToken']);
        if (!hex(attemptId) || !hex(browserProof) || typeof idToken !== 'string' || !idToken || idToken.length > 32768) deny();
        time();
        // Consume before the external verifier. Races/replays/failures cannot repeat verification.
        const claimed = await transition(attemptId, 'NEW', value => {
          const row = attempt(value, 'NEW', attemptId, time());
          requireBrowserProof(row, browserProof);
          return Object.freeze({ ...row, phase: 'CONSUMED' });
        });
        const bound = attempt(claimed, 'CONSUMED', attemptId, time());
        requireBrowserProof(bound, browserProof);
        const verified = await verify(idToken, bound.nonce);
        const at = time();
        attempt(bound, 'CONSUMED', attemptId, at); // No stale pre-I/O freshness check.
        const identity = data(verified, ['issuer', 'subject', 'expiresAt']);
        if (identity.issuer !== 'https://accounts.google.com' || typeof identity.subject !== 'string' ||
          !/^[A-Za-z0-9._-]{1,255}$/.test(identity.subject) || !Number.isSafeInteger(identity.expiresAt) ||
          identity.expiresAt <= at) deny();
        return Object.freeze({ profile: PROFILE, attemptId, context: c.context,
          principal: Object.freeze({ issuer: identity.issuer, sub: identity.subject }),
          verifiedAtMs: at, googleTokenExpiresAtMs: identity.expiresAt });
      } catch { return deny(); }
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
