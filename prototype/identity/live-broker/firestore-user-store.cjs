'use strict';
const api = require('../../../build/permission-node/index.cjs');
const { ROOT, USER_PROFILE, data, integer, authorityKey, userKey, validateCommand, descriptor,
  validateDescriptor, validateEnvelope, transition, createReceipt, validateReceipt, UserStoreError,
  sameUser } = require('./bd2-user-contract.cjs');

/** Internal trusted SDK port. No default client, HTTP registration, positive authorizer or cache.
 * authorize(command, reads) is trusted server injection, NEVER an actor/isAdmin DTO. Only test
 * fixtures currently allow. A future production authorizer/provenance boundary needs approval.
 * It may use reads.getUser within this transaction; no external effects or writes are allowed.
 */
function createFirestoreUserStore(options) {
  const o = data(options, ['firestore', 'context'], ['authorize', 'now']);
  const context = api.validateBd2Context(o.context), firestore = o.firestore;
  const authorize = o.authorize, now = o.now === undefined ? Date.now : o.now;
  if (!firestore || typeof firestore.collection !== 'function' || typeof firestore.runTransaction !== 'function' ||
    (authorize !== undefined && typeof authorize !== 'function') || typeof now !== 'function') throw Error('ACCESS_DENIED');
  const root = firestore.collection(ROOT).doc(authorityKey(context));
  const users = root.collection('users'), operations = root.collection('operations');
  let highWater = 0;
  const reject = (outcome, d = null) => { throw new UserStoreError(outcome, d); };
  function parsed(read, d = null) {
    try { return read(); } catch { return reject('INVALID', d); }
  }
  function time(previous = 1) {
    const at = integer(now(), 1);
    if (at < highWater || at < previous) throw Error('ACCESS_DENIED');
    highWater = at; return at;
  }
  async function mutate(value, kind) {
    let command;
    try { command = validateCommand(context, value); if (command.kind !== kind) throw Error(); }
    catch { return reject('REJECTED'); }
    const d = descriptor(context, command);
    if (typeof authorize !== 'function') return reject('REJECTED', d);
    const userRef = users.doc(d.userKey), operationRef = operations.doc(d.operationId);
    try {
      return await firestore.runTransaction(async tx => {
        const receiptSnapshot = await tx.get(operationRef), userSnapshot = await tx.get(userRef);
        const current = userSnapshot.exists ? parsed(() => validateEnvelope(context, userSnapshot.data(), d.userKey), d) : null;
        const receipt = receiptSnapshot.exists ? parsed(() => validateReceipt(context, receiptSnapshot.data(), d.operationId), d) : null;
        // Fresh on EVERY submission, including matching replay and UNKNOWN resubmission.
        // Only a restricted transaction read port is passed to the trusted authorizer.
        let allowed;
        try {
          allowed = await authorize(command, Object.freeze({ async getUser(principal) {
            const key = userKey(principal), snapshot = await tx.get(users.doc(key));
            return snapshot.exists ? validateEnvelope(context, snapshot.data(), key).user : undefined;
          } }));
        } catch { return reject('REJECTED', d); }
        if (allowed !== true) return reject('REJECTED', d);
        if (receipt) {
          if (receipt.requestDigest !== d.requestDigest || receipt.userKey !== d.userKey || !current ||
            current.user.revision < receipt.after.revision || current.user.authorizationVersion < receipt.after.authorizationVersion ||
            (current.user.revision === receipt.after.revision && !sameUser(current.user, receipt.after))) return reject('INVALID', d);
          return Object.freeze({ status: 'COMMITTED', receipt }); // Historical, never a current-user snapshot.
        }
        const plan = transition(context, command, current ? current.user : null);
        if (!['CREATED', 'UPDATED', 'NOOP'].includes(plan.outcome)) return reject(plan.outcome, d);
        let at, next, saved;
        try {
          at = time(current ? current.updatedAtMs : 1);
          saved = createReceipt(context, command, current ? current.user : null, plan.user, plan.outcome, at);
          if (plan.outcome !== 'NOOP') next = validateEnvelope(context, {
            storageProfile: USER_PROFILE, storageSchemaVersion: 1, user: plan.user,
            createdAtMs: current ? current.createdAtMs : at, createdBy: current ? current.createdBy : command.actor,
            updatedAtMs: at, updatedBy: command.actor, lastOperationId: d.operationId }, d.userKey);
        } catch { return reject('REJECTED', d); }
        // All validation/authorization/reads precede writes. Both docs commit or neither does.
        if (plan.outcome === 'CREATED') tx.create(userRef, next);
        else if (plan.outcome === 'UPDATED') tx.update(userRef, next);
        tx.create(operationRef, saved);
        return Object.freeze({ status: 'COMMITTED', receipt: saved });
      }, { maxAttempts: 1 });
    } catch (error) {
      if (error instanceof UserStoreError) throw error;
      // Numeric codes, including ABORTED, do not prove that an earlier Commit RPC failed.
      return reject('UNKNOWN', d);
    }
  }
  return Object.freeze({
    enrollUser: command => mutate(command, 'ENROLL_USER'),
    setUserActive: command => mutate(command, 'SET_USER_ACTIVE'),
    replaceUserRoles: command => mutate(command, 'REPLACE_USER_ROLES'),
    async getUser(principal) {
      let key;
      try { key = userKey(principal); } catch { return reject('REJECTED'); }
      let snapshot;
      try { snapshot = await users.doc(key).get(); } catch { return reject('UNAVAILABLE'); }
      return snapshot.exists ? parsed(() => validateEnvelope(context, snapshot.data(), key)).user : undefined;
    },
    async lookupOperationOutcome(value) {
      let d;
      try { d = validateDescriptor(context, value); } catch { return reject('REJECTED'); }
      let snapshot;
      try { snapshot = await operations.doc(d.operationId).get(); }
      catch { return Object.freeze({ status: 'UNAVAILABLE' }); }
      if (!snapshot.exists) return Object.freeze({ status: 'UNKNOWN' });
      try {
        const receipt = validateReceipt(context, snapshot.data(), d.operationId);
        if (receipt.userKey !== d.userKey || receipt.requestDigest !== d.requestDigest) throw Error();
        return Object.freeze({ status: 'COMMITTED', receipt });
      } catch { return Object.freeze({ status: 'INVALID' }); }
    },
  });
}
module.exports = { createFirestoreUserStore };
