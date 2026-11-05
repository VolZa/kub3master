'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createLocalFirestoreClient } = require('../firestore-attempt-store.cjs');
const { createFirestoreSessionPolicyStore } = require('../firestore-session-policy-store.cjs');
const c = require('../bd2-session-policy-contract.cjs');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw Error('INTEGRATION_BLOCKED: loopback Firestore Emulator required; no production/mock fallback');
const projectId = 'demo-kub-bd2-policy-local', clients = [];
const context = () => ({ environment: 'TEST', applicationAudience: 'policy-it-' + randomBytes(12).toString('hex'), expectedScriptId: 'isolated-no-GAS' });
const actor = { issuer: 'https://accounts.google.com', sub: 'fixture-actor' };
function fixture(ctx = context()) {
  const db = createLocalFirestoreClient({ host, projectId }); clients.push(db);
  const state = { allowed: true, transactions: 0, authorizations: 0, reads: 0, writes: 0 };
  const run = db.runTransaction.bind(db);
  db.runTransaction = (callback, options) => {
    state.transactions++; assert.equal(options.maxAttempts, 1);
    return run(async tx => {
      const get = tx.get.bind(tx), create = tx.create.bind(tx), update = tx.update.bind(tx);
      let staged = 0;
      tx.get = (...args) => { assert.equal(staged, 0, 'all transaction reads precede writes'); state.reads++; return get(...args); };
      tx.create = (...args) => { staged++; state.writes++; return create(...args); };
      tx.update = (...args) => { staged++; state.writes++; return update(...args); };
      return callback(tx);
    }, options);
  };
  const store = createFirestoreSessionPolicyStore({ firestore: db, context: ctx,
    authorize: async (cmd, reads) => { state.authorizations++; await reads.getUser(actor); return state.allowed; } });
  const root = db.collection(c.ROOT).doc(c.authorityKey(ctx));
  const current = root.collection('session_policy').doc('current'), histories = root.collection('session_policy_history'),
    operations = root.collection('session_policy_operations');
  const command = (idle, version = 1) => c.createCommand(ctx, { commandId: randomBytes(32).toString('hex'), actor,
    kind: idle === undefined ? 'INITIALIZE_SESSION_POLICY' : 'UPDATE_SESSION_POLICY',
    expectedPolicyVersion: idle === undefined ? null : version, payload: idle === undefined ? {} : { idleTimeoutMinutes: idle } });
  return { ctx, db, state, store, root, current, histories, operations, command };
}
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
const reject = (p, outcome) => assert.rejects(p, e => e instanceof c.SessionPolicyStoreError && e.outcome === outcome);
const rows = async f => ({ current: (await f.current.get()).data(),
  histories: (await f.histories.orderBy('__name__').get()).docs.map(d => [d.id, d.data()]),
  operations: (await f.operations.orderBy('__name__').get()).docs.map(d => [d.id, d.data()]) });

