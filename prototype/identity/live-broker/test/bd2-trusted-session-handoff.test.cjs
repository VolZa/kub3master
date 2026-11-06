'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { OAuth2Client } = require('google-auth-library');
const { hash } = require('../security.cjs');
const { authorityKey } = require('../bd2-user-contract.cjs');
const { operationId } = require('../bd2-attempt-contract.cjs');
const { createTrustedSessionHandoff } = require('../bd2-trusted-session-handoff.cjs');
const { createIsolatedJournaledLoginProof, requestDigest } = require('../bd2-dispatch-coordinator.cjs');
const { createGoogleLoginProofValidator } = require('../bd2-login-proof.cjs');
const { createLocalFirestoreClient, createFirestoreAttemptStore } = require('../firestore-attempt-store.cjs');
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certs = { fixture: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
const googleVerify = OAuth2Client.prototype.verifyIdToken;
const copy = value => structuredClone(value);
const denied = fn => assert.throws(fn, { message: 'ACCESS_DENIED' });
const configuration = () => ({ profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'handoff.apps.googleusercontent.com',
  context: { environment: 'TEST', applicationAudience: 'handoff-local', expectedScriptId: 'no-GAS' }, attemptTtlMs: 120000 });

// Unit-only transactional SDK stand-in; actual adapter/validator/coordinator code is used.
// Emulator evidence is a separate, explicitly gated test below, never inferred from this Map.
function memoryFirestore() {
  const rows = new Map(), events = [], hooks = {};
  let active = 0;
  const snapshot = path => ({ exists: rows.has(path), data: () => copy(rows.get(path)) });
  const db = { rows, events, hooks, active: () => active,
    collection(name) { return { doc(id) { const path = `${name}/${id}`; return { path, async get() { return snapshot(path); } }; } }; },
    async runTransaction(callback, options) {
      assert.equal(options.maxAttempts, 1);
      let stage;
      const writes = [];
      active++;
      try {
        const result = await callback({
          async get(ref) {
            stage = ref.path.startsWith('handoff_attempts/') ? (rows.has(ref.path) ? 'claim' : 'create')
              : (rows.has(ref.path) ? 'reserve' : 'intent');
            events.push(stage); await hooks.before?.(stage);
            return snapshot(ref.path);
          },
          create(ref, value) { assert.ok(!rows.has(ref.path)); writes.push([ref.path, copy(value)]); },
          update(ref, value) { assert.ok(rows.has(ref.path)); writes.push([ref.path, { ...copy(rows.get(ref.path)), ...copy(value) }]); },
        });
        for (const [path, value] of writes) rows.set(path, value);
        await hooks.after?.(stage);
        return result;
      } finally { active--; }
    },
  };
  return db;
}

function fixture(t, firestore = memoryFirestore()) {
  let at = Date.now(), google = 0;
  const config = configuration(), hooks = {}, now = () => at;
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs }));
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async function (...args) {
    google++; assert.equal(firestore.active?.() ?? 0, 0, 'Google call outside all transaction callbacks');
    const result = await googleVerify.apply(this, args); await hooks.afterGoogle?.(); return result;
  });
  const options = { firestore, configuration: config, now,
    attemptCollectionId: 'handoff_attempts', journalCollectionId: 'handoff_journal' };
  const owner = createTrustedSessionHandoff(options);
  return { owner, options, firestore, config, now, hooks, google: () => google, advance(ms) { at += ms; } };
}
async function login(f, owner = f.owner, claims = {}) {
  const browserProof = randomBytes(32).toString('hex');
  const a = await owner.begin({ browserProofHash: hash(browserProof) });
  const iat = Math.floor(f.now() / 1000) - 1;
  const encoded = [{ alg: 'RS256', kid: 'fixture' }, { iss: 'accounts.google.com', aud: f.config.clientId,
    sub: 'handoff-subject', iat, exp: iat + 300, nonce: a.nonce, ...claims }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return { attemptId: a.attemptId, nonce: a.nonce, browserProof,
    idToken: encoded + '.' + sign('RSA-SHA256', Buffer.from(encoded), pair.privateKey).toString('base64url') };
}
async function verified(f, request, owner = f.owner) {
  const r = request ?? await login(f, owner), p = await owner.prepareOriginal(r);
  assert.equal(p.status, 'PREPARED');
  const out = await owner.verify(p.handle, r);
  assert.equal(out.status, 'VERIFIED'); assert.ok(out.handoff);
  return { r, p, out, ...out.handoff };
}
const consume = (f, v, dispatch = () => 'CONSUMED_IN_TEST') => f.owner.consume(v.capability, v.binding, dispatch);

test('only successful original journaled Google flow yields one bound capability and unchanged proof fields', async t => {
  const f = fixture(t), v = await verified(f), b = v.binding;
  assert.deepEqual(f.firestore.events, ['create', 'intent', 'reserve', 'claim']);
  assert.equal(f.google(), 1);
  assert.deepEqual(b, { profile: f.config.profile, context: f.config.context, authorityKey: authorityKey(f.config.context),
    principal: { issuer: 'https://accounts.google.com', sub: 'handoff-subject' },
    attempt: { collectionId: 'handoff_attempts', clientId: f.config.clientId, attemptId: v.r.attemptId,
      bindingDigest: v.p.descriptor.bindingDigest },
    journal: { collectionId: 'handoff_journal', intentId: v.p.descriptor.intentId,
      operationId: operationId('CLAIM', v.r.attemptId), requestDigest: requestDigest(v.r, f.config) },
    verifiedAtMs: f.now(), googleTokenExpiresAtMs: v.out.proof.googleTokenExpiresAtMs });
  for (const value of [v.out, v.out.handoff, b, b.context, b.principal, b.attempt, b.journal, v.capability]) assert.ok(Object.isFrozen(value));
  assert.equal(await consume(f, v, actual => { assert.equal(actual, b); return 'one'; }), 'one');
  denied(() => consume(f, v));
  assert.equal((await f.owner.verify(v.p.handle, v.r)).handoff, undefined);
  assert.equal((await f.owner.prepareOriginal(v.r)).status, 'LOOKUP_ONLY');
});

for (const stage of ['intent', 'reserve', 'claim']) for (const afterCommit of [false, true]) {
  test(`UNKNOWN ${stage} ${afterCommit ? 'after' : 'before'} commit never creates handoff or repeats dispatch`, async t => {
    const f = fixture(t), r = await login(f);
    const fail = current => { if (current === stage) throw Error('secret storage diagnostic'); };
    f.firestore.hooks[afterCommit ? 'after' : 'before'] = fail;
    const p = await f.owner.prepareOriginal(r);
    const out = p.status === 'PREPARED' ? await f.owner.verify(p.handle, r) : p;
    assert.equal(out.status, 'LOOKUP_ONLY'); assert.equal(out.dispatchOutcome, 'UNKNOWN');
    assert.equal(out.handoff, undefined); assert.equal(out.proof, undefined); assert.equal(f.google(), 0);
    const count = f.firestore.events.length;
    for (const owner of [f.owner, createTrustedSessionHandoff(f.options)]) {
      assert.equal((await owner.recover(out.descriptor)).handoff, undefined);
      assert.equal((await owner.verify({ descriptor: out.descriptor }, r)).status, 'LOOKUP_ONLY');
    }
    assert.equal(f.firestore.events.length, count);
    assert.ok(!JSON.stringify(out).includes('secret storage diagnostic'));
  });
}

test('failed Google signature verification never creates capability despite committed claim', async t => {
  const f = fixture(t), r = await login(f); r.idToken += 'forged';
  const p = await f.owner.prepareOriginal(r), out = await f.owner.verify(p.handle, r);
  assert.equal(out.status, 'LOOKUP_ONLY'); assert.equal(out.dispatchOutcome, 'DENIED');
  assert.equal(out.handoff, undefined); assert.equal(out.outcome.phase, 'CONSUMED'); assert.equal(f.google(), 1);
  assert.equal((await f.owner.recover(p.descriptor)).handoff, undefined);
});

test('definitive rejected claim or reservation cannot mint handoff', async t => {
  const f = fixture(t);
  for (const stage of ['claim', 'reserve']) {
    const r = await login(f), p = await f.owner.prepareOriginal(r);
    const path = stage === 'claim' ? `handoff_attempts/${r.attemptId}` : `handoff_journal/${p.descriptor.intentId}`;
    const row = f.firestore.rows.get(path);
    if (stage === 'claim') {
      row.attempt.phase = 'CONSUMED'; row.revision = 1;
      row.claim = { operationId: operationId('CLAIM', r.attemptId), checkedAtMs: f.now() };
    } else row.revision = 9;
    const out = await f.owner.verify(p.handle, r);
    assert.equal(out.status, 'LOOKUP_ONLY'); assert.equal(out.dispatchOutcome, 'REJECTED'); assert.equal(out.handoff, undefined);
  }
  assert.equal(f.google(), 0);
});

for (const expiry of ['attempt', 'token']) {
  test(`post-Google ${expiry} expiry equality denies handoff`, async t => {
    const f = fixture(t), deadline = Math.floor(f.now() / 1000) * 1000 + 1000;
    const r = await login(f, f.owner, expiry === 'token' ? { exp: deadline / 1000 } : {});
    const p = await f.owner.prepareOriginal(r);
    f.hooks.afterGoogle = () => f.advance(expiry === 'attempt' ? 120000 : deadline - f.now());
    const out = await f.owner.verify(p.handle, r);
    assert.equal(out.status, 'LOOKUP_ONLY'); assert.equal(out.handoff, undefined); assert.equal(f.google(), 1);
  });
}

test('arbitrary proof DTOs, genuine public proof and VERIFIED outcomes are never mint/consume authority', async t => {
  const f = fixture(t), v = await verified(f);
  assert.deepEqual(Object.keys(require('../bd2-trusted-session-handoff.cjs')), ['createTrustedSessionHandoff']);
  assert.deepEqual(Object.keys(f.owner).sort(), ['begin', 'consume', 'prepareOriginal', 'recover', 'verify']);
  for (const value of [v.out.proof, copy(v.out.proof), v.out, copy(v.out), { status: 'VERIFIED', proof: copy(v.out.proof) },
    ...[JSON.parse(JSON.stringify(v.capability)), { ...v.capability }, copy(v.capability)]]) {
    denied(() => f.owner.consume(value, v.binding, () => assert.fail('forged dispatch')));
  }
  for (const field of ['proof', 'proofDto', 'loginProof', 'verifier', 'journal', 'attempts', 'client', 'fixtureKey']) {
    denied(() => createTrustedSessionHandoff({ ...f.options, [field]: v.out.proof }));
  }
  assert.equal(await consume(f, v), 'CONSUMED_IN_TEST', 'rejected copies do not consume the genuine identity');
});

test('a different owner cannot consume, adopt or restore an original capability', async t => {
  const f = fixture(t), v = await verified(f), other = createTrustedSessionHandoff(f.options);
  denied(() => other.consume(v.capability, v.binding, () => assert.fail('wrong owner')));
  assert.equal((await other.recover(v.p.descriptor)).handoff, undefined);
  assert.equal((await other.prepareOriginal(v.r)).status, 'LOOKUP_ONLY');
  assert.equal(await consume(f, v), 'CONSUMED_IN_TEST');
  assert.equal(f.google(), 1);
});

test('concurrent original verify calls create at most one handoff, with one reservation, claim and Google call', async t => {
  const f = fixture(t), r = await login(f), p = await f.owner.prepareOriginal(r);
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => f.owner.verify(p.handle, r)));
  assert.equal(outcomes.filter(o => o.handoff).length, 1);
  assert.equal(outcomes.filter(o => o.status === 'LOOKUP_ONLY').length, 7);
  assert.deepEqual(f.firestore.events, ['create', 'intent', 'reserve', 'claim']); assert.equal(f.google(), 1);
  const v = outcomes.find(o => o.handoff).handoff;
  assert.equal(await consume(f, v), 'CONSUMED_IN_TEST'); denied(() => consume(f, v));
});

