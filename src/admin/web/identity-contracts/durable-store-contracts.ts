import { IDENTITY_TTL, type IdentityApplicationContext } from './contracts';
import type { GrantRecord } from './atomic-store-contracts';
import { context, contextFields, record, hex, timestamp, lifetime, invalid, matchContext } from './validation';
import { signingKeyPolicy, verificationKey } from './signing-key-policy';

/** Serializable historical facts, NOT TrustedLoginGrant or verified identity evidence.
 * Existing GrantRecord fields are retained; only identity/authentication facts + schema version added.
 * assertionId is already present in GrantRecord and its key provenance; both must agree. */
export interface DurableGrantProjection extends GrantRecord {
  readonly schemaVersion: 1;
  readonly identityIssuer: 'https://accounts.google.com';
  readonly identitySubject: string;
  readonly authenticatedAt: number;
  readonly authenticationExpiresAt: number;
}
/** Trusted expected linkage, independently obtained by the reviewed store reader. Never browser data
 * or a copy of the record being checked. Store ownership/transaction expiry need separate checks. */
export interface DurableGrantBinding extends IdentityApplicationContext {
  readonly grantId: string;
  readonly transactionId: string;
  readonly assertionId: string;
  readonly expectedRevision: number;
  readonly identityIssuer: 'https://accounts.google.com';
  readonly identitySubject: string;
}
const revision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return invalid(); return value as number;
};
function identity(issuer: unknown, subject: unknown): void {
  if (issuer !== 'https://accounts.google.com' || typeof subject !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(subject)) invalid();
}
export function durableGrantBinding(value: unknown): Readonly<DurableGrantBinding> {
  const v = record(value, ['environment', 'applicationAudience', 'expectedScriptId', 'grantId', 'transactionId',
    'assertionId', 'expectedRevision', 'identityIssuer', 'identitySubject']);
  const c = context({ environment: v.environment, applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId });
  identity(v.identityIssuer, v.identitySubject);
  return Object.freeze({ ...c, grantId: hex(v.grantId), transactionId: hex(v.transactionId), assertionId: hex(v.assertionId),
    expectedRevision: revision(v.expectedRevision), identityIssuer: 'https://accounts.google.com', identitySubject: v.identitySubject as string });
}
/** Strict DTO validation and binding ONLY. A successful return cannot mint any trusted capability. */
export function durableGrantProjection(value: unknown, expected: DurableGrantBinding): Readonly<DurableGrantProjection> {
  const b = durableGrantBinding(expected);
  const v = record(value, ['schemaVersion', 'environment', 'applicationAudience', 'expectedScriptId', 'grantId', 'transactionId',
    'assertionId', 'revision', 'status', 'consumedAt', 'issuedAt', 'expiresAt', 'signingKey',
    'identityIssuer', 'identitySubject', 'authenticatedAt', 'authenticationExpiresAt']);
  matchContext(v as unknown as IdentityApplicationContext, contextFields(b)); identity(v.identityIssuer, v.identitySubject);
  const key = record(v.signingKey, ['protocolVersion', 'brokerIssuer', 'keyId', 'algorithm', 'assertionId', 'assertionIssuedAt']);
  const issuedAt = timestamp(v.issuedAt), expiresAt = timestamp(v.expiresAt), authenticatedAt = timestamp(v.authenticatedAt),
    authenticationExpiresAt = timestamp(v.authenticationExpiresAt), assertionIssuedAt = timestamp(key.assertionIssuedAt);
  const rev = revision(v.revision);
  if (v.schemaVersion !== 1 || hex(v.grantId) !== b.grantId || hex(v.transactionId) !== b.transactionId || v.grantId !== v.transactionId ||
    hex(v.assertionId) !== b.assertionId || rev !== b.expectedRevision || v.identityIssuer !== b.identityIssuer ||
    v.identitySubject !== b.identitySubject || key.protocolVersion !== 1 || key.algorithm !== 'RS256' ||
    typeof key.brokerIssuer !== 'string' || !/^https:\/\/[^\s?#]+$/.test(key.brokerIssuer) ||
    typeof key.keyId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(key.keyId) || hex(key.assertionId) !== b.assertionId ||
    authenticatedAt > assertionIssuedAt || assertionIssuedAt > issuedAt || authenticationExpiresAt <= issuedAt ||
    authenticationExpiresAt - authenticatedAt > IDENTITY_TTL.authenticationMaxAgeMs ||
    expiresAt <= issuedAt || expiresAt - issuedAt > IDENTITY_TTL.grantMs || expiresAt > authenticationExpiresAt ||
    (v.status !== 'AVAILABLE' && v.status !== 'CONSUMED') ||
    (v.status === 'AVAILABLE' ? v.consumedAt !== null || rev !== 0 :
      rev !== 1 || timestamp(v.consumedAt) < issuedAt || (v.consumedAt as number) >= expiresAt)) return invalid();
  return Object.freeze({ ...context({ environment: b.environment, applicationAudience: b.applicationAudience, expectedScriptId: b.expectedScriptId }),
    schemaVersion: 1, grantId: b.grantId, transactionId: b.transactionId, assertionId: b.assertionId, revision: rev,
    status: v.status, consumedAt: v.consumedAt as number | null, issuedAt, expiresAt,
    identityIssuer: b.identityIssuer, identitySubject: b.identitySubject, authenticatedAt, authenticationExpiresAt,
    signingKey: Object.freeze({ protocolVersion: 1, brokerIssuer: key.brokerIssuer, keyId: key.keyId,
      algorithm: 'RS256', assertionId: b.assertionId, assertionIssuedAt }) });
}
/** Fresh policy/time checks supplement ownership; still returns data, not runtime provenance. */
export function restorableGrantProjection(value: unknown, expected: DurableGrantBinding, policyValue: unknown, now: number): Readonly<DurableGrantProjection> {
  const grant = durableGrantProjection(value, expected), policy = signingKeyPolicy(policyValue);
  lifetime(grant.issuedAt, grant.expiresAt, IDENTITY_TTL.grantMs, now);
  if (grant.status !== 'AVAILABLE' || grant.authenticationExpiresAt <= now || policy.brokerIssuer !== grant.signingKey.brokerIssuer) return invalid();
  verificationKey(policy, grant.signingKey.keyId, contextFields(expected), grant.signingKey.assertionIssuedAt, now);
  return grant;
}
declare const restoredGrantProof: unique symbol;
/** Opaque requirement, NO factory/JSON rehydration implementation exists in runtime code. */
export interface TrustedRestoredGrant { readonly [restoredGrantProof]: true }
export interface GrantRestorationPort {
  /** Authenticate store/project/database/path ownership; validate independent linkage + current
   * revision/lifecycle, original transaction expiry and fresh policy/time BEFORE creating evidence.
   * Real implementation is missing; synthetic capability factories belong ONLY in tests. */
  restore(binding: Readonly<DurableGrantBinding>): Promise<{ readonly status: 'RESTORED'; readonly grant: TrustedRestoredGrant } |
    { readonly status: 'BLOCKED' | 'UNAVAILABLE' | 'TIMEOUT' }>;
}
export interface RestoredGrantReaderPort {
  /** Paired private-owner read, fresh authoritative record/revocation/key checks, then immutable DTO.
   * Only the atomic store may consume this result under a separately proved admission gate.
   * A schema validator or arbitrary lying injected reader is not a reviewed implementation. */
  read(evidence: unknown, binding: Readonly<DurableGrantBinding>): Promise<Readonly<DurableGrantProjection>>;
}
export interface DurableAdmissionRequirements {
  readonly expiryAtCommit: 'STRICT';
  readonly authoritativeClock: 'VERIFIED_ACROSS_WORKERS_AND_RESTART';
  readonly restoration: 'REVIEWED_STORE_OWNERSHIP';
  readonly directoryConsistency: 'EXPLICITLY_APPROVED';
}
declare const durableGuaranteeProof: unique symbol;
export interface VerifiedDurableGuarantees { readonly [durableGuaranteeProof]: true }
/** Deliberately no positive evidence issuer/verifier. No injected flags or casts can open this gate.
 * A later reviewed implementation AND temporal-policy approval are required, not another adapter flag. */
export function requireDurableAdmissionGuarantees(_evidence: unknown): never { throw Error('DURABLE_ADMISSION_BLOCKED'); }
export function durableAdmissionGate(_configuration?: unknown) {
  return Object.freeze({ status: 'BLOCKED' as const, expiryAtCommit: 'UNVERIFIED' as const,
    authoritativeClock: 'UNVERIFIED' as const, restoration: 'NOT_IMPLEMENTED' as const,
    directoryConsistency: 'NOT_APPROVED' as const });
}