test('local factory refuses non-loopback/non-demo/credential overrides', () => {
  for (const options of [{ host: 'firestore.googleapis.com:443', projectId }, { host, projectId: 'production-project' },
    { host, projectId, credentials: {} }]) assert.throws(() => createLocalFirestoreClient(options), /ACCESS_DENIED/);
});
test('atomic initialization, create-if-absent and persistence across independent SDK instances', async () => {
  const a = fixture(), cmd = a.command(), saved = await a.store.initializeSessionPolicy(cmd), b = fixture(a.ctx);
  const state = await rows(a);
  assert.equal(state.histories.length, 1); assert.equal(state.operations.length, 1);
  assert.equal(state.current.policy.policyVersion, 1); assert.equal(state.current.policy.idleTimeoutMinutes, 180);
  assert.equal(state.current.lastOperationId, cmd.operationId);
  assert.deepEqual(c.validateHistory(a.ctx, state.histories[0][1], '1').policy, saved.receipt.afterPolicy);
  assert.deepEqual(c.validateReceipt(a.ctx, state.operations[0][1], cmd.operationId), saved.receipt);
  await reject(b.store.initializeSessionPolicy(b.command()), 'ALREADY_EXISTS');
  assert.deepEqual(await b.store.getCurrentPolicy(), saved.receipt.afterPolicy);
  assert.deepEqual(await b.store.lookupOperationOutcome(c.descriptor(a.ctx, cmd)), saved);
  assert.deepEqual(await rows(a), state);
});
test('concurrent initialization creates at most one atomic triplet, one outer attempt per client', async t => {
  const a = fixture(), b = fixture(a.ctx), commands = [a.command(), b.command()];
  const results = await Promise.allSettled([a.store.initializeSessionPolicy(commands[0]), b.store.initializeSessionPolicy(commands[1])]);
  const state = await rows(a), committed = results.filter(r => r.status === 'fulfilled').length;
  assert.ok(committed <= 1); assert.equal(state.histories.length, state.operations.length);
  assert.equal(state.histories.length, state.current ? 1 : 0); assert.ok(state.operations.length >= committed);
  assert.equal(a.state.transactions, 1); assert.equal(b.state.transactions, 1);
  for (const r of results) if (r.status === 'rejected') assert.ok(['UNKNOWN', 'ALREADY_EXISTS'].includes(r.reason.outcome));
  // maxAttempts=1 guarantees safety, not progress. Recovery first; explicit original
  // submission below is a separate test action under fresh authorization.
  if (!state.current) {
    for (const cmd of commands) assert.equal((await a.store.lookupOperationOutcome(c.descriptor(a.ctx, cmd))).status, 'UNKNOWN');
    await a.store.initializeSessionPolicy(commands[0]);
  }
  const final = await rows(a); assert.equal(final.histories.length, 1); assert.equal(final.operations.length, 1);
  t.diagnostic(JSON.stringify({ concurrentTriplets: state.histories.length,
    outcomes: results.map(r => r.status === 'fulfilled' ? r.value.receipt.outcome : r.reason.outcome), explicitSubmission: !state.current }));
});
test('independent SDK update race preserves optimistic concurrency and monotonic history', async t => {
  const a = fixture(), b = fixture(a.ctx); await a.store.initializeSessionPolicy(a.command());
  const commands = [a.command(30), b.command(360)], initialCalls = [a.state.transactions, b.state.transactions];
  const results = await Promise.allSettled([a.store.updateSessionPolicy(commands[0]), b.store.updateSessionPolicy(commands[1])]);
  assert.ok(results.filter(r => r.status === 'fulfilled').length <= 1);
  for (const r of results) if (r.status === 'rejected') assert.ok(['UNKNOWN', 'CONFLICT'].includes(r.reason.outcome));
  assert.equal(a.state.transactions, initialCalls[0] + 1); assert.equal(b.state.transactions, initialCalls[1] + 1);
  const state = await rows(a), version = state.current.policy.policyVersion;
  assert.ok([1, 2].includes(version)); assert.equal(state.histories.length, version); assert.equal(state.operations.length, version);
  if (version === 1) await a.store.updateSessionPolicy(commands[0]);
  const current = await b.store.getCurrentPolicy(); assert.equal(current.policyVersion, 2);
  await reject(a.store.updateSessionPolicy(a.command(current.idleTimeoutMinutes, 1)), 'CONFLICT');
  const next = await b.store.updateSessionPolicy(b.command(180, 2)); assert.equal(next.receipt.afterPolicy.policyVersion, 3);
  const final = await rows(a); assert.equal(final.histories.length, 3); assert.equal(final.operations.length, 3);
  for (const [key, h] of final.histories) {
    c.validateHistory(a.ctx, h, key); assert.equal(h.previousPolicyVersion, key === '1' ? null : Number(key) - 1);
    const recovered = await a.store.lookupOperationOutcome(c.descriptor(a.ctx,
      c.validateReceipt(a.ctx, (await a.operations.doc(h.operationId).get()).data(), h.operationId).canonicalCommand));
    assert.equal(recovered.status, 'COMMITTED');
  }
  t.diagnostic(JSON.stringify({ versionAfterRace: version,
    outcomes: results.map(r => r.status === 'fulfilled' ? r.value.receipt.outcome : r.reason.outcome) }));
});
test('durable NOOP writes only immutable receipt and replay returns history under fresh authorization', async () => {
  const f = fixture(), init = f.command(), initial = await f.store.initializeSessionPolicy(init), before = await rows(f);
  const noop = f.command(180), saved = await f.store.updateSessionPolicy(noop), after = await rows(f);
  assert.equal(saved.receipt.outcome, 'NOOP'); assert.equal(saved.receipt.historyReference, null);
  assert.deepEqual(after.current, before.current); assert.deepEqual(after.histories, before.histories);
  assert.equal(after.operations.length, 2);
  await f.store.updateSessionPolicy(f.command(30)); const advanced = await rows(f), auth = f.state.authorizations;
  assert.deepEqual(await f.store.updateSessionPolicy(noop), saved); assert.deepEqual(await f.store.initializeSessionPolicy(init), initial);
  assert.equal(f.state.authorizations, auth + 2); assert.deepEqual(await rows(f), advanced);
  f.state.allowed = false; await reject(f.store.updateSessionPolicy(noop), 'DENY');
  assert.deepEqual(await rows(f), advanced);
  const b = fixture(f.ctx); b.state.allowed = false;
  assert.deepEqual(await b.store.lookupOperationOutcome(c.descriptor(f.ctx, noop)), saved); assert.equal(b.state.authorizations, 0);
  assert.equal(b.state.transactions, 0);
  // SDK create demonstrates the store's create-only immutable slots cannot overwrite.
  for (const ref of [f.histories.doc('1'), f.operations.doc(noop.operationId)]) {
    await assert.rejects(ref.create({ bad: true }), e => e.code === 6);
  }
  assert.deepEqual(await rows(f), advanced);
});
test('faults after staging initialization/update roll back current, history and receipt together', async () => {
  const f = fixture(), run = f.db.runTransaction.bind(f.db);
  let fail = true;
  f.db.runTransaction = (callback, options) => run(async tx => {
    const result = await callback(tx); if (fail) throw Error('injected after all staged writes'); return result;
  }, options);
  const init = f.command(); await reject(f.store.initializeSessionPolicy(init), 'UNKNOWN');
  assert.deepEqual(await rows(f), { current: undefined, histories: [], operations: [] });
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(f.ctx, init))).status, 'UNKNOWN');
  fail = false; await f.store.initializeSessionPolicy(init); const before = await rows(f);
  fail = true; const update = f.command(30); await reject(f.store.updateSessionPolicy(update), 'UNKNOWN');
  assert.deepEqual(await rows(f), before);
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(f.ctx, update))).status, 'UNKNOWN');
});
test('lost acknowledgement recovers original committed initialization/update/NOOP through independent client', async () => {
  const f = fixture(), run = f.db.runTransaction.bind(f.db), b = fixture(f.ctx);
  f.db.runTransaction = async (...args) => { await run(...args); throw Object.assign(Error('lost ack'), { code: 10 }); };
  for (const cmd of [f.command(), f.command(30), f.command(30, 2)]) {
    const before = { ...f.state }, d = c.descriptor(f.ctx, cmd);
    const method = cmd.kind === 'INITIALIZE_SESSION_POLICY' ? 'initializeSessionPolicy' : 'updateSessionPolicy';
    await assert.rejects(f.store[method](cmd), e => { assert.equal(e.outcome, 'UNKNOWN'); assert.deepEqual(e.descriptor, d); return true; });
    assert.equal(f.state.transactions, before.transactions + 1);
    const durable = await rows(f), auth = b.state.authorizations, calls = b.state.transactions;
    const recovered = await b.store.lookupOperationOutcome(d); assert.equal(recovered.status, 'COMMITTED');
    assert.equal(recovered.receipt.operationId, cmd.operationId);
    assert.equal(b.state.authorizations, auth); assert.equal(b.state.transactions, calls); assert.deepEqual(await rows(f), durable);
  }
  const durable = await rows(f); assert.equal(durable.histories.length, 2); assert.equal(durable.operations.length, 3);
});
test('descriptor substitutions reject before I/O; corruption and missing current never bootstrap', async () => {
  const f = fixture(), cmd = f.command(); await f.store.initializeSessionPolicy(cmd);
  const d = c.descriptor(f.ctx, cmd), getAll = f.db.getAll.bind(f.db); let reads = 0;
  f.db.getAll = (...args) => { reads++; return getAll(...args); };
  for (const patch of [{ operationId: '0'.repeat(64) }, { requestDigest: '0'.repeat(64) }, { authorityKey: '0'.repeat(64) }])
    await reject(f.store.lookupOperationOutcome({ ...d, ...patch }), 'DENY');
  assert.equal(reads, 0);
  await f.current.delete(); await reject(f.store.getCurrentPolicy(), 'INVALID');
  await reject(f.store.initializeSessionPolicy(f.command()), 'INVALID');
  assert.equal((await f.store.lookupOperationOutcome(d)).status, 'COMMITTED');
  await f.histories.doc('1').update({ previousPolicyVersion: 0 });
  assert.equal((await f.store.lookupOperationOutcome(d)).status, 'INVALID');
  assert.equal((await f.operations.get()).size, 1);
});
test('context/environment/audience/script authority isolation and default-deny across clients', async () => {
  const f = fixture(), cmd = f.command(); await f.store.initializeSessionPolicy(cmd);
  for (const ctx of [{ ...f.ctx, environment: 'PRODUCTION' }, { ...f.ctx, applicationAudience: 'other-' + randomBytes(8).toString('hex') },
    { ...f.ctx, expectedScriptId: 'other-script' }]) {
    // PRODUCTION here is only a DTO isolation test against the pinned local demo SDK.
    const b = fixture(ctx); assert.equal(await b.store.getCurrentPolicy(), undefined);
    await reject(b.store.initializeSessionPolicy(cmd), 'DENY');
    await reject(b.store.lookupOperationOutcome(c.descriptor(f.ctx, cmd)), 'DENY');
    const own = b.command(); await b.store.initializeSessionPolicy(own);
    const copied = (await f.current.get()).data(); await b.current.set(copied); // Deliberate emulator-only corruption.
    await reject(b.store.getCurrentPolicy(), 'INVALID');
  }
  const b = fixture(f.ctx); b.state.allowed = false; const before = await rows(f);
  await reject(b.store.updateSessionPolicy(b.command(30)), 'DENY'); assert.deepEqual(await rows(f), before);
});

