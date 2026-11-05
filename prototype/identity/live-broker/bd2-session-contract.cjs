'use strict';
const { createHash } = require('node:crypto');
const api = require('../../../build/permission-node/index.cjs');
const { ROOT, authorityKey, data, integer } = require('./bd2-user-contract.cjs');

// DATA ONLY: no store, issuer, clock, Google verification or authorization capability.
// SID is an opaque bearer with >=256 CSPRNG bits. Only its digest belongs here;
// raw SID must never enter persisted records, descriptors, logs or URLs.
const RECORD_PROFILE = 'KUB_BD2_SESSION_RECORD_V1';
const INTENT_PROFILE = 'KUB_BD2_SESSION_CREATION_INTENT_V1';
const BINDING_PROFILE = 'KUB_BD2_SESSION_CREATION_BINDING_V1';
const OPERATION_PROFILE = 'KUB_BD2_SESSION_CREATION_OPERATION_V1';
const deny = () => { throw Error('ACCESS_DENIED'); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const principalTuple = p => [p.issuer, p.sub];
const operationIdFor = (authority, digest) => hash(['KUB_BD2_SESSION_CREATION_OPERATION_ID_V1', authority, digest]);
const LOCATOR_KEYS = ['authorityKey', 'attemptKey', 'sessionDigest', 'operationId', 'requestDigest'];
const STORAGE_KEYS = ['storageProfile', 'storageSchemaVersion', ...LOCATOR_KEYS];
const INPUT_KEYS = ['commandId', 'kind', 'attempt', 'principal', 'createdAtMs', 'sessionDigest'];
const COMMAND_KEYS = ['profile', 'schemaVersion', 'context', 'authorityKey', ...INPUT_KEYS, 'requestDigest', 'operationId'];

function attempt(value) {
  const a = data(value, ['collectionId', 'clientId', 'attemptId', 'bindingDigest']);
  // Same namespace grammar as the existing Attempt store/configuration; no TTL/freshness policy.
  if (typeof a.collectionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(a.collectionId) ||
    typeof a.clientId !== 'string' || !/^[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com$/.test(a.clientId) ||
    !hex(a.attemptId) || !hex(a.bindingDigest)) deny();
  return Object.freeze(a);
}
function attemptKey(context, value) {
  const a = attempt(value);
  // Physical attempt locator is collectionId/attemptId within this authority.
  // Deliberately excludes command/operation, SID, principal, S, clientId and bindingDigest.
  // Reusing the same original attempt with different payload still occupies the same slot.
  return hash(['KUB_BD2_SESSION_CREATION_ATTEMPT_V1', authorityKey(context), a.collectionId, a.attemptId]);
}
function digestOf(c) {
  const a = c.attempt;
  return hash(['KUB_BD2_SESSION_CREATION_REQUEST_V1', c.profile, c.schemaVersion, c.authorityKey,
    c.commandId, c.kind, [a.collectionId, a.clientId, a.attemptId, a.bindingDigest],
    principalTuple(c.principal), c.createdAtMs, c.sessionDigest]);
}
function creationTime(value) {
  const s = integer(value, 1);
  // Same safe hard-expiry arithmetic required by validateBd2Session; no clock/freshness claim.
  integer(s + 720 * 60_000, 1);
  return s;
}
function commandData(context, value, sealed) {
  const ctx = api.validateBd2Context(context), r = data(value, sealed ? COMMAND_KEYS : INPUT_KEYS);
  const authority = authorityKey(ctx);
  if (sealed && (r.profile !== api.BD2_PROFILE || r.schemaVersion !== 1 ||
    authorityKey(r.context) !== authority || r.authorityKey !== authority)) deny();
  if (!hex(r.commandId) || r.kind !== 'CREATE_SESSION' || !hex(r.sessionDigest)) deny();
  const c = { profile: api.BD2_PROFILE, schemaVersion: 1, context: ctx, authorityKey: authority,
    commandId: r.commandId, kind: 'CREATE_SESSION', attempt: attempt(r.attempt),
    principal: api.validateCanonicalPrincipal(r.principal), createdAtMs: creationTime(r.createdAtMs), sessionDigest: r.sessionDigest };
  const requestDigest = digestOf(c), operationId = operationIdFor(authority, requestDigest);
  if (sealed && (r.requestDigest !== requestDigest || r.operationId !== operationId)) deny();
  return Object.freeze({ ...c, requestDigest, operationId });
}
// A matching DTO is never proof of a successful browser-bound Google verification.
const createCommand = (context, value) => commandData(context, value, false);
const validateCommand = (context, value) => commandData(context, value, true);
function locator(c) {
  return Object.freeze({ authorityKey: c.authorityKey, attemptKey: attemptKey(c.context, c.attempt),
    sessionDigest: c.sessionDigest, operationId: c.operationId, requestDigest: c.requestDigest });
}
function descriptor(context, value) { return locator(validateCommand(context, value)); }
function validateDescriptor(context, value) {
  const d = data(value, LOCATOR_KEYS);
  if (d.authorityKey !== authorityKey(context) || !LOCATOR_KEYS.every(k => hex(d[k])) ||
    d.operationId !== operationIdFor(d.authorityKey, d.requestDigest)) deny();
  // A locator cannot authenticate recovery or prove its claimed target without original evidence.
  return Object.freeze(d);
}
function storage(profile, d) { return { storageProfile: profile, storageSchemaVersion: 1, ...d }; }
function storageHeader(context, r, profile) {
  if (r.storageProfile !== profile || r.storageSchemaVersion !== 1) deny();
  return validateDescriptor(context, Object.fromEntries(LOCATOR_KEYS.map(k => [k, r[k]])));
}
function matchLocator(a, b) { if (LOCATOR_KEYS.some(k => a[k] !== b[k])) deny(); }

function createIntent(context, value) {
  const c = validateCommand(context, value), d = locator(c);
  return validateIntent(context, { ...storage(INTENT_PROFILE, d), canonicalCommand: c }, d.attemptKey);
}
function validateIntent(context, value, expectedAttemptKey) {
  const r = data(value, [...STORAGE_KEYS, 'canonicalCommand']);
  const d = storageHeader(context, r, INTENT_PROFILE), c = validateCommand(context, r.canonicalCommand);
  matchLocator(d, locator(c));
  if (d.attemptKey !== expectedAttemptKey) deny();
  return Object.freeze({ ...storage(INTENT_PROFILE, d), canonicalCommand: c });
}
function assertIntentMatchesCommand(context, value, command) {
  const c = validateCommand(context, command), d = locator(c);
  const i = validateIntent(context, value, d.attemptKey);
  matchLocator(i, d);
  if (!same(i.canonicalCommand, c)) deny();
  return i; // Never rebind or adopt a different command for this original attempt.
}
function createBinding(context, command) {
  const d = descriptor(context, command);
  return validateBinding(context, storage(BINDING_PROFILE, d), d.attemptKey);
}
function validateBinding(context, value, expectedAttemptKey) {
  const r = data(value, STORAGE_KEYS), d = storageHeader(context, r, BINDING_PROFILE);
  if (d.attemptKey !== expectedAttemptKey) deny();
  return Object.freeze(storage(BINDING_PROFILE, d)); // Future store MUST use create-only.
}
function assertBindingMatchesCommand(context, value, command) {
  const d = descriptor(context, command), b = validateBinding(context, value, d.attemptKey);
  matchLocator(b, d); return b;
}

function sessionForCommand(context, value, c, initial) {
  const s = api.validateBd2Session(value, context); // Unchanged canonical B/D2 validator.
  if (s.sessionDigest !== c.sessionDigest || s.createOperationId !== c.operationId ||
    s.createdAtMs !== c.createdAtMs || !same(s.principal, c.principal)) deny();
  if (initial && (s.lastEligibleActivityAtMs !== s.createdAtMs || s.revision !== 0 ||
    s.status !== 'ACTIVE' || s.revokedAtMs !== null)) deny();
  return s;
}
function createEnvelope(context, command, session) {
  const c = validateCommand(context, command), d = locator(c);
  return validateEnvelope(context, { storageProfile: RECORD_PROFILE, storageSchemaVersion: 1,
    authorityKey: d.authorityKey, session: sessionForCommand(context, session, c, false), creation: d }, d.sessionDigest);
}
function validateEnvelope(context, value, expectedSessionDigest) {
  const r = data(value, ['storageProfile', 'storageSchemaVersion', 'authorityKey', 'session', 'creation']);
  const s = api.validateBd2Session(r.session, context), d = validateDescriptor(context, r.creation);
  if (r.storageProfile !== RECORD_PROFILE || r.storageSchemaVersion !== 1 || r.authorityKey !== d.authorityKey ||
    s.sessionDigest !== expectedSessionDigest || s.sessionDigest !== d.sessionDigest || s.createOperationId !== d.operationId) deny();
  return Object.freeze({ storageProfile: RECORD_PROFILE, storageSchemaVersion: 1, authorityKey: d.authorityKey,
    session: s, creation: d });
}
function createReceipt(context, command, initialSession) {
  const c = validateCommand(context, command), d = locator(c);
  return validateReceipt(context, { ...storage(OPERATION_PROFILE, d), canonicalCommand: c,
    outcome: 'CREATED', initialSession }, d.operationId);
}
function validateReceipt(context, value, expectedOperationId) {
  const r = data(value, [...STORAGE_KEYS, 'canonicalCommand', 'outcome', 'initialSession']);
  const d = storageHeader(context, r, OPERATION_PROFILE), c = validateCommand(context, r.canonicalCommand);
  matchLocator(d, locator(c));
  if (d.operationId !== expectedOperationId || r.outcome !== 'CREATED') deny();
  const initialSession = sessionForCommand(context, r.initialSession, c, true);
  return Object.freeze({ ...storage(OPERATION_PROFILE, d), canonicalCommand: c, outcome: 'CREATED', initialSession });
}
function immutableSession(s) {
  return [s.profile, s.schemaVersion, authorityKey(s.context), s.sessionDigest, s.createOperationId,
    principalTuple(s.principal), s.createdAtMs,
    [s.policySnapshot.policyVersion, s.policySnapshot.idleTimeoutMinutes, s.policySnapshot.absoluteTimeoutMinutes],
    s.authorizationVersionAtIssue];
}

/** Proposed fixed point-read layout under the existing authority. No SDK/path input or I/O. */
function paths(context, value) {
  const d = validateDescriptor(context, value), root = `${ROOT}/${d.authorityKey}`;
  return Object.freeze({ intent: `${root}/session_creation_intents/${d.attemptKey}`,
    binding: `${root}/session_creation_bindings/${d.attemptKey}`,
    session: `${root}/sessions/${d.sessionDigest}`, receipt: `${root}/session_creation_operations/${d.operationId}` });
}
function observed(value, path, validate) {
  if (value === null) return null;
  const r = data(value, ['path', 'record']);
  if (r.path !== path) deny();
  return validate(r.record);
}
/** Pure classification of supplied evidence, NEVER a Session checker or a database lookup.
 * All four slots are explicit null or {path, record}. An adapter must obtain coherent,
 * authoritative reads separately. No status here proves persistence/atomicity or UseOK.
 */
function classifyCreationEvidence(context, value, evidence) {
  // Invalid caller locator throws; malformed stored evidence is classified INVALID.
  const d = validateDescriptor(context, value), p = paths(context, d);
  try {
    const e = data(evidence, ['intent', 'binding', 'session', 'receipt']);
    const i = observed(e.intent, p.intent, r => validateIntent(context, r, d.attemptKey));
    const b = observed(e.binding, p.binding, r => validateBinding(context, r, d.attemptKey));
    const s = observed(e.session, p.session, r => validateEnvelope(context, r, d.sessionDigest));
    const receipt = observed(e.receipt, p.receipt, r => validateReceipt(context, r, d.operationId));
    if (i) matchLocator(i, d);
    if (b) matchLocator(b, d);
    if (s) matchLocator(s.creation, d);
    if (receipt) matchLocator(receipt, d);
    if (!b && !s && !receipt) return Object.freeze({ status: 'UNKNOWN' });
    // No orphan adoption/repair: committed creation requires intent AND the atomic triplet.
    if (!i || !b || !s || !receipt) deny();
    if (!same(i.canonicalCommand, receipt.canonicalCommand) ||
      !same(immutableSession(s.session), immutableSession(receipt.initialSession)) ||
      (s.session.revision === 0 && !same(s.session, receipt.initialSession))) deny();
    return Object.freeze({ status: 'CONSISTENT_CREATION_DATA', receipt });
  } catch { return Object.freeze({ status: 'INVALID' }); }
}

module.exports = { ROOT, RECORD_PROFILE, INTENT_PROFILE, BINDING_PROFILE, OPERATION_PROFILE,
  authorityKey, attemptKey, createCommand, validateCommand, descriptor, validateDescriptor, paths,
  createIntent, validateIntent, assertIntentMatchesCommand, createBinding, validateBinding, assertBindingMatchesCommand,
  createEnvelope, validateEnvelope, createReceipt, validateReceipt, classifyCreationEvidence };
