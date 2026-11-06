'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const c = require('../bd2-session-contract.cjs');
const { createFirestoreSessionCreationIntentStore: createStore } = require('../firestore-session-creation-intent-store.cjs');
const ctx = { environment: 'TEST', applicationAudience: 'intent-unit', expectedScriptId: 'isolated' };
const hex = digit => digit.repeat(64);
const copy = value => structuredClone(value);
const raw = () => ({ commandId: hex('a'), kind: 'CREATE_SESSION',
  attempt: { collectionId: 'bd2_login_attempts_v1', clientId: 'unit.apps.googleusercontent.com',
    attemptId: hex('b'), bindingDigest: hex('c') },
  principal: { issuer: 'https://accounts.google.com', sub: 'subject' },
  createdAtMs: 1_800_000_000_000, sessionDigest: hex('d') });
const command = (patch = {}, context = ctx) => c.createCommand(context, { ...raw(), ...patch });
const hash = tuple => createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex');

// The fake stages writes separately from commit and records ALL mutation methods.
function fixture(rows = new Map()) {
  const events = [], state = { mode: '', release: null };
  const forbidden = name => () => { events.push([name]); assert.fail(name); };
  function ref(path) {
    return { path, collection: name => ref(`${path}/${name}`), doc: id => ref(`${path}/${id}`),
      async get() {
        events.push(['read', path]);
        if (state.mode === 'read-error') throw Error('private SDK details');
        return snapshot(path);
      } };
  }
  const snapshot = path => ({ exists: rows.has(path), data: () => copy(rows.get(path)) });
  const firestore = { collection: name => ref(name), async runTransaction(callback, options) {
    events.push(['transaction', options]);
    if (state.mode === 'before') throw Object.assign(Error('ABORTED secret'), { code: 10 });
    const staged = [];
    const out = await callback({ async get(r) { events.push(['get', r.path]); return snapshot(r.path); },
      create(r, record) { events.push(['create', r.path]); staged.push([r.path, copy(record)]); },
      set: forbidden('set'), update: forbidden('update'), delete: forbidden('delete') });
    if (state.mode === 'pause') await new Promise(resolve => { state.release = resolve; });
    if (state.mode === 'after-callback') throw Error('outer promise failed');
    for (const [path, record] of staged) { assert.ok(!rows.has(path)); rows.set(path, record); }
    events.push(['commit']);
    if (state.mode === 'lost-ack') throw Error('acknowledgement lost');
    return out;
  } };
  return { rows, events, state, firestore, store: createStore({ firestore, context: ctx }) };
}
const writes = f => f.events.filter(e => ['create', 'set', 'update', 'delete'].includes(e[0]));
const transactions = f => f.events.filter(e => e[0] === 'transaction');

test('exact UTF-8 authority/attempt/request/operation hashes, namespace and V1 persisted schema', async () => {
  const f = fixture(), cmd = command(), a = cmd.attempt, d = c.descriptor(ctx, cmd);
  const authority = hash(['KUB_BD2_USER_AUTHORITY_V1', ctx.environment, ctx.applicationAudience, ctx.expectedScriptId]);
  assert.equal(d.authorityKey, authority);
  assert.equal(d.attemptKey, hash(['KUB_BD2_SESSION_CREATION_ATTEMPT_V1', authority, a.collectionId, a.attemptId]));
  assert.equal(d.requestDigest, hash(['KUB_BD2_SESSION_CREATION_REQUEST_V1', cmd.profile, 1, authority,
    cmd.commandId, cmd.kind, [a.collectionId, a.clientId, a.attemptId, a.bindingDigest],
    [cmd.principal.issuer, cmd.principal.sub], cmd.createdAtMs, cmd.sessionDigest]));
  assert.equal(d.operationId, hash(['KUB_BD2_SESSION_CREATION_OPERATION_ID_V1', authority, d.requestDigest]));
  assert.deepEqual(await f.store.createOriginal(cmd), { status: 'NEW', descriptor: d });
  const path = `bd2_user_authorities_v1/${authority}/session_creation_intents/${d.attemptKey}`;
  assert.deepEqual([...f.rows.keys()], [path]);
  assert.deepEqual(f.rows.get(path), { storageProfile: 'KUB_BD2_SESSION_CREATION_INTENT_V1', storageSchemaVersion: 1,
    ...d, canonicalCommand: cmd });
  assert.deepEqual(f.events, [['transaction', { maxAttempts: 1 }], ['get', path], ['create', path], ['commit']]);
});

