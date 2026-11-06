'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { hash } = require('../security.cjs');
const { configuration, bindingDigest, operationId } = require('../bd2-attempt-contract.cjs');
const { authorityKey } = require('../bd2-user-contract.cjs');
const { createTrustedSessionHandoff } = require('../bd2-trusted-session-handoff.cjs');
const { validateAttemptEnvelope } = require('../firestore-attempt-store.cjs');
const { validateDispatchJournalRecord, intentId } = require('../firestore-dispatch-journal.cjs');
const { createOriginalAttemptMetadataReader } = require('../bd2-original-attempt-reader.cjs');

const EPOCH = Date.UTC(2026, 10, 6, 12);
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certs = { fixture: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
const copy = value => structuredClone(value);
const denied = fn => assert.throws(fn, { message: 'ACCESS_DENIED' });
const deniedAsync = fn => assert.rejects(async () => fn(), { message: 'ACCESS_DENIED' });
const config = () => ({ profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'original.apps.googleusercontent.com',
  context: { environment: 'TEST', applicationAudience: 'original-local', expectedScriptId: 'no-GAS' },
  attemptTtlMs: 120000 });

// Controlled SDK-shaped fixture: real D1/Google signature validation, no network or emulator.
// Returning caller-owned records also makes metadata detachment observable.
function memoryFirestore() {
  const rows = new Map(), collections = new Map(), reads = [], writes = [], hooks = {};
  let readOnly = false, transactions = 0;
  const snapshot = ref => ({ id: ref.id, ref, exists: rows.has(ref.path), data: () => rows.get(ref.path) });
  const db = {
    rows, reads, writes, hooks,
    get transactions() { return transactions; },
    onlyReads() { readOnly = true; reads.length = 0; },
    collection(name) {
      if (!collections.has(name)) {
        const collection = { firestore: db, id: name, path: name,
          doc(id) {
            const ref = { firestore: db, id, path: `${name}/${id}`, parent: collection,
              async get() {
                reads.push(ref.path);
                await hooks.beforeRead?.(ref);
                const value = snapshot(ref);
                return hooks.snapshot ? hooks.snapshot(ref, value) : value;
              } };
            return hooks.document ? hooks.document(ref) : ref;
          } };
        collections.set(name, collection);
      }
      const collection = collections.get(name);
      return hooks.collection ? hooks.collection(collection) : collection;
    },
    async runTransaction(callback, options) {
      assert.equal(readOnly, false, 'metadata must never start a transaction');
      assert.equal(options.maxAttempts, 1);
      transactions++;
      const staged = [];
      const result = await callback({
        async get(ref) { return snapshot(ref); },
        create(ref, value) {
          assert.equal(readOnly, false); assert.equal(rows.has(ref.path), false);
          staged.push([ref.path, copy(value)]);
        },
        update(ref, value) {
          assert.equal(readOnly, false); assert.equal(rows.has(ref.path), true);
          staged.push([ref.path, { ...copy(rows.get(ref.path)), ...copy(value) }]);
        },
      });
      for (const [path, value] of staged) { rows.set(path, value); writes.push(path); }
      return result;
    },
  };
  return db;
}

function fixture(t, options = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: EPOCH });
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs }));
  let at = EPOCH;
  const firestore = memoryFirestore(), originalConfig = config();
  const input = { firestore, configuration: originalConfig, now: () => at,
    attemptCollectionId: 'original_attempts', journalCollectionId: 'original_journal', ...options };
  const reader = createOriginalAttemptMetadataReader(input);
  return { reader, firestore, originalConfig, input, advance(ms) { at += ms; t.mock.timers.tick(ms); } };
}

