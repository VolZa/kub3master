'use strict';
const { hash, hex, deny } = require('./security.cjs');
const { data, configuration, operationId } = require('./bd2-attempt-contract.cjs');
const CONTEXT = ['environment', 'applicationAudience', 'expectedScriptId'];
const BINDING = ['profile', 'clientId', 'context', 'intentId', 'attemptId', 'operationId',
  'bindingDigest', 'requestDigest', 'attemptCreatedAtMs', 'attemptExpiresAtMs'];
const REFERENCE = ['intentId', 'attemptId', 'operationId', 'bindingDigest', 'requestDigest'];

function intentId(attemptId) {
  if (!hex(attemptId)) deny();
  return hash(JSON.stringify(['KUB_BD2_DISPATCH_INTENT_V1', attemptId, operationId('CLAIM', attemptId)]));
}
function reference(value) {
  return Object.freeze(Object.fromEntries(REFERENCE.map(k => [k, value[k]])));
}
function readReference(value) {
  const r = data(value, REFERENCE);
  if (!hex(r.attemptId) || r.intentId !== intentId(r.attemptId) || r.operationId !== operationId('CLAIM', r.attemptId) ||
    (r.bindingDigest !== null && !hex(r.bindingDigest)) || !hex(r.requestDigest)) deny();
  return Object.freeze(r);
}
function readBinding(value, config) {
  const b = data(value, BINDING), context = data(b.context, CONTEXT);
  readReference(reference(b));
  if (!hex(b.bindingDigest) || b.profile !== config.profile || b.clientId !== config.clientId ||
    CONTEXT.some(k => context[k] !== config.context[k]) ||
    !Number.isSafeInteger(b.attemptCreatedAtMs) || b.attemptCreatedAtMs < 1 ||
    !Number.isSafeInteger(b.attemptExpiresAtMs) || b.attemptExpiresAtMs !== b.attemptCreatedAtMs + config.attemptTtlMs) deny();
  return Object.freeze({ ...b, context: Object.freeze(context) });
}
function sameBinding(a, b) {
  return BINDING.every(k => k === 'context' ? CONTEXT.every(c => a.context[c] === b.context[c]) : a[k] === b[k]);
}
function outcomeReference(b) {
  return Object.freeze({ kind: 'CLAIM', attemptId: b.attemptId, operationId: b.operationId, bindingDigest: b.bindingDigest });
}
// Internal pure validator; config is the caller's captured, validated configuration.
function validateDispatchJournalRecord(value, config) {
  const r = data(value, ['schemaVersion', 'binding', 'createdAtMs', 'state', 'revision', 'reservedAtMs', 'outcomeRef']);
  const b = readBinding(r.binding, config), ref = data(r.outcomeRef, ['kind', 'attemptId', 'operationId', 'bindingDigest']);
  if (r.schemaVersion !== 1 || !Number.isSafeInteger(r.createdAtMs) || r.createdAtMs < b.attemptCreatedAtMs ||
    r.createdAtMs >= b.attemptExpiresAtMs || Object.keys(ref).some(k => ref[k] !== outcomeReference(b)[k])) deny();
  if (r.state === 'INTENT') {
    if (r.revision !== 0 || r.reservedAtMs !== null) deny();
  } else if (r.state === 'RESERVED') {
    if (r.revision !== 1 || !Number.isSafeInteger(r.reservedAtMs) ||
      r.reservedAtMs < r.createdAtMs || r.reservedAtMs >= b.attemptExpiresAtMs) deny();
  } else deny();
  return { ...r, binding: b };
}
class DispatchJournalError extends Error {
  constructor(outcome, descriptor) {
    super('ACCESS_DENIED'); this.name = 'DispatchJournalError'; this.outcome = outcome;
    this.descriptor = readReference(descriptor);
  }
}

/** Backend-only SDK port; never selected by browser data. No deletion, adoption, lease or reset.
 * Shared exclusion is Firestore create-if-absent + conditional reservation, not these WeakMaps.
 * Local permits only prove this invocation received confirmed acknowledgement; they cannot be
 * serialized, reissued from lookup or restored after restart. Lost permits sacrifice progress.
 */
