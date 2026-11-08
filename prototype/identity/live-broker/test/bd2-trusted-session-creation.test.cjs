'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { hash } = require('../security.cjs');
const { createTrustedSessionHandoff } = require('../bd2-trusted-session-handoff.cjs');
const { createOriginalAttemptMetadataReader, createTrustedSessionCreationComposition: createB } = require('../bd2-original-attempt-reader.cjs');
const session = require('../bd2-session-contract.cjs');

const EPOCH = Date.UTC(2026, 10, 6, 12), copy = value => structuredClone(value);
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certs = { fixture: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
const seed = () => ({ commandId: 'a'.repeat(64), sessionDigest: 'd'.repeat(64) });
const denied = fn => assert.throws(fn, { message: 'ACCESS_DENIED' });
const deniedAsync = fn => assert.rejects(async () => fn(), { message: 'ACCESS_DENIED' });
const isIntent = path => path.includes('/session_creation_intents/');

// SDK-shaped unit fixture only. All actual D1, A1, A2 and D2-F1 implementations
// execute; only certificate transport, clocks and Firestore I/O are controlled.
function memoryFirestore() {
  const rows = new Map(), reads = [], writes = [], submissions = [], hooks = {}, events = [];
  let active = 0;
  const snapshot = ref => ({ exists: rows.has(ref.path), id: ref.id, ref, data: () => copy(rows.get(ref.path)) });
  function collection(path) {
    return { firestore: db, id: path.split('/').at(-1), path, doc(id) { return document(`${path}/${id}`); } };
  }
  function document(path) {
    const ref = { firestore: db, id: path.split('/').at(-1), path,
      collection(name) { return collection(`${path}/${name}`); },
      async get() {
        reads.push(path); events.push('read'); await hooks.read?.(ref);
        return snapshot(ref);
      } };
    return ref;
  }
  const db = { rows, reads, writes, submissions, hooks, events, active: () => active,
    collection,
    async runTransaction(callback, options) {
      assert.deepEqual(options, { maxAttempts: 1 });
      const staged = []; let intent = false, record;
      active++;
      try {
        const result = await callback({
          async get(ref) {
            if (isIntent(ref.path)) {
              intent = true; submissions.push(ref.path); events.push('intent-read');
              await hooks.intentRead?.(ref);
            }
            return snapshot(ref);
          },
          create(ref, value) { assert.equal(rows.has(ref.path), false); record = value;
            staged.push([ref.path, copy(value), 'create']); },
          update(ref, value) { assert.equal(isIntent(ref.path), false, 'Intent is create-only');
            staged.push([ref.path, { ...copy(rows.get(ref.path)), ...copy(value) }, 'update']); },
          set() { assert.fail('set forbidden'); }, delete() { assert.fail('delete forbidden'); },
        });
        if (intent) { events.push('callback-returned'); await hooks.beforeCommit?.(record, result); }
        for (const [path, value, kind] of staged) { rows.set(path, value); writes.push([path, kind]); }
        if (intent) { events.push('commit'); await hooks.afterCommit?.(record, result); }
        return intent && hooks.result ? hooks.result(result) : result;
      } finally { active--; }
    },
  };
  return db;
}

function fixture(t, { ttl = 120000, epoch = EPOCH, factory = createB } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: EPOCH });
  const db = memoryFirestore(), hooks = {}, calls = [], samples = [];
  const state = { at: epoch, ns: 0n, observing: false, observations: 0 };
  // This is a clock seam, including for safe-integer overflow. RSA verification is real.
  t.mock.method(Date.prototype, 'getTime', () => state.at);
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs }));
  const configuration = { profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'creation.apps.googleusercontent.com',
    context: { environment: 'TEST', applicationAudience: 'creation-unit', expectedScriptId: 'no-GAS' }, attemptTtlMs: ttl };
  const options = { firestore: db, configuration, attemptCollectionId: 'creation_attempts', journalCollectionId: 'creation_journal',
    now() {
      if (state.observing) { state.observations++; hooks.clock?.(state.observations); samples.push(state.at); }
      return state.at;
    },
    monotonicNow() { return hooks.monotonic ? hooks.monotonic() : state.ns; },
    async target(command, descriptor) {
      assert.equal(db.active(), 0, 'target outside transaction');
      calls.push({ command, descriptor }); return hooks.target?.(command, descriptor);
    } };
  const owner = factory(options);
  return { db, hooks, calls, samples, state, options, owner,
    advance(ms) { state.at += ms; state.ns += BigInt(ms) * 1000000n; },
    complete(v, input = seed()) { state.observing = true; return owner.completeOriginal(v.capability, v.binding, input); },
  };
}

