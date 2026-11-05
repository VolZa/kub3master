'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const c = require('../bd2-user-contract.cjs');
const api = require('../../../../build/permission-node/index.cjs');
const context = () => ({ environment: 'TEST', applicationAudience: 'users-unit', expectedScriptId: 'isolated' });
const principal = (sub = 'target') => ({ issuer: 'https://accounts.google.com', sub });
const input = (patch = {}) => ({ commandId: 'a'.repeat(64), actor: principal('actor'), target: principal(),
  kind: 'ENROLL_USER', expectedRevision: null, payload: {}, ...patch });
const user = (patch = {}) => ({ profile: api.BD2_PROFILE, schemaVersion: 1, context: context(), principal: principal(),
  active: false, roles: [], authorizationVersion: 0, revision: 0, ...patch });
function envelope(patch = {}) {
  return { storageProfile: c.USER_PROFILE, storageSchemaVersion: 1, user: user(), createdAtMs: 1000,
    createdBy: principal('actor'), updatedAtMs: 1000, updatedBy: principal('actor'), lastOperationId: 'b'.repeat(64), ...patch };
}
const parse = value => c.validateEnvelope(context(), value, c.userKey(principal()));

test('canonical keys use versioned domain-separated JSON tuples and all context fields', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(c.ROOT, 'bd2_user_authorities_v1');
  assert.equal(c.userKey(principal()), hash(['KUB_BD2_USER_KEY_V1', principal().issuer, 'target']));
  assert.equal(c.authorityKey(context()), hash(['KUB_BD2_USER_AUTHORITY_V1', 'TEST', 'users-unit', 'isolated']));
  for (const field of ['environment', 'applicationAudience', 'expectedScriptId'])
    assert.notEqual(c.authorityKey(context()), c.authorityKey({ ...context(), [field]: field === 'environment' ? 'PRODUCTION' : 'other' }));
  assert.notEqual(c.userKey(principal()), c.userKey(principal('other')));
  assert.notEqual(c.userKey(principal()), c.authorityKey(context()));
});
test('valid envelope is detached and deeply immutable through the unchanged User facade', () => {
  const raw = envelope(), result = parse(raw); raw.user.principal.sub = 'changed'; raw.createdBy.sub = 'changed';
  assert.equal(result.user.principal.sub, 'target'); assert.equal(result.createdBy.sub, 'actor');
  for (const value of [result, result.user, result.user.roles, result.user.context, result.user.principal, result.createdBy, result.updatedBy])
    assert.ok(Object.isFrozen(value));
});
for (const bad of [null, {}, { issuer: 'accounts.google.com', sub: 'x' }, { ...principal(), sub: '' },
  { ...principal(), email: 'info@example.invalid' }, { ...principal(), sub: 1 }]) {
  test(`canonical principal rejects ${JSON.stringify(bad)}`, () => assert.throws(() => c.userKey(bad), /ACCESS_DENIED/));
}
for (const roles of [null, 'ADMIN', ['OWNER'], ['ADMIN', 'ADMIN'], ['ADMIN', 'unknown'], new Array(1)]) {
  test(`existing facade rejects malformed roles ${JSON.stringify(roles)}`, () => {
    assert.throws(() => parse(envelope({ user: user({ roles }) })), /ACCESS_DENIED/);
    assert.throws(() => c.createCommand(context(), input({ kind: 'REPLACE_USER_ROLES', expectedRevision: 0, payload: { roles } })), /ACCESS_DENIED/);
  });
}
for (const number of [-1, NaN, Infinity, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid versions rejected: ${String(number)}`, () => {
    for (const field of ['revision', 'authorizationVersion']) assert.throws(() => parse(envelope({ user: user({ [field]: number }) })), /ACCESS_DENIED/);
    assert.throws(() => c.createCommand(context(), input({ kind: 'SET_USER_ACTIVE', expectedRevision: number, payload: { active: true } })), /ACCESS_DENIED/);
  });
}
test('unknown/mixed storage and User records, wrong paths, contexts and audit metadata reject', () => {
  for (const patch of [{ storageProfile: 'LEGACY' }, { storageSchemaVersion: 2 }, { email: 'extra' },
    { createdAtMs: 0 }, { updatedAtMs: 999 }, { updatedBy: {} }, { lastOperationId: 'raw' },
    { user: user({ profile: 'LEGACY' }) }, { user: user({ schemaVersion: 2 }) }, { user: user({ active: 1 }) },
    { user: user({ email: 'extra' }) }, { user: user({ context: { ...context(), environment: 'PRODUCTION' } }) },
    { user: user({ principal: principal('other') }) }]) assert.throws(() => parse(envelope(patch)), /ACCESS_DENIED/);
  assert.throws(() => c.validateEnvelope(context(), envelope(), '0'.repeat(64)), /ACCESS_DENIED/);
});
test('data and nested User/role accessors never execute; symbols and prototypes reject', () => {
  let calls = 0;
  const accessor = envelope(); Object.defineProperty(accessor, 'updatedAtMs', { enumerable: true, get() { calls++; return 1000; } });
  const roles = ['ADMIN']; Object.defineProperty(roles, '0', { enumerable: true, get() { calls++; return 'ADMIN'; } });
  for (const bad of [accessor, { ...envelope(), [Symbol('extra')]: true }, Object.assign(Object.create({}), envelope()),
    envelope({ user: user({ roles }) })]) assert.throws(() => parse(bad), /ACCESS_DENIED/);
  assert.equal(calls, 0);
});
test('command binding is stable, detached, order independent and covers kind/actor/target/payload/revision/context', () => {
  const raw = input({ kind: 'REPLACE_USER_ROLES', expectedRevision: 0, payload: { roles: ['MANAGER', 'ADMIN'] } });
  const first = c.createCommand(context(), raw);
  assert.deepEqual(first, c.createCommand(context(), { ...raw, payload: { roles: ['ADMIN', 'MANAGER'] } }));
  raw.actor.sub = 'changed'; raw.payload.roles.length = 0;
  assert.equal(first.actor.sub, 'actor'); assert.deepEqual(first.payload.roles, ['ADMIN', 'MANAGER']);
  const variations = [{ actor: principal('other') }, { target: principal('other') }, { commandId: 'b'.repeat(64) },
    { expectedRevision: 1 }, { payload: { roles: ['ADMIN'] } },
    { kind: 'SET_USER_ACTIVE', payload: { active: true } }];
  for (const patch of variations) {
    const changed = { ...first, ...patch };
    assert.throws(() => c.validateCommand(context(), changed), /ACCESS_DENIED/);
    const { operationId: _, ...unsealed } = changed;
    assert.notEqual(c.createCommand(context(), unsealed).operationId, first.operationId);
  }
  assert.throws(() => c.validateCommand({ ...context(), environment: 'PRODUCTION' }, first), /ACCESS_DENIED/);
  assert.throws(() => c.validateCommand(context(), { ...first, isAdmin: true }), /ACCESS_DENIED/);
});
test('recovery descriptor binds operation ID to authority and request digest', () => {
  const cmd = c.createCommand(context(), input()), d = c.descriptor(context(), cmd);
  assert.deepEqual(c.validateDescriptor(context(), d), d);
  for (const patch of [{ operationId: '0'.repeat(64) }, { requestDigest: '0'.repeat(64) },
    { authorityKey: '0'.repeat(64) }, { operationId: 'invalid' }])
    assert.throws(() => c.validateDescriptor(context(), { ...d, ...patch }), /ACCESS_DENIED/);
});
test('initial state, revisions, no-op, role ordering and overflow have exact semantics', () => {
  const enroll = c.createCommand(context(), input()), initial = c.transition(context(), enroll, null);
  assert.equal(initial.outcome, 'CREATED'); assert.deepEqual(initial.user, user());
  assert.equal(c.transition(context(), enroll, initial.user).outcome, 'ALREADY_EXISTS');
  const update = c.createCommand(context(), input({ kind: 'SET_USER_ACTIVE', expectedRevision: 0, payload: { active: true } }));
  assert.equal(c.transition(context(), update, null).outcome, 'NOT_FOUND');
  const changed = c.transition(context(), update, initial.user);
  assert.equal(changed.user.active, true); assert.equal(changed.user.revision, 1); assert.equal(changed.user.authorizationVersion, 1);
  assert.equal(c.transition(context(), update, changed.user).outcome, 'CONFLICT');
  const noop = c.createCommand(context(), input({ kind: 'SET_USER_ACTIVE', expectedRevision: 1, payload: { active: true } }));
  assert.equal(c.transition(context(), noop, changed.user).outcome, 'NOOP');
  for (const field of ['revision', 'authorizationVersion']) {
    const before = user({ [field]: Number.MAX_SAFE_INTEGER });
    const cmd = c.createCommand(context(), input({ kind: 'SET_USER_ACTIVE', expectedRevision: before.revision, payload: { active: true } }));
    assert.equal(c.transition(context(), cmd, before).outcome, 'OVERFLOW');
  }
});
test('receipt validates complete transition, command identity, namespace and all snapshots', () => {
  const cmd = c.createCommand(context(), input()), next = c.transition(context(), cmd, null).user;
  const saved = c.createReceipt(context(), cmd, null, next, 'CREATED', 1000);
  assert.deepEqual(c.validateReceipt(context(), saved, cmd.operationId), saved);
  for (const patch of [{ outcome: 'UPDATED' }, { before: next }, { after: user({ active: true }) },
    { recordedAtMs: 0 }, { userKey: '0'.repeat(64) }, { authorityKey: '0'.repeat(64) },
    { requestDigest: '0'.repeat(64) }, { storageProfile: 'LEGACY' }, { storageSchemaVersion: 0 },
    { context: { ...context(), expectedScriptId: 'other' } }, { extra: true },
    { command: { ...cmd, target: principal('other') } }])
    assert.throws(() => c.validateReceipt(context(), { ...saved, ...patch }, cmd.operationId), /ACCESS_DENIED/);
  assert.throws(() => c.validateReceipt(context(), saved, '0'.repeat(64)), /ACCESS_DENIED/);
  assert.throws(() => c.validateDescriptor(context(), { ...c.descriptor(context(), cmd), authorityKey: '0'.repeat(64) }), /ACCESS_DENIED/);
});
