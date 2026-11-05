'use strict';
const api = require('../../../build/permission-node/index.cjs');
const users = require('./bd2-user-contract.cjs');
const c = require('./bd2-session-policy-contract.cjs');
const { data, integer } = users;

const reject = (outcome, d = null) => { throw new c.SessionPolicyStoreError(outcome, d); };
const parsed = (fn, d = null) => { try { return fn(); } catch { return reject('INVALID', d); } };

// Shared bounded validation graph for standalone, mutation, recovery and external reads.
function policyReader(context, root, get, d = null) {
  const currentRef = root.collection('session_policy').doc('current');
  const histories = root.collection('session_policy_history'), operations = root.collection('session_policy_operations');
  const cache = new Map();
  const read = ref => {
    if (!cache.has(ref.path)) cache.set(ref.path, get(ref));
    return cache.get(ref.path);
  };
  async function history(policy) {
    const key = c.versionKey(policy.policyVersion), s = await read(histories.doc(key));
    if (!s.exists) return reject('INVALID', d);
    const h = parsed(() => c.validateHistory(context, s.data(), key), d);
    if (!c.same(h.policy, policy)) return reject('INVALID', d);
    return h;
  }
  async function receipt(id) {
    const s = await read(operations.doc(id));
    if (!s.exists) return null;
    const r = parsed(() => c.validateReceipt(context, s.data(), id), d);
    const afterHistory = await history(r.afterPolicy);
    if (r.outcome !== 'NOOP' && afterHistory.operationId !== r.operationId) return reject('INVALID', d);
    if (r.beforePolicy !== null) await history(r.beforePolicy);
    // A NOOP references the pre-existing version. Validate its creating receipt too,
    // rather than accepting a fabricated standalone history as durable evidence.
    if (r.outcome === 'NOOP') {
      const s = await read(operations.doc(afterHistory.operationId));
      if (!s.exists) return reject('INVALID', d);
      const origin = parsed(() => c.validateReceipt(context, s.data(), afterHistory.operationId), d);
      if (origin.outcome === 'NOOP' || !c.same(origin.afterPolicy, r.afterPolicy)) return reject('INVALID', d);
      if (origin.beforePolicy !== null) await history(origin.beforePolicy);
    }
    return r;
  }
  async function current() {
    const s = await read(currentRef);
    if (!s.exists) {
      // No implicit bootstrap, including after deletion/corruption of current.
      const hs = await get(histories.limit(1)), os = await get(operations.limit(1));
      if (!hs.empty || !os.empty) return reject('INVALID', d);
      return null;
    }
    const record = parsed(() => c.validateRecord(context, s.data()), d), h = await history(record.policy);
    if (h.operationId !== record.lastOperationId) return reject('INVALID', d);
    const r = await receipt(record.lastOperationId);
    if (!r || r.outcome === 'NOOP' || !c.same(r.afterPolicy, record.policy)) return reject('INVALID', d);
    // Every current-policy decision remains anchored to explicit initialization,
    // even when the current/adjacent versions no longer include v1. Point reads
    // share this invocation's cache; never scan or reconstruct the history chain.
    const initialSnapshot = await read(histories.doc('1'));
    if (!initialSnapshot.exists) return reject('INVALID', d);
    const initial = parsed(() => c.validateHistory(context, initialSnapshot.data(), '1'), d);
    const initialized = await receipt(initial.operationId);
    if (!initialized || initialized.outcome !== 'INITIALIZED' || !c.same(initialized.afterPolicy, initial.policy))
      return reject('INVALID', d);
    return record;
  }
  return { read, receipt, current };
}

/** Internal trusted port: owner binds get to its transaction (documents AND queries).
 * No transaction, fallback, writes or authorization here. SDK failures reach the owner
 * unchanged; only corrupt durable evidence is classified INVALID by the shared reader.
 */
async function readCurrentPolicyInTransaction(options) {
  const o = data(options, ['firestore', 'context', 'get']);
  const context = api.validateBd2Context(o.context);
  if (!o.firestore || typeof o.firestore.collection !== 'function' || typeof o.get !== 'function')
    throw Error('ACCESS_DENIED');
  const root = o.firestore.collection(c.ROOT).doc(c.authorityKey(context));
  const record = await policyReader(context, root, o.get).current();
  return record ? record.policy : undefined;
}

/** Trusted SDK/authorizer injection only. No production composition, default client or cache.
 * authorize(command, reads) must use the restricted transaction read port for authoritative
 * decisions. It must not perform HTTP/Google calls, writes or other external effects.
 */
