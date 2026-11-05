'use strict';
const { createHash } = require('node:crypto');
// One curated module instance; missing build is an error, never a legacy fallback.
const api = require('../../../build/permission-node/index.cjs');
const ROOT = 'bd2_user_authorities_v1';
const USER_PROFILE = 'KUB_BD2_USER_RECORD_V1';
const OPERATION_PROFILE = 'KUB_BD2_USER_OPERATION_V1';
const deny = () => { throw Error('ACCESS_DENIED'); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const operationIdFor = (authority, digest) => hash(['KUB_BD2_USER_OPERATION_ID_V1', authority, digest]);

/** Exact own data fields. This is framing, not a second User/role validator. */
function data(value, required, optional = []) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) deny();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (required.some(k => !Object.hasOwn(descriptors, k)) || keys.some(k =>
    typeof k !== 'string' || ![...required, ...optional].includes(k) ||
    !Object.hasOwn(descriptors[k], 'value') || !descriptors[k].enumerable)) deny();
  return Object.fromEntries(keys.map(k => [k, descriptors[k].value]));
}
function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) deny();
  return value;
}
const principalTuple = p => [p.issuer, p.sub];
const samePrincipal = (a, b) => a.issuer === b.issuer && a.sub === b.sub;
const sameUser = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function authorityKey(context) {
  const c = api.validateBd2Context(context);
  return hash(['KUB_BD2_USER_AUTHORITY_V1', c.environment, c.applicationAudience, c.expectedScriptId]);
}
function userKey(principal) {
  return hash(['KUB_BD2_USER_KEY_V1', ...principalTuple(api.validateCanonicalPrincipal(principal))]);
}
function user(context, principal, active, roles, authorizationVersion, revision) {
  return api.validateBd2User({ profile: api.BD2_PROFILE, schemaVersion: 1,
    context, principal, active, roles, authorizationVersion, revision }, context);
}
const COMMAND_KEYS = ['commandId', 'actor', 'target', 'kind', 'expectedRevision', 'payload'];
function commandData(context, value, sealed) {
  const c = api.validateBd2Context(context);
  const r = data(value, sealed ? [...COMMAND_KEYS, 'operationId'] : COMMAND_KEYS);
  if (!hex(r.commandId)) deny();
  const actor = api.validateCanonicalPrincipal(r.actor), target = api.validateCanonicalPrincipal(r.target);
  let payload;
  if (r.kind === 'ENROLL_USER') {
    data(r.payload, []); if (r.expectedRevision !== null) deny(); payload = Object.freeze({});
  } else if (r.kind === 'SET_USER_ACTIVE') {
    const p = data(r.payload, ['active']);
    if (typeof p.active !== 'boolean') deny();
    integer(r.expectedRevision); payload = Object.freeze({ active: p.active });
  } else if (r.kind === 'REPLACE_USER_ROLES') {
    const p = data(r.payload, ['roles']); integer(r.expectedRevision);
    // The existing facade validates roles, including sparse arrays and accessors.
    const roles = user(c, target, false, p.roles, 0, 0).roles;
    payload = Object.freeze({ roles: Object.freeze([...roles].sort()) });
  } else deny();
  const result = { commandId: r.commandId, actor, target, kind: r.kind,
    expectedRevision: r.expectedRevision, payload };
  const digest = requestDigest(c, result);
  const operationId = operationIdFor(authorityKey(c), digest);
  if (sealed && r.operationId !== operationId) deny();
  return Object.freeze({ ...result, operationId });
}
/** Canonical tuple encoding; object property order and role order cannot change identity. */
function requestDigest(context, command) {
  return hash(['KUB_BD2_USER_REQUEST_V1', api.BD2_PROFILE, 1, authorityKey(context),
    command.commandId, principalTuple(command.actor), principalTuple(command.target),
    command.kind, command.expectedRevision,
    command.kind === 'SET_USER_ACTIVE' ? [command.payload.active] :
      command.kind === 'REPLACE_USER_ROLES' ? command.payload.roles : []]);
}
// Both functions construct/validate DATA, never authority or a permission grant.
const createCommand = (context, value) => commandData(context, value, false);
const validateCommand = (context, value) => commandData(context, value, true);
function descriptor(context, command) {
  return Object.freeze({ authorityKey: authorityKey(context), userKey: userKey(command.target),
    operationId: command.operationId, requestDigest: requestDigest(context, command) });
}
function validateDescriptor(context, value) {
  const d = data(value, ['authorityKey', 'userKey', 'operationId', 'requestDigest']);
  if (d.authorityKey !== authorityKey(context) || ![d.userKey, d.operationId, d.requestDigest].every(hex)) deny();
  if (d.operationId !== operationIdFor(d.authorityKey, d.requestDigest)) deny();
  return Object.freeze(d);
}

