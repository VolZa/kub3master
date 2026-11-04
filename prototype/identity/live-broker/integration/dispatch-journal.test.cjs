'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, generateKeyPairSync, sign } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { OAuth2Client } = require('google-auth-library');
const { hash, createGoogleVerifier } = require('../security.cjs');
const { operationId, configuration } = require('../bd2-attempt-contract.cjs');
const { createLoginProofValidator } = require('../bd2-login-proof.cjs');
const { createLocalFirestoreClient, createFirestoreAttemptStore } = require('../firestore-attempt-store.cjs');
const { createFirestoreDispatchJournal, intentId, reference } = require('../firestore-dispatch-journal.cjs');
const { createDispatchCoordinator, createIsolatedJournaledLoginProof, requestDigest } = require('../bd2-dispatch-coordinator.cjs');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw Error('INTEGRATION_BLOCKED: real Firestore Emulator required; no mock fallback');
const projectId = 'demo-kub-bd2-local', clients = [];
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const config = () => configuration({ profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'journal.apps.googleusercontent.com',
  context: { environment: 'TEST', applicationAudience: 'journal-local', expectedScriptId: 'no-GAS' }, attemptTtlMs: 120000 });
const names = () => { const id = randomBytes(8).toString('hex'); return { attempts: 'dispatch_attempt_' + id, journal: 'dispatch_intent_' + id }; };
function client() { const db = createLocalFirestoreClient({ host, projectId }); clients.push(db); return db; }
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
function fixture(collections = names(), c = config()) {
  const attemptDb = client(), journalDb = client();
  let clock = Date.now(), claims = 0, google = 0, callbacks = 0;
  const hooks = {};
  const now = () => clock;
  for (const db of [attemptDb, journalDb]) {
    const run = db.runTransaction.bind(db);
    db.runTransaction = (fn, options) => run(async tx => {
      callbacks++; try { return await fn(tx); } finally { callbacks--; }
    }, options);
  }
  const store = createFirestoreAttemptStore({ firestore: attemptDb, configuration: c, collectionId: collections.attempts, now });
  const attempts = { createOnce: store.createOnce, lookup: store.lookup,
    async transition(...args) { claims++; await hooks.beforeClaim?.(); return store.transition(...args); } };
  const oauth = new OAuth2Client(c.clientId);
  oauth.getFederatedSignonCertsAsync = async () => ({ certs: { fixture: publicKey } });
  const real = createGoogleVerifier({ clientId: c.clientId, client: oauth, now });
  const verifier = { async verify(...args) { assert.equal(callbacks, 0, 'Google verification outside transaction callbacks'); google++; return real.verify(...args); } };
  const core = createLoginProofValidator({ configuration: c, attempts, verifier, now });
  const journal = createFirestoreDispatchJournal({ firestore: journalDb, configuration: c, collectionId: collections.journal, now });
  const coordinator = createDispatchCoordinator({ configuration: c, attempts, loginProof: core, journal, now });
  return { collections, config: c, attemptDb, journalDb, store, attempts, core, journal, coordinator, now, hooks,
    counts: () => ({ claims, google }), advance: ms => { clock += ms; } };
}
async function login(f) {
  const browserProof = randomBytes(32).toString('hex');
  const a = await f.coordinator.begin({ browserProofHash: hash(browserProof) });
  const iat = Math.floor(Date.now() / 1000) - 1;
  const input = [{ alg: 'RS256', kid: 'fixture' }, { iss: 'accounts.google.com', aud: f.config.clientId,
    sub: 'dispatch-fixture-subject', iat, exp: iat + 300, nonce: a.nonce }]
    .map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
  return { attemptId: a.attemptId, nonce: a.nonce, browserProof,
    idToken: input + '.' + sign('RSA-SHA256', Buffer.from(input), pair.privateKey).toString('base64url') };
}
async function binding(f, r) {
  const receipt = await f.store.lookup({ kind: 'CREATE', attemptId: r.attemptId,
    operationId: operationId('CREATE', r.attemptId), bindingDigest: null });
  return { profile: f.config.profile, clientId: f.config.clientId, context: f.config.context,
    intentId: intentId(r.attemptId), attemptId: r.attemptId, operationId: operationId('CLAIM', r.attemptId),
    bindingDigest: receipt.bindingDigest, requestDigest: requestDigest(r, f.config),
    attemptCreatedAtMs: receipt.createdAtMs, attemptExpiresAtMs: receipt.expiresAtMs };
}
const copyHandle = descriptor => JSON.parse(JSON.stringify({ descriptor }));
async function assertRecoveryOnly(f, r, descriptor, expected) {
  const before = f.counts();
  for (let i = 0; i < 2; i++) {
    const recovered = await f.coordinator.recover(descriptor);
    assert.equal(recovered.status, 'LOOKUP_ONLY');
    if (expected) assert.equal(recovered.outcome.status, expected);
    assert.equal((await f.coordinator.verify(copyHandle(descriptor), r)).status, 'LOOKUP_ONLY');
  }
  assert.deepEqual(f.counts(), before, 'recovery must not invoke claim or Google verification');
}

