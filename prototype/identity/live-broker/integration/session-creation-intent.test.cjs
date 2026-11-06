'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { createLocalFirestoreClient } = require('../firestore-attempt-store.cjs');
const { createFirestoreSessionCreationIntentStore: createStore } = require('../firestore-session-creation-intent-store.cjs');
const { createSessionCreationCoordinator } = require('../bd2-session-creation-coordinator.cjs');
const c = require('../bd2-session-contract.cjs');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw Error('INTEGRATION_BLOCKED: loopback Firestore Emulator required; no mock/production fallback');
const projectId = 'demo-kub-intent-' + randomBytes(6).toString('hex');
const clients = [], fixtures = [];
const copy = value => structuredClone(value);
const context = () => ({ environment: 'TEST', applicationAudience: 'intent-it-' + randomBytes(10).toString('hex'), expectedScriptId: 'isolated-no-GAS' });
function command(ctx, patch = {}) {
  return c.createCommand(ctx, { commandId: randomBytes(32).toString('hex'), kind: 'CREATE_SESSION',
    attempt: { collectionId: 'original_attempts', clientId: 'unit.apps.googleusercontent.com',
      attemptId: randomBytes(32).toString('hex'), bindingDigest: randomBytes(32).toString('hex') },
    principal: { issuer: 'https://accounts.google.com', sub: 'fixture' },
    createdAtMs: 1_800_000_000_000, sessionDigest: randomBytes(32).toString('hex'), ...patch });
}
function changed(ctx, original, patch) {
  const { commandId, kind, attempt, principal, createdAtMs, sessionDigest } = original;
  return c.createCommand(ctx, { commandId, kind, attempt, principal, createdAtMs, sessionDigest, ...patch });
}
function fixture(ctx = context()) {
  const db = createLocalFirestoreClient({ host, projectId }); clients.push(db);
  const state = { transactions: 0, callbacks: 0, creates: [], reads: [], mode: '' };
  const run = db.runTransaction.bind(db), getAll = db.getAll.bind(db);
  db.runTransaction = async (fn, options) => {
    state.transactions++; assert.deepEqual(options, { maxAttempts: 1 });
    const outcome = await run(async tx => {
      state.callbacks++;
      const out = await fn({
        get(ref) { state.reads.push(ref.path); return tx.get(ref); },
        create(ref, record) { state.creates.push(ref.path); return tx.create(ref, record); },
        set() { assert.fail('set forbidden'); }, update() { assert.fail('update forbidden'); }, delete() { assert.fail('delete forbidden'); },
      });
      if (state.mode === 'before-commit') throw Object.assign(Error('injected failure before commit'), { code: 10 });
      return out;
    }, options);
    if (state.mode === 'lost-ack') throw Error('injected lost acknowledgement after actual commit');
    return outcome;
  };
  db.getAll = (...args) => {
    if (state.mode === 'read-failure') throw Error('injected SDK point-read failure');
    return getAll(...args);
  };
  const root = db.collection(c.ROOT).doc(c.authorityKey(ctx));
  const f = { db, ctx, state, root, store: createStore({ firestore: db, context: ctx }),
    owner: createSessionCreationCoordinator({ firestore: db, context: ctx }),
    ref: cmd => db.doc(c.paths(ctx, c.descriptor(ctx, cmd)).intent) };
  fixtures.push(f); return f;
}
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
const version = snap => [snap.createTime.toMillis(), snap.updateTime.toMillis()];
const counts = f => [f.state.transactions, f.state.callbacks, f.state.creates.length];

test('E-01 first creation: real SDK confirmed NEW and exact V1 schema at exact namespace', { timeout: 20000 }, async () => {
  const f = fixture(), cmd = command(f.ctx), d = c.descriptor(f.ctx, cmd);
  assert.deepEqual(await f.owner.createOriginal(cmd), { status: 'NEW', descriptor: d });
  const snap = await f.ref(cmd).get();
  assert.equal(snap.exists, true);
  assert.deepEqual(snap.data(), { storageProfile: 'KUB_BD2_SESSION_CREATION_INTENT_V1', storageSchemaVersion: 1,
    ...d, canonicalCommand: cmd });
  assert.deepEqual(f.state.reads, [f.ref(cmd).path]); assert.deepEqual(f.state.creates, [f.ref(cmd).path]);
  assert.deepEqual(counts(f), [1, 1, 1]);
});

test('E-02 identical replay: EXISTING with unchanged record/updateTime and no second write', async () => {
  const f = fixture(), cmd = command(f.ctx); assert.equal((await f.store.createOriginal(cmd)).status, 'NEW');
  const before = await f.ref(cmd).get();
  assert.equal((await f.store.createOriginal(cmd)).status, 'EXISTING');
  const after = await f.ref(cmd).get();
  assert.deepEqual(after.data(), before.data()); assert.deepEqual(version(after), version(before));
  assert.deepEqual(counts(f), [2, 2, 1]);
});

