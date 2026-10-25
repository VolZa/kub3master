import type { IdentityApplicationContext } from './contracts';
import { contextFields, matchContext, record, timestamp, invalid } from './validation';

export interface SigningKeyRule extends IdentityApplicationContext {
  readonly keyId: string;
  readonly algorithm: 'RS256';
  readonly signingNotBefore: number;
  readonly signingNotAfter: number;
  readonly verificationNotBefore: number;
  readonly verificationNotAfter: number;
  readonly status: 'ACTIVE' | 'VERIFY_ONLY' | 'RETIRED' | 'REVOKED';
  readonly revokedAt: number | null;
  readonly compromised: boolean;
}
export interface SigningKeyPolicy {
  readonly version: 1;
  readonly brokerIssuer: string;
  readonly keys: readonly Readonly<SigningKeyRule>[];
}
export function signingKeyPolicy(value: unknown): Readonly<SigningKeyPolicy> {
  const p = record(value, ['version', 'brokerIssuer', 'keys']);
  if (p.version !== 1 || typeof p.brokerIssuer !== 'string' ||
    !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/.test(p.brokerIssuer) ||
    !Array.isArray(p.keys) || !p.keys.length || p.keys.length > 8) return invalid();
  const seen = new Set<string>();
  const keys = p.keys.map(value => {
    const k = record(value, ['environment', 'applicationAudience', 'expectedScriptId', 'keyId', 'algorithm', 'signingNotBefore',
      'signingNotAfter', 'verificationNotBefore', 'verificationNotAfter', 'status', 'revokedAt', 'compromised']);
    const c = contextFields(k as unknown as SigningKeyRule);
    if (typeof k.keyId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(k.keyId) || k.algorithm !== 'RS256' ||
      !['ACTIVE', 'VERIFY_ONLY', 'RETIRED', 'REVOKED'].includes(k.status as string) || typeof k.compromised !== 'boolean') return invalid();
    const a = timestamp(k.signingNotBefore), b = timestamp(k.signingNotAfter),
      x = timestamp(k.verificationNotBefore), y = timestamp(k.verificationNotAfter);
    if (x > a || a >= b || b > y || x >= y || (k.revokedAt !== null && timestamp(k.revokedAt) < x) ||
      (k.status === 'REVOKED' && k.revokedAt === null)) return invalid();
    const id = JSON.stringify([c.environment, c.applicationAudience, c.expectedScriptId, k.keyId]);
    if (seen.has(id)) return invalid(); seen.add(id);
    return Object.freeze({ ...c, keyId: k.keyId, algorithm: 'RS256' as const, signingNotBefore: a, signingNotAfter: b,
      verificationNotBefore: x, verificationNotAfter: y, status: k.status as SigningKeyRule['status'],
      revokedAt: k.revokedAt as number | null, compromised: k.compromised });
  });
  return Object.freeze({ version: 1, brokerIssuer: p.brokerIssuer, keys: Object.freeze(keys) });
}
export function verificationKey(policy: SigningKeyPolicy, keyId: string, expected: IdentityApplicationContext,
  issuedAt: number, now: number): Readonly<SigningKeyRule> {
  timestamp(issuedAt); timestamp(now);
  const p = signingKeyPolicy(policy);
  const key = p.keys.find(k => k.keyId === keyId && k.environment === expected.environment &&
    k.applicationAudience === expected.applicationAudience && k.expectedScriptId === expected.expectedScriptId);
  if (!key) return invalid(); matchContext(key, expected);
  if (key.compromised || key.revokedAt !== null || !['ACTIVE', 'VERIFY_ONLY'].includes(key.status) ||
    issuedAt < key.signingNotBefore || issuedAt >= key.signingNotAfter ||
    now < key.verificationNotBefore || now >= key.verificationNotAfter) return invalid();
  return key;
}

/** Authoritative, already-issued session provenance ONLY; never verifies a new assertion/grant.
 * Planned window expiry/RETIRED stops new verification, not existing sessions. Retain a known
 * context-bound policy record until its sessions expire; removal, compromise and revocation deny. */
export function sessionProvenanceKey(policy: SigningKeyPolicy, keyId: string, expected: IdentityApplicationContext,
  issuedAt: number): Readonly<SigningKeyRule> {
  timestamp(issuedAt);
  const p = signingKeyPolicy(policy);
  const key = p.keys.find(k => k.keyId === keyId && k.environment === expected.environment &&
    k.applicationAudience === expected.applicationAudience && k.expectedScriptId === expected.expectedScriptId);
  if (!key) return invalid(); matchContext(key, expected);
  if (key.compromised || key.revokedAt !== null || key.status === 'REVOKED' ||
    issuedAt < key.signingNotBefore || issuedAt >= key.signingNotAfter) return invalid();
  return key;
}
