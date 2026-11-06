'use strict';
const { deny } = require('./security.cjs');
const { data, configuration, bindingDigest, operationId } = require('./bd2-attempt-contract.cjs');
const { authorityKey } = require('./bd2-user-contract.cjs');
const { createTrustedSessionHandoff } = require('./bd2-trusted-session-handoff.cjs');
const { validateAttemptEnvelope } = require('./firestore-attempt-store.cjs');
const { validateDispatchJournalRecord, intentId } = require('./firestore-dispatch-journal.cjs');
const CONTEXT = ['environment', 'applicationAudience', 'expectedScriptId'];
const sameContext = (a, b) => CONTEXT.every(key => a[key] === b[key]);

// A private read-only port pinned to the same SDK instance used to construct D1.
// SDK references are trusted infrastructure; neither references nor snapshots escape.
function documentReader(firestore, collectionId) {
  const collection = firestore.collection(collectionId);
  if (collection.firestore !== firestore || collection.id !== collectionId || collection.path !== collectionId) deny();
  return async id => {
    const path = `${collectionId}/${id}`, ref = collection.doc(id);
    if (ref.firestore !== firestore || ref.id !== id || ref.path !== path) deny();
    const snapshot = await ref.get();
    if (!snapshot || snapshot.exists !== true || snapshot.id !== id ||
      snapshot.ref?.firestore !== firestore || snapshot.ref.id !== id || snapshot.ref.path !== path ||
      typeof snapshot.data !== 'function') deny();
    return snapshot.data();
  };
}

/** Trusted Node construction ONLY: no owner/reader/verifier/continuation injection.
 * Captures original configuration before constructing its genuine D1 owner. Existing
 * D1 internals still revalidate immutable copies; no later configuration is consulted.
 * readOriginal consumes D1 and terminates at DATA. It grants no creation authority.
 * Future B must extend this closure's same private operation, never adopt its output.
 */
function createOriginalAttemptMetadataReader(options) {
  const o = data(options, ['firestore', 'configuration'], ['now', 'attemptCollectionId', 'journalCollectionId']);
  const c = configuration(o.configuration), firestore = o.firestore, now = o.now ?? Date.now;
  const attemptCollectionId = o.attemptCollectionId ?? 'bd2_login_attempts_v1';
  const journalCollectionId = o.journalCollectionId ?? 'bd2_dispatch_intents_v1';
  if (!firestore || typeof firestore.collection !== 'function' || typeof firestore.runTransaction !== 'function' ||
    typeof now !== 'function' || [attemptCollectionId, journalCollectionId].some(name =>
      typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(name))) deny();
  const authority = authorityKey(c.context);
  const readAttempt = documentReader(firestore, attemptCollectionId);
  const readJournal = documentReader(firestore, journalCollectionId);
  const owner = createTrustedSessionHandoff({ firestore, configuration: c, now, attemptCollectionId, journalCollectionId });

  // Unexported and reachable only through the original owner's consumed callback.
  async function readMetadata(original) {
    const a = original.attempt, j = original.journal;
    if (original.profile !== c.profile || original.authorityKey !== authority || !sameContext(original.context, c.context) ||
      a.clientId !== c.clientId || a.collectionId !== attemptCollectionId || j.collectionId !== journalCollectionId ||
      j.intentId !== intentId(a.attemptId) || j.operationId !== operationId('CLAIM', a.attemptId)) deny();

    const e = validateAttemptEnvelope(await readAttempt(a.attemptId), c, a.attemptId), row = e.attempt;
    if (row.phase !== 'CONSUMED' || e.revision !== 1 || row.createdAtMs >= row.expiresAtMs) deny();
    // Detach CLAIM before the next await; the extracted validator preserves adapter return behavior.
    const claim = data(e.claim, ['operationId', 'checkedAtMs']), digest = bindingDigest(row);
    if (digest !== e.bindingDigest || digest !== a.bindingDigest || claim.operationId !== j.operationId) deny();

    const journal = validateDispatchJournalRecord(await readJournal(j.intentId), c), b = journal.binding;
    const outcome = data(journal.outcomeRef, ['kind', 'attemptId', 'operationId', 'bindingDigest']);
    if (journal.state !== 'RESERVED' || journal.revision !== 1 ||
      b.profile !== row.profile || b.clientId !== row.clientId || !sameContext(b.context, row.context) ||
      b.attemptId !== row.attemptId || b.bindingDigest !== digest || b.operationId !== claim.operationId ||
      b.intentId !== j.intentId || b.requestDigest !== j.requestDigest ||
      b.attemptCreatedAtMs !== row.createdAtMs || b.attemptExpiresAtMs !== row.expiresAtMs ||
      outcome.kind !== 'CLAIM' || outcome.attemptId !== row.attemptId ||
      outcome.operationId !== claim.operationId || outcome.bindingDigest !== digest) deny();

    return Object.freeze({ profile: row.profile, context: Object.freeze({ ...row.context }), authorityKey: authority,
      attempt: Object.freeze({ collectionId: attemptCollectionId, clientId: row.clientId,
        attemptId: row.attemptId, bindingDigest: digest }),
      journal: Object.freeze({ collectionId: journalCollectionId, intentId: b.intentId,
        operationId: claim.operationId, requestDigest: b.requestDigest }),
      createdAtMs: row.createdAtMs, expiresAtMs: row.expiresAtMs });
  }

  return Object.freeze({
    begin: owner.begin,
    prepareOriginal: owner.prepareOriginal,
    verify: owner.verify,
    recover: owner.recover,
    readOriginal(capability, expectedBinding) {
      const count = arguments.length;
      // No await or I/O before D1's synchronous deletion, including malformed binding failures.
      return owner.consume(capability, expectedBinding, original => {
        if (count !== 2) deny(); // No per-operation overrides or continuation callbacks.
        return readMetadata(original);
      });
    },
  });
}

module.exports = { createOriginalAttemptMetadataReader };