test('F-01: damaged initialization evidence at current v3 blocks reads, UPDATE, NOOP and replay without writes', async t => {
  const cases = [
    ['missing history v1', (f, init) => f.histories.doc('1').delete()],
    ['missing initialization receipt', (f, init) => f.operations.doc(init.operationId).delete()],
    ['corrupt requestDigest', (f, init) => f.operations.doc(init.operationId).update({ requestDigest: '0'.repeat(64) })],
    ['receipt operationId mismatch', (f, init) => f.operations.doc(init.operationId).update({ operationId: '0'.repeat(64) })],
    ['history points to UPDATE receipt', (f, init, update) => f.histories.doc('1').update({ operationId: update.operationId })],
    ['history authority mismatch', f => f.histories.doc('1').update({ authorityKey: '0'.repeat(64) })],
    ['receipt authority mismatch', (f, init) => f.operations.doc(init.operationId).update({ authorityKey: '0'.repeat(64) })],
    ['receipt context mismatch', (f, init) => f.operations.doc(init.operationId).update({ 'context.applicationAudience': 'other' })],
    ['history profile mismatch', f => f.histories.doc('1').update({ storageProfile: c.RECORD_PROFILE })],
    ['receipt schema mismatch', (f, init) => f.operations.doc(init.operationId).update({ storageSchemaVersion: 2 })],
    ['invalid initial idle', f => f.histories.doc('1').update({ 'policy.idleTimeoutMinutes': 30 })],
    ['invalid initial absolute', f => f.histories.doc('1').update({ 'policy.absoluteTimeoutMinutes': 719 })],
    ['invalid initial appliesTo', f => f.histories.doc('1').update({ 'policy.appliesTo': 'ALL_SESSIONS' })],
    ['invalid initial version', f => f.histories.doc('1').update({ 'policy.policyVersion': 2 })],
    ['canonical command substitution', (f, init) => f.operations.doc(init.operationId).update({ 'canonicalCommand.actor.sub': 'other' })],
    ['initial history/receipt policy mismatch', async f => {
      const h = (await f.histories.doc('1').get()).data();
      await f.histories.doc('1').update({ 'policy.updatedAtMs': h.policy.updatedAtMs + 1 });
    }],
  ];
  for (const [name, corrupt] of cases) await t.test(name, async () => {
    const f = fixture(), init = f.command(), update = f.command(30);
    await f.store.initializeSessionPolicy(init); await f.store.updateSessionPolicy(update);
    await f.store.updateSessionPolicy(f.command(360, 2));
    await corrupt(f, init, update);
    const before = await rows(f), writes = f.state.writes, calls = f.state.transactions;
    await reject(f.store.getCurrentPolicy(), 'INVALID');
    await reject(f.store.updateSessionPolicy(f.command(180, 3)), 'INVALID');
    await reject(f.store.updateSessionPolicy(f.command(360, 3)), 'INVALID');
    await reject(f.store.updateSessionPolicy(update), 'INVALID');
    await reject(f.store.initializeSessionPolicy(init), 'INVALID');
    assert.equal(f.state.writes, writes, 'zero staged writes after corruption');
    assert.equal(f.state.transactions, calls + 5, 'no automatic retry');
    assert.equal((await f.histories.doc('4').get()).exists, false);
    assert.deepEqual(await rows(f), before, 'all persisted documents unchanged, no repair');
  });
});

