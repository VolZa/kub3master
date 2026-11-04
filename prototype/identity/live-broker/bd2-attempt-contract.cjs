'use strict';
const { hash, hex, deny } = require('./security.cjs');
const PROFILE = 'KUB_ERP_SESSION_BD2_V1';
const CONTEXT_KEYS = ['environment', 'applicationAudience', 'expectedScriptId'];
const ATTEMPT_KEYS = ['profile', 'clientId', 'context', 'attemptId', 'nonceHash', 'proofHash',
  'createdAtMs', 'expiresAtMs', 'phase'];

function data(value, required, optional = []) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) deny();
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (required.some(k => !Object.hasOwn(descriptors, k)) || keys.some(k =>
    ![...required, ...optional].includes(k) || !Object.hasOwn(descriptors[k], 'value') || !descriptors[k].enumerable)) deny();
  return Object.fromEntries(keys.map(k => [k, descriptors[k].value]));
}
function configuration(value) {
  const c = data(value, ['profile', 'clientId', 'context', 'attemptTtlMs']);
  const context = data(c.context, CONTEXT_KEYS);
  if (c.profile !== PROFILE || typeof c.clientId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,200}\.apps\.googleusercontent\.com$/.test(c.clientId) ||
    !['PRODUCTION', 'TEST'].includes(context.environment) ||
    typeof context.applicationAudience !== 'string' || !/^[A-Za-z0-9._:/-]{1,200}$/.test(context.applicationAudience) ||
    typeof context.expectedScriptId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(context.expectedScriptId) ||
    !Number.isSafeInteger(c.attemptTtlMs) || c.attemptTtlMs < 1 || c.attemptTtlMs > 120_000) deny();
  return Object.freeze({ ...c, context: Object.freeze(context) });
}
// Structural/context validation only. A lookup is never authorization or an expiry check.
function record(value, c, id) {
  const row = data(value, ATTEMPT_KEYS), context = data(row.context, CONTEXT_KEYS);
  if (!['NEW', 'CONSUMED'].includes(row.phase) || row.profile !== PROFILE || row.clientId !== c.clientId ||
    !hex(id) || row.attemptId !== id || CONTEXT_KEYS.some(k => context[k] !== c.context[k]) ||
    !hex(row.nonceHash) || !hex(row.proofHash) || !Number.isSafeInteger(row.createdAtMs) || row.createdAtMs < 1 ||
    !Number.isSafeInteger(row.expiresAtMs) || row.expiresAtMs !== row.createdAtMs + c.attemptTtlMs) deny();
  return Object.freeze({ ...row, context: Object.freeze(context) });
}
function bindingDigest(row) {
  return hash(JSON.stringify([PROFILE, row.clientId, ...CONTEXT_KEYS.map(k => row.context[k]), row.attemptId,
    row.nonceHash, row.proofHash, row.createdAtMs, row.expiresAtMs]));
}
function operationId(kind, attemptId) {
  if (!['CREATE', 'CLAIM'].includes(kind) || !hex(attemptId)) deny();
  return hash(JSON.stringify([PROFILE, kind, attemptId]));
}
class AttemptStoreError extends Error {
  constructor(outcome, descriptor) {
    super('ACCESS_DENIED'); this.name = 'AttemptStoreError'; this.outcome = outcome;
    this.descriptor = Object.freeze({ ...descriptor });
  }
}
module.exports = { PROFILE, data, configuration, record, bindingDigest, operationId, AttemptStoreError };