async function verified(f, owner = f.owner, tokenSeconds = 300) {
  const browserProof = 'b'.repeat(64), a = await owner.begin({ browserProofHash: hash(browserProof) });
  const iat = Math.floor(f.state.at / 1000) - 1;
  const jwt = [{ alg: 'RS256', kid: 'fixture' }, { iss: 'accounts.google.com', aud: 'creation.apps.googleusercontent.com',
    sub: 'creation-subject', nonce: a.nonce, iat, exp: iat + tokenSeconds }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const request = { attemptId: a.attemptId, nonce: a.nonce, browserProof,
    idToken: `${jwt}.${sign('RSA-SHA256', Buffer.from(jwt), pair.privateKey).toString('base64url')}` };
  const prepared = await owner.prepareOriginal(request);
  assert.equal(prepared.status, 'PREPARED');
  const outcome = await owner.verify(prepared.handle, request);
  assert.equal(outcome.status, 'VERIFIED');
  return { ...outcome.handoff, outcome, request,
    attemptPath: `creation_attempts/${a.attemptId}`, journalPath: `creation_journal/${outcome.handoff.binding.journal.intentId}` };
}

function dataOnly(out, v) {
  const visit = value => {
    assert.notEqual(typeof value, 'function');
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value));
      for (const [key, item] of Object.entries(value)) {
        assert.ok(!['permit', 'capability', 'original', 'metadata', 'guard', 'target', 'principal', 'command', 'sid'].includes(key));
        visit(item);
      }
    }
  };
  visit(out);
  for (const secret of [v.request.idToken, v.request.nonce, v.request.browserProof, 'private diagnostic'])
    assert.equal(JSON.stringify(out).includes(secret), false);
}
const spent = (f, v) => denied(() => f.owner.completeOriginal(v.capability, v.binding, seed()));
const intents = f => [...f.db.rows].filter(([path]) => isIntent(path));