test('E-03 conflicting replays: principal/S/digest/client/binding/command changes never rebind physical Attempt', async () => {
  const f = fixture(), cmd = command(f.ctx); await f.store.createOriginal(cmd);
  const before = await f.ref(cmd).get();
  for (const patch of [{ createdAtMs: cmd.createdAtMs + 1 }, { principal: { ...cmd.principal, sub: 'other' } },
    { sessionDigest: 'e'.repeat(64) }, { commandId: 'f'.repeat(64) },
    { attempt: { ...cmd.attempt, clientId: 'other.apps.googleusercontent.com' } },
    { attempt: { ...cmd.attempt, bindingDigest: 'e'.repeat(64) } }]) {
    const rival = changed(f.ctx, cmd, patch);
    assert.equal(f.ref(rival).path, f.ref(cmd).path);
    assert.equal((await f.store.createOriginal(rival)).status, 'CONFLICT');
    assert.equal((await f.store.lookupIntent(c.descriptor(f.ctx, rival))).status, 'CONFLICT');
  }
  const after = await f.ref(cmd).get();
  assert.deepEqual(after.data(), before.data()); assert.deepEqual(version(after), version(before));
  assert.equal(f.state.creates.length, 1);
});

for (const identical of [true, false]) {
  test(`E-04 independent SDK clients race with ${identical ? 'identical' : 'conflicting'} commands`, { timeout: 30000 }, async t => {
    const a = fixture(), b = fixture(a.ctx), first = command(a.ctx);
    const second = identical ? first : changed(a.ctx, first, { createdAtMs: first.createdAtMs + 1 });
    const outcomes = await Promise.all([a.store.createOriginal(first), b.store.createOriginal(second)]);
    assert.ok(outcomes.every(o => ['NEW', 'EXISTING', 'CONFLICT', 'UNKNOWN'].includes(o.status)));
    const acknowledged = outcomes.filter(o => o.status === 'NEW').length;
    assert.ok(acknowledged <= 1);
    assert.deepEqual([a.state.transactions, b.state.transactions, a.state.callbacks, b.state.callbacks], [1, 1, 1, 1]);
    const docs = await a.root.collection('session_creation_intents').get();
    assert.ok(docs.size <= 1); assert.ok(docs.size >= acknowledged);
    if (!docs.empty) {
      const record = c.validateIntent(a.ctx, docs.docs[0].data(), c.descriptor(a.ctx, first).attemptKey);
      assert.ok([first, second].some(cmd => JSON.stringify(c.createIntent(a.ctx, cmd)) === JSON.stringify(record)));
      const before = await a.ref(first).get(), previous = [counts(a), counts(b)];
      await a.store.lookupIntent(c.descriptor(a.ctx, first)); await b.store.lookupIntent(c.descriptor(a.ctx, second));
      assert.deepEqual([counts(a), counts(b)], previous);
      const after = await a.ref(first).get(); assert.deepEqual(version(after), version(before));
    } else {
      assert.ok(outcomes.every(o => o.status === 'UNKNOWN'));
      assert.deepEqual(await a.store.lookupIntent(c.descriptor(a.ctx, first)), { status: 'UNKNOWN', evidence: 'MISSING' });
      // No forced winner and NO explicit or automatic resubmission on zero progress.
    }
    t.diagnostic(JSON.stringify({ independentClients: 2, identical, outcomes: outcomes.map(o => o.status),
      persistedIntents: docs.size, confirmedNew: acknowledged, creationResubmissions: 0 }));
  });
}

test('E-05 lost acknowledgement after REAL commit: UNKNOWN, independent lookup FOUND, no retry/permit', async () => {
  const a = fixture(), b = fixture(a.ctx), cmd = command(a.ctx); a.state.mode = 'lost-ack';
  const out = await a.owner.createOriginal(cmd);
  assert.equal(out.status, 'UNKNOWN'); assert.deepEqual(counts(a), [1, 1, 1]);
  const snap = await b.ref(cmd).get(); assert.equal(snap.exists, true);
  const before = [counts(a), counts(b)];
  for (let i = 0; i < 3; i++) {
    const recovered = await b.owner.lookupIntent(out.descriptor);
    assert.deepEqual(recovered, { status: 'FOUND', intent: c.createIntent(a.ctx, cmd) });
  }
  assert.deepEqual([counts(a), counts(b)], before);
  assert.deepEqual(version(await b.ref(cmd).get()), version(snap));
});

test('E-06 real transaction failure before commit: UNKNOWN + missing evidence, never rollback authority or retry', async () => {
  const a = fixture(), b = fixture(a.ctx), cmd = command(a.ctx); a.state.mode = 'before-commit';
  const out = await a.store.createOriginal(cmd);
  assert.equal(out.status, 'UNKNOWN'); assert.deepEqual(counts(a), [1, 1, 1]);
  assert.equal((await b.ref(cmd).get()).exists, false);
  const before = [counts(a), counts(b)];
  for (let i = 0; i < 3; i++) assert.deepEqual(await b.store.lookupIntent(out.descriptor), { status: 'UNKNOWN', evidence: 'MISSING' });
  assert.deepEqual([counts(a), counts(b)], before);
});