async function verified(f, owner = f.reader) {
  const browserProof = 'b'.repeat(64), a = await owner.begin({ browserProofHash: hash(browserProof) });
  const iat = Math.floor(f.input.now() / 1000) - 1;
  // Use the captured original client even when the caller later replaces its configuration.
  const clientId = f.firestore.rows.get(`original_attempts/${a.attemptId}`)?.attempt.clientId ?? f.originalConfig.clientId;
  const encoded = [{ alg: 'RS256', kid: 'fixture' }, { iss: 'accounts.google.com', aud: clientId,
    sub: 'original-subject', nonce: a.nonce, iat, exp: iat + 300 }]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  const request = { attemptId: a.attemptId, nonce: a.nonce, browserProof,
    idToken: `${encoded}.${sign('RSA-SHA256', Buffer.from(encoded), pair.privateKey).toString('base64url')}` };
  const preparation = await owner.prepareOriginal(request);
  assert.equal(preparation.status, 'PREPARED');
  const outcome = await owner.verify(preparation.handle, request);
  assert.equal(outcome.status, 'VERIFIED');
  const { capability, binding } = outcome.handoff;
  return { capability, binding, request, outcome,
    attemptPath: `${binding.attempt.collectionId}/${binding.attempt.attemptId}`,
    journalPath: `${binding.journal.collectionId}/${binding.journal.intentId}` };
}

const evidence = (f, v) => ({ attempt: f.firestore.rows.get(v.attemptPath), journal: f.firestore.rows.get(v.journalPath) });
const read = (f, v) => f.reader.readOriginal(v.capability, v.binding);
async function rejectEvidence(f, v) {
  const writes = copy(f.firestore.writes), transactions = f.firestore.transactions;
  f.firestore.onlyReads();
  await deniedAsync(() => read(f, v));
  const reads = copy(f.firestore.reads);
  denied(() => read(f, v));
  assert.deepEqual(f.firestore.reads, reads, 'spent authority cannot read again');
  assert.deepEqual(f.firestore.writes, writes);
  assert.equal(f.firestore.transactions, transactions);
  assert.ok(reads.length <= 2 && reads.every(path => path === v.attemptPath || path === v.journalPath), 'no fallback');
}

test('genuine original flow returns only detached frozen metadata, exact C/D and two reads with no writes', async t => {
  const f = fixture(t), v = await verified(f), saved = evidence(f, v);
  const before = copy([...f.firestore.rows]), writes = copy(f.firestore.writes), transactions = f.firestore.transactions;
  f.firestore.onlyReads();
  const result = await read(f, v);
  assert.deepEqual(result, { profile: v.binding.profile, context: v.binding.context, authorityKey: authorityKey(v.binding.context),
    attempt: v.binding.attempt, journal: v.binding.journal, createdAtMs: EPOCH, expiresAtMs: EPOCH + 120000 });
  for (const value of [result, result.context, result.attempt, result.journal]) assert.ok(Object.isFrozen(value));
  assert.notEqual(result.context, saved.attempt.attempt.context);
  assert.notEqual(result.context, v.binding.context);
  assert.notEqual(result.attempt, v.binding.attempt);
  assert.notEqual(result.journal, v.binding.journal);
  const detached = copy(result);
  saved.attempt.attempt.createdAtMs = 1;
  saved.attempt.attempt.context.applicationAudience = 'changed';
  saved.journal.binding.requestDigest = hash('changed');
  assert.deepEqual(result, detached);
  assert.throws(() => { result.attempt.attemptId = 'changed'; }, TypeError);
  assert.deepEqual(f.firestore.reads, [v.attemptPath, v.journalPath]);
  assert.deepEqual(f.firestore.writes, writes);
  assert.equal(f.firestore.transactions, transactions);
  assert.equal(before.length, 2, 'only original Attempt and Journal exist');
  for (const secret of [v.request.idToken, v.request.nonce, v.request.browserProof]) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(Object.hasOwn(result, 'configuration'), false);
});

test('restricted facade/export exposes no owner, raw reader, continuation, Intent or permit API', t => {
  const f = fixture(t);
  assert.deepEqual(Object.keys(require('../bd2-original-attempt-reader.cjs')), ['createOriginalAttemptMetadataReader']);
  assert.deepEqual(Object.keys(f.reader).sort(), ['begin', 'prepareOriginal', 'readOriginal', 'recover', 'verify']);
  assert.ok(Object.isFrozen(f.reader));
  assert.equal(f.firestore.transactions, 0);
  assert.deepEqual(f.firestore.reads, []);
});

