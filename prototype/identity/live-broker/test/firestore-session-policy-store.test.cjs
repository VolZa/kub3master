'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../../../../build/permission-node/index.cjs');
const { createFirestoreSessionPolicyStore } = require('../firestore-session-policy-store.cjs');
const c = require('../bd2-session-policy-contract.cjs');
const ctx = { environment: 'TEST', applicationAudience: 'policy-store-unit', expectedScriptId: 'isolated' };
const actor = { issuer: 'https://accounts.google.com', sub: 'actor' };
function fixture({ authorize, unconfigured = false } = {}) {
  const rows = new Map(), counts = { transactions: 0, reads: 0, writes: 0, authorizations: 0 };
  const faults = { before: false, after: false, read: false, failWrite: false, staged: false };
  const snapshot = p => ({ exists: rows.has(p), data: () => structuredClone(rows.get(p)) });
  const read = r => {
    counts.reads++; if (faults.read) throw Error('unavailable');
    if (r.query) {
      const docs = [...rows.keys()].filter(p => p.startsWith(r.query + '/') && p.slice(r.query.length + 1).indexOf('/') === -1)
        .slice(0, r.limit).map(p => ({ ...snapshot(p), id: p.split('/').at(-1) }));
      return { empty: !docs.length, docs };
    }
    return snapshot(r.path);
  };
  const ref = path => ({ path, collection: name => collection(path + '/' + name), async get() { return read({ path }); } });
  const collection = path => ({ doc: id => ref(path + '/' + id), limit: n => ({ query: path, limit: n }) });
  const firestore = { collection, async runTransaction(callback, options) {
    counts.transactions++; assert.equal(options.maxAttempts, 1);
    if (faults.before) throw Object.assign(Error('before commit'), { code: 10 });
    const pending = [];
    const stage = (kind, r, value) => { pending.push([kind, r.path, value]); if (faults.staged) throw Error('after staging'); };
    const result = await callback({ async get(r) { assert.equal(pending.length, 0, 'reads before writes'); return read(r); },
      create(r, value) { stage('create', r, value); }, update(r, value) { stage('update', r, value); } });
    if (faults.failWrite) throw Error('commit failed');
    const next = new Map(rows);
    for (const [kind, path, value] of pending) { assert.equal(next.has(path), kind === 'update'); next.set(path, structuredClone(value)); }
    rows.clear(); for (const [p, value] of next) rows.set(p, value);
    counts.writes += pending.length;
    if (faults.after) throw Object.assign(Error('lost ack'), { code: 10 });
    return result;
  } };
  const state = { at: 1000, allowed: true }, options = { firestore, context: { ...ctx }, now: () => state.at };
  if (!unconfigured) options.authorize = async (...args) => { counts.authorizations++; return authorize ? authorize(...args) : state.allowed; };
  let id = 0;
  const command = (idle, version = 1) => c.createCommand(ctx, { commandId: (++id).toString(16).padStart(64, '0'), actor,
    kind: idle === undefined ? 'INITIALIZE_SESSION_POLICY' : 'UPDATE_SESSION_POLICY',
    expectedPolicyVersion: idle === undefined ? null : version, payload: idle === undefined ? {} : { idleTimeoutMinutes: idle } });
  const base = c.ROOT + '/' + c.authorityKey(ctx);
  const paths = { current: base + '/session_policy/current', history: v => base + '/session_policy_history/' + v,
    operation: cmd => base + '/session_policy_operations/' + cmd.operationId };
  return { rows, counts, faults, state, options, command, paths, store: createFirestoreSessionPolicyStore(options) };
}
const rejects = (p, outcome) => assert.rejects(p, e => e instanceof c.SessionPolicyStoreError && e.message === 'ACCESS_DENIED' && e.outcome === outcome);
test('explicit create-only initialization is atomic, immutable, and never an implicit read default', async () => {
  const f = fixture(); assert.equal(await f.store.getCurrentPolicy(), undefined); assert.equal(f.rows.size, 0);
  await rejects(f.store.updateSessionPolicy(f.command(30)), 'NOT_FOUND'); assert.equal(f.rows.size, 0);
  const init = f.command(), saved = await f.store.initializeSessionPolicy(init);
  assert.equal(saved.receipt.outcome, 'INITIALIZED'); assert.equal(f.rows.size, 3); assert.equal(f.counts.writes, 3);
  assert.deepEqual(f.rows.get(f.paths.current).policy, saved.receipt.afterPolicy);
  assert.deepEqual(c.validateHistory(ctx, f.rows.get(f.paths.history(1)), '1').policy, saved.receipt.afterPolicy);
  assert.deepEqual(c.validateReceipt(ctx, f.rows.get(f.paths.operation(init)), init.operationId), saved.receipt);
  const before = structuredClone([...f.rows]);
  await rejects(f.store.initializeSessionPolicy(f.command()), 'ALREADY_EXISTS'); assert.deepEqual([...f.rows], before);
});
test('update increments exactly once, NOOP persists only receipt, stale matching value conflicts', async () => {
  const f = fixture(); await f.store.initializeSessionPolicy(f.command());
  const initial = structuredClone([...f.rows]), noop = f.command(180);
  f.state.at = 1100;
  const result = await f.store.updateSessionPolicy(noop); assert.equal(result.receipt.outcome, 'NOOP');
  assert.equal(f.counts.writes, 4); for (const [p, value] of initial) assert.deepEqual(f.rows.get(p), value);
  const update = await f.store.updateSessionPolicy(f.command(30)); assert.equal(update.receipt.afterPolicy.policyVersion, 2);
  assert.equal(f.counts.writes, 7); assert.equal((await f.store.getCurrentPolicy()).idleTimeoutMinutes, 30);
  await rejects(f.store.updateSessionPolicy(f.command(30, 1)), 'CONFLICT');
  f.state.at = 1;
  await rejects(f.store.updateSessionPolicy(f.command(30, 1)), 'CONFLICT');
  f.state.at = 1100;
  const before = f.counts.writes;
  assert.deepEqual(await f.store.updateSessionPolicy(noop), result); assert.equal(f.counts.writes, before);
  assert.equal(result.receipt.afterPolicy.policyVersion, 1);
});
test('matching initialization replay is historical after several changes and reauthorizes every time', async () => {
  const f = fixture(), cmd = f.command(), saved = await f.store.initializeSessionPolicy(cmd);
  await f.store.updateSessionPolicy(f.command(30)); await f.store.updateSessionPolicy(f.command(360, 2));
  const before = { ...f.counts }; assert.deepEqual(await f.store.initializeSessionPolicy(cmd), saved);
  assert.equal(f.counts.writes, before.writes); assert.equal(f.counts.authorizations, before.authorizations + 1);
  f.state.allowed = false; await rejects(f.store.initializeSessionPolicy(cmd), 'DENY');
  const after = { ...f.counts }; assert.deepEqual(await f.store.lookupOperationOutcome(c.descriptor(ctx, cmd)), saved);
  assert.equal(f.counts.authorizations, after.authorizations); assert.equal(f.counts.transactions, after.transactions);
});
test('default-deny: absent, false, nonboolean, exceptions, rejected promises; zero writes', async () => {
  const missing = fixture({ unconfigured: true }); await rejects(missing.store.initializeSessionPolicy(missing.command()), 'DENY');
  assert.equal(missing.counts.transactions, 0);
  for (const authorize of [() => false, () => undefined, () => 1, () => ({ isAdmin: true }),
    () => { throw Error('detail'); }, () => Promise.reject(Error('detail'))]) {
    const f = fixture({ authorize }); await rejects(f.store.initializeSessionPolicy(f.command()), 'DENY');
    assert.equal(f.rows.size, 0); assert.equal(f.counts.writes, 0);
  }
});
test('authorizer uses only detached command/restricted consistent reads and port closes after decision', async () => {
  let held;
  const f = fixture({ authorize: async (cmd, reads) => {
    assert.ok(Object.isFrozen(cmd)); assert.ok(Object.isFrozen(reads)); assert.equal(reads.create, undefined);
    held = reads; assert.equal(await reads.getUser(actor), undefined);
    const p = await reads.getCurrentPolicy(); assert.equal(p?.policyVersion, cmd.expectedPolicyVersion === null ? undefined : 1);
    return true;
  } });
  await f.store.initializeSessionPolicy(f.command()); await f.store.updateSessionPolicy(f.command(30));
  await assert.rejects(held.getUser(actor)); await assert.rejects(held.getCurrentPolicy());
});
test('substituted sealed inputs, wrong methods and forged descriptors reject before I/O', async () => {
  const f = fixture(), cmd = f.command(30), d = c.descriptor(ctx, cmd);
  for (const patch of [{ actor: { ...actor, sub: 'other' } }, { payload: { idleTimeoutMinutes: 360 } },
    { expectedPolicyVersion: 2 }, { extra: true }, { context: { ...ctx, environment: 'PRODUCTION' } }])
    await rejects(f.store.updateSessionPolicy({ ...cmd, ...patch }), 'DENY');
  await rejects(f.store.initializeSessionPolicy(cmd), 'DENY');
  for (const patch of [{ operationId: '0'.repeat(64) }, { requestDigest: '0'.repeat(64) }, { authorityKey: '0'.repeat(64) }, { extra: true }])
    await rejects(f.store.lookupOperationOutcome({ ...d, ...patch }), 'DENY');
  assert.deepEqual(f.counts, { transactions: 0, reads: 0, writes: 0, authorizations: 0 });
});
test('UNKNOWN before/after commit preserves original descriptor, no retry, read-only recovery', async () => {
  for (const after of [false, true]) {
    const f = fixture(), cmd = f.command(), d = c.descriptor(ctx, cmd); f.faults[after ? 'after' : 'before'] = true;
    await assert.rejects(f.store.initializeSessionPolicy(cmd), e => { assert.equal(e.outcome, 'UNKNOWN'); assert.deepEqual(e.descriptor, d); return true; });
    assert.equal(f.counts.transactions, 1); assert.equal(f.rows.size, after ? 3 : 0);
    const before = { ...f.counts };
    for (let n = 0; n < 2; n++) assert.equal((await f.store.lookupOperationOutcome(d)).status, after ? 'COMMITTED' : 'UNKNOWN');
    assert.equal(f.counts.transactions, before.transactions); assert.equal(f.counts.writes, before.writes);
    assert.equal(f.counts.authorizations, before.authorizations);
  }
  for (const fault of ['staged', 'failWrite']) {
    const f = fixture(); f.faults[fault] = true; await rejects(f.store.initializeSessionPolicy(f.command()), 'UNKNOWN'); assert.equal(f.rows.size, 0);
  }
});
test('generic SDK error codes never cause automatic second outer attempt', async () => {
  for (const code of [1, 2, 4, 6, 8, 10, 13, 14, 16, undefined]) {
    const f = fixture(); let calls = 0;
    f.options.firestore.runTransaction = async () => { calls++; throw Object.assign(Error('sdk detail'), { code }); };
    await rejects(f.store.initializeSessionPolicy(f.command()), 'UNKNOWN'); assert.equal(calls, 1);
  }
});
test('corrupt current, receipt, history and path bindings fail closed without repair', async () => {
  for (const corrupt of [
    (f, cmd) => { f.rows.get(f.paths.current).storageProfile = c.HISTORY_PROFILE; },
    (f, cmd) => { f.rows.get(f.paths.operation(cmd)).requestDigest = '0'.repeat(64); },
    f => { f.rows.get(f.paths.history(1)).policy.idleTimeoutMinutes = 30; },
    f => { f.rows.get(f.paths.history(1)).operationId = '0'.repeat(64); },
    f => { f.rows.delete(f.paths.history(1)); },
    f => { f.rows.get(f.paths.current).authorityKey = '0'.repeat(64); },
    f => { f.rows.get(f.paths.current).lastOperationId = '0'.repeat(64); },
  ]) {
    const f = fixture(), cmd = f.command(); await f.store.initializeSessionPolicy(cmd); corrupt(f, cmd);
    const rows = structuredClone([...f.rows]);
    await rejects(f.store.getCurrentPolicy(), 'INVALID'); await rejects(f.store.updateSessionPolicy(f.command(30)), 'INVALID');
    assert.deepEqual([...f.rows], rows); assert.equal(f.counts.writes, 3);
  }
});
test('recovery validates immutable dependencies, survives current deletion and cannot repair it', async () => {
  const f = fixture(), init = f.command(), saved = await f.store.initializeSessionPolicy(init);
  const noop = f.command(180); await f.store.updateSessionPolicy(noop);
  f.rows.delete(f.paths.current); const before = { ...f.counts };
  assert.deepEqual(await f.store.lookupOperationOutcome(c.descriptor(ctx, init)), saved);
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(ctx, noop))).status, 'COMMITTED');
  assert.equal(f.counts.transactions, before.transactions); assert.equal(f.counts.authorizations, before.authorizations);
  await rejects(f.store.getCurrentPolicy(), 'INVALID'); await rejects(f.store.initializeSessionPolicy(f.command()), 'INVALID');
  f.rows.delete(f.paths.history(1));
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(ctx, init))).status, 'INVALID');
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(ctx, noop))).status, 'INVALID');
  assert.equal(f.counts.writes, 4);
});
test('receipt-only or history-only orphan prevents initialization; occupied next version is invalid', async () => {
  for (const keep of ['history', 'operation']) {
    const f = fixture(), cmd = f.command(); await f.store.initializeSessionPolicy(cmd);
    for (const p of f.rows.keys()) if (p !== (keep === 'history' ? f.paths.history(1) : f.paths.operation(cmd))) f.rows.delete(p);
    await rejects(f.store.initializeSessionPolicy(f.command()), 'INVALID'); assert.equal(f.rows.size, 1);
  }
  const f = fixture(); await f.store.initializeSessionPolicy(f.command()); f.rows.set(f.paths.history(2), {});
  await rejects(f.store.updateSessionPolicy(f.command(30)), 'INVALID'); assert.equal(f.counts.writes, 3);
});
test('recovery rejects corrupt before-history, timestamp, origin and receipt operation substitution', async () => {
  for (const corrupt of [
    (f, cmd) => { f.rows.get(f.paths.operation(cmd)).recordedAtMs++; },
    (f, cmd) => { f.rows.get(f.paths.operation(cmd)).operationId = '0'.repeat(64); },
    f => { f.rows.get(f.paths.history(1)).policy.updatedBy.sub = 'other'; },
    f => { f.rows.get(f.paths.history(2)).previousPolicyVersion = null; },
  ]) {
    const f = fixture(); await f.store.initializeSessionPolicy(f.command()); const cmd = f.command(30); await f.store.updateSessionPolicy(cmd);
    corrupt(f, cmd); assert.equal((await f.store.lookupOperationOutcome(c.descriptor(ctx, cmd))).status, 'INVALID');
  }
  const f = fixture(), init = f.command(); await f.store.initializeSessionPolicy(init);
  const noop = f.command(180); await f.store.updateSessionPolicy(noop);
  f.rows.get(f.paths.history(1)).operationId = noop.operationId; // Must reject without recursive lookup loop.
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(ctx, noop))).status, 'INVALID');
});
test('read failures distinguish UNAVAILABLE; rollback/invalid clock denies without mutation', async () => {
  const f = fixture(), cmd = f.command(); await f.store.initializeSessionPolicy(cmd);
  f.faults.read = true; await rejects(f.store.getCurrentPolicy(), 'UNAVAILABLE');
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(ctx, cmd))).status, 'UNAVAILABLE');
  await rejects(f.store.updateSessionPolicy(f.command(30)), 'UNKNOWN'); f.faults.read = false;
  for (const at of [999, 0, NaN, Infinity, '1000', Number.MAX_SAFE_INTEGER + 1]) {
    f.state.at = at; await rejects(f.store.updateSessionPolicy(f.command(30)), 'DENY');
  }
  assert.equal(f.counts.writes, 3);
});
test('safe-integer overflow denies after validating coherent durable state', async () => {
  const f = fixture(), init = f.command(); const p = (await f.store.initializeSessionPolicy(init)).receipt.afterPolicy;
  const max = Number.MAX_SAFE_INTEGER, prior = { ...p, policyVersion: max - 1 };
  const cmd = f.command(30, max - 1), receipt = c.createReceipt(ctx, cmd, prior, 1000);
  f.rows.set(f.paths.history(max - 1), c.createHistory(ctx, prior, init.operationId));
  f.rows.set(f.paths.history(max), c.createHistory(ctx, receipt.afterPolicy, cmd.operationId));
  f.rows.set(f.paths.operation(cmd), receipt); f.rows.set(f.paths.current, c.createRecord(ctx, receipt.afterPolicy, cmd.operationId));
  const before = structuredClone([...f.rows]); await rejects(f.store.updateSessionPolicy(f.command(180, max)), 'DENY');
  assert.deepEqual([...f.rows], before);
});
test('policy changes preserve captured session snapshots and exact expiry boundary denial', async () => {
  const f = fixture(); const p = (await f.store.initializeSessionPolicy(f.command())).receipt.afterPolicy;
  const session = api.validateBd2Session({ profile: api.BD2_PROFILE, schemaVersion: 1, context: ctx,
    sessionDigest: 'a'.repeat(64), createOperationId: 'b'.repeat(64), principal: actor, createdAtMs: 1000,
    lastEligibleActivityAtMs: 1000, policySnapshot: { policyVersion: p.policyVersion, idleTimeoutMinutes: p.idleTimeoutMinutes,
      absoluteTimeoutMinutes: 720 }, authorizationVersionAtIssue: 0, revision: 0, status: 'ACTIVE', revokedAtMs: null }, ctx);
  const before = structuredClone(session), expiry = 1000 + 180 * 60000;
  const user = { profile: api.BD2_PROFILE, schemaVersion: 1, context: ctx, principal: actor, active: true,
    roles: ['ADMIN'], authorizationVersion: 0, revision: 0 };
  for (const idle of [30, 360]) {
    const current = await f.store.getCurrentPolicy(); await f.store.updateSessionPolicy(f.command(idle, current.policyVersion));
    for (const at of [expiry - 1, expiry]) {
      const adapter = api.createPortablePermissionAdapter({ expectedContext: ctx, now: () => at,
        reader: { read: async () => ({ user, session, currentPolicy: await f.store.getCurrentPolicy() }) } });
      if (at < expiry) await adapter.require('trusted-test-handle', 'REPORT_VIEW');
      else await assert.rejects(adapter.require('trusted-test-handle', 'REPORT_VIEW'), /ACCESS_DENIED/);
    }
    assert.deepEqual(session, before);
  }
});
test('options detach and configuration rejects unknown dependencies', async () => {
  const f = fixture(); f.options.context.applicationAudience = 'changed'; f.options.authorize = () => false;
  await f.store.initializeSessionPolicy(f.command()); assert.equal(f.rows.size, 3);
  assert.throws(() => createFirestoreSessionPolicyStore({ ...f.options, isAdmin: true }));
});