test('one outer dispatch, durable reservation before claim, duplicates and COMMITTED receipt never reverify Google', async () => {
  const f = fixture(), r = await login(f), prepared = await f.coordinator.prepareOriginal(r);
  assert.equal(prepared.status, 'PREPARED');
  f.hooks.beforeClaim = async () => {
    const saved = await f.journal.lookup(prepared.descriptor);
    assert.equal(saved.state, 'RESERVED'); assert.equal(saved.revision, 1);
  };
  const result = await f.coordinator.verify(prepared.handle, r);
  assert.equal(result.status, 'VERIFIED'); assert.equal(result.proof.principal.sub, 'dispatch-fixture-subject');
  assert.deepEqual(f.counts(), { claims: 1, google: 1 });
  assert.equal((await f.coordinator.verify(prepared.handle, r)).status, 'LOOKUP_ONLY');
  assert.equal((await f.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
  await assertRecoveryOnly(f, r, prepared.descriptor, 'COMMITTED');
  const persisted = (await f.journalDb.collection(f.collections.journal).doc(prepared.descriptor.intentId).get()).data();
  for (const secret of [r.idToken, r.nonce, r.browserProof]) assert.equal(JSON.stringify(persisted).includes(secret), false);
  assert.equal(persisted.binding.operationId, operationId('CLAIM', r.attemptId));
  assert.equal(persisted.state, 'RESERVED'); assert.deepEqual(f.counts(), { claims: 1, google: 1 });
});

test('two independent coordinators/SDK clients race: at most one outer dispatch, including zero-progress UNKNOWN', async t => {
  const a = fixture(), b = fixture(a.collections), r = await login(a);
  const instances = [a, b], claimTransactions = [0, 0], journalTransactions = [0, 0];
  const reservationsBeforeClaim = [];
  for (const [i, f] of instances.entries()) {
    for (const [db, counts] of [[f.attemptDb, claimTransactions], [f.journalDb, journalTransactions]]) {
      const run = db.runTransaction.bind(db);
      db.runTransaction = (...args) => { counts[i]++; return run(...args); };
    }
  }
  const prepared = await Promise.all([a.coordinator.prepareOriginal(r), b.coordinator.prepareOriginal(r)]);
  const owners = prepared.filter(p => p.status === 'PREPARED').length;
  assert.ok(owners <= 1, 'two instances must never obtain independent preparation handles');
  for (const [i, p] of prepared.entries()) {
    assert.ok(['PREPARED', 'LOOKUP_ONLY'].includes(p.status));
    assert.equal(p.descriptor.attemptId, r.attemptId);
    assert.equal(p.descriptor.operationId, operationId('CLAIM', r.attemptId));
    assert.equal(p.descriptor.intentId, prepared[0].descriptor.intentId);
    assert.equal(p.descriptor.requestDigest, prepared[0].descriptor.requestDigest);
    assert.ok(journalTransactions[i] <= 1, 'intent creation must not outer-retry');
    assert.deepEqual(instances[i].counts(), { claims: 0, google: 0 });
    instances[i].hooks.beforeClaim = async () => {
      reservationsBeforeClaim.push(await instances[i].journal.lookup(p.descriptor));
    };
  }
  if (owners === 0) {
    // Both lock timeouts may be UNKNOWN; another caller may instead observe an existing
    // intent after an ambiguous create. Neither case confirms a dispatch reservation.
    assert.ok(prepared.some(p => p.dispatchOutcome === 'UNKNOWN'), 'zero progress needs an explicit ambiguous outcome');
    for (const p of prepared) {
      assert.equal(p.status, 'LOOKUP_ONLY'); assert.equal(p.handle, undefined);
    }
  }
  const intentTransactions = [...journalTransactions];
  const outputs = await Promise.all(prepared.map((p, i) => p.status === 'PREPARED'
    ? instances[i].coordinator.verify(p.handle, r) : instances[i].coordinator.recover(p.descriptor)));
  const claims = a.counts().claims + b.counts().claims, google = a.counts().google + b.counts().google;
  const verified = outputs.filter(o => o.status === 'VERIFIED').length;
  assert.ok(claims <= 1); assert.ok(google <= 1); assert.ok(google <= claims); assert.ok(verified <= google);
  assert.equal(reservationsBeforeClaim.length, claims);
  for (const reservation of reservationsBeforeClaim) {
    assert.equal(reservation.status, 'FOUND'); assert.equal(reservation.state, 'RESERVED');
    assert.equal(reservation.revision, 1); assert.equal(reservation.outcomeRef.operationId, operationId('CLAIM', r.attemptId));
  }
  for (const [i, out] of outputs.entries()) {
    assert.equal(claimTransactions[i], instances[i].counts().claims, 'one transaction per dispatched claim; no outer retry');
    assert.equal(journalTransactions[i], intentTransactions[i] + (prepared[i].status === 'PREPARED' ? 1 : 0));
    assert.ok(['VERIFIED', 'LOOKUP_ONLY'].includes(out.status));
    if (prepared[i].status !== 'PREPARED') assert.deepEqual(instances[i].counts(), { claims: 0, google: 0 });
  }
  if (owners === 0) { assert.equal(claims, 0); assert.equal(google, 0); }
  if (verified === 0 && owners > 0) {
    assert.ok(outputs.some(o => o.dispatchOutcome === 'UNKNOWN'), 'valid original request may lose progress only fail-closed');
  }
  const beforeRecovery = { claims, google, claimTransactions: [...claimTransactions], journalTransactions: [...journalTransactions] };
  for (const [i, p] of prepared.entries()) {
    await assertRecoveryOnly(instances[i], r, p.descriptor);
    if (p.status === 'PREPARED') assert.equal((await instances[i].coordinator.verify(p.handle, r)).status, 'LOOKUP_ONLY');
    const saved = await instances[i].journal.lookup(p.descriptor);
    // Never re-prepare missing intent after UNKNOWN: that routing boundary stays OPEN.
    if (saved.status === 'FOUND') assert.equal((await instances[i].coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
  }
  assert.deepEqual({ claims: a.counts().claims + b.counts().claims, google: a.counts().google + b.counts().google,
    claimTransactions, journalTransactions }, beforeRecovery, 'duplicates/recovery cannot write, re-dispatch or reverify');
  t.diagnostic(JSON.stringify({ prepared: owners, outerClaims: claims, google, verified,
    unknownBoundary: prepared.map((p, i) => p.dispatchOutcome === 'UNKNOWN' ? 'INTENT'
      : outputs[i].dispatchOutcome === 'UNKNOWN' ? (instances[i].counts().claims ? 'CLAIM' : 'RESERVATION') : null) }));
});

test('same local handle concurrent replay and serialized handle on another instance cannot cause a second claim', async () => {
  const a = fixture(), b = fixture(a.collections), r = await login(a), p = await a.coordinator.prepareOriginal(r);
  const outputs = await Promise.all([a.coordinator.verify(p.handle, r), a.coordinator.verify(p.handle, r),
    b.coordinator.verify(copyHandle(p.descriptor), r)]);
  assert.equal(outputs.filter(x => x.status === 'VERIFIED').length, 1);
  assert.equal(a.counts().claims + b.counts().claims, 1); assert.equal(a.counts().google + b.counts().google, 1);
});

test('binding mismatch is denied before reservation; changed token cannot hijack an owned handle', async () => {
  const f = fixture(), r = await login(f);
  for (const key of ['nonce', 'browserProof']) {
    await assert.rejects(f.coordinator.prepareOriginal({ ...r, [key]: 'e'.repeat(64) }), /ACCESS_DENIED/);
  }
  assert.equal((await f.journalDb.collection(f.collections.journal).get()).size, 0);
  const p = await f.coordinator.prepareOriginal(r);
  await assert.rejects(f.coordinator.verify(p.handle, { ...r, idToken: r.idToken + 'forged' }), /ACCESS_DENIED/);
  assert.deepEqual(f.counts(), { claims: 0, google: 0 });
  assert.equal((await f.coordinator.verify(p.handle, r)).status, 'VERIFIED');
  const other = fixture(f.collections, { ...f.config, context: { ...f.config.context, applicationAudience: 'substituted' } });
  assert.equal((await other.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
  assert.deepEqual(other.counts(), { claims: 0, google: 0 });
});

for (const afterCommit of [false, true]) {
  test(`UNKNOWN ${afterCommit ? 'after' : 'before'} claim commit: reserved dispatch never repeats even when attempt is NEW/missing receipt`, async () => {
    const f = fixture(), r = await login(f), p = await f.coordinator.prepareOriginal(r);
    const original = f.attemptDb.runTransaction.bind(f.attemptDb); let outerTransactions = 0;
    f.attemptDb.runTransaction = async (...args) => {
      outerTransactions++; if (afterCommit) await original(...args);
      throw Object.assign(Error('lost acknowledgement'), { code: afterCommit ? 10 : 2 });
    };
    const out = await f.coordinator.verify(p.handle, r);
    assert.equal(out.dispatchOutcome, 'UNKNOWN'); assert.equal(out.outcome.status, afterCommit ? 'COMMITTED' : 'UNKNOWN');
    const persistedAttempt = (await f.attemptDb.collection(f.collections.attempts).doc(r.attemptId).get()).data();
    assert.equal(persistedAttempt.attempt.phase, afterCommit ? 'CONSUMED' : 'NEW');
    assert.equal((await f.journal.lookup(p.descriptor)).state, 'RESERVED');
    await assertRecoveryOnly(f, r, p.descriptor, afterCommit ? 'COMMITTED' : 'UNKNOWN');
    assert.equal((await f.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
    const restarted = fixture(f.collections);
    assert.equal((await restarted.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
    await assertRecoveryOnly(restarted, r, p.descriptor, afterCommit ? 'COMMITTED' : 'UNKNOWN');
    assert.deepEqual(f.counts(), { claims: 1, google: 0 }); assert.deepEqual(restarted.counts(), { claims: 0, google: 0 });
    assert.equal(outerTransactions, 1);
  });
}

for (const stage of ['intent', 'reservation']) for (const afterCommit of [false, true]) {
  test(`journal ${stage} UNKNOWN ${afterCommit ? 'after' : 'before'} commit never issues a dispatch permit`, async () => {
    const f = fixture(), r = await login(f);
    let p;
    if (stage === 'reservation') p = await f.coordinator.prepareOriginal(r);
    const original = f.journalDb.runTransaction.bind(f.journalDb); let outer = 0;
    f.journalDb.runTransaction = async (...args) => {
      outer++; if (afterCommit) await original(...args);
      throw Object.assign(Error('ambiguous journal write'), { code: 10 });
    };
    const out = stage === 'intent' ? await f.coordinator.prepareOriginal(r) : await f.coordinator.verify(p.handle, r);
    assert.equal(out.status, 'LOOKUP_ONLY'); assert.equal(out.dispatchOutcome, 'UNKNOWN');
    const descriptor = out.descriptor;
    await assertRecoveryOnly(f, r, descriptor, 'UNKNOWN');
    if (p) assert.equal((await f.coordinator.verify(p.handle, r)).status, 'LOOKUP_ONLY');
    assert.equal(outer, 1); assert.deepEqual(f.counts(), { claims: 0, google: 0 });
    const saved = await f.journal.lookup(descriptor);
    assert.equal(saved.status, stage === 'intent' && !afterCommit ? 'UNKNOWN' : 'FOUND');
    if (saved.status === 'FOUND') {
      assert.equal(saved.state, stage === 'reservation' && afterCommit ? 'RESERVED' : 'INTENT');
      const restarted = fixture(f.collections);
      assert.equal((await restarted.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
      assert.deepEqual(restarted.counts(), { claims: 0, google: 0 });
    }
  });
}

test('journal reservation lost ack + identical Commit RPC ABORTED: one transaction, zero outer claims', async () => {
  const f = fixture(), r = await login(f), p = await f.coordinator.prepareOriginal(r);
  const run = f.journalDb.runTransaction.bind(f.journalDb), rpc = f.journalDb.request.bind(f.journalDb);
  let outer = 0, commits = 0, code;
  f.journalDb.runTransaction = (...args) => { outer++; return run(...args); };
  f.journalDb.request = async (method, body, ...rest) => {
    if (method !== 'commit' || !body.transaction || commits) return rpc(method, body, ...rest);
    commits++; await rpc(method, body, ...rest); commits++;
    try { return await rpc(method, body, ...rest); } catch (e) { code = e.code; throw e; }
  };
  const out = await f.coordinator.verify(p.handle, r);
  assert.equal(code, 10); assert.equal(commits, 2); assert.equal(outer, 1);
  assert.equal(out.dispatchOutcome, 'UNKNOWN'); assert.equal(out.journal.state, 'RESERVED');
  await assertRecoveryOnly(f, r, p.descriptor, 'UNKNOWN');
  assert.deepEqual(f.counts(), { claims: 0, google: 0 });
});

test('journal unavailable/corrupt, expiry equality and lost preparation fail closed without resets', async () => {
  const f = fixture(), r = await login(f), p = await f.coordinator.prepareOriginal(r);
  const doc = f.journalDb.collection(f.collections.journal).doc(p.descriptor.intentId);
  const before = (await doc.get()).data();
  const other = fixture(f.collections);
  assert.equal((await other.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY', 'existing unreserved INTENT is never adopted');
  await doc.update({ revision: 3 });
  assert.equal((await f.coordinator.verify(p.handle, r)).dispatchOutcome, 'REJECTED');
  assert.equal((await f.journal.lookup(p.descriptor)).status, 'INVALID');
  assert.equal((await doc.get()).data().revision, 3, 'corruption never resets the journal');
  assert.deepEqual(f.counts(), { claims: 0, google: 0 });
  const g = fixture(), s = await login(g), q = await g.coordinator.prepareOriginal(s);
  g.advance(120000);
  assert.equal((await g.coordinator.verify(q.handle, s)).dispatchOutcome, 'REJECTED');
  assert.equal((await g.journal.lookup(q.descriptor)).state, 'INTENT'); assert.deepEqual(g.counts(), { claims: 0, google: 0 });
  const h = fixture(), t = await login(h), z = await h.coordinator.prepareOriginal(t);
  h.journalDb.getAll = async () => { throw Object.assign(Error('unavailable'), { code: 14 }); };
  const recovery = await h.coordinator.recover(z.descriptor);
  assert.equal(recovery.journal.status, 'UNAVAILABLE');
  assert.equal((await h.coordinator.prepareOriginal(t)).status, 'LOOKUP_ONLY'); assert.deepEqual(h.counts(), { claims: 0, google: 0 });
  assert.equal(before.state, 'INTENT');
});

test('new independent login gets new attempt/nonce; sealed old reservation is never recycled', async () => {
  const f = fixture(), r = await login(f), b = await binding(f, r);
  const prep = await f.journal.createIntent(b); await f.journal.reserve(prep.preparation, b);
  const next = await login(f); assert.notEqual(next.attemptId, r.attemptId); assert.notEqual(next.nonce, r.nonce);
  const p = await f.coordinator.prepareOriginal(next);
  assert.equal((await f.coordinator.verify(p.handle, next)).status, 'VERIFIED');
  assert.equal((await f.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
  assert.equal((await f.journal.lookup(reference(b))).state, 'RESERVED'); assert.deepEqual(f.counts(), { claims: 1, google: 1 });
});

test('confirmed claim rejection and failed Google verification both seal dispatch without issuing identity on recovery', async () => {
  const f = fixture(), r = await login(f), p = await f.coordinator.prepareOriginal(r);
  // A state change after preparation makes the attempted claim definitively reject locally.
  await f.store.transition(r.attemptId, 'NEW', row => ({ ...row, phase: 'CONSUMED' }));
  const rejected = await f.coordinator.verify(p.handle, r);
  assert.equal(rejected.dispatchOutcome, 'REJECTED'); assert.equal(rejected.outcome.status, 'COMMITTED');
  await assertRecoveryOnly(f, r, p.descriptor, 'COMMITTED'); assert.deepEqual(f.counts(), { claims: 1, google: 0 });
  const g = fixture(), s = await login(g), forged = { ...s, idToken: s.idToken + 'invalid-signature' };
  const q = await g.coordinator.prepareOriginal(forged), denied = await g.coordinator.verify(q.handle, forged);
  assert.equal(denied.status, 'LOOKUP_ONLY'); assert.equal(denied.dispatchOutcome, 'DENIED');
  assert.equal(denied.proof, undefined); assert.equal(denied.outcome.status, 'COMMITTED');
  await assertRecoveryOnly(g, forged, q.descriptor, 'COMMITTED');
  assert.deepEqual(g.counts(), { claims: 1, google: 1 });
});

test('attempt storage outage after reservation leaves one outer invocation and cannot become a replacement dispatch', async () => {
  const f = fixture(), r = await login(f), p = await f.coordinator.prepareOriginal(r);
  f.attemptDb.runTransaction = async () => { throw Object.assign(Error('unavailable'), { code: 14 }); };
  f.attemptDb.getAll = async () => { throw Object.assign(Error('unavailable'), { code: 14 }); };
  const out = await f.coordinator.verify(p.handle, r);
  assert.equal(out.dispatchOutcome, 'UNKNOWN'); assert.equal(out.outcome.status, 'UNAVAILABLE');
  await assertRecoveryOnly(f, r, p.descriptor, 'UNAVAILABLE');
  const restarted = fixture(f.collections);
  assert.equal((await restarted.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
  await assertRecoveryOnly(restarted, r, p.descriptor, 'UNKNOWN');
  assert.deepEqual(f.counts(), { claims: 1, google: 0 }); assert.deepEqual(restarted.counts(), { claims: 0, google: 0 });
});

test('late reservation commit is persisted but does not produce dispatch; neither permit nor preparation can be reused', async () => {
  const f = fixture(), r = await login(f), b = await binding(f, r), p = await f.journal.createIntent(b);
  const run = f.journalDb.runTransaction.bind(f.journalDb); let outer = 0;
  f.journalDb.runTransaction = (fn, options) => {
    outer++; return run(async tx => { const value = await fn(tx); f.advance(120000); return value; }, options);
  };
  assert.equal((await f.journal.reserve(p.preparation, b)).status, 'LOOKUP_ONLY');
  assert.equal((await f.journal.lookup(reference(b))).state, 'RESERVED');
  assert.equal((await f.journal.reserve(p.preparation, b)).status, 'LOOKUP_ONLY'); assert.equal(outer, 1);
  const g = fixture(), s = await login(g), binding2 = await binding(g, s), q = await g.journal.createIntent(binding2);
  const reserved = await g.journal.reserve(q.preparation, binding2);
  assert.equal(reserved.status, 'GRANTED');
  assert.equal(g.journal.takeDispatchPermit(reserved.permit, binding2), true);
  assert.equal(g.journal.takeDispatchPermit(reserved.permit, binding2), false);
  assert.equal((await g.journal.createIntent(binding2)).status, 'LOOKUP_ONLY');
  assert.equal((await g.journal.reserve(q.preparation, binding2)).status, 'LOOKUP_ONLY');
  assert.deepEqual(f.counts(), { claims: 0, google: 0 }); assert.deepEqual(g.counts(), { claims: 0, google: 0 });
});

// A real child exits without cleanup at each boundary. Only metadata/counters cross stdout.
// Raw signed proof enters through stdin, never argv, journal or output. The parent is a fresh caller.
const crashScript = `
const fs=require('node:fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));
const {OAuth2Client}=require('google-auth-library');const {createGoogleVerifier}=require('./security.cjs');
const {createLocalFirestoreClient,createFirestoreAttemptStore}=require('./firestore-attempt-store.cjs');
const {createLoginProofValidator}=require('./bd2-login-proof.cjs');
const {createFirestoreDispatchJournal,reference}=require('./firestore-dispatch-journal.cjs');
const {createDispatchCoordinator}=require('./bd2-dispatch-coordinator.cjs');
const db=createLocalFirestoreClient(input.endpoint);let claims=0,google=0;
const store=createFirestoreAttemptStore({firestore:db,configuration:input.config,collectionId:input.collections.attempts});
const journal=createFirestoreDispatchJournal({firestore:db,configuration:input.config,collectionId:input.collections.journal});
function crash(){fs.writeSync(1,JSON.stringify({descriptor:reference(input.binding),claims,google}));process.exit(77);}
const attempts={createOnce:store.createOnce,lookup:store.lookup,async transition(...args){claims++;return store.transition(...args)}};
const oauth=new OAuth2Client(input.config.clientId);oauth.getFederatedSignonCertsAsync=async()=>({certs:{fixture:input.publicKey}});
const real=createGoogleVerifier({clientId:input.config.clientId,client:oauth});
const verifier={async verify(...args){if(input.stage==='after-claim')crash();google++;const value=await real.verify(...args);if(input.stage==='after-google')crash();return value;}};
const core=createLoginProofValidator({configuration:input.config,attempts,verifier});
const coordinator=createDispatchCoordinator({configuration:input.config,attempts,journal,loginProof:core});
(async()=>{
if(input.stage==='before-intent')crash();
if(input.stage==='after-reservation'){const p=await journal.createIntent(input.binding);await journal.reserve(p.preparation,input.binding);crash();}
const p=await coordinator.prepareOriginal(input.request);if(p.status!=='PREPARED')throw Error('not prepared');
if(input.stage==='after-intent')crash();await coordinator.verify(p.handle,input.request);throw Error('missed crash');
})().catch(()=>process.exit(1));`;

for (const stage of ['before-intent', 'after-intent', 'after-reservation', 'after-claim', 'after-google']) {
  test(`genuine process crash ${stage}: new process/instance performs lookup only and never repeats outer claim`, async () => {
    const f = fixture(), r = await login(f), b = await binding(f, r);
    const child = spawnSync(process.execPath, ['-e', crashScript], {
      cwd: require('node:path').resolve(__dirname, '..'), env: process.env, encoding: 'utf8', timeout: 45000,
      input: JSON.stringify({ stage, endpoint: { host, projectId }, config: f.config, collections: f.collections,
        request: r, binding: b, publicKey }), windowsHide: true,
    });
    assert.equal(child.status, 77, child.stderr);
    const result = JSON.parse(child.stdout), claimed = ['after-claim', 'after-google'].includes(stage);
    assert.equal(result.claims, claimed ? 1 : 0); assert.equal(result.google, stage === 'after-google' ? 1 : 0);
    const restarted = fixture(f.collections);
    await assertRecoveryOnly(restarted, r, result.descriptor, claimed ? 'COMMITTED' : 'UNKNOWN');
    if (stage !== 'before-intent') assert.equal((await restarted.coordinator.prepareOriginal(r)).status, 'LOOKUP_ONLY');
    const saved = await restarted.journal.lookup(result.descriptor);
    assert.equal(saved.status, stage === 'before-intent' ? 'UNKNOWN' : 'FOUND');
    if (saved.status === 'FOUND') assert.equal(saved.state, stage === 'after-intent' ? 'INTENT' : 'RESERVED');
    assert.deepEqual(restarted.counts(), { claims: 0, google: 0 });
    assert.equal(result.claims + restarted.counts().claims, claimed ? 1 : 0);
  });
}

test('default isolated composition uses maintained Google verifier; fixture certificate injection exists only in this test', async t => {
  const db = client(), collections = names(), c = config();
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { fixture: publicKey } }));
  const isolated = createIsolatedJournaledLoginProof({ firestore: db, configuration: c,
    attemptCollectionId: collections.attempts, journalCollectionId: collections.journal });
  const f = { coordinator: isolated, config: c }, r = await login(f), p = await isolated.prepareOriginal(r);
  assert.equal((await isolated.verify(p.handle, r)).status, 'VERIFIED');
  assert.deepEqual(Object.keys(isolated).sort(), ['begin', 'prepareOriginal', 'recover', 'verify']);
  assert.equal((await isolated.verify(p.handle, r)).status, 'LOOKUP_ONLY');
});
