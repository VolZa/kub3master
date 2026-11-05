'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createLocalFirestoreClient } = require('../firestore-attempt-store.cjs');
const { createFirestoreUserStore, readUserInTransaction } = require('../firestore-user-store.cjs');
const { createFirestoreSessionPolicyStore, readCurrentPolicyInTransaction } = require('../firestore-session-policy-store.cjs');
const pc = require('../bd2-session-policy-contract.cjs');
const c = require('../bd2-user-contract.cjs');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw Error('INTEGRATION_BLOCKED: loopback Firestore Emulator required; no mock/production fallback');
const projectId = 'demo-kub-bd2-users-local', clients = [];
const principal = sub => ({ issuer: 'https://accounts.google.com', sub });
const context = () => ({ environment: 'TEST', applicationAudience: 'users-it-' + randomBytes(12).toString('hex'), expectedScriptId: 'isolated-users-no-GAS' });
function fixture(ctx = context()) {
  const db = createLocalFirestoreClient({ host, projectId }); clients.push(db);
  const state = { allowed: true, authorizations: 0, transactions: 0 };
  const run = db.runTransaction.bind(db);
  db.runTransaction = (...args) => { state.transactions++; return run(...args); };
  const store = createFirestoreUserStore({ firestore: db, context: ctx,
    authorize: async () => { state.authorizations++; return state.allowed; } });
  const root = db.collection(c.ROOT).doc(c.authorityKey(ctx));
  function command(kind = 'ENROLL_USER', expectedRevision = null, payload = {}, target = 'target') {
    return c.createCommand(ctx, { commandId: randomBytes(32).toString('hex'), actor: principal('fixture-actor'),
      target: principal(target), kind, expectedRevision, payload });
  }
  return { db, store, state, ctx, root, command,
    userRef: target => root.collection('users').doc(c.userKey(principal(target))),
    operationRef: cmd => root.collection('operations').doc(cmd.operationId) };
}
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
const reject = (p, outcome) => assert.rejects(p, e => e instanceof c.UserStoreError && e.outcome === outcome);

// Test-only coordinator; results are inspected locally, never reused as authority in another transaction.
async function readPair(f, afterUser = () => {}) {
  const reads = [];
  const result = await f.db.runTransaction(async tx => {
    for (const method of ['create', 'update', 'set', 'delete']) tx[method] = () => assert.fail('read-only coordinator wrote');
    const port = { firestore: { collection: f.db.collection.bind(f.db) }, context: f.ctx,
      get: ref => { reads.push(ref.path); return tx.get(ref); } };
    const user = await readUserInTransaction(port, principal('target'));
    afterUser(); // May START a competing writer, but must never await it under read locks.
    const policy = await readCurrentPolicyInTransaction(port);
    if (!user || !policy) throw Error('REQUIRED_STATE_MISSING');
    assert.ok(Object.isFrozen(user)); assert.ok(Object.isFrozen(policy));
    return { user, policy };
  }, { maxAttempts: 1 });
  return { ...result, reads };
}
const policyCommand = (f, idle, version = 1) => pc.createCommand(f.ctx, {
  commandId: randomBytes(32).toString('hex'), actor: principal('fixture-actor'),
  kind: idle === undefined ? 'INITIALIZE_SESSION_POLICY' : 'UPDATE_SESSION_POLICY',
  expectedPolicyVersion: idle === undefined ? null : version, payload: idle === undefined ? {} : { idleTimeoutMinutes: idle },
});
function policyStore(f) {
  return createFirestoreSessionPolicyStore({ firestore: f.db, context: f.ctx, authorize: () => true });
}
async function pairFixture() {
  const a = fixture(), b = fixture(a.ctx), policies = policyStore(a);
  await a.store.enrollUser(a.command()); await policies.initializeSessionPolicy(policyCommand(a));
  return { a, b, policies };
}
async function durableRows(f) {
  const names = ['users', 'operations', 'session_policy', 'session_policy_history', 'session_policy_operations'];
  return Promise.all(names.map(async name => [name,
    (await f.root.collection(name).orderBy('__name__').get()).docs.map(d => [d.id, d.data()])]));
}