test('E-07 corrupt persisted record: INVALID, no repair and immutable updateTime', async () => {
  const f = fixture(), cmd = command(f.ctx), bad = { storageProfile: c.INTENT_PROFILE, storageSchemaVersion: 1, corrupt: true };
  await f.ref(cmd).create(bad); const before = await f.ref(cmd).get();
  assert.equal((await f.store.createOriginal(cmd)).status, 'INVALID');
  assert.deepEqual(await f.store.lookupIntent(c.descriptor(f.ctx, cmd)), { status: 'INVALID' });
  const after = await f.ref(cmd).get();
  assert.deepEqual(after.data(), bad); assert.deepEqual(version(after), version(before)); assert.equal(f.state.creates.length, 0);
});

test('E-08 child dies after commit before returning acknowledgement; new process/store can only look up data',
  { timeout: 35000 }, async () => {
    const f = fixture(), cmd = command(f.ctx), endpoint = { host, projectId };
    const childScript = `
const fs=require('node:fs'),input=JSON.parse(fs.readFileSync(0,'utf8'));
const {createLocalFirestoreClient}=require('./firestore-attempt-store.cjs');
const {createSessionCreationCoordinator}=require('./bd2-session-creation-coordinator.cjs');
const c=require('./bd2-session-contract.cjs');
const db=createLocalFirestoreClient(input.endpoint),run=db.runTransaction.bind(db);
let submissions=0,writes=0;
db.runTransaction=async(fn,options)=>{
 submissions++;
 if(input.mode==='lookup')throw Error('restart must not submit creation');
 const out=await run(tx=>fn({get:tx.get.bind(tx),create(ref,value){writes++;return tx.create(ref,value);}}),options);
 fs.writeSync(1,JSON.stringify({submissions,writes,descriptor:c.descriptor(input.context,input.command)}));
 process.exit(77); // Abrupt process loss, no SDK termination and no store acknowledgement.
 return out;
};
(async()=>{
 const owner=createSessionCreationCoordinator({firestore:db,context:input.context});
 if(input.mode==='crash'){await owner.createOriginal(input.command);process.exit(1);}
 const out=await owner.lookupIntent(input.descriptor);
 fs.writeSync(1,JSON.stringify({out,submissions,writes,api:Object.keys(owner).sort()}));
 await db.terminate();
})().catch(()=>process.exit(1));`;
    const spawn = input => spawnSync(process.execPath, ['-e', childScript], { encoding: 'utf8', windowsHide: true,
      timeout: 15000, cwd: resolve(__dirname, '..'), env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1' },
      input: JSON.stringify({ endpoint, context: f.ctx, command: cmd, ...input }) });
    const crash = spawn({ mode: 'crash' }); assert.equal(crash.status, 77, crash.stderr);
    const lost = JSON.parse(crash.stdout); assert.equal(lost.submissions, 1); assert.equal(lost.writes, 1);
    const before = await f.ref(cmd).get(); assert.deepEqual(before.data(), copy(c.createIntent(f.ctx, cmd)));
    const restart = spawn({ mode: 'lookup', descriptor: lost.descriptor }); assert.equal(restart.status, 0, restart.stderr);
    assert.deepEqual(JSON.parse(restart.stdout), { out: { status: 'FOUND', intent: c.createIntent(f.ctx, cmd) },
      submissions: 0, writes: 0, api: ['createOriginal', 'lookupIntent'] });
    const fresh = createStore({ firestore: f.db, context: f.ctx });
    assert.equal((await fresh.lookupIntent(lost.descriptor)).status, 'FOUND');
    assert.deepEqual(counts(f), [0, 0, 0]); assert.deepEqual(version(await f.ref(cmd).get()), version(before));
  });

test('E-09 SDK read failure: UNAVAILABLE, independent evidence unchanged, zero mutation', async () => {
  const a = fixture(), b = fixture(a.ctx), cmd = command(a.ctx); await a.store.createOriginal(cmd);
  const snap = await a.ref(cmd).get(), before = [counts(a), counts(b)]; b.state.mode = 'read-failure';
  assert.deepEqual(await b.owner.lookupIntent(c.descriptor(a.ctx, cmd)), { status: 'UNAVAILABLE' });
  assert.deepEqual([counts(a), counts(b)], before); assert.deepEqual(version(await a.ref(cmd).get()), version(snap));
});

test('E-10 all scenario namespaces and actual write traces contain only Intent records; no Session/binding/receipt', async () => {
  for (const f of fixtures) {
    assert.ok(f.state.creates.every(path => path.startsWith(`${c.ROOT}/${c.authorityKey(f.ctx)}/session_creation_intents/`)));
    const collections = await f.root.listCollections();
    assert.ok(collections.every(collection => collection.id === 'session_creation_intents'));
    for (const name of ['sessions', 'session_creation_bindings', 'session_creation_operations'])
      assert.equal((await f.root.collection(name).get()).empty, true);
  }
  const top = await clients[0].listCollections(); assert.deepEqual(top.map(ref => ref.id), [c.ROOT]);
});
