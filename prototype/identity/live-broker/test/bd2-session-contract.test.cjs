'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const api = require('../../../../build/permission-node/index.cjs');
const users = require('../bd2-user-contract.cjs');
const policy = require('../bd2-session-policy-contract.cjs');
const c = require('../bd2-session-contract.cjs');
const ctx = { environment: 'TEST', applicationAudience: 'session-contract-unit', expectedScriptId: 'isolated' };
const principal = { issuer: 'https://accounts.google.com', sub: 'subject' };
const S = 1_800_000_000_000, minute = 60_000;
const hex = digit => digit.repeat(64);
const copy = value => structuredClone(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const raw = () => ({ commandId: hex('a'), kind: 'CREATE_SESSION',
  attempt: { collectionId: 'bd2_login_attempts_v1', clientId: 'unit.apps.googleusercontent.com',
    attemptId: hex('b'), bindingDigest: hex('c') }, principal: copy(principal), createdAtMs: S, sessionDigest: hex('d') });
const command = (patch = {}, context = ctx) => c.createCommand(context, { ...raw(), ...patch });
const session = (cmd, patch = {}) => ({ profile: api.BD2_PROFILE, schemaVersion: 1, context: copy(cmd.context),
  sessionDigest: cmd.sessionDigest, createOperationId: cmd.operationId, principal: copy(cmd.principal),
  createdAtMs: cmd.createdAtMs, lastEligibleActivityAtMs: cmd.createdAtMs,
  policySnapshot: { policyVersion: 3, idleTimeoutMinutes: 180, absoluteTimeoutMinutes: 720 },
  authorizationVersionAtIssue: 7, revision: 0, status: 'ACTIVE', revokedAtMs: null, ...patch });
function fixture(cmd = command()) {
  const initial = session(cmd), d = c.descriptor(cmd.context, cmd), p = c.paths(cmd.context, d);
  const intent = c.createIntent(cmd.context, cmd), binding = c.createBinding(cmd.context, cmd);
  const envelope = c.createEnvelope(cmd.context, cmd, initial), receipt = c.createReceipt(cmd.context, cmd, initial);
  const evidence = Object.fromEntries(Object.entries({ intent, binding, session: envelope, receipt })
    .map(([key, record]) => [key, { path: p[key], record }]));
  return { cmd, initial, d, p, intent, binding, envelope, receipt, evidence };
}
const classify = f => c.classifyCreationEvidence(ctx, f.d, f.evidence);
const denied = fn => assert.throws(fn, /^Error: ACCESS_DENIED$/);
function frozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value)); for (const v of Object.values(value)) frozen(v);
}
// Every object and field in a valid tree, including nested context/principal/policy/command.
function nodes(value, path = []) {
  if (!value || typeof value !== 'object') return [];
  return [[path, value], ...Object.entries(value).flatMap(([k, v]) => nodes(v, [...path, k]))];
}
const at = (value, path) => path.reduce((v, k) => v[k], value);

test('valid canonical command, six contracts, paths and detached immutable projections', () => {
  const f = fixture();
  assert.deepEqual(c.validateCommand(ctx, f.cmd), f.cmd);
  assert.deepEqual(c.validateDescriptor(ctx, f.d), f.d);
  assert.deepEqual(c.validateIntent(ctx, f.intent, f.d.attemptKey), f.intent);
  assert.deepEqual(c.assertIntentMatchesCommand(ctx, f.intent, f.cmd), f.intent);
  assert.deepEqual(c.assertBindingMatchesCommand(ctx, f.binding, f.cmd), f.binding);
  assert.deepEqual(c.validateEnvelope(ctx, f.envelope, f.d.sessionDigest), f.envelope);
  assert.deepEqual(c.validateReceipt(ctx, f.receipt, f.d.operationId), f.receipt);
  assert.equal(classify(f).status, 'CONSISTENT_CREATION_DATA');
  const root = `${users.ROOT}/${users.authorityKey(ctx)}`;
  assert.deepEqual(f.p, { intent: `${root}/session_creation_intents/${f.d.attemptKey}`,
    binding: `${root}/session_creation_bindings/${f.d.attemptKey}`, session: `${root}/sessions/${f.d.sessionDigest}`,
    receipt: `${root}/session_creation_operations/${f.d.operationId}` });
  for (const value of [f.cmd, f.d, f.p, f.intent, f.binding, f.envelope, f.receipt, classify(f)]) frozen(value);
  const input = raw(), cmd = c.createCommand(ctx, input), initial = session(cmd);
  const envelope = c.createEnvelope(ctx, cmd, initial), receipt = c.createReceipt(ctx, cmd, initial);
  input.principal.sub = 'changed'; input.attempt.attemptId = hex('e'); initial.policySnapshot.idleTimeoutMinutes = 30;
  initial.context.applicationAudience = 'other';
  assert.equal(cmd.principal.sub, principal.sub); assert.equal(cmd.attempt.attemptId, hex('b'));
  assert.equal(envelope.session.policySnapshot.idleTimeoutMinutes, 180);
  assert.equal(receipt.initialSession.policySnapshot.idleTimeoutMinutes, 180);
});