test('concurrent and reentrant consumers consume synchronously before callback or I/O', async t => {
  const f = fixture(t), v = await verified(f);
  let release, calls = 0;
  const io = new Promise(resolve => { release = resolve; });
  const first = consume(f, v, async actual => {
    calls++; assert.equal(actual, v.binding);
    denied(() => consume(f, v)); // Reentry before the first await.
    await io; return 'finished';
  });
  denied(() => consume(f, v)); // First dispatch still awaits I/O.
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => Promise.resolve().then(() => consume(f, v))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 0);
  assert.equal(calls, 1); release(); assert.equal(await first, 'finished');
  const w = await verified(f);
  const race = await Promise.allSettled(Array.from({ length: 8 }, () => Promise.resolve().then(() => consume(f, w))));
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
});

test('failed, UNKNOWN, throwing or invalid consumer never restores a consumed capability or leaks diagnostics', async t => {
  const f = fixture(t);
  for (const callback of [() => { throw Error('raw-token-secret'); }, async () => { throw Error('raw-token-secret'); },
    () => Promise.reject(Error('UNKNOWN secret')), null]) {
    const v = await verified(f);
    await assert.rejects(Promise.resolve().then(() => consume(f, v, callback)), { message: 'ACCESS_DENIED' });
    denied(() => consume(f, v));
    assert.equal((await f.owner.verify(v.p.handle, v.r)).handoff, undefined);
  }
});

