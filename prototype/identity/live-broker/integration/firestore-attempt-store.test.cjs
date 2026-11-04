'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { OAuth2Client } = require('google-auth-library');
const { createGoogleVerifier, hash } = require('../security.cjs');
const { createLoginProofValidator } = require('../bd2-login-proof.cjs');
const { operationId, AttemptStoreError } = require('../bd2-attempt-contract.cjs');
const { createLocalFirestoreClient, createFirestoreAttemptStore } = require('../firestore-attempt-store.cjs');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw Error('INTEGRATION_BLOCKED: FIRESTORE_EMULATOR_HOST required; no mock fallback');
const projectId = 'demo-kub-bd2-local';
const collectionId = 'integration_' + randomBytes(8).toString('hex');
const clients = [];
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
function client() { const db = createLocalFirestoreClient({ host, projectId }); clients.push(db); return db; }
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
const configuration = () => ({ profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'isolated-durable.apps.googleusercontent.com',
  context: { environment: 'TEST', applicationAudience: 'bd2-local', expectedScriptId: 'no-GAS' }, attemptTtlMs: 120000 });
function fixture(db = client(), config = configuration()) {
  let clock = Date.now(), calls = 0;
  const now = () => clock;
  const store = createFirestoreAttemptStore({ firestore: db, configuration: config, collectionId, now });
  const oauth = new OAuth2Client(config.clientId);
  oauth.getFederatedSignonCertsAsync = async () => ({ certs: { fixture: pair.publicKey.export({ type: 'spki', format: 'pem' }) } });
  const real = createGoogleVerifier({ clientId: config.clientId, client: oauth, now });
  const verifier = { async verify(...args) { calls++; return real.verify(...args); } };
  const validator = createLoginProofValidator({ configuration: config, attempts: store, verifier, now });
  return { db, config, store, validator, now, calls: () => calls, advance: ms => { clock += ms; } };
}
async function login(f) {
  const browserProof = randomBytes(32).toString('hex');
  const a = await f.validator.begin({ browserProofHash: hash(browserProof) });
  const iat = Math.floor(f.now() / 1000) - 1;
  const claims = { iss: 'accounts.google.com', aud: f.config.clientId, sub: 'durable-fixture-subject', iat,
    exp: iat + 300, nonce: a.nonce };
  const input = [{ alg: 'RS256', kid: 'fixture' }, claims].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return { ...a, browserProof, idToken: input + '.' + sign('RSA-SHA256', Buffer.from(input), pair.privateKey).toString('base64url') };
}
const request = a => ({ attemptId: a.attemptId, nonce: a.nonce, browserProof: a.browserProof, idToken: a.idToken });
const lookup = (f, a, kind = 'CLAIM') => f.store.lookup({ kind, attemptId: a.attemptId,
  operationId: operationId(kind, a.attemptId), bindingDigest: null });
const denied = p => assert.rejects(p, { message: 'ACCESS_DENIED' });