test('external readers share exactly one SDK transaction across independent clients without authorization or writes', async () => {
  const { a, b } = await pairFixture(), before = await durableRows(a);
  for (const f of [a, b]) {
    const calls = f.state.transactions, auth = f.state.authorizations, pair = await readPair(f);
    assert.equal(pair.user.active, false); assert.deepEqual(pair.user.roles, []); assert.equal(pair.policy.policyVersion, 1);
    assert.equal(pair.reads.length, 4); assert.equal(new Set(pair.reads).size, 4);
    assert.equal(f.state.transactions, calls + 1); assert.equal(f.state.authorizations, auth);
    assert.deepEqual(pair.user, await f.store.getUser(principal('target')));
    assert.deepEqual(pair.policy, await policyStore(f).getCurrentPolicy());
  }
  assert.deepEqual(await durableRows(a), before);
});

test('test-only coordinator refuses missing User/Policy and corrupt persisted evidence with zero writes', async () => {
  for (const damage of ['missing user', 'missing policy', 'corrupt user', 'corrupt policy', 'missing anchor']) {
    const { a, b } = await pairFixture();
    if (damage === 'missing user') await a.userRef('target').delete();
    if (damage === 'missing policy') {
      for (const name of ['session_policy', 'session_policy_history', 'session_policy_operations'])
        for (const doc of (await a.root.collection(name).get()).docs) await doc.ref.delete();
    }
    if (damage === 'corrupt user') await a.userRef('target').update({ 'user.roles': ['OWNER'] });
    if (damage === 'corrupt policy') await a.root.collection('session_policy').doc('current').update({ storageSchemaVersion: 2 });
    if (damage === 'missing anchor') {
      const ps = policyStore(a); await ps.updateSessionPolicy(policyCommand(a, 30));
      await ps.updateSessionPolicy(policyCommand(a, 360, 2)); await a.root.collection('session_policy_history').doc('1').delete();
    }
    const before = await durableRows(a), calls = b.state.transactions, auth = b.state.authorizations;
    await assert.rejects(readPair(b), e => damage.startsWith('missing ') && damage !== 'missing anchor' ?
      e.message === 'REQUIRED_STATE_MISSING' : e.outcome === 'INVALID');
    assert.equal(b.state.transactions, calls + 1); assert.equal(b.state.authorizations, auth);
    assert.deepEqual(await durableRows(a), before);
  }
});

// Deliberate test-only coupled update: both normal store schemas/receipts/history stay valid.
// It is not exported or composed into runtime issuance/authorization.
async function coupledUpdate(f) {
  const userCommand = f.command('SET_USER_ACTIVE', 0, { active: true }), command = policyCommand(f, 30);
  return f.db.runTransaction(async tx => {
    const userRef = f.userRef('target'), currentRef = f.root.collection('session_policy').doc('current');
    const envelope = (await tx.get(userRef)).data(), record = (await tx.get(currentRef)).data();
    const before = c.validateEnvelope(f.ctx, envelope, c.userKey(principal('target'))).user;
    const policy = pc.validateRecord(f.ctx, record).policy, at = Math.max(Date.now(), envelope.updatedAtMs, policy.updatedAtMs);
    const plan = c.transition(f.ctx, userCommand, before), receipt = pc.createReceipt(f.ctx, command, policy, at);
    assert.equal(plan.outcome, 'UPDATED'); assert.equal(receipt.outcome, 'UPDATED');
    tx.update(userRef, c.validateEnvelope(f.ctx, { ...envelope, user: plan.user, updatedAtMs: at,
      updatedBy: userCommand.actor, lastOperationId: userCommand.operationId }, c.userKey(principal('target'))));
    tx.create(f.operationRef(userCommand), c.createReceipt(f.ctx, userCommand, before, plan.user, plan.outcome, at));
    tx.update(currentRef, pc.createRecord(f.ctx, receipt.afterPolicy, command.operationId));
    tx.create(f.root.collection('session_policy_history').doc('2'), pc.createHistory(f.ctx, receipt.afterPolicy, command.operationId));
    tx.create(f.root.collection('session_policy_operations').doc(command.operationId), receipt);
  }, { maxAttempts: 1 });
}