test('canonical hashing reuses authority and pins complete domain-separated tuple bindings', () => {
  const cmd = command(), d = c.descriptor(ctx, cmd), a = cmd.attempt;
  assert.equal(c.authorityKey(ctx), users.authorityKey(ctx)); assert.equal(c.authorityKey(ctx), policy.authorityKey(ctx));
  assert.equal(d.attemptKey, hash(['KUB_BD2_SESSION_CREATION_ATTEMPT_V1', d.authorityKey, a.collectionId, a.attemptId]));
  assert.equal(d.requestDigest, hash(['KUB_BD2_SESSION_CREATION_REQUEST_V1', api.BD2_PROFILE, 1, d.authorityKey,
    cmd.commandId, 'CREATE_SESSION', [a.collectionId, a.clientId, a.attemptId, a.bindingDigest],
    [principal.issuer, principal.sub], S, cmd.sessionDigest]));
  assert.equal(d.operationId, hash(['KUB_BD2_SESSION_CREATION_OPERATION_ID_V1', d.authorityKey, d.requestDigest]));
  for (const domain of ['KUB_BD2_USER_OPERATION_ID_V1', 'KUB_BD2_SESSION_POLICY_OPERATION_ID_V1',
    'KUB_BD2_SESSION_CREATION_REQUEST_V1', 'KUB_BD2_DISPATCH_REQUEST_V1'])
    assert.notEqual(d.operationId, hash([domain, d.authorityKey, d.requestDigest]));
  const input = raw();
  assert.deepEqual(c.createCommand(ctx, { sessionDigest: input.sessionDigest, createdAtMs: input.createdAtMs,
    principal: { sub: principal.sub, issuer: principal.issuer }, attempt: Object.fromEntries(Object.entries(input.attempt).reverse()),
    kind: input.kind, commandId: input.commandId }), cmd);
  assert.deepEqual(c.createCommand(ctx, copy(input)), cmd, 'identity does not depend on any first-payload registry');
});

test('every payload field changes identity; stale request digest or operation identity rejects', () => {
  const original = command();
  const variations = [{ commandId: hex('e') }, { principal: { ...principal, sub: 'other' } },
    { createdAtMs: S + 1 }, { sessionDigest: hex('e') }, ...Object.keys(raw().attempt).map(k => ({ attempt: {
      ...raw().attempt, [k]: k === 'collectionId' ? 'other_attempts' : k === 'clientId' ? 'other.apps.googleusercontent.com' : hex('e') } }))];
  for (const patch of variations) {
    const changed = command(patch);
    assert.notEqual(changed.requestDigest, original.requestDigest); assert.notEqual(changed.operationId, original.operationId);
    denied(() => c.validateCommand(ctx, { ...original, ...patch }));
    denied(() => c.validateCommand(ctx, { ...changed, operationId: original.operationId }));
    denied(() => c.validateCommand(ctx, { ...changed, requestDigest: original.requestDigest }));
  }
  denied(() => command({ kind: 'ISSUE_SESSION' }));
});