function validateEnvelope(context, value, expectedUserKey) {
  const r = data(value, ['storageProfile', 'storageSchemaVersion', 'user', 'createdAtMs', 'createdBy',
    'updatedAtMs', 'updatedBy', 'lastOperationId']);
  const u = api.validateBd2User(r.user, context);
  if (r.storageProfile !== USER_PROFILE || r.storageSchemaVersion !== 1 ||
    userKey(u.principal) !== expectedUserKey || !hex(r.lastOperationId)) deny();
  const createdAtMs = integer(r.createdAtMs, 1), updatedAtMs = integer(r.updatedAtMs, 1);
  if (updatedAtMs < createdAtMs) deny();
  return Object.freeze({ storageProfile: USER_PROFILE, storageSchemaVersion: 1, user: u,
    createdAtMs, createdBy: api.validateCanonicalPrincipal(r.createdBy), updatedAtMs,
    updatedBy: api.validateCanonicalPrincipal(r.updatedBy), lastOperationId: r.lastOperationId });
}

/** Pure transition. Semantic rejections are pre-write outcomes, not SDK abort evidence. */
function transition(context, command, before) {
  if (before !== null && !samePrincipal(before.principal, command.target)) deny();
  if (command.kind === 'ENROLL_USER') {
    return before !== null ? { outcome: 'ALREADY_EXISTS' } :
      { outcome: 'CREATED', user: user(context, command.target, false, [], 0, 0) };
  }
  if (before === null) return { outcome: 'NOT_FOUND' };
  if (before.revision !== command.expectedRevision) return { outcome: 'CONFLICT' };
  const active = command.kind === 'SET_USER_ACTIVE' ? command.payload.active : before.active;
  const roles = command.kind === 'REPLACE_USER_ROLES' ? command.payload.roles : before.roles;
  if (active === before.active && JSON.stringify([...roles].sort()) === JSON.stringify([...before.roles].sort()))
    return { outcome: 'NOOP', user: before };
  if (before.revision === Number.MAX_SAFE_INTEGER || before.authorizationVersion === Number.MAX_SAFE_INTEGER)
    return { outcome: 'OVERFLOW' };
  return { outcome: 'UPDATED', user: user(context, command.target, active, roles,
    before.authorizationVersion + 1, before.revision + 1) };
}
function createReceipt(context, command, before, after, outcome, at) {
  return validateReceipt(context, { storageProfile: OPERATION_PROFILE, storageSchemaVersion: 1,
    context, command, ...descriptor(context, command), outcome, before, after, recordedAtMs: at }, command.operationId);
}
function validateReceipt(context, value, expectedOperationId) {
  const r = data(value, ['storageProfile', 'storageSchemaVersion', 'context', 'command', 'authorityKey',
    'userKey', 'operationId', 'requestDigest', 'outcome', 'before', 'after', 'recordedAtMs']);
  // Header/context checks are delegated to the same User validator as every projection.
  const command = validateCommand(context, r.command), d = descriptor(context, command);
  const before = r.before === null ? null : api.validateBd2User(r.before, context);
  const after = api.validateBd2User(r.after, context);
  user(r.context, command.target, false, [], 0, 0);
  if (authorityKey(r.context) !== authorityKey(context) || r.storageProfile !== OPERATION_PROFILE ||
    r.storageSchemaVersion !== 1 || r.operationId !== expectedOperationId ||
    Object.keys(d).some(k => r[k] !== d[k])) deny();
  const expected = transition(context, command, before);
  if (!['CREATED', 'UPDATED', 'NOOP'].includes(expected.outcome) || r.outcome !== expected.outcome ||
    !sameUser(expected.user, after)) deny();
  return Object.freeze({ storageProfile: OPERATION_PROFILE, storageSchemaVersion: 1,
    context: api.validateBd2Context(context), command, ...d, outcome: r.outcome, before, after,
    recordedAtMs: integer(r.recordedAtMs, 1) });
}
class UserStoreError extends Error {
  constructor(outcome, lookupDescriptor = null) {
    super('ACCESS_DENIED'); this.name = 'UserStoreError'; this.outcome = outcome;
    this.descriptor = lookupDescriptor;
  }
}
module.exports = { ROOT, USER_PROFILE, OPERATION_PROFILE, data, integer, authorityKey, userKey,
  createCommand, validateCommand, descriptor, validateDescriptor, validateEnvelope, transition,
  createReceipt, validateReceipt, UserStoreError, sameUser };