test('configuration, nested context, namespaces and Firestore option mutation cannot influence either component', async t => {
  const f = fixture(t), otherDatabase = memoryFirestore();
  f.originalConfig.attemptTtlMs = 1;
  f.originalConfig.clientId = 'changed.apps.googleusercontent.com';
  f.originalConfig.context.applicationAudience = 'changed';
  f.input.configuration = config();
  f.input.configuration.attemptTtlMs = 60000;
  f.input.attemptCollectionId = 'changed_attempts';
  f.input.journalCollectionId = 'changed_journal';
  f.input.firestore = otherDatabase;
  const v = await verified(f);
  f.firestore.onlyReads();
  const result = await read(f, v);
  assert.equal(result.attempt.clientId, config().clientId);
  assert.deepEqual(result.context, config().context);
  assert.equal(result.expiresAtMs, EPOCH + 120000);
  assert.deepEqual(f.firestore.reads, [v.attemptPath, v.journalPath]);
  assert.equal(otherDatabase.rows.size, 0);
  assert.deepEqual(otherDatabase.reads, []);
});

test('later changed TTL and a separately constructed factory cannot adopt the original capability', async t => {
  const f = fixture(t), v = await verified(f);
  const later = createOriginalAttemptMetadataReader({ ...f.input, configuration: { ...config(), attemptTtlMs: 60000 } });
  f.firestore.onlyReads();
  denied(() => later.readOriginal(v.capability, v.binding));
  assert.deepEqual(f.firestore.reads, []);
  assert.equal((await read(f, v)).expiresAtMs, EPOCH + 120000);
});

for (const source of ['another factory, same configuration', 'another factory, different database', 'raw D1 owner']) {
  test(`foreign capability denied: ${source}`, async t => {
    const f = fixture(t);
    const owner = source === 'raw D1 owner' ? createTrustedSessionHandoff(f.input)
      : createOriginalAttemptMetadataReader({ ...f.input,
        firestore: source.includes('different database') ? memoryFirestore() : f.firestore });
    const v = await verified(f, owner);
    f.firestore.onlyReads();
    denied(() => read(f, v));
    assert.deepEqual(f.firestore.reads, []);
    // The rejected foreign consume cannot spend that owner's genuine capability.
    if (source === 'raw D1 owner') assert.equal(await owner.consume(v.capability, v.binding, () => 'owned'), 'owned');
    else assert.equal((await owner.readOriginal(v.capability, v.binding)).createdAtMs, EPOCH);
  });
}

test('fabricated/copied capabilities, proof DTOs and binding data cannot authorize reads', async t => {
  const f = fixture(t), v = await verified(f);
  f.firestore.onlyReads();
  for (const value of [{}, { ...v.capability }, copy(v.capability), JSON.parse(JSON.stringify(v.capability)),
    v.binding, copy(v.binding), v.outcome, v.outcome.proof, null, undefined]) {
    denied(() => f.reader.readOriginal(value, v.binding));
  }
  assert.deepEqual(f.firestore.reads, []);
  assert.equal((await read(f, v)).createdAtMs, EPOCH);
});

test('successful metadata and all copies remain data and cannot consume D1 again', async t => {
  const f = fixture(t), v = await verified(f);
  f.firestore.onlyReads();
  const result = await read(f, v), reads = copy(f.firestore.reads);
  for (const value of [result, copy(result), result.attempt, result.journal, v.capability]) {
    denied(() => f.reader.readOriginal(value, v.binding));
  }
  assert.deepEqual(f.firestore.reads, reads);
  assert.equal(f.firestore.rows.size, 2, 'no Intent or Session');
});

test('D1 is spent synchronously before first metadata read and reentrant use cannot start another read', async t => {
  const f = fixture(t), v = await verified(f);
  f.firestore.onlyReads();
  f.firestore.hooks.beforeRead = () => denied(() => read(f, v));
  const pending = read(f, v);
  denied(() => read(f, v));
  assert.equal((await pending).createdAtMs, EPOCH);
  assert.deepEqual(f.firestore.reads, [v.attemptPath, v.journalPath]);
});

test('concurrent metadata calls have exactly one winner and one pair of reads', async t => {
  const f = fixture(t), v = await verified(f);
  f.firestore.onlyReads();
  const outcomes = await Promise.allSettled(Array.from({ length: 8 }, async () => read(f, v)));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  for (const value of outcomes.filter(value => value.status === 'rejected')) assert.equal(value.reason.message, 'ACCESS_DENIED');
  assert.deepEqual(f.firestore.reads, [v.attemptPath, v.journalPath]);
});