function createFirestoreSessionPolicyStore(options) {
  const o = data(options, ['firestore', 'context'], ['authorize', 'now']);
  const context = api.validateBd2Context(o.context), firestore = o.firestore;
  const authorize = o.authorize, now = o.now === undefined ? Date.now : o.now;
  if (!firestore || typeof firestore.collection !== 'function' || typeof firestore.runTransaction !== 'function' ||
    (authorize !== undefined && typeof authorize !== 'function') || typeof now !== 'function') throw Error('ACCESS_DENIED');
  const root = firestore.collection(c.ROOT).doc(c.authorityKey(context));
  const currentRef = root.collection('session_policy').doc('current');
  const histories = root.collection('session_policy_history'), operations = root.collection('session_policy_operations');
  const userRecords = root.collection('users');
  let highWater = 0;
  const committed = receipt => Object.freeze({ status: 'COMMITTED', receipt });
  function time(previous) {
    const at = integer(now(), 1);
    if (at < highWater || at < previous) throw Error('ACCESS_DENIED');
    highWater = at; return at;
  }
  const reader = (get, d = null) => policyReader(context, root, get, d);
  async function mutate(value, kind) {
    let command;
    try { command = c.validateCommand(context, value); if (command.kind !== kind) throw Error(); }
    catch { return reject('DENY'); }
    const d = c.descriptor(context, command);
    if (typeof authorize !== 'function') return reject('DENY', d);
    try {
      return await firestore.runTransaction(async tx => {
        const reads = reader(ref => tx.get(ref), d);
        const current = await reads.current(), receipt = await reads.receipt(d.operationId);
        // Check the next immutable slot before writes; a pre-existing slot is corruption,
        // never an instruction to overwrite or adopt it.
        let nextRef;
        if (command.kind === 'INITIALIZE_SESSION_POLICY' && !current) nextRef = histories.doc('1');
        else if (current && command.kind === 'UPDATE_SESSION_POLICY' &&
          current.policy.policyVersion === command.expectedPolicyVersion &&
          current.policy.idleTimeoutMinutes !== command.payload.idleTimeoutMinutes &&
          current.policy.policyVersion < Number.MAX_SAFE_INTEGER)
          nextRef = histories.doc(c.versionKey(current.policy.policyVersion + 1));
        if (!receipt && nextRef && (await reads.read(nextRef)).exists) return reject('INVALID', d);
        let allowed, open = true;
        try {
          allowed = await authorize(command, Object.freeze({
            async getCurrentPolicy() { if (!open) throw Error('ACCESS_DENIED'); return current ? current.policy : undefined; },
            async getUser(principal) {
              if (!open) throw Error('ACCESS_DENIED');
              const key = users.userKey(principal), s = await reads.read(userRecords.doc(key));
              return s.exists ? users.validateEnvelope(context, s.data(), key).user : undefined;
            },
          }));
        } catch { return reject('DENY', d); }
        finally { open = false; }
        if (allowed !== true) return reject('DENY', d);
        if (receipt) {
          if (receipt.requestDigest !== d.requestDigest || !current ||
            current.policy.policyVersion < receipt.afterPolicy.policyVersion ||
            (current.policy.policyVersion === receipt.afterPolicy.policyVersion && !c.same(current.policy, receipt.afterPolicy)))
            return reject('INVALID', d);
          return committed(receipt);
        }
        const before = current ? current.policy : null;
        let saved;
        try {
          const plan = c.transition(context, command, before, before ? before.updatedAtMs : 1);
          if (!['INITIALIZED', 'UPDATED', 'NOOP'].includes(plan.outcome)) return reject(plan.outcome, d);
          const at = time(before ? before.updatedAtMs : 1);
          saved = c.createReceipt(context, command, before, at);
        } catch (e) { if (e instanceof c.SessionPolicyStoreError) throw e; return reject('DENY', d); }
        // All required reads, validation and fresh authorization precede every write.
        if (saved.outcome !== 'NOOP') {
          const record = c.createRecord(context, saved.afterPolicy, d.operationId);
          const history = c.createHistory(context, saved.afterPolicy, d.operationId);
          if (saved.outcome === 'INITIALIZED') tx.create(currentRef, record);
          else tx.update(currentRef, record);
          tx.create(nextRef, history);
        }
        tx.create(operations.doc(d.operationId), saved);
        return committed(saved);
      }, { maxAttempts: 1 });
    } catch (e) {
      if (e instanceof c.SessionPolicyStoreError) throw e;
      // Numeric SDK codes do not establish rollback. No automatic outer retry.
      return reject('UNKNOWN', d);
    }
  }
  return Object.freeze({
    initializeSessionPolicy: command => mutate(command, 'INITIALIZE_SESSION_POLICY'),
    updateSessionPolicy: command => mutate(command, 'UPDATE_SESSION_POLICY'),
    async getCurrentPolicy() {
      try {
        return await firestore.runTransaction(async tx => {
          const record = await reader(ref => tx.get(ref)).current();
          return record ? record.policy : undefined;
        }, { maxAttempts: 1 });
      } catch (e) { if (e instanceof c.SessionPolicyStoreError) throw e; return reject('UNAVAILABLE'); }
    },
    async lookupOperationOutcome(value) {
      let d;
      try { d = c.validateDescriptor(context, value); } catch { return reject('DENY'); }
      try {
        // Only immutable dependencies are needed; current may have advanced or disappeared.
        const receipt = await reader(ref => ref.get(), d).receipt(d.operationId);
        if (!receipt) return Object.freeze({ status: 'UNKNOWN' });
        if (receipt.requestDigest !== d.requestDigest) return Object.freeze({ status: 'INVALID' });
        return committed(receipt);
      } catch (e) { return Object.freeze({ status: e instanceof c.SessionPolicyStoreError ? 'INVALID' : 'UNAVAILABLE' }); }
    },
  });
}
module.exports = { createFirestoreSessionPolicyStore, readCurrentPolicyInTransaction };