test('invalid profiles, schemas, context, authority and canonical principal reject', () => {
  const f = fixture();
  for (const patch of [{ profile: 'LEGACY' }, { schemaVersion: 2 }, { schemaVersion: '1' },
    { authorityKey: hex('0') }, { context: { ...ctx, extra: true } },
    ...Object.keys(ctx).map(k => ({ context: { ...ctx, [k]: k === 'environment' ? 'PRODUCTION' : 'other' } }))])
    denied(() => c.validateCommand(ctx, { ...f.cmd, ...patch }));
  for (const changed of [{ ...ctx, environment: 'PRODUCTION' }, { ...ctx, applicationAudience: 'other' }, { ...ctx, expectedScriptId: 'other' }]) {
    const other = command({}, changed);
    assert.notEqual(other.operationId, f.cmd.operationId); assert.notEqual(c.descriptor(changed, other).attemptKey, f.d.attemptKey);
    denied(() => c.validateCommand(changed, f.cmd)); denied(() => c.validateDescriptor(changed, f.d));
  }
  for (const bad of [{ issuer: 'accounts.google.com', sub: 'subject' }, { ...principal, sub: '' },
    { ...principal, sub: 'x'.repeat(256) }, { ...principal, email: 'unknown@example.invalid' }, null])
    denied(() => command({ principal: bad }));
  for (const patch of [{ collectionId: '../attempts' }, { collectionId: '' }, { collectionId: 'a'.repeat(101) },
    { clientId: 'wrong' }, { clientId: 'a'.repeat(201) + '.apps.googleusercontent.com' }, { attemptId: 'raw' }, { bindingDigest: null }])
    denied(() => command({ attempt: { ...raw().attempt, ...patch } }));
});

test('missing, extra, malformed, hidden, symbol and prototype fields reject at every depth without getters', () => {
  const f = fixture();
  const cases = [[raw(), value => c.createCommand(ctx, value)], [f.cmd, value => c.validateCommand(ctx, value)],
    [f.d, value => c.validateDescriptor(ctx, value)], [f.intent, value => c.validateIntent(ctx, value, f.d.attemptKey)],
    [f.binding, value => c.validateBinding(ctx, value, f.d.attemptKey)],
    [f.envelope, value => c.validateEnvelope(ctx, value, f.d.sessionDigest)],
    [f.receipt, value => c.validateReceipt(ctx, value, f.d.operationId)]];
  let calls = 0;
  for (const [base, validate] of cases) {
    for (const malformed of [null, undefined, [], 'data', 1, new Date()]) denied(() => validate(malformed));
    for (const [path, node] of nodes(base)) {
      for (const key of Object.keys(node)) {
        const missing = copy(base); delete at(missing, path)[key]; denied(() => validate(missing));
        const accessor = copy(base);
        Object.defineProperty(at(accessor, path), key, { enumerable: true, get() { calls++; return node[key]; } });
        denied(() => validate(accessor));
        const hidden = copy(base); Object.defineProperty(at(hidden, path), key, { enumerable: false }); denied(() => validate(hidden));
      }
      for (const key of ['extra', '__proto__', 'constructor', Symbol('extra')]) {
        const bad = copy(base); Object.defineProperty(at(bad, path), key, { enumerable: true, value: 'untrusted' });
        denied(() => validate(bad));
      }
      const bad = copy(base); Object.setPrototypeOf(at(bad, path), { polluted: true }); denied(() => validate(bad));
    }
    const nullProto = copy(base); for (const [path] of nodes(nullProto)) Object.setPrototypeOf(at(nullProto, path), null);
    assert.deepEqual(validate(nullProto), validate(base));
  }
  const context = { ...ctx }; Object.defineProperty(context, 'environment', { enumerable: true, get() { calls++; return 'TEST'; } });
  denied(() => c.createCommand(context, raw()));
  assert.equal(calls, 0); assert.equal({}.polluted, undefined);
});

test('same original attempt retains binding and intent slots despite new commandId, principal, S, digest, clientId or bindingDigest', () => {
  const f = fixture();
  for (const patch of [{ commandId: hex('e') }, { principal: { ...principal, sub: 'other' } },
    { createdAtMs: S + 1 }, { sessionDigest: hex('e') }, { attempt: { ...raw().attempt, bindingDigest: hex('e') } },
    { attempt: { ...raw().attempt, clientId: 'other.apps.googleusercontent.com' } }]) {
    const other = command(patch), d = c.descriptor(ctx, other), p = c.paths(ctx, d);
    assert.equal(d.attemptKey, f.d.attemptKey); assert.equal(p.binding, f.p.binding); assert.equal(p.intent, f.p.intent);
    assert.notEqual(d.operationId, f.d.operationId);
    denied(() => c.assertIntentMatchesCommand(ctx, f.intent, other));
    denied(() => c.assertBindingMatchesCommand(ctx, f.binding, other));
    assert.equal(c.classifyCreationEvidence(ctx, d, f.evidence).status, 'INVALID');
  }
  for (const key of ['collectionId', 'attemptId']) {
    const other = { ...raw().attempt, [key]: key === 'collectionId' ? 'independent' : hex('e') };
    assert.notEqual(c.attemptKey(ctx, other), f.d.attemptKey);
  }
});