test('genuine D1 through A2/A1/confirmed NEW enters one fixed target with canonical frozen DATA', async t => {
  const f = fixture(t), v = await verified(f);
  f.hooks.clock = n => f.advance(1);
  const out = await f.complete(v);
  assert.deepEqual([out.status, out.intentStatus, out.dispatchStatus], ['TARGET_RETURNED', 'NEW', 'RETURNED']);
  assert.equal(f.state.observations, 6); assert.equal(f.calls.length, 1); assert.equal(f.db.submissions.length, 1);
  const { command, descriptor } = f.calls[0];
  assert.deepEqual(command, session.createCommand(v.binding.context, { ...seed(), kind: 'CREATE_SESSION',
    attempt: v.binding.attempt, principal: v.binding.principal, createdAtMs: f.samples[2] }));
  assert.equal(command.createdAtMs, EPOCH + 3); assert.ok(f.samples[5] > command.createdAtMs);
  assert.deepEqual(out.descriptor, descriptor); assert.deepEqual(session.descriptor(v.binding.context, command), descriptor);
  assert.ok(Object.isFrozen(command)); assert.ok(Object.isFrozen(command.attempt));
  assert.deepEqual(intents(f)[0][1], session.createIntent(v.binding.context, command));
  assert.equal(f.db.rows.size, 3);
  assert.ok(f.db.writes.every(([path]) => /^(creation_attempts|creation_journal)\//.test(path) || isIntent(path)));
  dataOnly(out, v); spent(f, v);
});

test('B facade and construction accept no owner, verifier, continuation, path or public permit port', t => {
  const f = fixture(t);
  assert.deepEqual(Object.keys(f.owner).sort(), ['begin', 'completeOriginal', 'lookupIntent', 'prepareOriginal', 'recover', 'verify']);
  assert.ok(Object.isFrozen(f.owner));
  for (const target of [undefined, null, {}, 1]) denied(() => createB({ ...f.options, target }));
  for (const key of ['owner', 'reader', 'verifier', 'loginProof', 'continuation', 'path', 'clockGuard', 'dispatch'])
    denied(() => createB({ ...f.options, [key]: () => assert.fail(key) }));
  let getters = 0;
  denied(() => createB({ ...f.options, get target() { getters++; return () => {}; } }));
  assert.equal(getters, 0); assert.equal(f.db.rows.size, 0);
});

test('fabricated/copied/foreign D1 and metadata DTOs cannot authorize B or spend the genuine capability', async t => {
  const f = fixture(t), v = await verified(f);
  for (const value of [{}, { ...v.capability }, copy(v.capability), JSON.parse(JSON.stringify(v.capability)),
    v.binding, v.outcome, v.outcome.proof, null, undefined])
    denied(() => f.owner.completeOriginal(value, v.binding, seed()));
  const another = createB(f.options);
  denied(() => another.completeOriginal(v.capability, v.binding, seed()));
  const raw = createTrustedSessionHandoff({ firestore: f.db, configuration: f.options.configuration,
    now: f.options.now, attemptCollectionId: 'creation_attempts', journalCollectionId: 'creation_journal' });
  const foreign = await verified(f, raw);
  denied(() => f.owner.completeOriginal(foreign.capability, foreign.binding, seed()));
  assert.equal(await raw.consume(foreign.capability, foreign.binding, () => 'still owned'), 'still owned');
  const reader = createOriginalAttemptMetadataReader({ firestore: f.db, configuration: f.options.configuration,
    now: f.options.now, attemptCollectionId: 'creation_attempts', journalCollectionId: 'creation_journal' });
  const rv = await verified(f, reader), metadata = await reader.readOriginal(rv.capability, rv.binding);
  denied(() => f.owner.completeOriginal(metadata, rv.binding, seed()));
  assert.equal(f.db.submissions.length, 0);
  assert.equal((await f.complete(v)).status, 'TARGET_RETURNED');
});

test('wrong expected binding burns genuine D1 before clocks or I/O', async t => {
  const f = fixture(t), v = await verified(f), changed = copy(v.binding);
  changed.principal.sub = 'substituted';
  const reads = f.db.reads.length;
  denied(() => f.owner.completeOriginal(v.capability, changed, seed()));
  spent(f, v); assert.equal(f.state.observations, 0); assert.equal(f.db.reads.length, reads);
});

test('operation framing rejects getters, overrides, extra arguments and malformed scalars after D1 deletion', async t => {
  const f = fixture(t);
  let getters = 0;
  const accessor = { ...seed(), get commandId() { getters++; return 'a'.repeat(64); } };
  for (const input of [null, {}, accessor, { ...seed(), principal: {} }, { ...seed(), S: EPOCH },
    { ...seed(), target() {} }, { ...seed(), canonicalCommand: {} }, { ...seed(), commandId: 'bad' },
    { ...seed(), sessionDigest: 'BAD' }]) {
    const v = await verified(f);
    await deniedAsync(() => f.complete(v, input)); spent(f, v);
  }
  const v = await verified(f);
  await deniedAsync(() => f.owner.completeOriginal(v.capability, v.binding, seed(), () => assert.fail('override')));
  spent(f, v); assert.equal(getters, 0); assert.equal(f.db.submissions.length, 0);
});

test('D1 spent before anchor/source callbacks, both metadata reads, concurrent completion and target reentry', async t => {
  const f = fixture(t), v = await verified(f);
  f.hooks.clock = () => spent(f, v);
  f.db.hooks.read = () => spent(f, v);
  f.hooks.target = () => { spent(f, v); return { permit: {}, secret: v.request.idToken }; };
  const outcomes = await Promise.allSettled(Array.from({ length: 8 }, async () => f.complete(v)));
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(f.calls.length, 1); assert.equal(f.db.submissions.length, 1);
  dataOnly(outcomes.find(o => o.status === 'fulfilled').value, v);
});

test('captured configuration, TTL, seed and callable survive later option/input mutation', async t => {
  const f = fixture(t), v = await verified(f), input = seed();
  f.options.configuration.attemptTtlMs = 1; f.options.configuration.context.applicationAudience = 'changed';
  f.options.attemptCollectionId = 'other'; f.options.journalCollectionId = 'other';
  f.options.target = () => assert.fail('replacement target'); f.options.now = () => NaN;
  f.db.hooks.read = () => { input.commandId = 'e'.repeat(64); input.sessionDigest = 'f'.repeat(64); };
  assert.equal((await f.complete(v, input)).status, 'TARGET_RETURNED');
  assert.equal(f.calls[0].command.commandId, seed().commandId);
  assert.equal(f.calls[0].command.sessionDigest, seed().sessionDigest);
  assert.equal(f.calls[0].command.attempt.collectionId, 'creation_attempts');
});

for (const corruption of ['missing Attempt', 'missing Journal', 'TTL', 'claim', 'journal digest', 'C/D', 'read error']) {
  test(`A2 evidence failure burns D1 with no Intent: ${corruption}`, async t => {
    const f = fixture(t), v = await verified(f), a = f.db.rows.get(v.attemptPath), j = f.db.rows.get(v.journalPath);
    if (corruption === 'missing Attempt') f.db.rows.delete(v.attemptPath);
    if (corruption === 'missing Journal') f.db.rows.delete(v.journalPath);
    if (corruption === 'TTL') a.attempt.expiresAtMs++;
    if (corruption === 'claim') a.claim.operationId = hash('wrong');
    if (corruption === 'journal digest') j.binding.requestDigest = hash('wrong');
    if (corruption === 'C/D') { j.binding.attemptCreatedAtMs++; j.binding.attemptExpiresAtMs++; }
    if (corruption === 'read error') f.db.hooks.read = () => { throw Error('private diagnostic'); };
    await deniedAsync(() => f.complete(v)); spent(f, v);
    assert.equal(f.calls.length, 0); assert.equal(f.db.submissions.length, 0);
  });
}

for (const age of [0, 29999, 30000]) test(`proof age ${age}: exact freshness boundary`, async t => {
  const f = fixture(t), v = await verified(f); f.advance(age);
  if (age < 30000) assert.equal((await f.complete(v)).status, 'TARGET_RETURNED');
  else await deniedAsync(() => f.complete(v));
  assert.equal(f.calls.length, age < 30000 ? 1 : 0); spent(f, v);
});

for (const deadline of ['D', 'G']) for (const atObservation of [2, 3, 4, 5, 6]) {
  test(`${deadline} equality at observation ${atObservation} denies and never refreshes S`, async t => {
    const f = fixture(t, { ttl: deadline === 'D' ? 1000 : 120000 });
    const v = await verified(f, f.owner, deadline === 'G' ? 2 : 300);
    const expires = deadline === 'D' ? f.db.rows.get(v.attemptPath).attempt.expiresAtMs : v.binding.googleTokenExpiresAtMs;
    f.hooks.clock = n => { if (n === atObservation) f.advance(expires - f.state.at); };
    if (atObservation < 4) await deniedAsync(() => f.complete(v));
    else {
      const out = await f.complete(v);
      assert.equal(out.status, 'DENIED'); assert.equal(out.dispatchStatus, 'NOT_INVOKED'); dataOnly(out, v);
    }
    assert.equal(f.calls.length, 0); assert.equal(f.db.submissions.length, atObservation >= 5 ? 1 : 0);
    assert.equal(intents(f).length, atObservation >= 5 ? 1 : 0); spent(f, v);
  });
}

for (const atObservation of [2, 3, 4, 5, 6]) test(`proof expires at checkpoint ${atObservation}`, async t => {
  const trace = { live: 0, events: [] }, f = fixture(t, { factory: tracedFactory(trace) }), v = await verified(f);
  f.hooks.clock = n => { if (n === atObservation) f.advance(30000); };
  if (atObservation < 4) await deniedAsync(() => f.complete(v));
  else assert.equal((await f.complete(v)).status, 'DENIED');
  assert.equal(f.calls.length, 0); assert.equal(intents(f).length, atObservation >= 5 ? 1 : 0); spent(f, v);
  assert.deepEqual(trace.events, atObservation === 6 ? ['mint', 'delete'] : []);
  assert.equal(trace.live, 0);
});

for (const boundary of ['Attempt', 'Journal', 'Intent']) test(`delay during ${boundary} I/O is checked after I/O`, async t => {
  const f = fixture(t), v = await verified(f);
  if (boundary === 'Intent') f.db.hooks.afterCommit = () => f.advance(30000);
  else f.db.hooks.read = ref => { if (ref.path === (boundary === 'Attempt' ? v.attemptPath : v.journalPath)) f.advance(30000); };
  if (boundary === 'Intent') {
    const out = await f.complete(v); assert.equal(out.intentStatus, 'NEW'); assert.equal(out.status, 'DENIED');
    const before = copy(intents(f)); f.advance(1); spent(f, v); assert.deepEqual(intents(f), before);
  } else await deniedAsync(() => f.complete(v));
  assert.equal(f.calls.length, 0); spent(f, v);
});

for (const fault of ['regression', 'forward anomaly', 'monotonic regression', 'source failure', 'invalid wall', 'invalid monotonic']) {
  for (const atObservation of [1, 2, 3, 4, 5, 6]) test(`${fault} at observation ${atObservation}: guard/temporal policy`, async t => {
    const f = fixture(t), v = await verified(f);
    f.hooks.clock = n => {
      if (n !== atObservation) return;
      if (fault === 'regression') f.state.at--;
      if (fault === 'forward anomaly') f.state.at += 1000;
      if (fault === 'monotonic regression') f.state.ns = -1n;
      if (fault === 'source failure') throw Error('private diagnostic');
      if (fault === 'invalid wall') f.state.at = NaN;
      if (fault === 'invalid monotonic') f.hooks.monotonic = () => Promise.resolve(0n);
    };
    // Initial valid numeric samples establish an anchor; a pre-anchor offset is not detectable.
    const initialUndetectable = atObservation === 1 && ['regression', 'forward anomaly'].includes(fault);
    if (initialUndetectable && fault === 'forward anomaly') assert.equal((await f.complete(v)).status, 'TARGET_RETURNED');
    else if (atObservation < 4) await deniedAsync(() => f.complete(v));
    else assert.equal((await f.complete(v)).status, 'DENIED');
    assert.equal(f.calls.length, initialUndetectable && fault === 'forward anomaly' ? 1 : 0);
    f.state.at = EPOCH; f.state.ns = 0n; spent(f, v);
  });
}

// Instrument only this module's lexical WeakMap in a same-realm CommonJS wrapper.
// D1 and all required modules use their real implementations/registries. No production
// test hooks or forged proof authority; keys/operation values are never exposed here.
function tracedFactory(trace, throwAfterMint = false) {
  class PermitMap extends WeakMap {
    set(key, value) {
      super.set(key, value); trace.live++; trace.events.push('mint');
      if (throwAfterMint) throw Error('private diagnostic');
      return this;
    }
    delete(key) {
      const removed = super.delete(key);
      if (removed) { trace.live--; trace.events.push('delete'); }
      return removed;
    }
  }
  const path = require.resolve('../bd2-original-attempt-reader.cjs'), mod = { exports: {} };
  new Function('require', 'module', 'exports', 'WeakMap', readFileSync(path, 'utf8'))(
    createRequire(path), mod, mod.exports, PermitMap);
  return mod.exports.createTrustedSessionCreationComposition;
}

test('private permit minted after NEW, deleted before final clock callback and target entry', async t => {
  const trace = { live: 0, events: [] }, f = fixture(t, { factory: tracedFactory(trace) }), v = await verified(f);
  f.db.hooks.beforeCommit = () => assert.equal(trace.live, 0);
  f.hooks.clock = n => {
    if (n === 5) assert.deepEqual(trace.events, []);
    if (n === 6) { assert.deepEqual(trace.events, ['mint', 'delete']); assert.equal(trace.live, 0); spent(f, v); }
  };
  f.hooks.target = () => { assert.equal(trace.live, 0); assert.deepEqual(trace.events, ['mint', 'delete']); };
  assert.equal((await f.complete(v)).status, 'TARGET_RETURNED');
  assert.equal(trace.live, 0); spent(f, v);
});

test('exception after private mint and before consume removes the otherwise live entry', async t => {
  const trace = { live: 0, events: [] }, f = fixture(t, { factory: tracedFactory(trace, true) }), v = await verified(f);
  const out = await f.complete(v);
  assert.equal(out.status, 'DENIED'); assert.equal(out.intentStatus, 'NEW'); assert.equal(f.calls.length, 0);
  assert.deepEqual(trace.events, ['mint', 'delete']); assert.equal(trace.live, 0); spent(f, v);
});

test('safe hard-expiry overflow denies with genuine D1 and valid scalar creation ordering', async t => {
  const f = fixture(t, { epoch: Number.MAX_SAFE_INTEGER - 20000, ttl: 10000 });
  const v = await verified(f, f.owner, 5);
  assert.ok(v.binding.googleTokenExpiresAtMs > f.state.at);
  await deniedAsync(() => f.complete(v));
  assert.equal(f.state.observations, 3); assert.equal(f.calls.length, 0); assert.equal(f.db.submissions.length, 0); spent(f, v);
});

for (const status of ['EXISTING', 'CONFLICT', 'INVALID']) test(`actual D2-F1 ${status} never dispatches`, async t => {
  const trace = { live: 0, events: [] }, f = fixture(t, { factory: tracedFactory(trace) }), v = await verified(f);
  const command = session.createCommand(v.binding.context, { ...seed(), kind: 'CREATE_SESSION',
    attempt: v.binding.attempt, principal: v.binding.principal, createdAtMs: EPOCH });
  const path = session.paths(v.binding.context, session.descriptor(v.binding.context, command)).intent;
  const other = session.createCommand(v.binding.context, { ...seed(), commandId: 'e'.repeat(64), kind: 'CREATE_SESSION',
    attempt: v.binding.attempt, principal: v.binding.principal, createdAtMs: EPOCH });
  f.db.rows.set(path, status === 'INVALID' ? { corrupt: true } : session.createIntent(v.binding.context, status === 'CONFLICT' ? other : command));
  const before = copy([...f.db.rows]), out = await f.complete(v);
  assert.equal(out.status, 'DENIED'); assert.equal(out.intentStatus, status); assert.equal(f.calls.length, 0);
  assert.deepEqual([...f.db.rows], before); assert.equal(f.db.submissions.length, 1); spent(f, v); dataOnly(out, v);
  assert.deepEqual(trace.events, []);
});

for (const when of ['intentRead', 'beforeCommit', 'afterCommit']) test(`${when} error/lost acknowledgement is UNKNOWN, lookup-only`, async t => {
  const trace = { live: 0, events: [] }, f = fixture(t, { factory: tracedFactory(trace) }), v = await verified(f);
  f.db.hooks[when] = () => { throw Object.assign(Error('private diagnostic'), { code: 10 }); };
  const out = await f.complete(v);
  assert.equal(out.status, 'UNKNOWN'); assert.equal(out.intentStatus, 'UNKNOWN'); assert.equal(out.dispatchStatus, 'NOT_INVOKED');
  assert.equal(f.calls.length, 0); assert.equal(f.db.submissions.length, 1); spent(f, v); dataOnly(out, v);
  const before = copy([...f.db.rows]);
  for (const owner of [f.owner, createB(f.options)]) {
    const found = await owner.lookupIntent(out.descriptor);
    assert.equal(found.status, when === 'afterCommit' ? 'FOUND' : 'UNKNOWN');
    denied(() => owner.completeOriginal(out, v.binding, seed()));
  }
  assert.equal(f.db.submissions.length, 1); assert.deepEqual([...f.db.rows], before);
  assert.deepEqual(trace.events, []);
});

for (const result of [undefined, null, {}, { status: 'FOUND' }, { status: 'UNAVAILABLE' }]) {
  test(`unavailable/malformed SDK result ${JSON.stringify(result)} cannot produce authority`, async t => {
    const f = fixture(t), v = await verified(f); f.db.hooks.result = () => result;
    const out = await f.complete(v);
    assert.equal(out.status, 'UNKNOWN'); assert.equal(f.calls.length, 0); assert.equal(f.db.submissions.length, 1); spent(f, v);
  });
}

test('callback-local NEW and staged write cannot dispatch before outer acknowledgement', async t => {
  const f = fixture(t), v = await verified(f); let release, reached;
  const ready = new Promise(resolve => { reached = resolve; });
  f.db.hooks.beforeCommit = () => { reached(); return new Promise(resolve => { release = resolve; }); };
  const pending = f.complete(v); await ready;
  assert.equal(f.calls.length, 0); assert.equal(intents(f).length, 0); spent(f, v);
  release(); assert.equal((await pending).status, 'TARGET_RETURNED'); assert.equal(f.calls.length, 1);
});

for (const failure of ['throw', 'reject', 'thenable']) test(`target ${failure} is UNKNOWN after entry and cannot restore authority`, async t => {
  const f = fixture(t), v = await verified(f);
  f.hooks.target = () => {
    spent(f, v);
    if (failure === 'throw') throw Error('private diagnostic');
    if (failure === 'reject') return Promise.reject(Error('private diagnostic'));
    return { get then() { throw Error('private diagnostic'); } };
  };
  const out = await f.complete(v);
  assert.deepEqual([out.status, out.intentStatus, out.dispatchStatus], ['UNKNOWN', 'NEW', 'UNKNOWN']);
  assert.equal(f.calls.length, 1); assert.equal(f.db.submissions.length, 1); dataOnly(out, v); spent(f, v);
});

test('pending target, target return DTO and restarted owner never yield replacement dispatch authority', async t => {
  const f = fixture(t), v = await verified(f); let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.hooks.target = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const pending = f.complete(v); await ready;
  spent(f, v); const restarted = createB(f.options);
  denied(() => restarted.completeOriginal(v.capability, v.binding, seed()));
  const descriptor = f.calls[0].descriptor;
  assert.equal((await restarted.lookupIntent(descriptor)).status, 'FOUND');
  release({ status: 'NEW', permit: {}, capability: {}, secret: v.request.idToken });
  const out = await pending; dataOnly(out, v);
  denied(() => restarted.completeOriginal(copy(out), v.binding, seed()));
  assert.equal(f.calls.length, 1); assert.equal(f.db.submissions.length, 1);
});
