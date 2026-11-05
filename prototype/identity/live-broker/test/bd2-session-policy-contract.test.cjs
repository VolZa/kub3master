'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const api = require('../../../../build/permission-node/index.cjs');
const c = require('../bd2-session-policy-contract.cjs');
const users = require('../bd2-user-contract.cjs');
const ctx = { environment: 'TEST', applicationAudience: 'policy-unit', expectedScriptId: 'isolated' };
const actor = { issuer: 'https://accounts.google.com', sub: 'actor' };
const raw = (kind = 'INITIALIZE_SESSION_POLICY', expectedPolicyVersion = null, payload = {}) =>
  ({ commandId: 'a'.repeat(64), actor, kind, expectedPolicyVersion, payload });
const init = () => c.createCommand(ctx, raw());
const update = (idle = 30, version = 1) => c.createCommand(ctx, raw('UPDATE_SESSION_POLICY', version, { idleTimeoutMinutes: idle }));
const policy = () => c.transition(ctx, init(), null, 1000).policy;
const copy = value => structuredClone(value);

test('explicit initial policy, decimal version keys and canonical Users authority', () => {
  const p = policy();
  assert.equal(c.authorityKey(ctx), users.authorityKey(ctx));
  assert.deepEqual(p, { profile: api.BD2_PROFILE, schemaVersion: 1, context: ctx, policyVersion: 1,
    idleTimeoutMinutes: 180, absoluteTimeoutMinutes: 720, appliesTo: 'NEW_SESSIONS_ONLY', updatedAtMs: 1000, updatedBy: actor });
  for (const v of [1, 12, Number.MAX_SAFE_INTEGER]) assert.equal(c.versionKey(v), String(v));
  for (const v of [0, -1, '1', 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => c.versionKey(v));
});
test('idle boundaries and fixed absolute/new-sessions-only structural contract', () => {
  for (const idle of [30, 180, 360]) assert.equal(update(idle).payload.idleTimeoutMinutes, idle);
  for (const idle of [29, 361, 30.5, NaN, '180', Infinity, null]) assert.throws(() => update(idle));
  for (const patch of [{ absoluteTimeoutMinutes: 719 }, { absoluteTimeoutMinutes: 721 },
    { appliesTo: 'ALL_SESSIONS' }, { updatedAtMs: 0 }, { policyVersion: 0 }, { policyVersion: Number.MAX_SAFE_INTEGER + 1 }])
    assert.throws(() => api.validateSessionPolicyConfig({ ...policy(), ...patch }, ctx));
});
test('strict schemas reject missing/extra fields, prototypes, accessors, symbols without executing getters', () => {
  for (const base of [raw(), init(), c.descriptor(ctx, init()), c.createRecord(ctx, policy(), init().operationId),
    c.createHistory(ctx, policy(), init().operationId), c.createReceipt(ctx, init(), null, 1000)]) {
    const validate = value => {
      if ('canonicalCommand' in base) return c.validateReceipt(ctx, value, init().operationId);
      if ('previousPolicyVersion' in base) return c.validateHistory(ctx, value, '1');
      if ('lastOperationId' in base) return c.validateRecord(ctx, value);
      if ('requestDigest' in base) return c.validateDescriptor(ctx, value);
      return 'operationId' in base ? c.validateCommand(ctx, value) : c.createCommand(ctx, value);
    };
    for (const key of Object.keys(base)) {
      const missing = copy(base); delete missing[key]; assert.throws(() => validate(missing));
      const accessor = copy(base); Object.defineProperty(accessor, key, { enumerable: true, get() { assert.fail('getter executed'); } });
      assert.throws(() => validate(accessor), /ACCESS_DENIED/);
    }
    assert.throws(() => validate({ ...base, extra: true }));
    assert.throws(() => validate({ ...base, [Symbol('extra')]: true }));
    assert.throws(() => validate(Object.assign(Object.create({ custom: true }), base)));
    const hidden = copy(base); Object.defineProperty(hidden, 'hidden', { value: true }); assert.throws(() => validate(hidden));
  }
  let getterCalls = 0;
  const input = raw(); input.actor = { ...actor, get extra() { getterCalls++; return 'unexpected'; } };
  assert.throws(() => c.createCommand(ctx, input), /ACCESS_DENIED/);
  assert.equal(getterCalls, 0, 'nested actor getter must never execute');
  assert.throws(() => c.createCommand(ctx, { ...raw(), payload: Object.create({}) }));
});
test('detached command identity binds all request fields, contract header, context and full digest', () => {
  const input = raw('UPDATE_SESSION_POLICY', 1, { idleTimeoutMinutes: 30 }); const cmd = c.createCommand(ctx, input);
  input.actor = { ...actor, sub: 'other' }; input.payload.idleTimeoutMinutes = 360;
  assert.equal(cmd.payload.idleTimeoutMinutes, 30); assert.ok(Object.isFrozen(cmd.actor)); assert.ok(Object.isFrozen(cmd.context));
  const reordered = { payload: { idleTimeoutMinutes: 30 }, expectedPolicyVersion: 1, kind: cmd.kind, actor, commandId: cmd.commandId };
  assert.deepEqual(c.createCommand(ctx, reordered), cmd);
  for (const patch of [{ payload: { idleTimeoutMinutes: 360 } }, { actor: { ...actor, sub: 'other' } },
    { commandId: 'b'.repeat(64) }, { expectedPolicyVersion: 2 }, { profile: 'legacy' }, { schemaVersion: 2 },
    { context: { ...ctx, environment: 'PRODUCTION' } }, { authorityKey: '0'.repeat(64) }, { operationId: '0'.repeat(64) }])
    assert.throws(() => c.validateCommand(ctx, { ...cmd, ...patch }));
  for (const changed of [{ ...ctx, environment: 'PRODUCTION' }, { ...ctx, applicationAudience: 'other' }, { ...ctx, expectedScriptId: 'other' }]) {
    assert.throws(() => c.validateCommand(changed, cmd));
    assert.notEqual(c.createCommand(changed, reordered).operationId, cmd.operationId);
  }
  const changed = c.createCommand(ctx, { ...reordered, payload: { idleTimeoutMinutes: 360 } });
  assert.notEqual(cmd.operationId, changed.operationId, 'documented absence of first-payload registry');
  const d = c.descriptor(ctx, cmd), hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  assert.equal(d.requestDigest, hash(['KUB_BD2_SESSION_POLICY_REQUEST_V1', api.BD2_PROFILE, 1, c.authorityKey(ctx),
    cmd.commandId, [actor.issuer, actor.sub], cmd.kind, 1, [30]]));
  assert.equal(d.operationId, hash(['KUB_BD2_SESSION_POLICY_OPERATION_ID_V1', d.authorityKey, d.requestDigest]));
  assert.notEqual(d.operationId, hash(['KUB_BD2_USER_OPERATION_ID_V1', d.authorityKey, d.requestDigest]));
  for (const patch of [{ operationId: '0'.repeat(64) }, { requestDigest: '0'.repeat(64) }, { authorityKey: '0'.repeat(64) }])
    assert.throws(() => c.validateDescriptor(ctx, { ...d, ...patch }));
});
test('transition versions, stale matching desired value, no-op identity and overflow DENY', () => {
  const p = policy();
  assert.equal(c.transition(ctx, init(), p, 1000).outcome, 'ALREADY_EXISTS');
  assert.equal(c.transition(ctx, update(), null, 1000).outcome, 'NOT_FOUND');
  const changed = c.transition(ctx, update(), p, 1100); assert.equal(changed.outcome, 'UPDATED'); assert.equal(changed.policy.policyVersion, 2);
  const noop = c.transition(ctx, update(180), p, 1100); assert.equal(noop.outcome, 'NOOP'); assert.deepEqual(noop.policy, p);
  assert.equal(c.transition(ctx, update(180, 2), p, 1100).outcome, 'CONFLICT');
  const max = { ...p, policyVersion: Number.MAX_SAFE_INTEGER };
  assert.equal(c.transition(ctx, update(30, max.policyVersion), max, 1100).outcome, 'DENY');
  assert.equal(c.transition(ctx, update(180, max.policyVersion), max, 1100).outcome, 'NOOP');
  assert.throws(() => c.transition(ctx, update(), p, 999));
});
test('storage and receipts enforce legal transitions, path/version/actor/timestamp bindings', () => {
  const command = init(), receipt = c.createReceipt(ctx, command, null, 1000);
  const history = c.createHistory(ctx, receipt.afterPolicy, command.operationId);
  assert.equal(history.previousPolicyVersion, null);
  assert.throws(() => c.validateHistory(ctx, history, '01'));
  assert.throws(() => c.validateHistory(ctx, { ...history, previousPolicyVersion: 0 }, '1'));
  for (const patch of [{ outcome: 'NOOP' }, { historyReference: null }, { beforePolicy: policy() }, { recordedAtMs: 1001 },
    { afterPolicy: { ...policy(), updatedBy: { ...actor, sub: 'other' } } }, { storageProfile: c.RECORD_PROFILE },
    { storageSchemaVersion: 2 }, { authorityKey: '0'.repeat(64) }, { requestDigest: '0'.repeat(64) }])
    assert.throws(() => c.validateReceipt(ctx, { ...receipt, ...patch }, command.operationId));
  const noop = c.createReceipt(ctx, update(180), policy(), 1100);
  assert.equal(noop.historyReference, null); assert.equal(noop.afterPolicy.updatedAtMs, 1000);
  assert.throws(() => c.validateReceipt(ctx, { ...noop, recordedAtMs: 999 }, noop.operationId));
  for (const validate of [() => c.validateRecord({ ...ctx, applicationAudience: 'other' }, c.createRecord(ctx, policy(), command.operationId)),
    () => c.validateHistory(ctx, { ...history, policy: { ...history.policy, idleTimeoutMinutes: 30 } }, '1')]) assert.throws(validate);
});