test('binding and intent reject conflicting targets, paths, digests and operations without rebinding', () => {
  const f = fixture();
  for (const [base, validate] of [[f.intent, v => c.validateIntent(ctx, v, f.d.attemptKey)],
    [f.binding, v => c.validateBinding(ctx, v, f.d.attemptKey)]]) {
    for (const patch of [{ storageProfile: 'LEGACY' }, { storageSchemaVersion: 2 }, { authorityKey: hex('0') },
      { attemptKey: hex('0') }, { operationId: hex('0') }, { requestDigest: hex('0') }, { sessionDigest: 'raw SID' }])
      denied(() => validate({ ...base, ...patch }));
  }
  denied(() => c.validateBinding(ctx, f.binding, hex('0'))); denied(() => c.validateIntent(ctx, f.intent, hex('0')));
  const changed = copy(f.evidence); changed.binding.record.sessionDigest = hex('e');
  assert.equal(c.classifyCreationEvidence(ctx, f.d, changed).status, 'INVALID');
});

test('receipt contains exact original command and initial Session; inconsistent creation fields reject', () => {
  const f = fixture();
  for (const patch of [{ storageProfile: c.RECORD_PROFILE }, { storageSchemaVersion: 2 }, { outcome: 'UNKNOWN' },
    { attemptKey: hex('0') }, { sessionDigest: hex('0') }, { requestDigest: hex('0') }, { operationId: hex('0') },
    { canonicalCommand: { ...f.cmd, principal: { ...principal, sub: 'other' } } }])
    denied(() => c.validateReceipt(ctx, { ...f.receipt, ...patch }, f.d.operationId));
  for (const patch of [{ createdAtMs: S - 1 }, { lastEligibleActivityAtMs: S + 1 }, { revision: 1 },
    { status: 'EXPIRED' }, { status: 'REVOKED', revokedAtMs: S }, { sessionDigest: hex('e') },
    { createOperationId: hex('e') }, { principal: { ...principal, sub: 'other' } },
    { policySnapshot: { ...f.initial.policySnapshot, absoluteTimeoutMinutes: 719 } }])
    denied(() => c.createReceipt(ctx, f.cmd, { ...f.initial, ...patch }));
  denied(() => c.validateReceipt(ctx, f.receipt, hex('0')));
});

test('Session envelope enforces unchanged facade, creation reference and digest path binding', () => {
  const f = fixture();
  for (const patch of [{ storageProfile: 'LEGACY' }, { storageSchemaVersion: 2 }, { authorityKey: hex('0') },
    { session: { ...f.initial, profile: 'LEGACY' } }, { session: { ...f.initial, schemaVersion: 2 } },
    { session: { ...f.initial, context: { ...ctx, applicationAudience: 'other' } } },
    { session: { ...f.initial, sessionDigest: hex('e') } }, { session: { ...f.initial, createOperationId: hex('e') } },
    { creation: { ...f.d, operationId: hex('e') } }])
    denied(() => c.validateEnvelope(ctx, { ...f.envelope, ...patch }, f.d.sessionDigest));
  denied(() => c.validateEnvelope(ctx, f.envelope, hex('0')));
  for (const patch of [{ principal: { ...principal, sub: 'other' } }, { createdAtMs: S - 1 }])
    denied(() => c.createEnvelope(ctx, f.cmd, { ...f.initial, ...patch }));
});

