import { IDENTITY_TTL, type BrokerAssertionClaims, type BrokerSignatureVerificationPort, type VerifiedBrokerAssertion,
  type VerifiedIdentityContext, type TrustedLoginGrant, type IdentityApplicationContext } from './contracts';
import { record, invalid, context, contextFields, matchContext, timestamp, hex, lifetime, signature, brokerPolicy, transaction, addTime } from './validation';

// Runtime provenance, not a token/session store. No mutable replay registry shared between requests,
// clock, RNG or I/O. Each evidence object is immutable and private-field branded; copying/casting or
// JSON round trips lose its provenance. Even its reachable constructor requires this private key.
const constructionKey = Object.freeze({});
class Evidence {
  readonly #proof = true;
  constructor(key: unknown, readonly kind: string, readonly data: unknown) {
    if (key !== constructionKey) invalid(); Object.freeze(this);
  }
  static read<D>(value: unknown, kind: string): D {
    if (!value || typeof value !== 'object' || !(#proof in value) || !value.#proof || value.kind !== kind) return invalid();
    return value.data as D;
  }
}
const claimKeys = ['environment', 'applicationAudience', 'expectedScriptId', 'purpose', 'issuer', 'identityIssuer', 'subject',
  'authenticatedAt', 'authenticationExpiresAt', 'transactionId', 'nonce', 'browserProofBinding', 'issuedAt', 'expiresAt', 'assertionId'];

/** Contract boundary with an explicitly injected signature port. The port is not implemented here.
 * Its result must come from verification of this exact message, not browser-supplied decoded claims.
 * Validation is deterministic with a deterministic signature port and explicit trusted clock.
 */
export function verifyBrokerAssertion(message: unknown, expected: unknown, policyValue: unknown,
  transactionValue: unknown, now: number, verifier: BrokerSignatureVerificationPort): VerifiedBrokerAssertion {
  try {
    timestamp(now); const target = context(expected), policy = brokerPolicy(policyValue), tx = transaction(transactionValue, target);
    lifetime(tx.createdAt, tx.expiresAt, IDENTITY_TTL.transactionMs, now);
    if (tx.status !== 'VERIFYING' || tx.updatedAt > now) return invalid();
    const envelope = record(message, ['assertion']);
    if (typeof envelope.assertion !== 'string' || !envelope.assertion || envelope.assertion.length > 8192 || /\s/.test(envelope.assertion)) return invalid();
    const result = verifier.verify(Object.freeze({ assertion: envelope.assertion }), policy);
    const checked = record(result, ['claims', 'signature']), metadata = signature(checked.signature);
    if (metadata.algorithm !== policy.signature.algorithm || metadata.keyId !== policy.signature.keyId) return invalid();
    const raw = record(checked.claims, claimKeys), c = matchContext(raw as unknown as IdentityApplicationContext, target);
    lifetime(raw.issuedAt, raw.expiresAt, IDENTITY_TTL.assertionMs, now);
    const authenticatedAt = timestamp(raw.authenticatedAt), authenticationExpiresAt = timestamp(raw.authenticationExpiresAt);
    if (raw.purpose !== 'ADMIN_WEB_LOGIN_V1' || raw.issuer !== policy.brokerIssuer || raw.identityIssuer !== 'https://accounts.google.com' ||
      typeof raw.subject !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(raw.subject) ||
      authenticatedAt > (raw.issuedAt as number) || authenticationExpiresAt <= now ||
      authenticationExpiresAt - authenticatedAt > IDENTITY_TTL.authenticationMaxAgeMs ||
      (raw.issuedAt as number) < tx.createdAt || (raw.expiresAt as number) > authenticationExpiresAt ||
      hex(raw.transactionId) !== tx.transactionId || hex(raw.nonce) !== tx.nonce || hex(raw.browserProofBinding) !== tx.browserProofBinding) return invalid();
    const claims: BrokerAssertionClaims = Object.freeze({ ...c, purpose: raw.purpose, issuer: raw.issuer as string,
      identityIssuer: raw.identityIssuer, subject: raw.subject, authenticatedAt, authenticationExpiresAt,
      transactionId: raw.transactionId as string, nonce: raw.nonce as string, browserProofBinding: raw.browserProofBinding as string,
      issuedAt: raw.issuedAt as number, expiresAt: raw.expiresAt as number, assertionId: hex(raw.assertionId) });
    return new Evidence(constructionKey, 'VERIFIED_ASSERTION', Object.freeze({ claims, signature: metadata, verifiedAt: now })) as unknown as VerifiedBrokerAssertion;
  } catch { return invalid(); }
}
export function readVerifiedAssertion(value: unknown, expected: unknown, now: number): VerifiedBrokerAssertion['data'] {
  const data = Evidence.read<VerifiedBrokerAssertion['data']>(value, 'VERIFIED_ASSERTION');
  matchContext(data.claims, expected); timestamp(now);
  if (data.verifiedAt > now) return invalid();
  lifetime(data.claims.issuedAt, data.claims.expiresAt, IDENTITY_TTL.assertionMs, now);
  return data;
}
export function readVerifiedIdentity(value: unknown, expected: unknown): VerifiedIdentityContext['data'] {
  const data = Evidence.read<VerifiedIdentityContext['data']>(value, 'VERIFIED_IDENTITY'); matchContext(data, expected); return data;
}
/** Produces only an in-memory contract object, no persistence/consume/session issuance.
 * Future store MUST atomically fence assertionId AND transactionId before recording this grant.
 * One deterministic grantId per transaction prevents duplicate ledger keys; it is not atomicity.
 */
export function createTrustedLoginGrant(verified: unknown, transactionValue: unknown, expected: unknown, now: number): TrustedLoginGrant {
  const result = readVerifiedAssertion(verified, expected, now), c = context(expected), tx = transaction(transactionValue, c);
  lifetime(tx.createdAt, tx.expiresAt, IDENTITY_TTL.transactionMs, now);
  if (tx.status !== 'VERIFIED' || tx.updatedAt > now || tx.transactionId !== result.claims.transactionId ||
    tx.nonce !== result.claims.nonce || tx.browserProofBinding !== result.claims.browserProofBinding) return invalid();
  const identity = new Evidence(constructionKey, 'VERIFIED_IDENTITY', Object.freeze({ ...c,
    identityIssuer: result.claims.identityIssuer, identitySubject: result.claims.subject,
    authenticatedAt: result.claims.authenticatedAt, authenticationExpiresAt: result.claims.authenticationExpiresAt,
    provenance: 'OIDC_BROKER_ASSERTION_V1' as const })) as unknown as VerifiedIdentityContext;
  const data = Object.freeze({ ...c, grantId: tx.transactionId, transactionId: tx.transactionId,
    assertionId: result.claims.assertionId, identity, issuedAt: now,
    expiresAt: Math.min(addTime(now, IDENTITY_TTL.grantMs), tx.expiresAt, result.claims.authenticationExpiresAt) });
  return new Evidence(constructionKey, 'TRUSTED_LOGIN_GRANT', data) as unknown as TrustedLoginGrant;
}
export function readTrustedLoginGrant(value: unknown, expected: unknown, now: number): TrustedLoginGrant['data'] {
  const data = Evidence.read<TrustedLoginGrant['data']>(value, 'TRUSTED_LOGIN_GRANT');
  matchContext(data, expected); readVerifiedIdentity(data.identity, contextFields(data));
  lifetime(data.issuedAt, data.expiresAt, IDENTITY_TTL.grantMs, now); return data;
}