const bindingChanges = [
  ['profile', b => { b.profile = 'other'; }],
  ['client', b => { b.attempt.clientId = 'other.apps.googleusercontent.com'; }],
  ['context', b => { b.context.applicationAudience = 'other'; }],
  ['authority', b => { b.authorityKey = hash('other'); }],
  ['Attempt ID', b => { b.attempt.attemptId = hash('other'); }],
  ['Attempt namespace', b => { b.attempt.collectionId = 'other'; }],
  ['binding digest', b => { b.attempt.bindingDigest = hash('other'); }],
  ['CLAIM operation', b => { b.journal.operationId = hash('other'); }],
  ['Journal ID', b => { b.journal.intentId = hash('other'); }],
  ['Journal namespace', b => { b.journal.collectionId = 'other'; }],
  ['request digest', b => { b.journal.requestDigest = hash('other'); }],
  ['principal', b => { b.principal.sub = 'other'; }],
  ['V', b => { b.verifiedAtMs++; }],
  ['G', b => { b.googleTokenExpiresAtMs++; }],
  ['configuration override', b => { b.configuration = config(); }],
];
for (const [name, mutate] of bindingChanges) test(`substituted D1 provenance denied and burned before I/O: ${name}`, async t => {
  const f = fixture(t), v = await verified(f), changed = copy(v.binding);
  mutate(changed); f.firestore.onlyReads();
  denied(() => f.reader.readOriginal(v.capability, changed));
  denied(() => read(f, v));
  assert.deepEqual(f.firestore.reads, []);
});

test('per-operation configuration/database/namespace or continuation arguments are rejected and burn D1', async t => {
  const f = fixture(t);
  for (const extra of [{ configuration: config() }, { firestore: memoryFirestore() }, { attemptCollectionId: 'other' },
    { journalCollectionId: 'other' }, () => assert.fail('caller continuation')]) {
    const v = await verified(f), reads = copy(f.firestore.reads);
    denied(() => f.reader.readOriginal(v.capability, v.binding, extra));
    denied(() => read(f, v));
    assert.deepEqual(f.firestore.reads, reads);
  }
});

test('missing original configuration, invalid names and injection options deny construction without I/O', () => {
  const firestore = memoryFirestore();
  for (const configuration of [undefined, null, {}, { ...config(), attemptTtlMs: undefined }]) {
    denied(() => createOriginalAttemptMetadataReader({ firestore, configuration }));
  }
  for (const name of ['', 'nested/path', '.', 1, {}, 'x'.repeat(101)]) for (const field of ['attemptCollectionId', 'journalCollectionId']) {
    denied(() => createOriginalAttemptMetadataReader({ firestore, configuration: config(), [field]: name }));
  }
  for (const field of ['owner', 'reader', 'verifier', 'loginProof', 'client', 'certs', 'continuation', 'readPort', 'attempts', 'journal']) {
    denied(() => createOriginalAttemptMetadataReader({ firestore, configuration: config(), [field]: {} }));
  }
  denied(() => createOriginalAttemptMetadataReader({ configuration: config() }));
  assert.deepEqual(firestore.reads, []); assert.equal(firestore.transactions, 0);
});

test('construction rejects getters without invoking them and rejects a different physical collection/database', () => {
  const firestore = memoryFirestore();
  let getters = 0;
  denied(() => createOriginalAttemptMetadataReader({ firestore, get configuration() { getters++; return config(); } }));
  const changed = config();
  Object.defineProperty(changed.context, 'applicationAudience', { enumerable: true, get() { getters++; return 'other'; } });
  denied(() => createOriginalAttemptMetadataReader({ firestore, configuration: changed }));
  for (const patch of [{ firestore: memoryFirestore() }, { path: 'other' }, { id: 'other' }]) {
    firestore.hooks.collection = collection => ({ ...collection, ...patch });
    denied(() => createOriginalAttemptMetadataReader({ firestore, configuration: config() }));
  }
  assert.equal(getters, 0); assert.equal(firestore.transactions, 0); assert.deepEqual(firestore.reads, []);
});