test('immutable Session fields match receipt while valid lifecycle data remains inspectable without authorization', () => {
  const f = fixture();
  for (const patch of [{ createdAtMs: S - 1 }, { principal: { ...principal, sub: 'other' } },
    { authorizationVersionAtIssue: 8 }, { policySnapshot: { ...f.initial.policySnapshot, policyVersion: 4 } },
    { policySnapshot: { ...f.initial.policySnapshot, idleTimeoutMinutes: 30 } }]) {
    const e = copy(f.evidence); Object.assign(e.session.record.session, patch);
    assert.equal(c.classifyCreationEvidence(ctx, f.d, e).status, 'INVALID');
  }
  for (const patch of [{ lastEligibleActivityAtMs: S + minute, revision: 1 },
    { status: 'EXPIRED', revision: 1 }, { status: 'REVOKED', revokedAtMs: S + minute, revision: 1 }]) {
    const e = copy(f.evidence); Object.assign(e.session.record.session, patch);
    assert.equal(c.classifyCreationEvidence(ctx, f.d, e).status, 'CONSISTENT_CREATION_DATA');
  }
  for (const patch of [{ lastEligibleActivityAtMs: S + 1 }, { status: 'EXPIRED' }]) {
    const e = copy(f.evidence); Object.assign(e.session.record.session, patch);
    assert.equal(c.classifyCreationEvidence(ctx, f.d, e).status, 'INVALID', 'revision zero still denotes initial snapshot');
  }
});

test('UNKNOWN versus INVALID: all sixteen evidence-presence combinations, no rollback inference', () => {
  const f = fixture(), keys = ['intent', 'binding', 'session', 'receipt'];
  for (let mask = 0; mask < 16; mask++) {
    const e = Object.fromEntries(keys.map((k, bit) => [k, mask & (1 << bit) ? copy(f.evidence[k]) : null]));
    const before = copy(e), result = c.classifyCreationEvidence(ctx, f.d, e);
    assert.equal(result.status, mask === 15 ? 'CONSISTENT_CREATION_DATA' : mask <= 1 ? 'UNKNOWN' : 'INVALID', `mask ${mask}`);
    assert.deepEqual(e, before, 'classification never repairs, retries or changes evidence'); frozen(result);
  }
});

test('corrupt path/profile/schema/digest bindings and malformed evidence are INVALID; caller locator rejects', () => {
  const f = fixture();
  for (const key of Object.keys(f.evidence)) {
    for (const mutate of [item => { item.path += '/extra'; }, item => { item.path = f.p[key].replace(f.d.authorityKey, hex('0')); },
      item => { item.record.storageProfile = 'LEGACY'; }, item => { item.record.storageSchemaVersion = 2; },
      item => { item.record.authorityKey = hex('0'); }, item => { item.extra = true; }]) {
      const e = copy(f.evidence); mutate(e[key]); assert.equal(c.classifyCreationEvidence(ctx, f.d, e).status, 'INVALID');
    }
  }
  for (const e of [{}, null, { ...f.evidence, extra: true }, { ...f.evidence, receipt: undefined },
    { ...f.evidence, binding: { path: f.p.binding, record: {} } }])
    assert.equal(c.classifyCreationEvidence(ctx, f.d, e).status, 'INVALID');
  denied(() => c.classifyCreationEvidence(ctx, { ...f.d, operationId: hex('0') }, f.evidence));
});

test('evidence accessors never execute, including UNKNOWN intent-only and nested snapshots', () => {
  const f = fixture(); let calls = 0;
  for (const [path, node] of nodes(f.evidence)) for (const key of Object.keys(node)) {
    const e = copy(f.evidence);
    Object.defineProperty(at(e, path), key, { enumerable: true, get() { calls++; return node[key]; } });
    assert.equal(c.classifyCreationEvidence(ctx, f.d, e).status, 'INVALID');
  }
  const onlyIntent = { intent: copy(f.evidence.intent), binding: null, session: null, receipt: null };
  Object.defineProperty(onlyIntent.intent.record.canonicalCommand, 'createdAtMs', { enumerable: true, get() { calls++; return S; } });
  assert.equal(c.classifyCreationEvidence(ctx, f.d, onlyIntent).status, 'INVALID'); assert.equal(calls, 0);
});