function leaves(value, path = []) {
  return Object.entries(value).flatMap(([key, item]) => item && typeof item === 'object'
    ? leaves(item, [...path, key]) : [[...path, key]]);
}
const atPath = (value, path) => path.reduce((v, key) => v[key], value);
test('every principal/context/authority/physical Attempt/Journal/metadata binding substitution is rejected and burned', async t => {
  const f = fixture(t), sample = await verified(f);
  for (const path of leaves(sample.binding)) {
    const v = await verified(f), changed = copy(v.binding), parent = atPath(changed, path.slice(0, -1)), key = path.at(-1);
    parent[key] = typeof parent[key] === 'number' ? parent[key] + 1 : parent[key] + '-changed';
    denied(() => f.owner.consume(v.capability, changed, () => assert.fail(path.join('.'))));
    denied(() => consume(f, v));
  }
  assert.throws(() => { sample.binding.principal.sub = 'changed'; }, TypeError);
  assert.throws(() => { sample.binding.attempt.collectionId = 'other'; }, TypeError);
});

test('accessors are rejected without executing getters; consuming fails closed before validation reentry', async t => {
  const f = fixture(t), sample = await verified(f);
  let calls = 0;
  for (const path of leaves(sample.binding)) {
    const v = await verified(f), expected = copy(v.binding), parent = atPath(expected, path.slice(0, -1));
    Object.defineProperty(parent, path.at(-1), { enumerable: true, get() { calls++; return 'secret'; } });
    denied(() => f.owner.consume(v.capability, expected, () => assert.fail('accessor dispatch')));
    denied(() => consume(f, v));
  }
  const trap = { get principal() { calls++; return sample.binding.principal; }, get toJSON() { calls++; return () => 'secret'; } };
  denied(() => f.owner.consume(trap, trap, () => assert.fail('forged accessor')));
  const r = await login(f), p = await f.owner.prepareOriginal(r);
  await assert.rejects(f.owner.verify(p.handle, { ...r, get idToken() { calls++; return r.idToken; } }), /ACCESS_DENIED/);
  denied(() => createTrustedSessionHandoff({ ...f.options, get configuration() { calls++; return f.config; } }));
  for (const key of ['attemptCollectionId', 'journalCollectionId']) {
    denied(() => createTrustedSessionHandoff({ ...f.options, [key]: { toString() { calls++; return 'secret'; } } }));
  }
  const v = await verified(f);
  const proxy = new Proxy(v.binding, { getPrototypeOf(target) {
    denied(() => consume(f, v)); // Registry entry has gone before caller-controlled validation.
    return Reflect.getPrototypeOf(target);
  } });
  assert.equal(await f.owner.consume(v.capability, proxy, () => 'one'), 'one');
  assert.equal(calls, 0);
});

