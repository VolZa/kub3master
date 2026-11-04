'use strict';
const { hash, hex, deny } = require('./security.cjs');
const { data, configuration, record, bindingDigest, operationId, AttemptStoreError } = require('./bd2-attempt-contract.cjs');
const { createGoogleLoginProofValidator } = require('./bd2-login-proof.cjs');
const { createFirestoreAttemptStore } = require('./firestore-attempt-store.cjs');
const { createFirestoreDispatchJournal, DispatchJournalError, intentId, reference, readReference, readBinding } = require('./firestore-dispatch-journal.cjs');

function request(value) {
  const r = data(value, ['attemptId', 'nonce', 'browserProof', 'idToken']);
  if (!hex(r.attemptId) || !hex(r.nonce) || !hex(r.browserProof) ||
    typeof r.idToken !== 'string' || !r.idToken || r.idToken.length > 32768) deny();
  return Object.freeze(r);
}
function requestDigest(r, c) {
  return hash(JSON.stringify(['KUB_BD2_DISPATCH_REQUEST_V1', c.profile, c.clientId,
    c.context.environment, c.context.applicationAudience, c.context.expectedScriptId,
    r.attemptId, hash(r.nonce), hash(r.browserProof), hash(r.idToken)]));
}

/** Server-only coordinator. prepareOriginal is explicit setup for a fresh completion request.
 * verify NEVER prepares, recreates, adopts or retries intent/reservation. Its opaque local handle
 * is one-use; a copied/lost handle is recovery-only. recover is read-only, even if state is NEW/missing.
 * No raw request is retained in handles/journal. Permits are dispatch control, not ERP credentials.
 */
