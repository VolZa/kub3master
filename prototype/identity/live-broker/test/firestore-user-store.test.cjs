'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFirestoreUserStore } = require('../firestore-user-store.cjs');
const c = require('../bd2-user-contract.cjs');
const context = () => ({ environment: 'TEST', applicationAudience: 'store-unit', expectedScriptId: 'isolated' });
const principal = sub => ({ issuer: 'https://accounts.google.com', sub });

/** Unit port only. Real concurrency/atomicity evidence is in the SDK/Emulator suite. */
function fixture({ authorize, unconfigured = false } = {}) {
  const rows = new Map(), counts = { transactions: 0, reads: 0, writes: 0, authorizations: 0 };
  const faults = { before: false, after: false, read: false, failWrite: false };
  const snapshot = p => ({ exists: rows.has(p), data: () => structuredClone(rows.get(p)) });
  const ref = p => ({ path: p, collection: name => collection(p + '/' + name), async get() {
    counts.reads++; if (faults.read) throw Error('read unavailable'); return snapshot(p);
  } });
  const collection = p => ({ doc: id => ref(p + '/' + id) });
  const firestore = { collection, async runTransaction(callback, options) {
    counts.transactions++; assert.equal(options.maxAttempts, 1);
    if (faults.before) throw Object.assign(Error('before commit'), { code: 10 });
    const pending = [];
    const result = await callback({ async get(r) { assert.equal(pending.length, 0, 'reads before writes');
      counts.reads++; if (faults.read) throw Error('transaction read unavailable'); return snapshot(r.path); },
    create(r, value) { pending.push(['create', r.path, value]); }, update(r, value) { pending.push(['update', r.path, value]); } });
    if (faults.failWrite) throw Error('commit unavailable');
    const next = new Map(rows);
    for (const [kind, p, value] of pending) {
      assert.equal(next.has(p), kind === 'update'); next.set(p, structuredClone(value));
    }
    rows.clear(); for (const [p, value] of next) rows.set(p, value); counts.writes += pending.length;
    if (faults.after) throw Object.assign(Error('lost commit ack'), { code: 10 });
    return result;
  } };
  const ctx = context(), state = { allowed: true, at: 1000 };
  const options = { firestore, context: ctx, now: () => state.at };
  if (!unconfigured) options.authorize = async (...args) => {
    counts.authorizations++; return authorize ? authorize(...args) : state.allowed;
  };
  let id = 0;
  const command = (kind = 'ENROLL_USER', expectedRevision = null, payload = {}, target = 'target') => c.createCommand(context(), {
    commandId: (++id).toString(16).padStart(64, '0'), actor: principal('actor'), target: principal(target), kind, expectedRevision, payload });
  const path = target => `${c.ROOT}/${c.authorityKey(context())}/users/${c.userKey(principal(target))}`;
  return { rows, counts, faults, state, options, command, path, store: createFirestoreUserStore(options) };
}
const rejects = (promise, outcome) => assert.rejects(promise, e => e instanceof c.UserStoreError &&
  e.message === 'ACCESS_DENIED' && e.outcome === outcome);

