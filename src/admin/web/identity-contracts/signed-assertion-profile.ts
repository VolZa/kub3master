import { IDENTITY_TTL, type BrokerAssertionClaims, type IdentityApplicationContext, type VerifiedBrokerAssertion } from './contracts';
import { record, invalid, timestamp, lifetime, hex, matchContext, context, transaction } from './validation';
import { base64urlJson, base64urlBytes } from './strict-json';
import { signingKeyPolicy, verificationKey, type SigningKeyPolicy, type SigningKeyRule } from './signing-key-policy';
import { verifyBrokerAssertion, readVerifiedAssertion } from './verification';

export interface SignedAssertionClaimsV1 extends BrokerAssertionClaims { readonly protocolVersion: 1 }
export interface SignedAssertionHeader { readonly typ: 'kub-admin-login+jws'; readonly alg: 'RS256'; readonly kid: string }
export interface StructuralJws {
  readonly assertion: string;
  readonly signingInput: string;
  readonly header: Readonly<SignedAssertionHeader>;
  readonly claims: Readonly<SignedAssertionClaimsV1>;
}
/** Trusted server injection. MUST verify exact Compact JWS bytes using a real JOSE adapter.
 * No default verifier, crypto algorithm, key material or network implementation is supplied. */
export interface ProfileSignatureVerificationPort {
  verify(assertion: string, key: Readonly<SigningKeyRule>): boolean;
}
const keys = ['protocolVersion', 'purpose', 'issuer', 'applicationAudience', 'environment', 'expectedScriptId', 'assertionId',
  'transactionId', 'identityIssuer', 'subject', 'nonce', 'browserProofBinding', 'authenticatedAt', 'authenticationExpiresAt', 'issuedAt', 'expiresAt'];

/** Structural validation ONLY. Returning this object is never signature verification. */
export function validateCompactJws(message: unknown, expected: IdentityApplicationContext, policyValue: unknown, now: number): Readonly<StructuralJws> {
  const envelope = record(message, ['assertion']), c = context(expected), policy = signingKeyPolicy(policyValue); timestamp(now);
  if (typeof envelope.assertion !== 'string' || envelope.assertion.length > 8192) return invalid();
  const parts = envelope.assertion.split('.'); if (parts.length !== 3) return invalid();
  const h = record(base64urlJson(parts[0]), ['typ', 'alg', 'kid']);
  if (h.typ !== 'kub-admin-login+jws' || h.alg !== 'RS256' || typeof h.kid !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(h.kid)) return invalid();
  const signature = base64urlBytes(parts[2]); if (signature.length < 256 || signature.length > 512) return invalid();
  const p = record(base64urlJson(parts[1]), keys); matchContext(p as unknown as IdentityApplicationContext, c);
  lifetime(p.issuedAt, p.expiresAt, IDENTITY_TTL.assertionMs, now);
  const authenticatedAt = timestamp(p.authenticatedAt), authenticationExpiresAt = timestamp(p.authenticationExpiresAt);
  if (p.protocolVersion !== 1 || p.purpose !== 'ADMIN_WEB_LOGIN_V1' || p.issuer !== policy.brokerIssuer ||
    p.identityIssuer !== 'https://accounts.google.com' || typeof p.subject !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(p.subject) ||
    authenticatedAt > (p.issuedAt as number) || authenticationExpiresAt <= now || authenticationExpiresAt <= authenticatedAt ||
    authenticationExpiresAt - authenticatedAt > IDENTITY_TTL.authenticationMaxAgeMs || (p.expiresAt as number) > authenticationExpiresAt) return invalid();
  verificationKey(policy, h.kid, c, p.issuedAt as number, now);
  const claims: SignedAssertionClaimsV1 = Object.freeze({ ...c, protocolVersion: 1, purpose: p.purpose, issuer: p.issuer as string,
    identityIssuer: p.identityIssuer, subject: p.subject, assertionId: hex(p.assertionId), transactionId: hex(p.transactionId),
    nonce: hex(p.nonce), browserProofBinding: hex(p.browserProofBinding), authenticatedAt, authenticationExpiresAt,
    issuedAt: p.issuedAt as number, expiresAt: p.expiresAt as number });
  return Object.freeze({ assertion: envelope.assertion, signingInput: parts[0] + '.' + parts[1],
    header: Object.freeze({ typ: h.typ, alg: h.alg, kid: h.kid }), claims });
}

declare const profileProof: unique symbol;
export interface VerifiedSignedAssertion {
  readonly data: { readonly claims: Readonly<SignedAssertionClaimsV1>; readonly keyId: string; readonly legacy: VerifiedBrokerAssertion;
    /** Exact verified bytes, transient only; never a receipt or log field. */ readonly assertion: string };
  readonly [profileProof]: true;
}
const capability = Object.freeze({});
class ProfileEvidence {
  readonly #proof = true;
  constructor(key: unknown, readonly data: VerifiedSignedAssertion['data']) {
    if (key !== capability) invalid(); Object.freeze(this);
  }
  static read(value: unknown): VerifiedSignedAssertion['data'] {
    if (!value || typeof value !== 'object' || !(#proof in value)) return invalid(); return value.data;
  }
}
/** Clock is a trusted port. Re-read AFTER verifier I/O; no stale pre-verification decision time. */
export function verifySignedAssertion(message: unknown, expected: IdentityApplicationContext, policyValue: SigningKeyPolicy,
  transactionValue: unknown, clock: () => number, verifier: ProfileSignatureVerificationPort): VerifiedSignedAssertion {
  try {
    const before = timestamp(clock()), parsed = validateCompactJws(message, expected, policyValue, before);
    const key = verificationKey(policyValue, parsed.header.kid, expected, parsed.claims.issuedAt, before);
    if (verifier.verify(parsed.assertion, key) !== true) return invalid();
    const after = timestamp(clock()); if (after < before) return invalid();
    validateCompactJws(message, expected, policyValue, after);
    const { protocolVersion: _version, ...claims } = parsed.claims;
    const legacy = verifyBrokerAssertion(message, expected, { brokerIssuer: policyValue.brokerIssuer,
      signature: { algorithm: 'RS256', keyId: parsed.header.kid } }, transaction(transactionValue, expected), after,
    { verify: () => ({ claims, signature: { algorithm: 'RS256', keyId: parsed.header.kid } }) });
    return new ProfileEvidence(capability, Object.freeze({ claims: parsed.claims, keyId: parsed.header.kid, legacy, assertion: parsed.assertion })) as unknown as VerifiedSignedAssertion;
  } catch { return invalid(); }
}
/** Provenance only. Call assertSignedAssertionLive before acceptance at a fresh trusted time. */
export function readSignedAssertion(value: unknown, expected: IdentityApplicationContext): VerifiedSignedAssertion['data'] {
  const data = ProfileEvidence.read(value); matchContext(data.claims, expected); return data;
}
export function assertSignedAssertionLive(value: unknown, expected: IdentityApplicationContext, policyValue: SigningKeyPolicy, now: number) {
  const data = readSignedAssertion(value, expected); readVerifiedAssertion(data.legacy, expected, now);
  if (data.claims.issuer !== signingKeyPolicy(policyValue).brokerIssuer) return invalid();
  verificationKey(policyValue, data.keyId, expected, data.claims.issuedAt, now); return data;
}