for (const mode of ['User version', 'Policy update', 'atomic coupled User/Policy']) {
  test('external snapshot remains consistent during concurrent ' + mode, { timeout: 45000 }, async t => {
    const { a, b, policies } = await pairFixture(); let writer;
    const userCmd = a.command('SET_USER_ACTIVE', 0, { active: true }), policyCmd = policyCommand(a, 30);
    const write = () => mode === 'User version' ? a.store.setUserActive(userCmd) :
      mode === 'Policy update' ? policies.updateSessionPolicy(policyCmd) : coupledUpdate(a);
    const start = a.state.transactions, readerStart = b.state.transactions;
    const observed = await Promise.allSettled([readPair(b, () => {
      // Handle rejection immediately; settle it only AFTER the reader releases its locks.
      writer = Promise.allSettled([write()]);
    })]);
    const [written] = await writer;
    assert.equal(a.state.transactions, start + 1); assert.equal(b.state.transactions, readerStart + 1);
    const check = pair => {
      const u = pair.user.authorizationVersion, p = pair.policy.policyVersion;
      if (mode === 'User version') { assert.ok([0, 1].includes(u)); assert.equal(p, 1); }
      else if (mode === 'Policy update') { assert.equal(u, 0); assert.ok([1, 2].includes(p)); }
      else assert.ok((u === 0 && p === 1) || (u === 1 && p === 2), 'no mixed snapshot across an atomic write');
      assert.equal(pair.user.revision, u); assert.equal(pair.user.active, u === 1);
      assert.equal(pair.policy.idleTimeoutMinutes, p === 1 ? 180 : 30);
    };
    if (observed[0].status === 'fulfilled') check(observed[0].value);
    else assert.ok([4, 10].includes(observed[0].reason.code), 'only SDK contention may abort the reader');
    if (written.status === 'rejected') assert.ok(written.reason.outcome === 'UNKNOWN' || [4, 10].includes(written.reason.code));
    const settled = await readPair(b); check(settled);
    if (written.status === 'fulfilled') {
      assert.equal(settled.user.authorizationVersion, mode === 'Policy update' ? 0 : 1);
      assert.equal(settled.policy.policyVersion, mode === 'User version' ? 1 : 2);
    }
    // A separate explicit test action ensures positive post-change evidence even if contention made no progress.
    if ((mode === 'User version' && settled.user.authorizationVersion === 0) ||
      (mode !== 'User version' && settled.policy.policyVersion === 1)) await write();
    const final = await readPair(b); check(final);
    assert.equal(final.user.authorizationVersion, mode === 'Policy update' ? 0 : 1);
    assert.equal(final.policy.policyVersion, mode === 'User version' ? 1 : 2);
    t.diagnostic(JSON.stringify({ mode, reader: observed[0].status, writer: written.status,
      finalUserVersion: final.user.authorizationVersion, finalPolicyVersion: final.policy.policyVersion }));
  });
}