test('enrollment is inactive/empty, duplicate refuses overwrite and missing update is explicit', async () => {
  const f = fixture(); assert.equal(await f.store.getUser(principal('target')), undefined);
  const result = await f.store.enrollUser(f.command());
  assert.equal(result.status, 'COMMITTED'); assert.equal(result.receipt.outcome, 'CREATED');
  assert.deepEqual(result.receipt.after.roles, []); assert.equal(result.receipt.after.active, false);
  assert.equal(result.receipt.after.revision, 0); assert.equal(result.receipt.after.authorizationVersion, 0);
  const before = structuredClone([...f.rows]);
  await rejects(f.store.enrollUser(f.command()), 'ALREADY_EXISTS'); assert.deepEqual([...f.rows], before);
  await rejects(f.store.setUserActive(f.command('SET_USER_ACTIVE', 0, { active: true }, 'missing')), 'NOT_FOUND');
});
test('active/role changes, deactivate/reactivate and fresh reads invalidate old versions without cache', async () => {
  const f = fixture(); await f.store.enrollUser(f.command());
  await f.store.replaceUserRoles(f.command('REPLACE_USER_ROLES', 0, { roles: ['MANAGER'] }));
  for (const [revision, active] of [[1, true], [2, false], [3, true]]) {
    const before = f.counts.reads;
    await f.store.setUserActive(f.command('SET_USER_ACTIVE', revision, { active }));
    const current = await f.store.getUser(principal('target'));
    assert.equal(current.active, active); assert.equal(current.revision, revision + 1);
    assert.equal(current.authorizationVersion, revision + 1); assert.ok(f.counts.reads > before);
  }
  assert.deepEqual((await f.store.getUser(principal('target'))).roles, ['MANAGER']);
});
test('no-op checks revision first, writes only receipt and matching replay is historical', async () => {
  const f = fixture(), enroll = f.command(); const created = await f.store.enrollUser(enroll);
  const before = structuredClone(f.rows.get(f.path('target')));
  const noop = f.command('SET_USER_ACTIVE', 0, { active: false });
  assert.equal((await f.store.setUserActive(noop)).receipt.outcome, 'NOOP');
  assert.deepEqual(f.rows.get(f.path('target')), before); assert.equal(f.counts.writes, 3);
  await f.store.setUserActive(f.command('SET_USER_ACTIVE', 0, { active: true }));
  const writes = f.counts.writes;
  assert.deepEqual(await f.store.enrollUser(enroll), created);
  assert.equal((await f.store.setUserActive(noop)).receipt.after.active, false);
  assert.equal((await f.store.getUser(principal('target'))).active, true);
  assert.equal(f.counts.writes, writes);
  await rejects(f.store.setUserActive(f.command('SET_USER_ACTIVE', 0, { active: true })), 'CONFLICT');
});
test('role order is a no-op; stale roles cannot overwrite another active update', async () => {
  const f = fixture(); await f.store.enrollUser(f.command());
  await f.store.replaceUserRoles(f.command('REPLACE_USER_ROLES', 0, { roles: ['MANAGER', 'ADMIN'] }));
  assert.equal((await f.store.replaceUserRoles(f.command('REPLACE_USER_ROLES', 1, { roles: ['ADMIN', 'MANAGER'] }))).receipt.outcome, 'NOOP');
  await f.store.setUserActive(f.command('SET_USER_ACTIVE', 1, { active: true }));
  await rejects(f.store.replaceUserRoles(f.command('REPLACE_USER_ROLES', 1, { roles: [] })), 'CONFLICT');
  assert.deepEqual((await f.store.getUser(principal('target'))).roles, ['ADMIN', 'MANAGER']);
});
test('default deny, false/nonboolean/error authorizer and forged actor flags never write', async () => {
  const unconfigured = fixture({ unconfigured: true });
  await rejects(unconfigured.store.enrollUser(unconfigured.command()), 'REJECTED'); assert.equal(unconfigured.counts.transactions, 0);
  for (const authorize of [() => false, () => undefined, () => ({ isAdmin: true }), () => { throw Error('secret detail'); }]) {
    const f = fixture({ authorize }); await rejects(f.store.enrollUser(f.command()), 'REJECTED'); assert.equal(f.rows.size, 0);
  }
  const f = fixture(); await rejects(f.store.enrollUser({ ...f.command(), isAdmin: true }), 'REJECTED');
  assert.equal(f.counts.transactions, 0);
});
test('fresh authorization applies to matching receipt and explicit resubmission after UNKNOWN', async () => {
  const f = fixture(), cmd = f.command(); f.faults.before = true;
  await rejects(f.store.enrollUser(cmd), 'UNKNOWN'); f.faults.before = false; f.state.allowed = false;
  await rejects(f.store.enrollUser(cmd), 'REJECTED'); assert.equal(f.rows.size, 0);
  f.state.allowed = true; await f.store.enrollUser(cmd); f.state.allowed = false;
  await rejects(f.store.enrollUser(cmd), 'REJECTED');
  const before = { ...f.counts }; assert.equal((await f.store.lookupOperationOutcome(c.descriptor(context(), cmd))).status, 'COMMITTED');
  assert.equal(f.counts.authorizations, before.authorizations); assert.equal(f.counts.transactions, before.transactions);
});
test('authorizer gets only frozen command and transaction read port before writes', async () => {
  const f = fixture({ authorize: async (cmd, reads) => {
    assert.ok(Object.isFrozen(cmd)); assert.ok(Object.isFrozen(reads)); assert.deepEqual(Object.keys(reads), ['getUser']);
    await reads.getUser(principal('actor')); return true;
  } });
  await f.store.enrollUser(f.command()); assert.equal(f.counts.authorizations, 1);
});
test('command substitution and wrong operation method reject before transaction', async () => {
  const f = fixture(), cmd = f.command('SET_USER_ACTIVE', 0, { active: true });
  for (const value of [{ ...cmd, payload: { active: false } }, { ...cmd, actor: principal('other') },
    { ...cmd, target: principal('other') }, { ...cmd, expectedRevision: 1 }]) await rejects(f.store.setUserActive(value), 'REJECTED');
  await rejects(f.store.enrollUser(cmd), 'REJECTED'); assert.equal(f.counts.transactions, 0);
});
test('UNKNOWN before/after commit has one outer attempt, original descriptor and read-only lookup', async () => {
  for (const after of [false, true]) {
    const f = fixture(), cmd = f.command(), d = c.descriptor(context(), cmd); f.faults[after ? 'after' : 'before'] = true;
    await assert.rejects(f.store.enrollUser(cmd), e => { assert.equal(e.outcome, 'UNKNOWN'); assert.deepEqual(e.descriptor, d); return true; });
    assert.equal(f.counts.transactions, 1); assert.equal(f.rows.size, after ? 2 : 0);
    const before = { ...f.counts };
    for (let i = 0; i < 2; i++) assert.equal((await f.store.lookupOperationOutcome(d)).status, after ? 'COMMITTED' : 'UNKNOWN');
    assert.equal(f.counts.transactions, before.transactions); assert.equal(f.counts.writes, before.writes);
    assert.equal(f.counts.authorizations, before.authorizations);
  }
});
test('recovery rejects forged descriptors before I/O and valid lookup remains read-only', async () => {
  const f = fixture(), cmd = f.command(), d = c.descriptor(context(), cmd);
  for (const committed of [false, true]) {
    const expected = committed ? await f.store.enrollUser(cmd) : { status: 'UNKNOWN' };
    const before = { ...f.counts }, rows = structuredClone([...f.rows]);
    for (const patch of [{ operationId: '0'.repeat(64) }, { requestDigest: '0'.repeat(64) },
      { authorityKey: '0'.repeat(64) }, { operationId: 'invalid' }]) {
      await rejects(f.store.lookupOperationOutcome({ ...d, ...patch }), 'REJECTED');
      assert.deepEqual(f.counts, before, 'invalid descriptor must not read, write, transact or authorize');
    }
    assert.deepEqual(await f.store.lookupOperationOutcome(d), expected);
    assert.deepEqual(f.counts, { ...before, reads: before.reads + 1 });
    assert.deepEqual([...f.rows], rows);
  }
});
test('all numeric SDK error codes remain UNKNOWN; no second outer call', async () => {
  for (const code of [1, 2, 4, 8, 10, 13, 14, 16, undefined]) {
    const f = fixture(); let calls = 0;
    f.options.firestore.runTransaction = async () => { calls++; throw Object.assign(Error('upstream detail'), { code }); };
    await rejects(f.store.enrollUser(f.command()), 'UNKNOWN'); assert.equal(calls, 1);
  }
});
test('corrupt User/receipt fail closed without repair or replacement; lookup is independent of current User', async () => {
  const f = fixture(), cmd = f.command(); await f.store.enrollUser(cmd);
  const userPath = f.path('target'), operationPath = [...f.rows.keys()].find(p => p.includes('/operations/'));
  const original = structuredClone(f.rows.get(userPath)); f.rows.get(userPath).user.roles = ['OWNER'];
  await rejects(f.store.getUser(principal('target')), 'INVALID');
  await rejects(f.store.setUserActive(f.command('SET_USER_ACTIVE', 0, { active: true })), 'INVALID');
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(context(), cmd))).status, 'COMMITTED');
  f.rows.set(userPath, original); f.rows.get(operationPath).after.active = true;
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(context(), cmd))).status, 'INVALID');
  await rejects(f.store.enrollUser(cmd), 'INVALID'); assert.equal(f.counts.writes, 2);
});
test('read failures, bad descriptors, overflow and clock rollback never produce success', async () => {
  const f = fixture(), cmd = f.command(); await f.store.enrollUser(cmd);
  f.faults.read = true;
  await rejects(f.store.getUser(principal('target')), 'UNAVAILABLE');
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(context(), cmd))).status, 'UNAVAILABLE');
  f.faults.read = false;
  await rejects(f.store.lookupOperationOutcome({ ...c.descriptor(context(), cmd), authorityKey: '0'.repeat(64) }), 'REJECTED');
  f.state.at = 999; await rejects(f.store.setUserActive(f.command('SET_USER_ACTIVE', 0, { active: true })), 'REJECTED');
  f.state.at = 1000;
  for (const field of ['revision', 'authorizationVersion']) {
    const row = f.rows.get(f.path('target')), before = structuredClone(row);
    row.user[field] = Number.MAX_SAFE_INTEGER;
    await rejects(f.store.setUserActive(f.command('SET_USER_ACTIVE', row.user.revision, { active: true })), 'OVERFLOW');
    f.rows.set(f.path('target'), before);
  }
  assert.equal(f.counts.writes, 2);
});
test('configuration and command inputs detach before any injected callback can mutate them', async () => {
  const f = fixture(); f.options.context.applicationAudience = 'changed';
  f.options.authorize = () => false;
  await f.store.enrollUser(f.command()); assert.equal(f.rows.size, 2);
  assert.throws(() => createFirestoreUserStore({ ...f.options, isAdmin: true }), /ACCESS_DENIED/);
});