const attemptCorruptions = [
  ['missing document', (e, f, v) => f.firestore.rows.delete(v.attemptPath)],
  ['missing envelope', (e, f, v) => f.firestore.rows.set(v.attemptPath, undefined)],
  ['wrong document type', (e, f, v) => f.firestore.rows.set(v.attemptPath, e.journal)],
  ['wrong revision', e => { e.attempt.revision = 2; }],
  ['nonterminal NEW', e => { e.attempt.attempt.phase = 'NEW'; e.attempt.revision = 0; e.attempt.claim = null; }],
  ['unknown phase', e => { e.attempt.attempt.phase = 'OTHER'; }],
  ['wrong CREATE identity', e => { e.attempt.createOperationId = hash('other'); }],
  ['wrong CLAIM identity', e => { e.attempt.claim.operationId = operationId('CREATE', e.attempt.attempt.attemptId); }],
  ['missing CLAIM', e => { e.attempt.claim = null; }],
  ['wrong envelope digest', e => { e.attempt.bindingDigest = hash('other'); }],
  ['wrong nonce hash', e => { e.attempt.attempt.nonceHash = hash('other'); }],
  ['wrong proof hash', e => { e.attempt.attempt.proofHash = hash('other'); }],
  ['wrong embedded Attempt ID', e => { e.attempt.attempt.attemptId = hash('other'); }],
  ['wrong profile', e => { e.attempt.attempt.profile = 'other'; }],
  ['wrong client', e => { e.attempt.attempt.clientId = 'other.apps.googleusercontent.com'; }],
  ['wrong context', e => { e.attempt.attempt.context.applicationAudience = 'other'; }],
  ['wrong TTL', e => { e.attempt.attempt.expiresAtMs++; }],
  ['C equals D', e => { e.attempt.attempt.createdAtMs = e.attempt.attempt.expiresAtMs; }],
  ['CLAIM before C', e => { e.attempt.claim.checkedAtMs--; }],
  ['CLAIM at D', e => { e.attempt.claim.checkedAtMs = e.attempt.attempt.expiresAtMs; }],
];
for (const [name, mutate] of attemptCorruptions) test(`Attempt corruption denies metadata: ${name}`, async t => {
  const f = fixture(t), v = await verified(f);
  mutate(evidence(f, v), f, v); await rejectEvidence(f, v);
});

for (const field of ['createdAtMs', 'expiresAtMs']) for (const value of [0, -1, NaN, Infinity, 1.5, '1000', Number.MAX_SAFE_INTEGER + 1]) {
  test(`Attempt rejects invalid ${field}: ${String(value)}`, async t => {
    const f = fixture(t), v = await verified(f);
    evidence(f, v).attempt.attempt[field] = value;
    await rejectEvidence(f, v);
  });
}

const journalCorruptions = [
  ['missing document', (e, f, v) => f.firestore.rows.delete(v.journalPath)],
  ['missing record', (e, f, v) => f.firestore.rows.set(v.journalPath, undefined)],
  ['wrong document type', (e, f, v) => f.firestore.rows.set(v.journalPath, e.attempt)],
  ['wrong revision', e => { e.journal.revision = 2; }],
  ['nonterminal INTENT', e => { e.journal.state = 'INTENT'; e.journal.revision = 0; e.journal.reservedAtMs = null; }],
  ['unknown state', e => { e.journal.state = 'OTHER'; }],
  ['different Attempt', e => { e.journal.binding.attemptId = hash('other'); }],
  ['wrong intent identity', e => { e.journal.binding.intentId = hash('other'); }],
  ['wrong CLAIM identity', e => { e.journal.binding.operationId = operationId('CREATE', e.journal.binding.attemptId); }],
  ['different request digest', e => { e.journal.binding.requestDigest = hash('other'); }],
  ['different profile', e => { e.journal.binding.profile = 'other'; }],
  ['different client', e => { e.journal.binding.clientId = 'other.apps.googleusercontent.com'; }],
  ['different context', e => { e.journal.binding.context.expectedScriptId = 'other'; }],
  ['different binding digest', e => { e.journal.binding.bindingDigest = hash('other'); e.journal.outcomeRef.bindingDigest = hash('other'); }],
  ['wrong outcome kind', e => { e.journal.outcomeRef.kind = 'CREATE'; }],
  ['wrong outcome Attempt', e => { e.journal.outcomeRef.attemptId = hash('other'); }],
  ['wrong outcome operation', e => { e.journal.outcomeRef.operationId = hash('other'); }],
  ['wrong outcome digest', e => { e.journal.outcomeRef.bindingDigest = hash('other'); }],
  ['missing outcome', e => { e.journal.outcomeRef = null; }],
  ['creation before C', e => { e.journal.createdAtMs--; }],
  ['creation at D', e => { e.journal.createdAtMs = e.journal.binding.attemptExpiresAtMs; }],
  ['reservation before creation', e => { e.journal.reservedAtMs--; }],
  ['reservation at D', e => { e.journal.reservedAtMs = e.journal.binding.attemptExpiresAtMs; }],
  ['missing reservation', e => { e.journal.reservedAtMs = null; }],
  ['invalid original Journal timestamp', e => { e.journal.binding.attemptCreatedAtMs = 0; }],
  ['wrong Journal TTL', e => { e.journal.binding.attemptExpiresAtMs++; }],
];
for (const [name, mutate] of journalCorruptions) test(`Journal corruption denies metadata: ${name}`, async t => {
  const f = fixture(t), v = await verified(f);
  mutate(evidence(f, v), f, v); await rejectEvidence(f, v);
});