function createFirestoreDispatchJournal({ firestore, configuration: config,
  collectionId = 'bd2_dispatch_intents_v1', now = Date.now }) {
  const c = configuration(config);
  if (!firestore || typeof firestore.runTransaction !== 'function' || typeof firestore.collection !== 'function' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(collectionId) || typeof now !== 'function') deny();
  const collection = firestore.collection(collectionId), preparations = new WeakMap(), dispatches = new WeakMap();
  let highWater = 0;
  function time() {
    const at = now();
    if (!Number.isSafeInteger(at) || at < 1 || at < highWater) deny();
    highWater = at; return at;
  }
  function live(binding, at) {
    if (binding.attemptCreatedAtMs > at || binding.attemptExpiresAtMs <= at) deny();
  }
  async function transaction(ref, callback) {
    // F-01: never turn any numeric SDK code into another outer transaction.
    // maxAttempts=1 does not disable all lower-level RPC retries.
    try { return await firestore.runTransaction(callback, { maxAttempts: 1 }); }
    catch (e) {
      if (e instanceof DispatchJournalError) throw e;
      throw new DispatchJournalError('UNKNOWN', ref);
    }
  }
  function reject(ref) { throw new DispatchJournalError('REJECTED', ref); }
  return Object.freeze({
    async createIntent(value) {
      const b = readBinding(value, c), ref = reference(b), doc = collection.doc(b.intentId);
      const created = await transaction(ref, async tx => {
        const snapshot = await tx.get(doc);
        if (snapshot.exists) {
          try { if (!sameBinding(validateDispatchJournalRecord(snapshot.data(), c).binding, b)) deny(); }
          catch { return reject(ref); }
          return false; // Existing INTENT is never adopted, even if no reservation occurred.
        }
        let at; try { at = time(); live(b, at); } catch { return reject(ref); }
        tx.create(doc, { schemaVersion: 1, binding: b, createdAtMs: at,
          state: 'INTENT', revision: 0, reservedAtMs: null, outcomeRef: outcomeReference(b) });
        return true;
      });
      if (!created) return Object.freeze({ status: 'LOOKUP_ONLY', descriptor: ref });
      try { live(b, time()); } catch { return Object.freeze({ status: 'LOOKUP_ONLY', descriptor: ref }); }
      const preparation = Object.freeze({}); preparations.set(preparation, b);
      return Object.freeze({ status: 'PREPARED', descriptor: ref, preparation });
    },
    async reserve(preparation, value) {
      const b = readBinding(value, c), ref = reference(b), owned = preparations.get(preparation);
      preparations.delete(preparation); // Consume before I/O, including UNKNOWN before commit.
      if (!owned || !sameBinding(owned, b)) return Object.freeze({ status: 'LOOKUP_ONLY', descriptor: ref });
      const reserved = await transaction(ref, async tx => {
        const doc = collection.doc(b.intentId), snapshot = await tx.get(doc);
        if (!snapshot.exists) return reject(ref);
        let r, at;
        try { r = validateDispatchJournalRecord(snapshot.data(), c); if (!sameBinding(r.binding, b)) deny(); }
        catch { return reject(ref); }
        if (r.state !== 'INTENT') return false;
        try { at = time(); live(b, at); if (at < r.createdAtMs) deny(); } catch { return reject(ref); }
        tx.update(doc, { state: 'RESERVED', revision: 1, reservedAtMs: at });
        return true;
      });
      if (!reserved) return Object.freeze({ status: 'LOOKUP_ONLY', descriptor: ref });
      try { live(b, time()); } catch { return Object.freeze({ status: 'LOOKUP_ONLY', descriptor: ref }); }
      const permit = Object.freeze({}); dispatches.set(permit, b);
      return Object.freeze({ status: 'GRANTED', descriptor: ref, permit });
    },
    takeDispatchPermit(permit, value) {
      const b = readBinding(value, c), owned = dispatches.get(permit);
      dispatches.delete(permit);
      if (!owned || !sameBinding(owned, b)) return false;
      live(b, time()); return true;
    },
    async lookup(value) {
      const ref = readReference(value); let snapshot;
      try { snapshot = await collection.doc(ref.intentId).get(); }
      catch { return Object.freeze({ status: 'UNAVAILABLE' }); }
      if (!snapshot.exists) return Object.freeze({ status: 'UNKNOWN' });
      try {
        const r = validateDispatchJournalRecord(snapshot.data(), c), actual = reference(r.binding);
        if (r.binding.intentId !== ref.intentId || actual.requestDigest !== ref.requestDigest ||
          (ref.bindingDigest !== null && actual.bindingDigest !== ref.bindingDigest)) deny();
        return Object.freeze({ status: 'FOUND', descriptor: actual, state: r.state, revision: r.revision,
          createdAtMs: r.createdAtMs, reservedAtMs: r.reservedAtMs, outcomeRef: outcomeReference(r.binding) });
      } catch { return Object.freeze({ status: 'INVALID' }); }
    },
  });
}
module.exports = { createFirestoreDispatchJournal, DispatchJournalError, intentId, reference, readReference, readBinding,
  validateDispatchJournalRecord };
