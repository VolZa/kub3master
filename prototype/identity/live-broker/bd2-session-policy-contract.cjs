'use strict';
const { createHash } = require('node:crypto');
const api = require('../../../build/permission-node/index.cjs');
// Reuse Durable Users authority identity, never fork its canonical algorithm.
const { ROOT, authorityKey, data, integer } = require('./bd2-user-contract.cjs');
const RECORD_PROFILE = 'KUB_BD2_SESSION_POLICY_RECORD_V1';
const HISTORY_PROFILE = 'KUB_BD2_SESSION_POLICY_HISTORY_V1';
const OPERATION_PROFILE = 'KUB_BD2_SESSION_POLICY_OPERATION_V1';
const deny = () => { throw Error('ACCESS_DENIED'); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const operationIdFor = (authority, digest) => hash(['KUB_BD2_SESSION_POLICY_OPERATION_ID_V1', authority, digest]);
const versionKey = value => String(integer(value, 1));
const INPUT_KEYS = ['commandId', 'actor', 'kind', 'expectedPolicyVersion', 'payload'];
const HEADER_KEYS = ['profile', 'schemaVersion', 'context', 'authorityKey'];
function header(context, r) {
  const c = api.validateBd2Context(r.context);
  if (r.profile !== api.BD2_PROFILE || r.schemaVersion !== 1 || authorityKey(c) !== authorityKey(context) ||
    r.authorityKey !== authorityKey(context)) deny();
}
function commandData(context, value, sealed) {
  const c = api.validateBd2Context(context);
  const r = data(value, sealed ? [...HEADER_KEYS, ...INPUT_KEYS, 'operationId'] : INPUT_KEYS);
  if (sealed) header(c, r);
  if (!hex(r.commandId)) deny();
  const actor = api.validateCanonicalPrincipal(r.actor);
  let payload;
  if (r.kind === 'INITIALIZE_SESSION_POLICY') {
    data(r.payload, []); if (r.expectedPolicyVersion !== null) deny();
    payload = Object.freeze({});
  } else if (r.kind === 'UPDATE_SESSION_POLICY') {
    integer(r.expectedPolicyVersion, 1);
    const p = data(r.payload, ['idleTimeoutMinutes']);
    integer(p.idleTimeoutMinutes, 30); if (p.idleTimeoutMinutes > 360) deny();
    payload = Object.freeze({ idleTimeoutMinutes: p.idleTimeoutMinutes });
  } else deny();
  const command = { profile: api.BD2_PROFILE, schemaVersion: 1, context: c, authorityKey: authorityKey(c),
    commandId: r.commandId, actor, kind: r.kind, expectedPolicyVersion: r.expectedPolicyVersion, payload };
  const operationId = operationIdFor(command.authorityKey, digestOf(command));
  if (sealed && r.operationId !== operationId) deny();
  return Object.freeze({ ...command, operationId });
}
function digestOf(c) {
  return hash(['KUB_BD2_SESSION_POLICY_REQUEST_V1', c.profile, c.schemaVersion, c.authorityKey,
    c.commandId, [c.actor.issuer, c.actor.sub], c.kind, c.expectedPolicyVersion,
    c.kind === 'UPDATE_SESSION_POLICY' ? [c.payload.idleTimeoutMinutes] : []]);
}
const createCommand = (context, value) => commandData(context, value, false);
const validateCommand = (context, value) => commandData(context, value, true);
function descriptor(context, value) {
  const command = validateCommand(context, value);
  return Object.freeze({ authorityKey: command.authorityKey, operationId: command.operationId,
    requestDigest: digestOf(command) });
}
function validateDescriptor(context, value) {
  const d = data(value, ['authorityKey', 'operationId', 'requestDigest']);
  if (d.authorityKey !== authorityKey(context) || !hex(d.requestDigest) || !hex(d.operationId) ||
    d.operationId !== operationIdFor(d.authorityKey, d.requestDigest)) deny();
  return Object.freeze(d);
}
function storage(context, r, profile) {
  if (r.storageProfile !== profile || r.storageSchemaVersion !== 1 || r.authorityKey !== authorityKey(context)) deny();
}
function validateRecord(context, value) {
  const r = data(value, ['storageProfile', 'storageSchemaVersion', 'authorityKey', 'policy', 'lastOperationId']);
  storage(context, r, RECORD_PROFILE);
  if (!hex(r.lastOperationId)) deny();
  return Object.freeze({ ...r, policy: api.validateSessionPolicyConfig(r.policy, context) });
}
function validateHistory(context, value, expectedVersionKey) {
  const r = data(value, ['storageProfile', 'storageSchemaVersion', 'authorityKey', 'policy', 'previousPolicyVersion', 'operationId']);
  storage(context, r, HISTORY_PROFILE);
  const policy = api.validateSessionPolicyConfig(r.policy, context);
  if (versionKey(policy.policyVersion) !== expectedVersionKey || !hex(r.operationId) ||
    r.previousPolicyVersion !== (policy.policyVersion === 1 ? null : policy.policyVersion - 1) ||
    (policy.policyVersion === 1 && policy.idleTimeoutMinutes !== 180)) deny();
  return Object.freeze({ ...r, policy });
}
function transition(context, value, beforeValue, at) {
  const command = validateCommand(context, value);
  const before = beforeValue === null ? null : api.validateSessionPolicyConfig(beforeValue, context);
  if (command.kind === 'INITIALIZE_SESSION_POLICY' && before !== null) return { outcome: 'ALREADY_EXISTS' };
  if (command.kind === 'UPDATE_SESSION_POLICY') {
    if (before === null) return { outcome: 'NOT_FOUND' };
    if (before.policyVersion !== command.expectedPolicyVersion) return { outcome: 'CONFLICT' };
    if (before.idleTimeoutMinutes === command.payload.idleTimeoutMinutes) return { outcome: 'NOOP', policy: before };
    if (before.policyVersion === Number.MAX_SAFE_INTEGER) return { outcome: 'DENY' };
  }
  integer(at, 1); if (before && at < before.updatedAtMs) deny();
  const policy = api.validateSessionPolicyConfig({ profile: api.BD2_PROFILE, schemaVersion: 1,
    context, policyVersion: before ? before.policyVersion + 1 : 1,
    idleTimeoutMinutes: before ? command.payload.idleTimeoutMinutes : 180,
    absoluteTimeoutMinutes: 720, appliesTo: 'NEW_SESSIONS_ONLY', updatedAtMs: at, updatedBy: command.actor }, context);
  return Object.freeze({ outcome: before ? 'UPDATED' : 'INITIALIZED', policy });
}
function createRecord(context, policy, operationId) {
  return validateRecord(context, { storageProfile: RECORD_PROFILE, storageSchemaVersion: 1,
    authorityKey: authorityKey(context), policy, lastOperationId: operationId });
}
function createHistory(context, policy, operationId) {
  return validateHistory(context, { storageProfile: HISTORY_PROFILE, storageSchemaVersion: 1,
    authorityKey: authorityKey(context), policy,
    previousPolicyVersion: policy.policyVersion === 1 ? null : policy.policyVersion - 1, operationId }, versionKey(policy.policyVersion));
}
function createReceipt(context, command, beforePolicy, at) {
  const plan = transition(context, command, beforePolicy, at);
  if (!['INITIALIZED', 'UPDATED', 'NOOP'].includes(plan.outcome)) deny();
  return validateReceipt(context, { storageProfile: OPERATION_PROFILE, storageSchemaVersion: 1,
    context, canonicalCommand: command, ...descriptor(context, command), outcome: plan.outcome,
    beforePolicy, afterPolicy: plan.policy, historyReference: plan.outcome === 'NOOP' ? null : versionKey(plan.policy.policyVersion),
    recordedAtMs: at }, command.operationId);
}
function validateReceipt(context, value, expectedOperationId) {
  const r = data(value, ['storageProfile', 'storageSchemaVersion', 'context', 'authorityKey', 'canonicalCommand',
    'requestDigest', 'operationId', 'outcome', 'beforePolicy', 'afterPolicy', 'historyReference', 'recordedAtMs']);
  storage(context, r, OPERATION_PROFILE);
  if (authorityKey(r.context) !== authorityKey(context)) deny();
  const command = validateCommand(context, r.canonicalCommand), d = descriptor(context, command);
  if (r.operationId !== expectedOperationId || Object.keys(d).some(k => d[k] !== r[k])) deny();
  const before = r.beforePolicy === null ? null : api.validateSessionPolicyConfig(r.beforePolicy, context);
  const after = api.validateSessionPolicyConfig(r.afterPolicy, context), at = integer(r.recordedAtMs, 1);
  if (before && at < before.updatedAtMs) deny();
  const plan = transition(context, command, before, at);
  if (!['INITIALIZED', 'UPDATED', 'NOOP'].includes(plan.outcome) || r.outcome !== plan.outcome ||
    !same(plan.policy, after) || r.historyReference !== (r.outcome === 'NOOP' ? null : versionKey(after.policyVersion))) deny();
  return Object.freeze({ ...r, context: api.validateBd2Context(context), canonicalCommand: command,
    beforePolicy: before, afterPolicy: after });
}
class SessionPolicyStoreError extends Error {
  constructor(outcome, lookupDescriptor = null) {
    super('ACCESS_DENIED'); this.name = 'SessionPolicyStoreError'; this.outcome = outcome; this.descriptor = lookupDescriptor;
  }
}
module.exports = { ROOT, RECORD_PROFILE, HISTORY_PROFILE, OPERATION_PROFILE, authorityKey, versionKey,
  createCommand, validateCommand, descriptor, validateDescriptor, validateRecord, validateHistory,
  transition, createRecord, createHistory, createReceipt, validateReceipt, SessionPolicyStoreError, same };
