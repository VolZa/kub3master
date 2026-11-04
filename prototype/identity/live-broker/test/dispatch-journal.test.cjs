'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hash } = require('../security.cjs');
const { configuration, operationId } = require('../bd2-attempt-contract.cjs');
const { createFirestoreDispatchJournal, DispatchJournalError, intentId, reference, readBinding, readReference } = require('../firestore-dispatch-journal.cjs');
const { createIsolatedJournaledLoginProof, requestDigest } = require('../bd2-dispatch-coordinator.cjs');
const c = configuration({ profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'dispatch.apps.googleusercontent.com',
  context: { environment: 'TEST', applicationAudience: 'local', expectedScriptId: 'no-GAS' }, attemptTtlMs: 120000 });
const attemptId = 'a'.repeat(64);
const binding = () => ({ profile: c.profile, clientId: c.clientId, context: c.context, intentId: intentId(attemptId),
  attemptId, operationId: operationId('CLAIM', attemptId), bindingDigest: 'b'.repeat(64), requestDigest: 'c'.repeat(64),
  attemptCreatedAtMs: 1000, attemptExpiresAtMs: 121000 });

test('dispatch reference is stable per original attempt/claim, independent of substituted request payload', () => {
  const b = binding();
  assert.equal(readReference(reference(b)).intentId, intentId(attemptId));
  assert.notEqual(intentId(attemptId), intentId('d'.repeat(64)));
  assert.throws(() => readReference({ ...reference(b), operationId: operationId('CREATE', attemptId) }), /ACCESS_DENIED/);
  assert.throws(() => readReference({ ...reference(b), intentId: hash('forged') }), /ACCESS_DENIED/);
  for (const patch of [{ clientId: 'other' }, { bindingDigest: null }, { attemptExpiresAtMs: 121001 },
    { context: { ...c.context, applicationAudience: 'other' } }, { idToken: 'secret' }]) {
    assert.throws(() => readBinding({ ...b, ...patch }, c), /ACCESS_DENIED/);
  }
});

test('request digest binds token, nonce, browser proof and context without persisting raw proof', () => {
  const r = { attemptId, nonce: 'b'.repeat(64), browserProof: 'c'.repeat(64), idToken: 'signed-token' };
  const digest = requestDigest(r, c);
  for (const key of ['nonce', 'browserProof', 'idToken']) assert.notEqual(requestDigest({ ...r, [key]: 'other' }, c), digest);
  assert.notEqual(requestDigest(r, { ...c, context: { ...c.context, applicationAudience: 'other' } }), digest);
  assert.match(digest, /^[a-f0-9]{64}$/);
});

test('journal never outer-retries ambiguous SDK errors, including numeric ABORTED', async () => {
  for (const code of [1, 2, 4, 10, 13, 14, undefined]) {
    let calls = 0;
    const firestore = { collection: () => ({ doc: () => ({}) }), async runTransaction(fn, options) {
      calls++; assert.equal(options.maxAttempts, 1); throw Object.assign(Error('RPC ambiguity'), { code });
    } };
    const journal = createFirestoreDispatchJournal({ firestore, configuration: c, now: () => 1000 });
    await assert.rejects(journal.createIntent(binding()), e => e instanceof DispatchJournalError &&
      e.outcome === 'UNKNOWN' && e.descriptor.operationId === operationId('CLAIM', attemptId));
    assert.equal(calls, 1);
  }
});

test('fabricated preparation/permit cannot start a transaction; read-only recovery cannot mint permits', async () => {
  let calls = 0;
  const firestore = { collection: () => ({ doc: () => ({ async get() { return { exists: false }; } }) }),
    async runTransaction() { calls++; throw Error('must not run'); } };
  const journal = createFirestoreDispatchJournal({ firestore, configuration: c, now: () => 1000 });
  assert.equal((await journal.reserve({}, binding())).status, 'LOOKUP_ONLY');
  assert.equal(journal.takeDispatchPermit({}, binding()), false);
  assert.equal((await journal.lookup(reference(binding()))).status, 'UNKNOWN');
  assert.equal(calls, 0);
});

test('isolated composition rejects fixture verifier, key, client or store substitution options', () => {
  for (const key of ['verifier', 'client', 'certs', 'attempts', 'journal', 'fixtureKey']) {
    assert.throws(() => createIsolatedJournaledLoginProof({ firestore: {}, configuration: c, [key]: {} }), /ACCESS_DENIED/);
  }
  assert.throws(() => createIsolatedJournaledLoginProof({ configuration: c }), /ACCESS_DENIED/);
});
