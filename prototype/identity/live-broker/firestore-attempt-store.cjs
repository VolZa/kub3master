'use strict';
const { Firestore } = require('@google-cloud/firestore');
const { hex, deny } = require('./security.cjs');
const { data, configuration, record, bindingDigest, operationId, AttemptStoreError } = require('./bd2-attempt-contract.cjs');

/** Isolated local factory: loopback + demo project only, insecure emulator transport, no ADC.
 * A future production client/composition requires separate approval. No environment fallback.
 */
function createLocalFirestoreClient(options) {
  const { host, projectId } = data(options, ['host', 'projectId']);
  if (!/^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(host || '') || Number(host.split(':')[1]) > 65535 ||
    !/^demo-[a-z0-9-]{1,50}$/.test(projectId || '') ||
    (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST !== host)) deny();
  // Pin the public universe so GoogleAuth does not probe ADC/metadata to discover it.
  return new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com', ignoreUndefinedProperties: false });
}

/** Implements the existing createOnce/transition port, plus read-only outcome lookup.
 * firestore is trusted SDK injection; there is no in-memory or production default.
 * NEW -> CONSUMED is still the only lifecycle transition. No deletion/TTL cleanup is exposed.
 */
function createFirestoreAttemptStore({ firestore, configuration: config, collectionId = 'bd2_login_attempts_v1',
  now = Date.now }) {
  const c = configuration(config);
  if (!firestore || typeof firestore.runTransaction !== 'function' || typeof firestore.collection !== 'function' ||
    typeof now !== 'function' || !/^[A-Za-z0-9_-]{1,100}$/.test(collectionId)) deny();
  const collection = firestore.collection(collectionId);
  let highWater = 0;
  const descriptor = (kind, id, digest) => Object.freeze({ kind, attemptId: id,
    operationId: operationId(kind, id), bindingDigest: digest });
  const rejected = d => { throw new AttemptStoreError('REJECTED', d); };
  function time() {
    const t = now();
    if (!Number.isSafeInteger(t) || t < 1 || t < highWater) deny();
    highWater = t;
    return t;
  }
  function live(row, at) {
    if (row.createdAtMs > at || row.expiresAtMs <= at) deny();
  }
  function envelope(value, id) {
    const e = data(value, ['schemaVersion', 'attempt', 'bindingDigest', 'createOperationId', 'revision', 'claim']);
    const row = record(e.attempt, c, id);
    if (e.schemaVersion !== 1 || e.bindingDigest !== bindingDigest(row) || e.createOperationId !== operationId('CREATE', id)) deny();
    if (row.phase === 'NEW') {
      if (e.revision !== 0 || e.claim !== null) deny();
    } else {
      const claim = data(e.claim, ['operationId', 'checkedAtMs']);
      if (e.revision !== 1 || claim.operationId !== operationId('CLAIM', id) ||
        !Number.isSafeInteger(claim.checkedAtMs) || claim.checkedAtMs < row.createdAtMs ||
        claim.checkedAtMs >= row.expiresAtMs) deny();
    }
    return { ...e, attempt: row };
  }
  async function transaction(d, update) {
    // One outer attempt only. maxAttempts disables SDK callback retries, not all RPC retries.
    // ABORTED can describe a repeated Commit RPC after an earlier successful commit.
    // No numeric SDK code proves original-operation abort: uncertainty is lookup-only.
    try { return await firestore.runTransaction(update, { maxAttempts: 1 }); }
    catch (error) {
      if (error instanceof AttemptStoreError) throw error; // Our pre-write validation rejection.
      throw new AttemptStoreError('UNKNOWN', d);
    }
  }
  return Object.freeze({
    async createOnce(id, value) {
      const row = record(value, c, id), d = descriptor('CREATE', id, bindingDigest(row));
      if (row.phase !== 'NEW') rejected(d);
      const ref = collection.doc(id);
      return transaction(d, async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists) rejected(d);
        try { live(row, time()); } catch { return rejected(d); }
        tx.create(ref, { schemaVersion: 1, attempt: row, bindingDigest: d.bindingDigest,
          createOperationId: d.operationId, revision: 0, claim: null });
      });
    },
    async transition(id, phase, update) {
      if (!hex(id) || phase !== 'NEW' || typeof update !== 'function') deny();
      const ref = collection.doc(id);
      // Binding is filled only after an authoritative read; UNKNOWN before read remains lookup-by-ID.
      let digest = null;
      const d = () => descriptor('CLAIM', id, digest);
      try {
        return await transaction(d(), async tx => {
          const snapshot = await tx.get(ref);
          if (!snapshot.exists) rejected(d());
          let e, next, at;
          try {
            e = envelope(snapshot.data(), id); digest = e.bindingDigest;
            at = time(); live(e.attempt, at);
            if (e.attempt.phase !== 'NEW') rejected(d());
            next = record(update(e.attempt), c, id);
            if (next.phase !== 'CONSUMED' || bindingDigest(next) !== digest) rejected(d());
            at = time(); live(next, at);
          } catch (error) {
            if (error instanceof AttemptStoreError) throw error;
            return rejected(d());
          }
          tx.update(ref, { attempt: next, revision: 1,
            claim: { operationId: operationId('CLAIM', id), checkedAtMs: at } });
          return next; // SDK resolves runTransaction only after confirmed commit.
        });
      } catch (error) {
        if (error instanceof AttemptStoreError) throw new AttemptStoreError(error.outcome, d());
        throw error;
      }
    },
    async lookup(query) {
      const q = data(query, ['kind', 'attemptId', 'operationId', 'bindingDigest']);
      if (!['CREATE', 'CLAIM'].includes(q.kind) || !hex(q.attemptId) ||
        q.operationId !== operationId(q.kind, q.attemptId) || (q.bindingDigest !== null && !hex(q.bindingDigest))) deny();
      let snapshot;
      try { snapshot = await collection.doc(q.attemptId).get(); }
      catch { return Object.freeze({ status: 'UNAVAILABLE' }); }
      if (!snapshot.exists) return Object.freeze({ status: 'UNKNOWN' });
      let e;
      try {
        e = envelope(snapshot.data(), q.attemptId);
        if (q.bindingDigest !== null && q.bindingDigest !== e.bindingDigest) deny();
      } catch { return Object.freeze({ status: 'INVALID' }); }
      if (q.kind === 'CLAIM' && e.claim === null) return Object.freeze({ status: 'UNKNOWN' });
      return Object.freeze({ status: 'COMMITTED', kind: q.kind, attemptId: q.attemptId,
        operationId: q.operationId, bindingDigest: e.bindingDigest, phase: e.attempt.phase, revision: e.revision,
        checkedAtMs: q.kind === 'CLAIM' ? e.claim.checkedAtMs : null,
        createdAtMs: e.attempt.createdAtMs, expiresAtMs: e.attempt.expiresAtMs });
    },
  });
}
module.exports = { createLocalFirestoreClient, createFirestoreAttemptStore };