test('binding schema rejects missing/extra/hidden/symbol/prototype fields and nested object accessors', async t => {
  const f = fixture(t);
  const changes = [b => { delete b.principal; }, b => { b.idToken = 'secret'; },
    b => { b[Symbol('secret')] = 'secret'; }, b => Object.setPrototypeOf(b, { verified: true }),
    b => Object.defineProperty(b, 'authorityKey', { enumerable: false }),
    b => { b.attempt.extra = 'secret'; }, b => { delete b.journal.requestDigest; },
    b => Object.defineProperty(b, 'principal', { enumerable: true, get() { assert.fail('principal getter'); } }),
    b => Object.defineProperty(b, 'context', { enumerable: true, get() { assert.fail('context getter'); } })];
  for (const change of changes) {
    const v = await verified(f), binding = copy(v.binding); change(binding);
    denied(() => f.owner.consume(v.capability, binding, () => assert.fail('malformed binding')));
    denied(() => consume(f, v));
  }
});

test('capability serialization contains no provenance, token, nonce or browser proof', async t => {
  const f = fixture(t), v = await verified(f);
  assert.equal(JSON.stringify(v.capability), '{}'); assert.deepEqual(Reflect.ownKeys(v.capability), []);
  for (const output of [JSON.stringify(v.out), JSON.stringify(v.binding), JSON.stringify([...f.firestore.rows])]) {
    for (const secret of [v.r.idToken, v.r.nonce, v.r.browserProof]) assert.equal(output.includes(secret), false);
  }
  const { handoff, ...dto } = copy(v.out);
  denied(() => f.owner.consume(dto, handoff.binding, () => assert.fail('restored outcome')));
});