test('secrets and claimed verification fields are excluded throughout persisted contracts and locators', () => {
  const f = fixture();
  const forbidden = ['sid', 'rawSid', 'idToken', 'googleIdToken', 'nonce', 'browserProof', 'credential', 'verified', 'isAdmin'];
  for (const secret of forbidden) {
    denied(() => command({ [secret]: 'bearer-secret' }));
    for (const [base, validate] of [[f.cmd, v => c.validateCommand(ctx, v)], [f.d, v => c.validateDescriptor(ctx, v)],
      [f.intent, v => c.validateIntent(ctx, v, f.d.attemptKey)], [f.binding, v => c.validateBinding(ctx, v, f.d.attemptKey)],
      [f.envelope, v => c.validateEnvelope(ctx, v, f.d.sessionDigest)], [f.receipt, v => c.validateReceipt(ctx, v, f.d.operationId)]]) {
      for (const [path] of nodes(base)) {
        const bad = copy(base); at(bad, path)[secret] = 'bearer-secret'; denied(() => validate(bad));
      }
    }
  }
  denied(() => command({ sessionDigest: 'bearer-secret' }));
  assert.equal(JSON.stringify(f).includes('bearer-secret'), false);
});

test('recovery descriptor is detached, immutable and only a locator; no mutator or credential output', () => {
  const f = fixture(), original = copy(f.d), d = c.validateDescriptor(ctx, original);
  original.sessionDigest = hex('e'); assert.equal(d.sessionDigest, f.d.sessionDigest); frozen(d);
  assert.deepEqual(Object.keys(d), ['authorityKey', 'attemptKey', 'sessionDigest', 'operationId', 'requestDigest']);
  assert.throws(() => { d.operationId = hex('e'); }, TypeError);
  for (const name of ['issue', 'createSession', 'lookup', 'recover', 'touch', 'revoke', 'authorize', 'checkSession']) assert.equal(c[name], undefined);
  for (const patch of [{ attemptKey: 'invalid' }, { sessionDigest: 'invalid' }, { requestDigest: hex('0') }, { authorityKey: hex('0') }])
    denied(() => c.validateDescriptor(ctx, { ...f.d, ...patch }));
  // A syntactically valid substituted locator is not authority: full evidence must agree.
  const substituted = c.validateDescriptor(ctx, { ...f.d, attemptKey: hex('e') });
  assert.equal(c.classifyCreationEvidence(ctx, substituted, f.evidence).status, 'INVALID');
});

test('safe-integer and timestamp limits preserve the existing Bd2Session arithmetic and policy constraints', () => {
  for (const n of [0, -1, 1.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER - 1])
    denied(() => command({ createdAtMs: n }));
  for (const s of [1, S, Number.MAX_SAFE_INTEGER - 720 * minute]) {
    const cmd = command({ createdAtMs: s }), initial = session(cmd);
    assert.equal(c.createReceipt(ctx, cmd, initial).initialSession.createdAtMs, s);
  }
  const f = fixture();
  for (const field of ['authorizationVersionAtIssue', 'revision']) {
    for (const n of [-1, 1.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1])
      denied(() => c.createEnvelope(ctx, f.cmd, { ...f.initial, [field]: n }));
    assert.equal(c.createEnvelope(ctx, f.cmd, { ...f.initial, [field]: Number.MAX_SAFE_INTEGER }).session[field], Number.MAX_SAFE_INTEGER);
  }
  for (const idle of [30, 360]) assert.equal(c.createReceipt(ctx, f.cmd,
    { ...f.initial, policySnapshot: { ...f.initial.policySnapshot, idleTimeoutMinutes: idle } }).initialSession.policySnapshot.idleTimeoutMinutes, idle);
  for (const n of [29, 361, 30.5, NaN, Infinity, '180']) denied(() => c.createReceipt(ctx, f.cmd,
    { ...f.initial, policySnapshot: { ...f.initial.policySnapshot, idleTimeoutMinutes: n } }));
  for (const patch of [{ lastEligibleActivityAtMs: S - 1 }, { lastEligibleActivityAtMs: S + 720 * minute },
    { status: 'REVOKED', revokedAtMs: S - 1 }, { status: 'REVOKED', revokedAtMs: null }, { revokedAtMs: S }])
    denied(() => c.createEnvelope(ctx, f.cmd, { ...f.initial, ...patch }));
  denied(() => command({ createdAtMs: Number.MAX_SAFE_INTEGER - 720 * minute + 1 }));
  const cmd = command({ createdAtMs: Number.MAX_SAFE_INTEGER - 720 * minute });
  denied(() => c.createEnvelope(ctx, cmd, session(cmd, { lastEligibleActivityAtMs: Number.MAX_SAFE_INTEGER - 1 })));
});