test('NEW waits for outer commit, and caller mutation after validation cannot change persisted command', async () => {
  const f = fixture(), input = copy(command()); f.state.mode = 'pause';
  let settled = false;
  const pending = f.store.createOriginal(input).then(out => { settled = true; return out; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false); assert.equal(f.rows.size, 0);
  input.principal.sub = 'caller-mutated'; input.createdAtMs++;
  f.state.release(); assert.equal((await pending).status, 'NEW');
  assert.deepEqual([...f.rows.values()][0].canonicalCommand, command());
});

test('identical replay and reordered input are EXISTING with zero additional writes', async () => {
  const f = fixture(), cmd = command(); await f.store.createOriginal(cmd);
  const before = copy([...f.rows]); f.events.length = 0;
  const reordered = Object.fromEntries(Object.entries(copy(cmd)).reverse());
  assert.equal((await f.store.createOriginal(reordered)).status, 'EXISTING');
  assert.deepEqual([...f.rows], before); assert.deepEqual(writes(f), []);
});

const changes = { principal: { principal: { issuer: 'https://accounts.google.com', sub: 'other' } },
  S: { createdAtMs: raw().createdAtMs + 1 }, sessionDigest: { sessionDigest: hex('e') },
  commandId: { commandId: hex('f') },
  clientId: { attempt: { ...raw().attempt, clientId: 'other.apps.googleusercontent.com' } },
  bindingDigest: { attempt: { ...raw().attempt, bindingDigest: hex('e') } } };
for (const [name, patch] of Object.entries(changes)) {
  test(`changed ${name} (and recomputed operationId) conflicts in the SAME physical slot`, async () => {
    const f = fixture(), original = command(), changed = command(patch);
    await f.store.createOriginal(original); const before = copy([...f.rows]); f.events.length = 0;
    assert.equal(c.descriptor(ctx, changed).attemptKey, c.descriptor(ctx, original).attemptKey);
    assert.notEqual(changed.operationId, original.operationId);
    assert.equal((await f.store.createOriginal(changed)).status, 'CONFLICT');
    assert.equal((await f.store.lookupIntent(c.descriptor(ctx, changed))).status, 'CONFLICT');
    assert.deepEqual([...f.rows], before); assert.deepEqual(writes(f), []);
  });
}

test('invalid command/digest/authority/framing rejected before I/O; strict options reject path/callback inputs', async () => {
  const f = fixture(), original = command();
  let getters = 0;
  const accessor = copy(original); Object.defineProperty(accessor, 'kind', { get() { getters++; } });
  const bad = [null, {}, accessor, { ...original, sid: 'raw-secret' },
    { ...original, requestDigest: hex('0') }, { ...original, operationId: hex('0') },
    { ...original, authorityKey: hex('0') }, { ...original, createdAtMs: original.createdAtMs + 1 },
    { ...original, attempt: { ...original.attempt, collectionId: '../escape' } },
    command({}, { ...ctx, applicationAudience: 'other' })];
  for (const value of bad) assert.deepEqual(await f.store.createOriginal(value), { status: 'INVALID' });
  assert.deepEqual(f.events, []); assert.equal(getters, 0);
  for (const field of ['path', 'collectionId', 'authorize', 'dispatch', 'now'])
    assert.throws(() => createStore({ firestore: f.firestore, context: ctx, [field]: () => assert.fail(field) }), /ACCESS_DENIED/);
});

test('strict persisted validation rejects corruption, wrong authority and misplaced physical locator without repair', async () => {
  const cmd = command(), good = c.createIntent(ctx, cmd), path = c.paths(ctx, c.descriptor(ctx, cmd)).intent;
  const foreignContext = { ...ctx, expectedScriptId: 'other' };
  const otherLocator = command({ attempt: { ...raw().attempt, attemptId: hex('e') } });
  const corruptions = [null, {}, { ...good, rawSID: 'secret' }, { ...good, storageSchemaVersion: 2 },
    { ...good, sessionDigest: hex('0') }, { ...good, canonicalCommand: { ...cmd, operationId: hex('0') } },
    c.createIntent(foreignContext, command({}, foreignContext)), c.createIntent(ctx, otherLocator),
    c.createIntent(ctx, command({ attempt: { ...raw().attempt, collectionId: 'other_attempts' } }))];
  for (const corrupt of corruptions) {
    const f = fixture(new Map([[path, corrupt]])), before = copy([...f.rows]);
    assert.equal((await f.store.createOriginal(cmd)).status, 'INVALID');
    assert.equal((await f.store.lookupIntent(c.descriptor(ctx, cmd))).status, 'INVALID');
    assert.deepEqual(writes(f), []); assert.deepEqual([...f.rows], before);
  }
});

for (const mode of ['before', 'after-callback', 'lost-ack']) {
  test(`${mode}: exception/ABORTED is UNKNOWN, never callback-based NEW or automatic retry`, async () => {
    const f = fixture(), cmd = command(); f.state.mode = mode;
    const out = await f.store.createOriginal(cmd);
    assert.deepEqual(out, { status: 'UNKNOWN', descriptor: c.descriptor(ctx, cmd) });
    assert.equal(transactions(f).length, 1); assert.deepEqual(transactions(f)[0][1], { maxAttempts: 1 });
    assert.equal(f.rows.size, mode === 'lost-ack' ? 1 : 0);
    assert.equal(writes(f).length, mode === 'before' ? 0 : 1);
    const calls = transactions(f).length;
    const recovered = await f.store.lookupIntent(out.descriptor);
    assert.equal(recovered.status, mode === 'lost-ack' ? 'FOUND' : 'UNKNOWN');
    if (mode !== 'lost-ack') assert.equal(recovered.evidence, 'MISSING');
    assert.equal(transactions(f).length, calls);
  });
}

test('outer rejection after reading existing/conflicting/invalid evidence also remains UNKNOWN', async () => {
  for (const record of [c.createIntent(ctx, command()), c.createIntent(ctx, command(changes.S)), {}]) {
    const cmd = command(), path = c.paths(ctx, c.descriptor(ctx, cmd)).intent;
    const f = fixture(new Map([[path, record]])); f.state.mode = 'after-callback';
    assert.equal((await f.store.createOriginal(cmd)).status, 'UNKNOWN'); assert.deepEqual(writes(f), []);
  }
});

test('lookup uses one exact point read, repeats across restart with zero transactions/writes or adoption', async () => {
  const f = fixture(), cmd = command(), d = c.descriptor(ctx, cmd);
  await f.store.createOriginal(cmd); const before = copy([...f.rows]); f.events.length = 0;
  for (const store of [f.store, createStore({ firestore: f.firestore, context: ctx })]) {
    for (let i = 0; i < 3; i++) {
      const out = await store.lookupIntent(d);
      assert.deepEqual(out, { status: 'FOUND', intent: c.createIntent(ctx, cmd) });
      assert.ok(Object.isFrozen(out)); assert.ok(Object.isFrozen(out.intent.canonicalCommand.principal));
      assert.deepEqual(Object.keys(out).sort(), ['intent', 'status']);
    }
  }
  assert.deepEqual(f.events, Array.from({ length: 6 }, () => ['read', c.paths(ctx, d).intent]));
  assert.deepEqual([...f.rows], before);
});

test('missing/read failure/forged descriptors cannot recover authority or submit creation', async () => {
  const f = fixture(), d = c.descriptor(ctx, command());
  assert.deepEqual(await f.store.lookupIntent(d), { status: 'UNKNOWN', evidence: 'MISSING' });
  f.state.mode = 'read-error'; assert.deepEqual(await f.store.lookupIntent(d), { status: 'UNAVAILABLE' });
  const count = f.events.length;
  for (const bad of [null, {}, { ...d, authorityKey: hex('0') }, { ...d, operationId: hex('0') },
    { ...d, attemptKey: '../escape' }, { ...d, path: 'sessions/secret' }])
    assert.deepEqual(await f.store.lookupIntent(bad), { status: 'INVALID' });
  assert.equal(f.events.length, count); assert.deepEqual(transactions(f), []); assert.deepEqual(writes(f), []);
  // A syntactically valid substituted key is only an unauthenticated locator.
  f.state.mode = '';
  assert.deepEqual(await f.store.lookupIntent({ ...d, attemptKey: hex('0') }), { status: 'UNKNOWN', evidence: 'MISSING' });
});