test('F-01: current v3 requires intact initialization evidence before reads, UPDATE, NOOP and replay', async t => {
  const cases = [
    ['missing history v1', (f, init) => f.rows.delete(f.paths.history(1))],
    ['missing initialization receipt', (f, init) => f.rows.delete(f.paths.operation(init))],
    ['corrupt requestDigest', (f, init) => { f.rows.get(f.paths.operation(init)).requestDigest = '0'.repeat(64); }],
    ['receipt operationId mismatch', (f, init) => { f.rows.get(f.paths.operation(init)).operationId = '0'.repeat(64); }],
    ['history points to UPDATE receipt', (f, init, update) => { f.rows.get(f.paths.history(1)).operationId = update.operationId; }],
    ['history authority mismatch', f => { f.rows.get(f.paths.history(1)).authorityKey = '0'.repeat(64); }],
    ['receipt authority mismatch', (f, init) => { f.rows.get(f.paths.operation(init)).authorityKey = '0'.repeat(64); }],
    ['receipt context mismatch', (f, init) => { f.rows.get(f.paths.operation(init)).context.applicationAudience = 'other'; }],
    ['history profile mismatch', f => { f.rows.get(f.paths.history(1)).storageProfile = c.RECORD_PROFILE; }],
    ['receipt schema mismatch', (f, init) => { f.rows.get(f.paths.operation(init)).storageSchemaVersion = 2; }],
    ['invalid initial idle', f => { f.rows.get(f.paths.history(1)).policy.idleTimeoutMinutes = 30; }],
    ['invalid initial absolute', f => { f.rows.get(f.paths.history(1)).policy.absoluteTimeoutMinutes = 719; }],
    ['invalid initial appliesTo', f => { f.rows.get(f.paths.history(1)).policy.appliesTo = 'ALL_SESSIONS'; }],
    ['invalid initial version', f => { f.rows.get(f.paths.history(1)).policy.policyVersion = 2; }],
    ['canonical command substitution', (f, init) => { f.rows.get(f.paths.operation(init)).canonicalCommand.actor.sub = 'other'; }],
    ['initial history/receipt policy mismatch', f => { f.rows.get(f.paths.history(1)).policy.updatedAtMs++; }],
  ];
  for (const [name, corrupt] of cases) await t.test(name, async () => {
    const f = fixture(), init = f.command(), update = f.command(30);
    await f.store.initializeSessionPolicy(init);
    await f.store.updateSessionPolicy(update);
    await f.store.updateSessionPolicy(f.command(360, 2));
    corrupt(f, init, update);
    const before = structuredClone([...f.rows]), writes = f.counts.writes, calls = f.counts.transactions;
    await rejects(f.store.getCurrentPolicy(), 'INVALID');
    await rejects(f.store.updateSessionPolicy(f.command(180, 3)), 'INVALID');
    await rejects(f.store.updateSessionPolicy(f.command(360, 3)), 'INVALID');
    await rejects(f.store.updateSessionPolicy(update), 'INVALID');
    await rejects(f.store.initializeSessionPolicy(init), 'INVALID');
    assert.equal(f.counts.transactions, calls + 5, 'one attempt per call, no automatic retry');
    assert.equal(f.counts.writes, writes);
    assert.equal(f.rows.has(f.paths.history(4)), false);
    assert.deepEqual([...f.rows], before, 'all durable documents unchanged, no repair');
  });
});

