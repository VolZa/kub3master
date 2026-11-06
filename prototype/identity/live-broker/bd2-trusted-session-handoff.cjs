'use strict';
const { deny } = require('./security.cjs');
const { data, configuration } = require('./bd2-attempt-contract.cjs');
const { authorityKey } = require('./bd2-user-contract.cjs');
const { createIsolatedJournaledLoginProof } = require('./bd2-dispatch-coordinator.cjs');

// Compare exact own data trees without invoking getters, toJSON or caller equality hooks.
// This checks a consumer's expected binding; it NEVER registers provenance from data.
function match(expected, actual) {
  const value = data(expected, Object.keys(actual));
  for (const key of Object.keys(actual)) {
    if (actual[key] && typeof actual[key] === 'object') match(value[key], actual[key]);
    else if (value[key] !== actual[key]) deny();
  }
}

/** Trusted server composition ONLY. firestore/configuration/names/clock are TCB inputs,
 * never browser options. No verifier, loginProof, proof DTO or outcome injection exists.
 * Owns the original journaled Google flow and its process-local one-use handoffs.
 * Does not issue sessions, authorize access, or establish issuance-time freshness.
 */
function createTrustedSessionHandoff(options) {
  const o = data(options, ['firestore', 'configuration'], ['now', 'attemptCollectionId', 'journalCollectionId']);
  const c = configuration(o.configuration), authority = authorityKey(c.context);
  const attemptCollectionId = o.attemptCollectionId ?? 'bd2_login_attempts_v1';
  const journalCollectionId = o.journalCollectionId ?? 'bd2_dispatch_intents_v1';
  if (typeof attemptCollectionId !== 'string' || typeof journalCollectionId !== 'string') deny();
  const original = createIsolatedJournaledLoginProof({ firestore: o.firestore, configuration: c,
    now: o.now ?? Date.now, attemptCollectionId, journalCollectionId });
  const capabilities = new WeakMap();
  return Object.freeze({
    begin: original.begin,
    prepareOriginal: original.prepareOriginal,
    recover: original.recover, // Read-only outcomes cannot reach the private mint below.
    async verify(handle, request) {
      const outcome = await original.verify(handle, request);
      if (outcome.status !== 'VERIFIED') return outcome;
      // Only this invocation of the private, real composition can reach this point.
      // Its validator has confirmed claim + Google verification + post-I/O freshness.
      const p = outcome.proof, d = outcome.descriptor;
      const binding = Object.freeze({ profile: p.profile, context: p.context, authorityKey: authority,
        principal: p.principal,
        attempt: Object.freeze({ collectionId: attemptCollectionId, clientId: c.clientId,
          attemptId: p.attemptId, bindingDigest: d.bindingDigest }),
        journal: Object.freeze({ collectionId: journalCollectionId, intentId: d.intentId,
          operationId: d.operationId, requestDigest: d.requestDigest }),
        verifiedAtMs: p.verifiedAtMs, googleTokenExpiresAtMs: p.googleTokenExpiresAtMs });
      const capability = Object.freeze({});
      capabilities.set(capability, binding);
      // Server-internal extension only; the existing coordinator's result/API is unchanged.
      return Object.freeze({ ...outcome, handoff: Object.freeze({ capability, binding }) });
    },
    consume(capability, expectedBinding, dispatch) {
      const binding = capabilities.get(capability);
      capabilities.delete(capability); // Synchronous, before validation, callbacks, await or I/O.
      if (!binding) deny(); // No property access on an unknown object (including accessors).
      try {
        match(expectedBinding, binding);
        if (typeof dispatch !== 'function') deny();
        // The trusted consumer receives only the immutable, token-free bound snapshot.
        // Every failure burns the capability, including rejection/UNKNOWN after dispatch.
        return Promise.resolve(dispatch(binding)).catch(() => deny());
      } catch { return deny(); }
    },
  });
}

module.exports = { createTrustedSessionHandoff };