test('real SDK/emulator create and claim: digest-only persisted record, replay and duplicate ID deny', async () => {
  const f = fixture(), a = await login(f), ref = f.db.collection(collectionId).doc(a.attemptId);
  const before = (await ref.get()).data();
  assert.equal(before.attempt.nonce, undefined); assert.equal(before.attempt.nonceHash, hash(a.nonce));
  const serialized = JSON.stringify(before);
  for (const raw of [a.nonce, a.browserProof, a.idToken]) assert.equal(serialized.includes(raw), false);
  await denied(f.store.createOnce(a.attemptId, before.attempt));
  assert.equal((await f.validator.verify(request(a))).principal.sub, 'durable-fixture-subject');
  await denied(f.validator.verify(request(a))); assert.equal(f.calls(), 1);
  const outcome = await lookup(f, a); assert.equal(outcome.status, 'COMMITTED'); assert.equal(outcome.revision, 1);
  assert.equal((await lookup(f, a, 'CREATE')).status, 'COMMITTED');
});
test('two concurrent requests through two independent SDK clients have at most one successful claim', async t => {
  const a = fixture(), b = fixture(), attempt = await login(a);
  const ref = a.db.collection(collectionId).doc(attempt.attemptId), before = (await ref.get()).data();
  assert.equal(before.attempt.phase, 'NEW'); assert.equal(before.revision, 0); assert.equal(before.claim, null);
  const instances = [a, b], outerTransactions = [0, 0];
  for (const [i, f] of instances.entries()) {
    const run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = (...args) => { outerTransactions[i]++; return run(...args); };
  }
  const results = await Promise.allSettled([a.validator.verify(request(attempt)), b.validator.verify(request(attempt))]);
  const successes = results.filter(r => r.status === 'fulfilled'), failures = results.filter(r => r.status === 'rejected');
  assert.ok(successes.length <= 1); assert.equal(a.calls() + b.calls(), successes.length);
  assert.deepEqual(outerTransactions, [1, 1], 'one original invocation per caller; no outer retry after UNKNOWN');
  for (const result of successes) assert.equal(result.value.principal.sub, 'durable-fixture-subject');
  for (const { reason } of failures) {
    assert.equal(reason instanceof AttemptStoreError, true);
    assert.ok(['REJECTED', 'UNKNOWN'].includes(reason.outcome));
    assert.equal(reason.descriptor.kind, 'CLAIM'); assert.equal(reason.descriptor.attemptId, attempt.attemptId);
    assert.equal(reason.descriptor.operationId, operationId('CLAIM', attempt.attemptId));
    if (reason.descriptor.bindingDigest !== null) assert.equal(reason.descriptor.bindingDigest, before.bindingDigest);
  }
  if (successes.length === 0) {
    assert.ok(failures.some(r => r.reason.outcome === 'UNKNOWN'), 'zero progress requires fail-closed ambiguity, not silent denial');
    assert.equal(a.calls() + b.calls(), 0);
  }
  // UNKNOWN may leave NEW or persist CONSUMED. Inspect storage independently; neither
  // a numeric SDK error nor lack of successful responses proves the original outcome.
  const after = (await ref.get()).data();
  assert.deepEqual({ ...after.attempt, phase: 'NEW' }, before.attempt);
  assert.equal(after.bindingDigest, before.bindingDigest); assert.equal(after.createOperationId, before.createOperationId);
  assert.ok(['NEW', 'CONSUMED'].includes(after.attempt.phase));
  if (after.attempt.phase === 'NEW') {
    assert.equal(after.revision, 0); assert.equal(after.claim, null); assert.equal(successes.length, 0);
  } else {
    assert.equal(after.revision, 1); assert.equal(after.claim.operationId, operationId('CLAIM', attempt.attemptId));
  }
  if (successes.length === 1) assert.equal(after.attempt.phase, 'CONSUMED');
  const callsBeforeRecovery = a.calls() + b.calls();
  for (const [i, result] of results.entries()) {
    const descriptor = result.status === 'rejected' ? result.reason.descriptor : {
      kind: 'CLAIM', attemptId: attempt.attemptId, operationId: operationId('CLAIM', attempt.attemptId), bindingDigest: before.bindingDigest };
    for (let read = 0; read < 2; read++) {
      const outcome = await instances[i].store.lookup(descriptor);
      assert.equal(outcome.status, after.attempt.phase === 'CONSUMED' ? 'COMMITTED' : 'UNKNOWN');
      if (outcome.status === 'COMMITTED') { assert.equal(outcome.phase, 'CONSUMED'); assert.equal(outcome.revision, 1); }
    }
  }
  assert.deepEqual(outerTransactions, [1, 1], 'original-operation recovery must be read-only');
  assert.equal(a.calls() + b.calls(), callsBeforeRecovery, 'lookup must not resume Google verification');
  assert.deepEqual((await ref.get()).data(), after);
  t.diagnostic(JSON.stringify({ successes: successes.length, unknown: failures.filter(r => r.reason.outcome === 'UNKNOWN').length,
    outerTransactions, google: a.calls() + b.calls(), persistedPhase: after.attempt.phase, revision: after.revision }));
});
test('consumed state survives a genuine backend process restart; child lookup cannot authorize replay', async () => {
  const f = fixture(), a = await login(f);
  const script = `const {createLocalFirestoreClient,createFirestoreAttemptStore}=require('./firestore-attempt-store.cjs');
    const {operationId}=require('./bd2-attempt-contract.cjs');
    (async()=>{const db=createLocalFirestoreClient(JSON.parse(process.argv[1]));
    try{const store=createFirestoreAttemptStore({firestore:db,configuration:JSON.parse(process.argv[2]),collectionId:process.argv[3]});
    const id=process.argv[4];if(process.argv[5]==='claim')await store.transition(id,'NEW',r=>({...r,phase:'CONSUMED'}));
    const outcome=await store.lookup({kind:'CLAIM',attemptId:id,operationId:operationId('CLAIM',id),bindingDigest:null});
    let rejected=false;try{await store.transition(id,'NEW',r=>({...r,phase:'CONSUMED'}));}catch{rejected=true;}
    process.stdout.write(JSON.stringify({outcome,rejected}));}finally{await db.terminate();}})().catch(()=>process.exitCode=1);`;
  for (const mode of ['claim', 'lookup']) {
    const child = spawnSync(process.execPath, ['-e', script, JSON.stringify({ host, projectId }), JSON.stringify(f.config), collectionId, a.attemptId, mode],
      { cwd: require('node:path').resolve(__dirname, '..'), env: process.env, encoding: 'utf8', timeout: 45000 });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout); assert.equal(result.outcome.phase, 'CONSUMED'); assert.equal(result.rejected, true);
  }
});
test('pre-commit injected ABORTED rolls back but numeric code alone stays UNKNOWN without retry', async () => {
  const db = client(), original = db.runTransaction.bind(db); let callbacks = 0, inject = false;
  db.runTransaction = (fn, opts) => original(async tx => {
    const result = await fn(tx);
    if (inject && ++callbacks === 1) throw Object.assign(Error('fault-injected ABORTED'), { code: 10 });
    return result;
  }, opts);
  const f = fixture(db), a = await login(f); inject = true;
  let descriptor;
  await assert.rejects(f.validator.verify(request(a)), error => {
    descriptor = error.descriptor; return error.outcome === 'UNKNOWN';
  });
  assert.equal(callbacks, 1); assert.equal(f.calls(), 0);
  assert.equal((await f.store.lookup(descriptor)).status, 'UNKNOWN');
  assert.equal((await db.collection(collectionId).doc(a.attemptId).get()).data().attempt.phase, 'NEW');
});
test('confirmed pre-write rejection has no commit, no automatic retry and no Google verification', async () => {
  const f = fixture(), a = await login(f), ref = f.db.collection(collectionId).doc(a.attemptId);
  const before = (await ref.get()).data(), run = f.db.runTransaction.bind(f.db); let calls = 0;
  f.db.runTransaction = (...args) => { calls++; return run(...args); };
  await assert.rejects(f.validator.verify({ ...request(a), browserProof: 'f'.repeat(64) }), error =>
    error instanceof AttemptStoreError && error.outcome === 'REJECTED');
  assert.equal(calls, 1); assert.equal(f.calls(), 0);
  assert.deepEqual((await ref.get()).data(), before);
});
test('UNKNOWN after actual commit: lookup confirms consumed; no verification, retry or resurrection', async () => {
  const f = fixture(), a = await login(f), original = f.db.runTransaction.bind(f.db); let calls = 0;
  f.db.runTransaction = async (...args) => { calls++; await original(...args); throw Object.assign(Error('lost ack'), { code: 2 }); };
  let descriptor;
  await assert.rejects(f.validator.verify(request(a)), e => {
    assert.equal(e instanceof AttemptStoreError, true); assert.equal(e.outcome, 'UNKNOWN'); descriptor = e.descriptor; return true;
  });
  assert.equal(calls, 1); assert.equal(f.calls(), 0);
  const result = await f.store.lookup(descriptor); assert.equal(result.status, 'COMMITTED'); assert.equal(result.phase, 'CONSUMED');
  await denied(fixture().validator.verify(request(a))); assert.equal(calls, 1);
});
test('F-01: lost commit acknowledgement plus identical Commit RPC ABORTED stays UNKNOWN with one outer attempt', async () => {
  const f = fixture(), a = await login(f);
  const ref = f.db.collection(collectionId).doc(a.attemptId);
  const originalBinding = (await ref.get()).data().bindingDigest;
  const run = f.db.runTransaction.bind(f.db), rpc = f.db.request.bind(f.db);
  let transactionCalls = 0, commitRPCs = 0, injected = false, actualServerCode;
  f.db.runTransaction = (...args) => { transactionCalls++; return run(...args); };
  f.db.request = async (method, body, ...rest) => {
    if (method !== 'commit' || !body.transaction || injected) return rpc(method, body, ...rest);
    injected = true;
    commitRPCs++;
    await rpc(method, body, ...rest); // Original commit actually succeeds; drop its acknowledgement.
    commitRPCs++;
    // Reuse exactly the same transactional Commit request. Do not manufacture code=10.
    try { return await rpc(method, body, ...rest); }
    catch (error) { actualServerCode = error.code; throw error; }
  };
  let failure;
  await assert.rejects(f.validator.verify(request(a)), error => {
    failure = error; return error instanceof AttemptStoreError;
  });
  assert.equal(actualServerCode, 10, 'ABORTED must come from the emulator after original commit');
  assert.equal(commitRPCs, 2);
  assert.equal(transactionCalls, 1, 'F-01: no new outer transaction/claim after ambiguous RPC history');
  assert.equal(failure.outcome, 'UNKNOWN');
  assert.equal(failure.descriptor.operationId, operationId('CLAIM', a.attemptId));
  assert.equal(failure.descriptor.attemptId, a.attemptId);
  assert.equal(failure.descriptor.bindingDigest, originalBinding);
  assert.equal(f.calls(), 0, 'ambiguous storage must not invoke/repeat Google verification');
  const outcome = await f.store.lookup(failure.descriptor);
  assert.equal(outcome.status, 'COMMITTED'); assert.equal(outcome.phase, 'CONSUMED');
  assert.equal(outcome.revision, 1); assert.equal(outcome.operationId, failure.descriptor.operationId);
  assert.equal((await ref.get()).data().attempt.phase, 'CONSUMED');
  assert.equal(transactionCalls, 1, 'lookup must remain read-only');
});
test('UNKNOWN before commit: missing claim receipt stays UNKNOWN; recovery is lookup-only', async () => {
  const f = fixture(), a = await login(f); let calls = 0;
  f.db.runTransaction = async () => { calls++; throw Object.assign(Error('ambiguous before dispatch'), { code: 2 }); };
  let descriptor;
  await assert.rejects(f.validator.verify(request(a)), e => { descriptor = e.descriptor; return e.outcome === 'UNKNOWN'; });
  assert.equal((await f.store.lookup(descriptor)).status, 'UNKNOWN');
  assert.equal((await f.store.lookup(descriptor)).status, 'UNKNOWN');
  assert.equal(calls, 1); assert.equal(f.calls(), 0);
  assert.equal((await f.db.collection(collectionId).doc(a.attemptId).get()).data().attempt.phase, 'NEW');
});
test('OPEN integration risk: an explicitly resubmitted request after UNKNOWN can claim unless caller fences it', async () => {
  const f = fixture(), a = await login(f), run = f.db.runTransaction.bind(f.db); let calls = 0;
  f.db.runTransaction = (...args) => {
    calls++;
    if (calls === 1) return Promise.reject(Object.assign(Error('ambiguous before dispatch'), { code: 2 }));
    return run(...args);
  };
  let descriptor;
  await assert.rejects(f.validator.verify(request(a)), error => {
    descriptor = error.descriptor; return error.outcome === 'UNKNOWN';
  });
  assert.equal((await f.store.lookup(descriptor)).status, 'UNKNOWN');
  assert.equal(calls, 1); assert.equal(f.calls(), 0);
  // Deliberate caller protocol violation, not adapter retry. Records the known boundary.
  const repeated = await f.validator.verify(request(a));
  assert.equal(repeated.principal.sub, 'durable-fixture-subject');
  assert.equal(calls, 2); assert.equal(f.calls(), 1);
});
test('UNKNOWN create after commit is recoverable only as metadata, not a new attempt/nonce', async () => {
  const f = fixture(), original = f.db.runTransaction.bind(f.db); let descriptor;
  f.db.runTransaction = async (...args) => { await original(...args); throw Object.assign(Error(), { code: 4 }); };
  await assert.rejects(f.validator.begin({ browserProofHash: hash('a'.repeat(64)) }), e => {
    descriptor = e.descriptor; return e.outcome === 'UNKNOWN';
  });
  const result = await f.store.lookup(descriptor); assert.equal(result.status, 'COMMITTED');
  assert.equal(result.kind, 'CREATE'); assert.equal(result.nonce, undefined); assert.equal(f.calls(), 0);
});
test('corrupted record, wrong context and wrong browser/nonce binding fail closed', async () => {
  const f = fixture(), a = await login(f);
  await denied(f.validator.verify({ ...request(a), browserProof: 'f'.repeat(64) }));
  await denied(f.validator.verify({ ...request(a), nonce: 'e'.repeat(64) }));
  const other = fixture(client(), { ...configuration(), context: { ...configuration().context, applicationAudience: 'other' } });
  await denied(other.validator.verify(request(a))); assert.equal(other.calls(), 0);
  const ref = f.db.collection(collectionId).doc(a.attemptId);
  await ref.update({ 'attempt.nonceHash': 'd'.repeat(64) });
  assert.equal((await lookup(f, a)).status, 'INVALID');
  await denied(f.validator.verify(request(a))); assert.equal(f.calls(), 0);
});
test('expired attempt/equality reject and conditional update cannot change immutable bindings', async () => {
  const f = fixture(), a = await login(f); f.advance(120000);
  await denied(f.validator.verify(request(a))); assert.equal(f.calls(), 0);
  const g = fixture(), b = await login(g);
  await denied(g.store.transition(b.attemptId, 'NEW', r => ({ ...r, nonceHash: 'd'.repeat(64), phase: 'CONSUMED' })));
  assert.equal((await lookup(g, b)).status, 'UNKNOWN');
});
test('commit delayed beyond expiry persists terminal claim but fresh post-I/O check denies Google verification', async () => {
  const f = fixture(), a = await login(f), original = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn, opts) => original(async tx => { const result = await fn(tx); f.advance(120000); return result; }, opts);
  await denied(f.validator.verify(request(a))); assert.equal(f.calls(), 0);
  assert.equal((await lookup(f, a)).phase, 'CONSUMED');
});
test('storage unavailable and missing receipt return honest outcomes with no verification', async () => {
  const f = fixture(), a = await login(f);
  // Controlled SDK outage, not a Map store. Avoid using a terminated SDK while its
  // fire-and-forget rollback is pending; emulator persistence is checked by another client.
  f.db.runTransaction = async () => { throw Object.assign(Error('storage unavailable'), { code: 14 }); };
  f.db.getAll = async () => { throw Object.assign(Error('storage unavailable'), { code: 14 }); };
  await assert.rejects(f.validator.verify(request(a)), e => e.outcome === 'UNKNOWN');
  assert.equal((await lookup(f, a)).status, 'UNAVAILABLE'); assert.equal(f.calls(), 0);
  // The real document still exists on emulator after that client is gone.
  assert.equal((await lookup(fixture(), a)).status, 'UNKNOWN');
});