test('lost transient state and direct raw verification cannot become recovery/creation authority', async t => {
  const f = fixture(t), v = await verified(f), restarted = createTrustedSessionHandoff(f.options);
  assert.equal((await restarted.recover(v.p.descriptor)).outcome.status, 'COMMITTED');
  denied(() => restarted.consume(v.capability, v.binding, () => assert.fail('adoption')));
  const store = createFirestoreAttemptStore({ firestore: f.firestore, configuration: f.config,
    collectionId: 'handoff_attempts', now: f.now });
  const raw = createGoogleLoginProofValidator({ configuration: f.config, attempts: store, now: f.now });
  const r = await login(f, raw), proof = await raw.verify(r);
  denied(() => f.owner.consume(proof, v.binding, () => assert.fail('raw bypass')));
  assert.equal((await f.owner.prepareOriginal(r)).status, 'LOOKUP_ONLY');
  assert.equal((await restarted.prepareOriginal(v.r)).status, 'LOOKUP_ONLY');
});

test('original isolated coordinator retains exact API/result and cannot mint handoff', async t => {
  const f = fixture(t), original = createIsolatedJournaledLoginProof(f.options);
  const r = await login(f, original), p = await original.prepareOriginal(r), result = await original.verify(p.handle, r);
  assert.deepEqual(Object.keys(original).sort(), ['begin', 'prepareOriginal', 'recover', 'verify']);
  assert.deepEqual(Object.keys(result).sort(), ['descriptor', 'proof', 'status']);
  assert.deepEqual(Object.keys(result.proof).sort(), ['attemptId', 'context', 'googleTokenExpiresAtMs', 'principal', 'profile', 'verifiedAtMs']);
  denied(() => f.owner.consume(result, {}, () => assert.fail('old result mint')));
});

