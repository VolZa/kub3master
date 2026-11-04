'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLocalFirestoreClient, createFirestoreAttemptStore } = require('../firestore-attempt-store.cjs');
const { configuration, record, operationId, AttemptStoreError } = require('../bd2-attempt-contract.cjs');
const c = () => ({ profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'local.apps.googleusercontent.com',
  context: { environment: 'TEST', applicationAudience: 'bd2-local', expectedScriptId: 'no-GAS' }, attemptTtlMs: 120000 });
const row = () => ({ ...c(), context: c().context, attemptId: 'a'.repeat(64), nonceHash: 'b'.repeat(64),
  proofHash: 'c'.repeat(64), createdAtMs: 1000, expiresAtMs: 121000, phase: 'NEW' });
function attempt() { const { attemptTtlMs: _, ...r } = row(); return r; }

test('local client factory rejects remote hosts, real projects, credentials and ambient endpoint substitution', () => {
  for (const host of ['firestore.googleapis.com:443', '0.0.0.0:8080', 'localhost:8080', '127.0.0.1:65536']) {
    assert.throws(() => createLocalFirestoreClient({ host, projectId: 'demo-kub-local' }), /ACCESS_DENIED/);
  }
  assert.throws(() => createLocalFirestoreClient({ host: '127.0.0.1:8685', projectId: 'real-project' }), /ACCESS_DENIED/);
  assert.throws(() => createLocalFirestoreClient({ host: '127.0.0.1:8685', projectId: 'demo-kub-local', credentials: {} }), /ACCESS_DENIED/);
  const previous = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    process.env.FIRESTORE_EMULATOR_HOST = 'remote.invalid:443';
    assert.throws(() => createLocalFirestoreClient({ host: '127.0.0.1:8685', projectId: 'demo-kub-local' }), /ACCESS_DENIED/);
  } finally {
    if (previous === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = previous;
  }
});
test('shared record contract accepts digests only and rejects old raw nonce or credential fields', () => {
  const config = configuration(c());
  assert.equal(record(attempt(), config, 'a'.repeat(64)).nonceHash, 'b'.repeat(64));
  for (const extra of [{ nonce: 'raw' }, { idToken: 'raw' }, { browserProof: 'raw' }, { secret: 'raw' }]) {
    assert.throws(() => record({ ...attempt(), ...extra }, config, 'a'.repeat(64)), /ACCESS_DENIED/);
  }
});
test('one outer attempt: SDK errors including ABORTED stay UNKNOWN without automatic retry', async () => {
  for (const code of [1, 2, 4, 10, 13, 14, 16, 8, undefined]) {
    let calls = 0;
    const firestore = { collection: () => ({ doc: () => ({}) }), async runTransaction(fn, options) {
      calls++; assert.equal(options.maxAttempts, 1); throw Object.assign(Error(), { code });
    } };
    const store = createFirestoreAttemptStore({ firestore, configuration: c(), now: () => 1000 });
    await assert.rejects(store.createOnce('a'.repeat(64), attempt()), error =>
      error instanceof AttemptStoreError && error.outcome === 'UNKNOWN' && error.descriptor.kind === 'CREATE');
    assert.equal(calls, 1);
  }
});
test('known local validation rejection preserves its outcome and descriptor without retry', async () => {
  let calls = 0;
  const descriptor = { kind: 'CREATE', attemptId: 'a'.repeat(64), operationId: operationId('CREATE', 'a'.repeat(64)),
    bindingDigest: 'd'.repeat(64) };
  const firestore = { collection: () => ({ doc: () => ({}) }), async runTransaction() {
    calls++; throw new AttemptStoreError('REJECTED', descriptor);
  } };
  const store = createFirestoreAttemptStore({ firestore, configuration: c(), now: () => 1000 });
  await assert.rejects(store.createOnce('a'.repeat(64), attempt()), error => {
    assert.deepEqual(error.descriptor, descriptor); return error.outcome === 'REJECTED';
  });
  assert.equal(calls, 1);
});
test('operation IDs are stable, separated by kind and never raw browser proof', () => {
  assert.equal(operationId('CLAIM', 'a'.repeat(64)), operationId('CLAIM', 'a'.repeat(64)));
  assert.notEqual(operationId('CREATE', 'a'.repeat(64)), operationId('CLAIM', 'a'.repeat(64)));
});