test('F-01: intact v1 evidence permits current v3, v4, NOOP, replay and read-only recovery with bounded reads', async () => {
  const f = fixture(), init = f.command(); await f.store.initializeSessionPolicy(init);
  await f.store.updateSessionPolicy(f.command(30)); await f.store.updateSessionPolicy(f.command(360, 2));
  let reads = f.counts.reads;
  assert.equal((await f.store.getCurrentPolicy()).policyVersion, 3);
  assert.equal(f.counts.reads - reads, 6, 'current, adjacent evidence and v1 anchor: six point reads');
  const noop = f.command(360, 3), savedNoop = await f.store.updateSessionPolicy(noop);
  const update = f.command(180, 3), saved = await f.store.updateSessionPolicy(update);
  assert.equal(savedNoop.receipt.outcome, 'NOOP'); assert.equal(saved.receipt.afterPolicy.policyVersion, 4);
  reads = f.counts.reads;
  assert.equal((await f.store.getCurrentPolicy()).policyVersion, 4);
  assert.equal(f.counts.reads - reads, 6, 'point read bound does not grow with policy version');
  const before = structuredClone([...f.rows]), writes = f.counts.writes;
  assert.deepEqual(await f.store.updateSessionPolicy(update), saved);
  assert.deepEqual(await f.store.updateSessionPolicy(noop), savedNoop);
  const calls = f.counts.transactions, auth = f.counts.authorizations;
  f.state.allowed = false;
  assert.deepEqual(await f.store.lookupOperationOutcome(c.descriptor(ctx, update)), saved);
  assert.deepEqual(await f.store.lookupOperationOutcome(c.descriptor(ctx, noop)), savedNoop);
  assert.equal(f.counts.transactions, calls); assert.equal(f.counts.authorizations, auth);
  assert.equal(f.counts.writes, writes); assert.deepEqual([...f.rows], before);
});