for (const shift of [-1, 1]) test(`Journal C/D shifted ${shift}ms passes its TTL validator but fails exact cross-document binding`, async t => {
  const f = fixture(t), v = await verified(f), e = evidence(f, v);
  e.journal.binding.attemptCreatedAtMs += shift; e.journal.binding.attemptExpiresAtMs += shift;
  e.journal.createdAtMs += shift; e.journal.reservedAtMs += shift;
  assert.doesNotThrow(() => validateDispatchJournalRecord(e.journal, configuration(config())));
  await rejectEvidence(f, v);
});

for (const field of ['nonceHash', 'createdAtMs']) test(`coherent substituted ${field} and recomputed cross-document digest still fail genuine D1 binding`, async t => {
  const f = fixture(t), v = await verified(f), e = evidence(f, v), row = e.attempt.attempt;
  if (field === 'nonceHash') row.nonceHash = hash('other');
  else {
    row.createdAtMs--; row.expiresAtMs--;
    e.journal.binding.attemptCreatedAtMs--; e.journal.binding.attemptExpiresAtMs--;
  }
  e.attempt.bindingDigest = bindingDigest(row);
  e.journal.binding.bindingDigest = e.attempt.bindingDigest;
  e.journal.outcomeRef.bindingDigest = e.attempt.bindingDigest;
  assert.doesNotThrow(() => validateAttemptEnvelope(e.attempt, configuration(config()), row.attemptId));
  assert.doesNotThrow(() => validateDispatchJournalRecord(e.journal, configuration(config())));
  await rejectEvidence(f, v);
});

test('substituting both records from another genuine Attempt cannot select a replacement', async t => {
  const f = fixture(t), original = await verified(f), other = await verified(f), otherEvidence = evidence(f, other);
  f.firestore.rows.set(original.attemptPath, otherEvidence.attempt);
  f.firestore.rows.set(original.journalPath, otherEvidence.journal);
  await rejectEvidence(f, original);
  assert.equal((await read(f, other)).attempt.attemptId, other.binding.attempt.attemptId);
});

const schemaTargets = [
  ['Attempt envelope', e => e.attempt], ['Attempt record', e => e.attempt.attempt],
  ['Attempt context', e => e.attempt.attempt.context], ['CLAIM', e => e.attempt.claim],
  ['Journal record', e => e.journal], ['Journal binding', e => e.journal.binding],
  ['Journal context', e => e.journal.binding.context], ['outcome', e => e.journal.outcomeRef],
];
for (const [target, select] of schemaTargets) for (const shape of ['extra', 'missing', 'symbol', 'hidden', 'accessor', 'prototype']) {
  test(`exact schema rejects ${shape} field in ${target}`, async t => {
    const f = fixture(t), v = await verified(f), value = select(evidence(f, v)), key = Object.keys(value)[0];
    let getters = 0;
    if (shape === 'extra') value.extra = 'secret';
    if (shape === 'missing') delete value[key];
    if (shape === 'symbol') value[Symbol('secret')] = true;
    if (shape === 'hidden') Object.defineProperty(value, key, { enumerable: false });
    if (shape === 'accessor') Object.defineProperty(value, key, { enumerable: true, get() { getters++; return 'secret'; } });
    if (shape === 'prototype') Object.setPrototypeOf(value, { inherited: true });
    await rejectEvidence(f, v); assert.equal(getters, 0);
  });
}