test('real SDK/Firestore Emulator: original flow, no extra records, one-use and restart lookup only',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST && 'INTEGRATION_BLOCKED: real loopback Firestore Emulator not supplied' }, async t => {
    const endpoint = { host: process.env.FIRESTORE_EMULATOR_HOST, projectId: 'demo-kub-bd2-handoff-' + randomBytes(6).toString('hex') };
    const db = createLocalFirestoreClient(endpoint);
    t.after(() => db.terminate());
    const f = fixture(t, db), suffix = randomBytes(8).toString('hex');
    f.options.attemptCollectionId = `handoff_attempt_${suffix}`; f.options.journalCollectionId = `handoff_journal_${suffix}`;
    f.owner = createTrustedSessionHandoff(f.options);
    const v = await verified(f);
    assert.equal(await consume(f, v), 'CONSUMED_IN_TEST'); denied(() => consume(f, v));
    const restarted = createTrustedSessionHandoff(f.options);
    denied(() => restarted.consume(v.capability, v.binding, () => assert.fail('adoption')));
    const recovered = await restarted.recover(v.p.descriptor);
    assert.equal(recovered.status, 'LOOKUP_ONLY'); assert.equal(recovered.outcome.phase, 'CONSUMED');
    assert.equal(recovered.handoff, undefined); assert.equal((await restarted.prepareOriginal(v.r)).status, 'LOOKUP_ONLY');
    assert.equal(f.google(), 1);
    const collections = await db.listCollections();
    assert.deepEqual(collections.map(c => c.id).sort(), [f.options.attemptCollectionId, f.options.journalCollectionId].sort());
    for (const collection of collections) assert.equal((await collection.get()).size, 1);

    // A real process dies with an unconsumed capability; only a JSON copy crosses stdout.
    // Test signing keys/certificates are restricted to this test's child, never factory inputs.
    const childScript = `
const fs=require('node:fs'),input=JSON.parse(fs.readFileSync(0,'utf8'));
const {OAuth2Client}=require('google-auth-library');
OAuth2Client.prototype.getFederatedSignonCertsAsync=async()=>({certs:input.certs});
const {createLocalFirestoreClient}=require('./firestore-attempt-store.cjs');
const {createTrustedSessionHandoff}=require('./bd2-trusted-session-handoff.cjs');
const db=createLocalFirestoreClient(input.endpoint);
const owner=createTrustedSessionHandoff({...input.options,firestore:db});
(async()=>{const p=await owner.prepareOriginal(input.request);const out=await owner.verify(p.handle,input.request);
if(out.status!=='VERIFIED')process.exit(1);fs.writeSync(1,JSON.stringify(out));process.exit(77);
})().catch(()=>process.exit(1));`;
    const r = await login(f);
    const child = spawnSync(process.execPath, ['-e', childScript], { encoding: 'utf8', windowsHide: true, timeout: 15000,
      cwd: require('node:path').resolve(__dirname, '..'), env: process.env,
      input: JSON.stringify({ endpoint, certs, request: r, options: { configuration: f.config,
        attemptCollectionId: f.options.attemptCollectionId, journalCollectionId: f.options.journalCollectionId } }) });
    assert.equal(child.status, 77, child.stderr);
    const lost = JSON.parse(child.stdout);
    for (const owner of [f.owner, restarted]) {
      denied(() => owner.consume(lost.handoff.capability, lost.handoff.binding, () => assert.fail('crash adoption')));
      assert.equal((await owner.recover(lost.descriptor)).outcome.status, 'COMMITTED');
      assert.equal((await owner.prepareOriginal(r)).status, 'LOOKUP_ONLY');
    }
    assert.equal(f.google(), 1, 'parent recovery never verifies again');
  });
