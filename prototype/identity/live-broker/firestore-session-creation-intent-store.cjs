'use strict';
const api = require('../../../build/permission-node/index.cjs');
const { data } = require('./bd2-user-contract.cjs');
const c = require('./bd2-session-contract.cjs');

const result = (status, fields = {}) => Object.freeze({ status, ...fields });

/** Internal Node-only foundation. firestore/context are trusted composition inputs.
 * Commands and descriptors are DATA, never Google verification or dispatch authority.
 * No default SDK client, clock, retry, issuer, capability registry or production port.
 */
function createFirestoreSessionCreationIntentStore(options) {
  const o = data(options, ['firestore', 'context']);
  const context = api.validateBd2Context(o.context), firestore = o.firestore;
  if (!firestore || typeof firestore.collection !== 'function' || typeof firestore.runTransaction !== 'function')
    throw Error('ACCESS_DENIED');
  const intents = firestore.collection(c.ROOT).doc(c.authorityKey(context)).collection('session_creation_intents');

  // Strict validation precedes matching; a corrupt record is never a conflict to adopt.
  function classify(snapshot, descriptor, command) {
    let intent;
    try { intent = c.validateIntent(context, snapshot.data(), descriptor.attemptKey); }
    catch { return result('INVALID'); }
    if (command) {
      try { c.assertIntentMatchesCommand(context, intent, command); }
      catch { return result('CONFLICT'); }
    } else if (Object.keys(descriptor).some(key => intent[key] !== descriptor[key])) {
      return result('CONFLICT');
    }
    return result(command ? 'EXISTING' : 'FOUND', { intent });
  }

  return Object.freeze({
    async createOriginal(value) {
      let command, intent, descriptor;
      try {
        command = c.validateCommand(context, value);
        intent = c.createIntent(context, command);
        descriptor = c.descriptor(context, command);
      } catch { return result('INVALID'); }
      try {
        const ref = intents.doc(descriptor.attemptKey);
        // The callback's NEW is provisional. Only the fulfilled OUTER SDK promise
        // confirms creation; staging a write or losing its acknowledgement does not.
        const outcome = await firestore.runTransaction(async tx => {
          const snapshot = await tx.get(ref);
          if (snapshot.exists) return classify(snapshot, descriptor, command);
          tx.create(ref, intent);
          return result('NEW');
        }, { maxAttempts: 1 });
        return result(outcome.status, { descriptor });
      } catch {
        // Includes ABORTED and rejection after callback/commit. Never resubmit.
        return result('UNKNOWN', { descriptor });
      }
    },
    async lookupIntent(value) {
      let descriptor;
      try { descriptor = c.validateDescriptor(context, value); }
      catch { return result('INVALID'); }
      try {
        const snapshot = await intents.doc(descriptor.attemptKey).get();
        // Absence is evidence only, never confirmed rollback or permission to retry.
        if (!snapshot.exists) return result('UNKNOWN', { evidence: 'MISSING' });
        return classify(snapshot, descriptor);
      } catch { return result('UNAVAILABLE'); }
    },
  });
}

module.exports = { createFirestoreSessionCreationIntentStore };