const snapshotCorruptions = [
  ['no snapshot', () => undefined],
  ['incomplete snapshot', () => ({ exists: true })],
  ['nonboolean existence', s => ({ ...s, exists: 'true' })],
  ['wrong snapshot ID', s => ({ ...s, id: hash('other') })],
  ['wrong physical document ID', s => ({ ...s, ref: { ...s.ref, id: hash('other'), path: `original_attempts/${hash('other')}` } })],
  ['wrong physical namespace', s => ({ ...s, ref: { ...s.ref, path: `other/${s.id}` } })],
  ['wrong Firestore instance', s => ({ ...s, ref: { ...s.ref, firestore: memoryFirestore() } })],
  ['missing document reference', s => ({ ...s, ref: undefined })],
  ['missing data method', s => ({ ...s, data: undefined })],
  ['data read throws', s => ({ ...s, data() { throw Error('secret diagnostic'); } })],
];
for (const target of ['Attempt', 'Journal']) for (const [name, change] of snapshotCorruptions) {
  test(`${target} physical evidence rejects ${name}`, async t => {
    const f = fixture(t), v = await verified(f), path = target === 'Attempt' ? v.attemptPath : v.journalPath;
    f.firestore.hooks.snapshot = (ref, s) => ref.path === path ? change(s) : s;
    await rejectEvidence(f, v);
  });
}

for (const field of ['firestore', 'id', 'path']) test(`substituted requested document ${field} denies before get()`, async t => {
  const f = fixture(t), v = await verified(f);
  f.firestore.hooks.document = ref => ({ ...ref, [field]: field === 'firestore' ? memoryFirestore() : 'other' });
  await rejectEvidence(f, v);
  assert.deepEqual(f.firestore.reads, []);
});

for (const target of ['Attempt', 'Journal']) test(`${target} read failure is sanitized, burns D1 and cannot be recovered or reconstructed`, async t => {
  const f = fixture(t), v = await verified(f), path = target === 'Attempt' ? v.attemptPath : v.journalPath;
  const restarted = createOriginalAttemptMetadataReader(f.input);
  f.firestore.hooks.beforeRead = ref => { if (ref.path === path) throw Error('secret database diagnostic'); };
  await rejectEvidence(f, v);
  const reads = copy(f.firestore.reads);
  denied(() => restarted.readOriginal(v.capability, v.binding));
  assert.deepEqual(f.firestore.reads, reads);
  delete f.firestore.hooks.beforeRead;
  const recovered = await f.reader.recover(v.outcome.descriptor);
  assert.equal(recovered.status, 'LOOKUP_ONLY');
  assert.equal(recovered.handoff, undefined);
  denied(() => read(f, v));
  denied(() => f.reader.readOriginal(recovered, v.binding));
});

test('shared validators preserve valid nonterminal records while A2 separately requires terminal states', async t => {
  const f = fixture(t), v = await verified(f), e = copy(evidence(f, v)), c = configuration(config());
  e.attempt.attempt.phase = 'NEW'; e.attempt.revision = 0; e.attempt.claim = null;
  e.journal.state = 'INTENT'; e.journal.revision = 0; e.journal.reservedAtMs = null;
  const before = copy(e);
  assert.equal(validateAttemptEnvelope(e.attempt, c, v.binding.attempt.attemptId).attempt.phase, 'NEW');
  assert.equal(validateDispatchJournalRecord(e.journal, c).state, 'INTENT');
  assert.deepEqual(e, before, 'pure validators do not mutate evidence');
});

test('historical metadata preserves original expired D without extending it or granting freshness', async t => {
  const f = fixture(t), v = await verified(f);
  f.advance(120001); f.firestore.onlyReads();
  const result = await read(f, v);
  assert.equal(result.expiresAtMs, EPOCH + 120000);
  assert.ok(result.expiresAtMs < f.input.now());
  assert.equal(f.firestore.rows.size, 2);
});