function createDispatchCoordinator(options) {
  const o = data(options, ['configuration', 'journal', 'attempts', 'loginProof'], ['now']);
  const c = configuration(o.configuration), now = o.now ?? Date.now, handles = new WeakMap();
  if (typeof now !== 'function' || !['createIntent', 'reserve', 'takeDispatchPermit', 'lookup'].every(k => typeof o.journal?.[k] === 'function') ||
    typeof o.attempts?.lookup !== 'function' || typeof o.loginProof?.verify !== 'function' || typeof o.loginProof?.begin !== 'function') deny();
  const journal = o.journal, lookup = o.attempts.lookup.bind(o.attempts);
  const complete = o.loginProof.verify.bind(o.loginProof), begin = o.loginProof.begin.bind(o.loginProof);
  let highWater = 0;
  function time() {
    const t = now(); if (!Number.isSafeInteger(t) || t < 1 || t < highWater) deny(); highWater = t; return t;
  }
  async function recover(value) {
    const ref = readReference(value);
    let saved;
    try { saved = await journal.lookup(ref); }
    catch { saved = Object.freeze({ status: 'UNAVAILABLE' }); }
    if (!saved || !['FOUND', 'UNKNOWN', 'INVALID', 'UNAVAILABLE'].includes(saved.status)) deny();
    if (saved.status === 'INVALID' || saved.status === 'UNAVAILABLE') {
      return Object.freeze({ status: 'LOOKUP_ONLY', descriptor: ref, journal: saved,
        outcome: Object.freeze({ status: saved.status }) });
    }
    const original = saved.status === 'FOUND' ? readReference(saved.descriptor) : ref;
    let outcome;
    try { outcome = await lookup({ kind: 'CLAIM', attemptId: original.attemptId,
      operationId: original.operationId, bindingDigest: original.bindingDigest }); }
    catch { outcome = Object.freeze({ status: 'UNAVAILABLE' }); }
    return Object.freeze({ status: 'LOOKUP_ONLY', descriptor: original, journal: saved, outcome });
  }
  return Object.freeze({
    begin,
    async prepareOriginal(value) {
      const r = request(value), digest = requestDigest(r, c);
      const initial = Object.freeze({ intentId: intentId(r.attemptId), attemptId: r.attemptId,
        operationId: operationId('CLAIM', r.attemptId), bindingDigest: null, requestDigest: digest });
      let receipt;
      try { receipt = await lookup({ kind: 'CREATE', attemptId: r.attemptId,
        operationId: operationId('CREATE', r.attemptId), bindingDigest: null }); }
      catch { return recover(initial); }
      if (!receipt || receipt.status !== 'COMMITTED') return recover(initial);
      if (receipt.kind !== 'CREATE' || receipt.attemptId !== r.attemptId ||
        receipt.operationId !== operationId('CREATE', r.attemptId)) deny();
      const row = record({ profile: c.profile, clientId: c.clientId, context: c.context,
        attemptId: r.attemptId, nonceHash: hash(r.nonce), proofHash: hash(r.browserProof),
        createdAtMs: receipt.createdAtMs, expiresAtMs: receipt.expiresAtMs, phase: receipt.phase }, c, r.attemptId);
      if (bindingDigest(row) !== receipt.bindingDigest) deny();
      const b = readBinding({ profile: c.profile, clientId: c.clientId, context: c.context,
        ...initial, bindingDigest: receipt.bindingDigest, attemptCreatedAtMs: row.createdAtMs,
        attemptExpiresAtMs: row.expiresAtMs }, c), ref = reference(b);
      const existing = await journal.lookup(ref);
      if (!existing || existing.status !== 'UNKNOWN' || row.phase !== 'NEW') return recover(ref);
      const at = time(); if (at < row.createdAtMs || at >= row.expiresAtMs) return recover(ref);
      try {
        const prepared = await journal.createIntent(b);
        if (prepared.status !== 'PREPARED') return recover(ref);
        const handle = Object.freeze({ descriptor: ref });
        handles.set(handle, Object.freeze({ binding: b, preparation: prepared.preparation }));
        return Object.freeze({ status: 'PREPARED', descriptor: ref, handle });
      } catch (e) {
        if (!(e instanceof DispatchJournalError)) throw e;
        return Object.freeze({ ...await recover(ref), dispatchOutcome: e.outcome });
      }
    },
    async verify(handle, value) {
      const r = request(value), h = data(handle, ['descriptor']), ref = readReference(h.descriptor);
      if (ref.attemptId !== r.attemptId || ref.requestDigest !== requestDigest(r, c)) deny();
      const owned = handles.get(handle);
      handles.delete(handle); // Before reservation I/O; UNKNOWN cannot leave a reusable local handle.
      if (!owned) return recover(ref);
      try {
        const reservation = await journal.reserve(owned.preparation, owned.binding);
        if (reservation.status !== 'GRANTED' || !journal.takeDispatchPermit(reservation.permit, owned.binding)) return recover(ref);
      } catch (e) {
        if (!(e instanceof DispatchJournalError)) throw e;
        return Object.freeze({ ...await recover(ref), dispatchOutcome: e.outcome });
      }
      // Reservation and claim are separate transactions. This effect is outside both callbacks.
      try { return Object.freeze({ status: 'VERIFIED', proof: await complete(r), descriptor: ref }); }
      catch (e) {
        return Object.freeze({ ...await recover(ref), dispatchOutcome: e instanceof AttemptStoreError ? e.outcome : 'DENIED' });
      }
    },
    recover,
  });
}

/** Isolated composition/test entrypoint. No HTTP/GAS registration or fixture overrides. */
function createIsolatedJournaledLoginProof(options) {
  const o = data(options, ['firestore', 'configuration'], ['now', 'attemptCollectionId', 'journalCollectionId']);
  const c = configuration(o.configuration), now = o.now ?? Date.now;
  const attempts = createFirestoreAttemptStore({ firestore: o.firestore, configuration: c, now,
    collectionId: o.attemptCollectionId ?? 'bd2_login_attempts_v1' });
  const journal = createFirestoreDispatchJournal({ firestore: o.firestore, configuration: c, now,
    collectionId: o.journalCollectionId ?? 'bd2_dispatch_intents_v1' });
  const loginProof = createGoogleLoginProofValidator({ configuration: c, attempts, now });
  return createDispatchCoordinator({ configuration: c, attempts, journal, loginProof, now });
}
module.exports = { createDispatchCoordinator, createIsolatedJournaledLoginProof, requestDigest };