test('local client rejects production hosts/projects, ADC options and endpoint substitution', () => {
  for (const options of [{ host: 'firestore.googleapis.com:443', projectId }, { host, projectId: 'real-project' },
    { host, projectId, credentials: {} }]) assert.throws(() => createLocalFirestoreClient(options), /ACCESS_DENIED/);
});
test('real SDK stores one atomic User/receipt pair with exact inactive initial state', async () => {
  const f = fixture(), cmd = f.command(), result = await f.store.enrollUser(cmd);
  assert.equal(result.receipt.outcome, 'CREATED');
  const storedUser = (await f.userRef('target').get()).data(), storedReceipt = (await f.operationRef(cmd).get()).data();
  assert.equal(storedUser.user.active, false); assert.deepEqual(storedUser.user.roles, []);
  assert.equal(storedUser.user.revision, 0); assert.equal(storedUser.user.authorizationVersion, 0);
  assert.equal(storedUser.lastOperationId, cmd.operationId);
  assert.deepEqual(c.validateReceipt(f.ctx, storedReceipt, cmd.operationId), result.receipt);
  await reject(f.store.enrollUser(f.command()), 'ALREADY_EXISTS');
  assert.equal((await f.root.collection('users').get()).size, 1);
  assert.equal((await f.root.collection('operations').get()).size, 1);
});
test('recovery rejects forged identities before SDK reads and preserves UNKNOWN/COMMITTED lookup', async () => {
  const f = fixture(), cmd = f.command(), d = c.descriptor(f.ctx, cmd);
  const getAll = f.db.getAll.bind(f.db);
  let reads = 0;
  f.db.getAll = (...args) => { reads++; return getAll(...args); };
  for (const committed of [false, true]) {
    const expected = committed ? await f.store.enrollUser(cmd) : { status: 'UNKNOWN' };
    const before = { reads, ...f.state };
    for (const patch of [{ operationId: '0'.repeat(64) }, { requestDigest: '0'.repeat(64) },
      { authorityKey: '0'.repeat(64) }, { operationId: 'invalid' }]) {
      await reject(f.store.lookupOperationOutcome({ ...d, ...patch }), 'REJECTED');
      assert.deepEqual({ reads, ...f.state }, before, 'invalid descriptor must not read, transact or authorize');
    }
    assert.deepEqual(await f.store.lookupOperationOutcome(d), expected);
    assert.deepEqual({ reads, ...f.state }, { ...before, reads: before.reads + 1 });
    assert.equal((await f.root.collection('users').get()).size, committed ? 1 : 0);
    assert.equal((await f.root.collection('operations').get()).size, committed ? 1 : 0);
  }
});
test('concurrent enrollment through independent SDK clients never duplicates User/receipt, including zero-progress UNKNOWN', async t => {
  const a = fixture(), b = fixture(a.ctx);
  const commands = [a.command(), b.command()];
  const outputs = await Promise.allSettled([a.store.enrollUser(commands[0]), b.store.enrollUser(commands[1])]);
  const acknowledgements = outputs.filter(x => x.status === 'fulfilled').length;
  assert.ok(acknowledgements <= 1);
  for (const x of outputs) if (x.status === 'rejected') assert.ok(['UNKNOWN', 'ALREADY_EXISTS'].includes(x.reason.outcome));
  const users = (await a.root.collection('users').get()).size;
  const receipts = (await a.root.collection('operations').get()).size;
  assert.ok(users <= 1); assert.equal(receipts, users); assert.ok(users >= acknowledgements);
  assert.equal(a.state.transactions, 1); assert.equal(b.state.transactions, 1);
  // maxAttempts=1 promises safety, not progress. An explicit fresh submission keeps the ORIGINAL ID.
  if (users === 0) {
    assert.ok(outputs.every(x => x.status === 'rejected' && x.reason.outcome === 'UNKNOWN'));
    const authBefore = a.state.authorizations;
    const submitted = await a.store.enrollUser(commands[0]);
    assert.equal(submitted.receipt.operationId, commands[0].operationId);
    assert.equal(a.state.authorizations, authBefore + 1);
  }
  assert.equal((await a.root.collection('users').get()).size, 1);
  assert.equal((await a.root.collection('operations').get()).size, 1);
  assert.equal((await b.store.getUser(principal('target'))).revision, 0);
  t.diagnostic(JSON.stringify({ independentClients: 2, concurrentUsers: users, concurrentReceipts: receipts,
    explicitOriginalResubmission: users === 0,
    outcomes: outputs.map(x => x.status === 'fulfilled' ? 'CREATED' : x.reason.outcome) }));
});
test('active/roles race with one expectedRevision cannot lose or silently merge an update', async t => {
  const a = fixture(), b = fixture(a.ctx); await a.store.enrollUser(a.command());
  const activeCommand = a.command('SET_USER_ACTIVE', 0, { active: true });
  const outputs = await Promise.allSettled([
    a.store.setUserActive(activeCommand),
    b.store.replaceUserRoles(b.command('REPLACE_USER_ROLES', 0, { roles: ['MANAGER'] })),
  ]);
  assert.ok(outputs.filter(x => x.status === 'fulfilled').length <= 1);
  for (const x of outputs) if (x.status === 'rejected') assert.ok(['UNKNOWN', 'CONFLICT'].includes(x.reason.outcome));
  let current = await b.store.getUser(principal('target'));
  const concurrentRevision = current.revision;
  assert.ok([0, 1].includes(concurrentRevision));
  assert.equal(current.authorizationVersion, concurrentRevision);
  assert.equal((await a.root.collection('operations').get()).size, concurrentRevision + 1);
  assert.equal(a.state.transactions, 2); assert.equal(b.state.transactions, 1);
  if (concurrentRevision === 0) {
    assert.equal(current.active, false); assert.deepEqual(current.roles, []);
    assert.ok(outputs.every(x => x.status === 'rejected' && x.reason.outcome === 'UNKNOWN'));
    await a.store.setUserActive(activeCommand); // Explicit same-command resubmission, not automatic store retry.
    current = await b.store.getUser(principal('target'));
  }
  assert.equal(current.revision, 1); assert.equal(current.authorizationVersion, 1);
  assert.ok(current.active && current.roles.length === 0 || !current.active && current.roles.join() === 'MANAGER');
  assert.equal((await a.root.collection('operations').get()).size, 2);
  await reject(b.store.replaceUserRoles(b.command('REPLACE_USER_ROLES', 0, { roles: ['ADMIN'] })), 'CONFLICT');
  assert.deepEqual(await b.store.getUser(principal('target')), current);
  t.diagnostic(JSON.stringify({ concurrentRevision, explicitOriginalResubmission: concurrentRevision === 0,
    revision: current.revision, authorizationVersion: current.authorizationVersion,
    outcomes: outputs.map(x => x.status === 'fulfilled' ? 'UPDATED' : x.reason.outcome) }));
});
test('concurrent identical command has one effect/receipt; replay returns historical result', async () => {
  const a = fixture(), b = fixture(a.ctx), cmd = a.command();
  const outputs = await Promise.allSettled([a.store.enrollUser(cmd), b.store.enrollUser(cmd)]);
  for (const x of outputs) if (x.status === 'rejected') assert.equal(x.reason.outcome, 'UNKNOWN');
  const saved = (await a.root.collection('operations').get()).size;
  assert.ok(saved <= 1); assert.equal((await a.root.collection('users').get()).size, saved);
  if (saved === 0) await a.store.enrollUser(cmd); // Explicit original ID; never mint a replacement.
  const original = await b.store.lookupOperationOutcome(c.descriptor(a.ctx, cmd));
  assert.equal(original.status, 'COMMITTED');
  await a.store.setUserActive(a.command('SET_USER_ACTIVE', 0, { active: true }));
  assert.deepEqual(await b.store.enrollUser(cmd), original);
  assert.equal(original.receipt.after.active, false);
  assert.equal((await b.store.getUser(principal('target'))).active, true);
  assert.equal((await a.root.collection('operations').get()).size, 2);
});
test('failure after staging User write aborts both User and receipt in the real transaction', async () => {
  const f = fixture(), cmd = f.command(), run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (callback, options) => run(tx => callback({ get: tx.get.bind(tx), update: tx.update.bind(tx),
    create(ref, value) { if (ref.path.includes('/operations/')) throw Error('fault after staged User create'); return tx.create(ref, value); },
  }), options);
  await reject(f.store.enrollUser(cmd), 'UNKNOWN');
  assert.equal((await f.userRef('target').get()).exists, false);
  assert.equal((await f.operationRef(cmd).get()).exists, false);
});
test('failed update commit leaves existing User unchanged and creates no operation receipt', async () => {
  const f = fixture(); await f.store.enrollUser(f.command());
  const before = (await f.userRef('target').get()).data();
  const cmd = f.command('SET_USER_ACTIVE', 0, { active: true }), run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (callback, options) => run(tx => callback({ get: tx.get.bind(tx), update: tx.update.bind(tx),
    create() { throw Error('fault after staged User update'); },
  }), options);
  await reject(f.store.setUserActive(cmd), 'UNKNOWN');
  assert.deepEqual((await f.userRef('target').get()).data(), before);
  assert.equal((await f.operationRef(cmd).get()).exists, false);
  assert.equal((await f.root.collection('operations').get()).size, 1);
});
test('lost acknowledgement plus identical Commit RPC yields real ABORTED but never a second outer transaction', async t => {
  const f = fixture(), cmd = f.command(), d = c.descriptor(f.ctx, cmd);
  const run = f.db.runTransaction.bind(f.db), rpc = f.db.request.bind(f.db);
  let calls = 0, commitRPCs = 0, injected = false, actualServerCode;
  f.db.runTransaction = (...args) => { calls++; return run(...args); };
  f.db.request = async (method, body, ...rest) => {
    if (method !== 'commit' || !body.transaction || injected) return rpc(method, body, ...rest);
    injected = true; commitRPCs++;
    await rpc(method, body, ...rest); // Both User and receipt commit; discard the successful acknowledgement.
    commitRPCs++;
    try { return await rpc(method, body, ...rest); }
    catch (error) { actualServerCode = error.code; throw error; }
  };
  await assert.rejects(f.store.enrollUser(cmd), error => {
    assert.equal(error.outcome, 'UNKNOWN'); assert.deepEqual(error.descriptor, d); return true;
  });
  assert.equal(actualServerCode, 10, 'ABORTED comes from the Emulator, not an invented error code');
  assert.equal(commitRPCs, 2); assert.equal(calls, 1); assert.equal(f.state.authorizations, 1);
  assert.equal((await f.store.lookupOperationOutcome(d)).status, 'COMMITTED');
  assert.equal((await f.root.collection('users').get()).size, 1);
  assert.equal((await f.root.collection('operations').get()).size, 1);
  assert.equal((await f.store.getUser(principal('target'))).revision, 0);
  assert.equal(calls, 1); assert.equal(f.state.authorizations, 1);
  t.diagnostic(JSON.stringify({ outerTransactions: calls, commitRPCs, actualServerCode,
    outcome: 'UNKNOWN', lookup: 'COMMITTED', users: 1, receipts: 1 }));
});
for (const afterCommit of [false, true]) {
  test(`UNKNOWN ${afterCommit ? 'after' : 'before'} commit: original descriptor, no retry or replacement, read-only recovery`, async t => {
    const f = fixture(), cmd = f.command(), d = c.descriptor(f.ctx, cmd), run = f.db.runTransaction.bind(f.db);
    let calls = 0;
    f.db.runTransaction = async (...args) => {
      calls++; if (afterCommit) await run(...args); throw Object.assign(Error('lost acknowledgement'), { code: 10 });
    };
    await assert.rejects(f.store.enrollUser(cmd), e => {
      assert.equal(e.outcome, 'UNKNOWN'); assert.deepEqual(e.descriptor, d); return true;
    });
    assert.equal(calls, 1);
    const checks = { authorizations: f.state.authorizations, transactions: f.state.transactions };
    const restarted = fixture(f.ctx);
    for (const store of [f.store, restarted.store]) for (let i = 0; i < 2; i++)
      assert.equal((await store.lookupOperationOutcome(d)).status, afterCommit ? 'COMMITTED' : 'UNKNOWN');
    assert.deepEqual({ authorizations: f.state.authorizations, transactions: f.state.transactions }, checks);
    assert.equal(restarted.state.transactions, 0); assert.equal(restarted.state.authorizations, 0);
    assert.equal((await f.root.collection('users').get()).size, afterCommit ? 1 : 0);
    assert.equal((await f.root.collection('operations').get()).size, afterCommit ? 1 : 0);
    assert.equal(calls, 1);
    t.diagnostic(JSON.stringify({ afterCommit, outerCalls: calls, lookup: afterCommit ? 'COMMITTED' : 'UNKNOWN', operationId: cmd.operationId }));
  });
}
for (const afterCommit of [false, true]) {
  test(`explicit same-command submission after UNKNOWN ${afterCommit ? 'after' : 'before'} commit requires fresh authorization`, async () => {
    const f = fixture(), cmd = f.command(), run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = async (...args) => { if (afterCommit) await run(...args); throw Error('ambiguous'); };
    await reject(f.store.enrollUser(cmd), 'UNKNOWN'); f.db.runTransaction = run;
    f.state.allowed = false; const count = f.state.authorizations;
    await reject(f.store.enrollUser(cmd), 'REJECTED'); assert.equal(f.state.authorizations, count + 1);
    assert.equal((await f.root.collection('operations').get()).size, afterCommit ? 1 : 0);
    f.state.allowed = true;
    const result = await f.store.enrollUser(cmd); assert.equal(result.receipt.operationId, cmd.operationId);
    assert.equal((await f.root.collection('operations').get()).size, 1);
    assert.equal((await f.store.getUser(principal('target'))).revision, 0);
  });
}
test('no-op receipt does not update User; later reads observe roles, active, disable and re-enable', async () => {
  const a = fixture(), b = fixture(a.ctx); await a.store.enrollUser(a.command());
  const before = (await a.userRef('target').get()).data();
  const noop = await a.store.setUserActive(a.command('SET_USER_ACTIVE', 0, { active: false }));
  assert.equal(noop.receipt.outcome, 'NOOP'); assert.deepEqual((await a.userRef('target').get()).data(), before);
  await a.store.replaceUserRoles(a.command('REPLACE_USER_ROLES', 0, { roles: ['MANAGER'] }));
  assert.deepEqual((await b.store.getUser(principal('target'))).roles, ['MANAGER']);
  for (const [revision, active] of [[1, true], [2, false], [3, true]]) {
    await a.store.setUserActive(a.command('SET_USER_ACTIVE', revision, { active }));
    const u = await b.store.getUser(principal('target'));
    assert.equal(u.active, active); assert.equal(u.authorizationVersion, revision + 1);
  }
  await reject(a.store.setUserActive(a.command('SET_USER_ACTIVE', 0, { active: true })), 'CONFLICT');
});
test('namespace, context and corrupt records fail closed; default store cannot enroll or grant ADMIN', async () => {
  const f = fixture(), foreign = fixture(), cmd = f.command(); await f.store.enrollUser(cmd);
  assert.equal(await foreign.store.getUser(principal('target')), undefined);
  await reject(foreign.store.enrollUser(cmd), 'REJECTED');
  await f.userRef('target').update({ 'user.roles': ['OWNER'] });
  await reject(f.store.getUser(principal('target')), 'INVALID');
  await f.operationRef(cmd).update({ outcome: 'NOOP' });
  assert.equal((await f.store.lookupOperationOutcome(c.descriptor(f.ctx, cmd))).status, 'INVALID');
  const closed = createFirestoreUserStore({ firestore: f.db, context: f.ctx });
  await reject(closed.enrollUser(f.command('ENROLL_USER', null, {}, 'other')), 'REJECTED');
  assert.equal((await f.userRef('other').get()).exists, false);
});