test('F-01: intact initialization anchor preserves v3/v4, NOOP, replay and read-only recovery', async () => {
  const f = fixture(), init = f.command(); await f.store.initializeSessionPolicy(init);
  await f.store.updateSessionPolicy(f.command(30)); await f.store.updateSessionPolicy(f.command(360, 2));
  let reads = f.state.reads;
  assert.equal((await f.store.getCurrentPolicy()).policyVersion, 3); assert.equal(f.state.reads - reads, 6);
  const noop = f.command(360, 3), savedNoop = await f.store.updateSessionPolicy(noop);
  const update = f.command(180, 3), saved = await f.store.updateSessionPolicy(update);
  assert.equal(savedNoop.receipt.outcome, 'NOOP'); assert.equal(saved.receipt.afterPolicy.policyVersion, 4);
  reads = f.state.reads;
  assert.equal((await f.store.getCurrentPolicy()).policyVersion, 4); assert.equal(f.state.reads - reads, 6);
  const before = await rows(f), writes = f.state.writes;
  assert.deepEqual(await f.store.updateSessionPolicy(update), saved);
  assert.deepEqual(await f.store.updateSessionPolicy(noop), savedNoop);
  const calls = f.state.transactions, auth = f.state.authorizations; f.state.allowed = false;
  assert.deepEqual(await f.store.lookupOperationOutcome(c.descriptor(f.ctx, update)), saved);
  assert.deepEqual(await f.store.lookupOperationOutcome(c.descriptor(f.ctx, noop)), savedNoop);
  assert.equal(f.state.transactions, calls); assert.equal(f.state.authorizations, auth);
  assert.equal(f.state.writes, writes); assert.deepEqual(await rows(f), before);
});
