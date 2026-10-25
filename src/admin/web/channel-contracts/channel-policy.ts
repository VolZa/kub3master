import { CHANNEL, type ChannelContext, type ChannelExpectation, type ChannelKeyPolicy, type ChannelKeyRule,
  type Direction, type NonceClaim, type RequestHeader } from './contracts';
import { invalid } from './encoding';

export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(descriptors, k)) ||
    Object.values(descriptors).some(d => d.get || d.set || !d.enumerable) || Object.getOwnPropertySymbols(value).length) return invalid();
  return value as Record<string, unknown>;
}
export function time(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalid(); return value;
}
export function hex(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return invalid(); return value;
}
export function keyId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) return invalid(); return value;
}
export function origin(value: unknown): string {
  // Canonical HTTPS host, optional nondefault port. No IP literals, path, query, credentials or redirects.
  if (typeof value !== 'string' || value.length > 253 ||
    !/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+(?::[1-9][0-9]{0,4})?$/.test(value)) return invalid();
  const port = /:([0-9]+)$/.exec(value);
  const hostname = value.slice('https://'.length).split(':')[0], labels = hostname.split('.');
  // A numeric final label also covers URL-parser alternate IPv4 spellings such as 0x7f.1.
  if (port && (Number(port[1]) > 65535 || Number(port[1]) === 443) ||
    labels.some(label => label.length > 63) || !/^[a-z]/.test(labels[labels.length - 1])) return invalid(); return value;
}
export function channelContext(value: unknown): Readonly<ChannelContext> {
  const v = object(value, ['environment', 'applicationAudience', 'expectedScriptId']);
  if ((v.environment !== 'PRODUCTION' && v.environment !== 'TEST') || typeof v.applicationAudience !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9:/.\-_]{2,199}$/.test(v.applicationAudience) || typeof v.expectedScriptId !== 'string' ||
    !/^[A-Za-z0-9_-]{20,200}$/.test(v.expectedScriptId) || /REPLACE|PLACEHOLDER/i.test(v.expectedScriptId)) return invalid();
  return Object.freeze({ environment: v.environment, applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId });
}
export function expectation(value: unknown): Readonly<ChannelExpectation> {
  const v = object(value, ['environment', 'applicationAudience', 'expectedScriptId', 'backendOrigin']);
  return Object.freeze({ ...channelContext({ environment: v.environment, applicationAudience: v.applicationAudience,
    expectedScriptId: v.expectedScriptId }), backendOrigin: origin(v.backendOrigin) });
}
export function matchesContext(value: ChannelContext, expected: ChannelContext): void {
  const fields = (v: ChannelContext) => channelContext({ environment: v.environment, applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId });
  const actual = fields(value), target = fields(expected);
  if (actual.environment !== target.environment || actual.applicationAudience !== target.applicationAudience ||
    actual.expectedScriptId !== target.expectedScriptId) return invalid();
}
export function checkFresh(timestamp: unknown, nowValue: unknown, maxAge: number): number {
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0) return invalid();
  const at = time(timestamp), now = time(nowValue);
  if (at - now > CHANNEL.futureSkewMs || now - at >= maxAge) return invalid(); return at;
}
export function channelKeyPolicy(value: unknown, expectedValue: unknown): Readonly<ChannelKeyPolicy> {
  const expected = expectation(expectedValue), p = object(value, ['environment', 'applicationAudience', 'expectedScriptId', 'backendOrigin', 'keys']);
  if (p.environment !== expected.environment || p.applicationAudience !== expected.applicationAudience ||
    p.expectedScriptId !== expected.expectedScriptId || p.backendOrigin !== expected.backendOrigin ||
    !Array.isArray(p.keys) || !p.keys.length || p.keys.length > 16) return invalid();
  const seen = new Set<string>();
  const keys = p.keys.map(value => {
    const k = object(value, ['keyId', 'direction', 'signingNotBefore', 'signingNotAfter', 'verificationNotAfter', 'status', 'revokedAt', 'compromised']);
    const id = keyId(k.keyId), a = time(k.signingNotBefore), b = time(k.signingNotAfter), end = time(k.verificationNotAfter);
    if (seen.has(id) || (k.direction !== 'REQUEST' && k.direction !== 'RESPONSE') || a >= b || b > end ||
      !['ACTIVE', 'VERIFY_ONLY', 'REVOKED'].includes(k.status as string) || typeof k.compromised !== 'boolean' ||
      k.revokedAt !== null && time(k.revokedAt) < a || k.status === 'REVOKED' && k.revokedAt === null) return invalid();
    seen.add(id);
    return Object.freeze({ keyId: id, direction: k.direction, signingNotBefore: a, signingNotAfter: b, verificationNotAfter: end,
      status: k.status as ChannelKeyRule['status'], revokedAt: k.revokedAt as number | null, compromised: k.compromised });
  });
  return Object.freeze({ ...expected, keys: Object.freeze(keys) });
}
/** Policy check only; no MAC verification and no deployment attestation. */
export function verificationKey(policy: unknown, expected: unknown, id: string, direction: Direction,
  signedAt: number, now: number): Readonly<ChannelKeyRule> {
  time(signedAt); time(now); keyId(id);
  const key = channelKeyPolicy(policy, expected).keys.find(k => k.keyId === id && k.direction === direction);
  if (!key || key.compromised || key.revokedAt !== null || key.status === 'REVOKED' ||
    signedAt < key.signingNotBefore || signedAt >= key.signingNotAfter || now >= key.verificationNotAfter) return invalid();
  return key;
}
/** Plan only, not a claimed nonce. Caller MUST authenticate the request before using the ledger. */
export function nonceClaimPlan(header: RequestHeader, expectedValue: unknown, now: number): Readonly<NonceClaim> {
  const expected = expectation(expectedValue); matchesContext(header, expected);
  if (header.backendOrigin !== expected.backendOrigin || header.protocolVersion !== 1 || header.algorithm !== CHANNEL.algorithm) return invalid();
  const at = checkFresh(header.timestamp, now, CHANNEL.requestAgeMs), retainUntil = time(Math.max(now, at) + CHANNEL.nonceRetentionMs);
  return Object.freeze({ environment: expected.environment, applicationAudience: expected.applicationAudience,
    expectedScriptId: expected.expectedScriptId, direction: 'REQUEST', nonce: hex(header.nonce), requestId: hex(header.requestId),
    timestamp: at, receivedAt: now, retainUntil });
}
/** Behavioral contract only; not runtime proof that a durable claim really happened. */
export function replayDisposition(outcome: unknown): 'CONTINUE_AFTER_AUTHENTICATION' | 'BLOCKED' {
  if (outcome === 'CLAIMED') return 'CONTINUE_AFTER_AUTHENTICATION';
  if (['DUPLICATE', 'UNAVAILABLE', 'OUTCOME_UNKNOWN', 'CAPACITY_EXCEEDED'].includes(outcome as string)) return 'BLOCKED';
  return invalid();
}
