'use strict';
const { deny, hex } = require('./security.cjs');
const { data, configuration, bindingDigest, operationId } = require('./bd2-attempt-contract.cjs');
const { authorityKey } = require('./bd2-user-contract.cjs');
const { createTrustedSessionHandoff } = require('./bd2-trusted-session-handoff.cjs');
const { validateAttemptEnvelope } = require('./firestore-attempt-store.cjs');
const { validateDispatchJournalRecord, intentId } = require('./firestore-dispatch-journal.cjs');
const { createCreationClockGuard, isPreFixationTimeValid, isPostFixationTimeValid } = require('./bd2-creation-clock.cjs');
const { createSessionCreationCoordinator } = require('./bd2-session-creation-coordinator.cjs');
const session = require('./bd2-session-contract.cjs');
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

// Module-private construction shared by the two distinct facades. Never exported:
// neither a raw owner nor a reader/continuation supplied by callers is accepted.
function originalOperation(o) {
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

  return { owner, readMetadata, configuration: c, firestore, now };
}

/** Compatible A2 data-only facade. Reading metadata spends D1 and ends progression. */
function createOriginalAttemptMetadataReader(options) {
  const o = data(options, ['firestore', 'configuration'], ['now', 'attemptCollectionId', 'journalCollectionId']);
  const { owner, readMetadata } = originalOperation(o);
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

/** Isolated trusted Node construction, NOT production D3 registration. target and
 * clocks are trusted infrastructure, never request options. No default target exists.
 * Only canonical command/descriptor DATA cross target entry; its result is discarded.
 */
function createTrustedSessionCreationComposition(options) {
  const o = data(options, ['firestore', 'configuration', 'target'],
    ['now', 'monotonicNow', 'attemptCollectionId', 'journalCollectionId']);
  const target = o.target, monotonicNow = o.monotonicNow ?? (() => process.hrtime.bigint());
  if (typeof target !== 'function' || typeof monotonicNow !== 'function') deny();
  const { owner, readMetadata, configuration: c, firestore, now } = originalOperation(o);
  const intents = createSessionCreationCoordinator({ firestore, context: c.context });
  const permits = new WeakMap();
  const report = (status, intentStatus, dispatchStatus, descriptor) => Object.freeze({
    status, intentStatus, dispatchStatus, ...(descriptor ? { descriptor } : {}),
  });

  // No await, validation, clock/source callback or target lookup before deletion.
  function consumePermit(permit, operation) {
    const owned = permits.get(permit);
    permits.delete(permit);
    if (owned !== operation || operation.target !== target) deny();
    if (!isPostFixationTimeValid({ ...operation.timing, t: operation.guard.observe() })) deny();
  }

  return Object.freeze({
    begin: owner.begin,
    prepareOriginal: owner.prepareOriginal,
    verify: owner.verify,
    recover: owner.recover,
    lookupIntent: descriptor => intents.lookupIntent(descriptor), // Data only; never resumes completion.
    completeOriginal(capability, expectedBinding, input) {
      const count = arguments.length;
      return owner.consume(capability, expectedBinding, async original => {
        let descriptor, permit, entered = false, intentStatus = 'NOT_SUBMITTED';
        try {
          if (count !== 3) deny();
          const seed = data(input, ['commandId', 'sessionDigest']);
          if (!hex(seed.commandId) || !hex(seed.sessionDigest)) deny();
          // Detached scalars before any asynchronous work; no caller command/S/principal.
          Object.freeze(seed);
          const guard = createCreationClockGuard({ wallNow: now, monotonicNow });
          guard.observe(); // Anchor after D1 deletion, before first metadata I/O. Not S.
          const metadata = await readMetadata(original);
          const pre = Object.freeze({ C: metadata.createdAtMs, D: metadata.expiresAtMs,
            V: original.verifiedAtMs, G: original.googleTokenExpiresAtMs });
          if (!isPreFixationTimeValid({ ...pre, t: guard.observe() })) deny();
          const S = guard.observe(); // Distinct fixation observation, outside any transaction.
          const timing = Object.freeze({ ...pre, S });
          if (!isPostFixationTimeValid({ ...timing, t: S })) deny();
          const command = session.createCommand(c.context, { ...seed, kind: 'CREATE_SESSION',
            attempt: original.attempt, principal: original.principal, createdAtMs: S });
          descriptor = session.descriptor(c.context, command);
          const operation = Object.freeze({ original, metadata, timing, command, descriptor, guard, target });
          if (!isPostFixationTimeValid({ ...timing, t: guard.observe() })) deny();
          intentStatus = 'UNKNOWN'; // Any exception after submission cannot establish rollback.
          const outcome = data(await intents.createOriginal(command), ['status', 'descriptor']);
          if (!['NEW', 'EXISTING', 'CONFLICT', 'INVALID', 'UNKNOWN'].includes(outcome.status)) deny();
          const returned = session.validateDescriptor(c.context, outcome.descriptor);
          if (Object.keys(descriptor).some(key => returned[key] !== descriptor[key])) deny();
          intentStatus = outcome.status;
          if (!isPostFixationTimeValid({ ...timing, t: guard.observe() })) deny();
          if (intentStatus !== 'NEW') return report(intentStatus === 'UNKNOWN' ? 'UNKNOWN' : 'DENIED',
            intentStatus, 'NOT_INVOKED', descriptor);

          permit = Object.freeze({});
          permits.set(permit, operation); // Only this original NEW continuation can mint.
          consumePermit(permit, operation);
          entered = true; // Before calling: throw/rejection/thenable failure is potentially UNKNOWN.
          await target(command, descriptor);
          return report('TARGET_RETURNED', intentStatus, 'RETURNED', descriptor);
        } catch {
          if (!descriptor) return deny(); // D1 also sanitizes; no original snapshot escapes.
          return report(entered || intentStatus === 'UNKNOWN' ? 'UNKNOWN' : 'DENIED', intentStatus,
            entered ? 'UNKNOWN' : 'NOT_INVOKED', descriptor);
        } finally {
          if (permit) permits.delete(permit); // Also covers failure between mint and consume.
        }
      });
    },
  });
}

module.exports = { createOriginalAttemptMetadataReader, createTrustedSessionCreationComposition };
