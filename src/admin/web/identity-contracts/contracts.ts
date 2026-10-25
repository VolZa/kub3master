import type { AdminEnvironment } from '../contracts';

/** All times are Unix milliseconds supplied by a trusted clock, never read implicitly. */
export interface IdentityApplicationContext {
  readonly environment: AdminEnvironment;
  readonly applicationAudience: string;
  readonly expectedScriptId: string;
}
export const IDENTITY_TTL = Object.freeze({ transactionMs: 120_000, assertionMs: 20_000,
  grantMs: 30_000, sessionMs: 900_000, authenticationMaxAgeMs: 3_600_000 });
export type LoginTransactionStatus = 'CREATED' | 'BOUND' | 'VERIFYING' | 'VERIFIED' | 'CONSUMED' | 'FAILED' | 'EXPIRED';
export interface LoginTransaction extends IdentityApplicationContext {
  readonly transactionId: string;
  readonly browserProofBinding: string;
  readonly nonce: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly status: LoginTransactionStatus;
  readonly updatedAt: number;
  readonly consumedAt: number | null;
}
export interface UnverifiedBrokerAssertion { readonly assertion: string }
export type SignatureAlgorithm = 'HS256' | 'RS256';
export interface SignatureMetadata { readonly algorithm: SignatureAlgorithm; readonly keyId: string }
export interface BrokerVerificationPolicy {
  readonly brokerIssuer: string;
  readonly signature: SignatureMetadata;
}
/** Everything in these claims, including upstream authentication times, MUST be signature-covered. */
export interface BrokerAssertionClaims extends IdentityApplicationContext {
  readonly purpose: 'ADMIN_WEB_LOGIN_V1';
  readonly issuer: string;
  readonly identityIssuer: 'https://accounts.google.com';
  readonly subject: string;
  readonly authenticatedAt: number;
  readonly authenticationExpiresAt: number;
  readonly transactionId: string;
  readonly nonce: string;
  readonly browserProofBinding: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly assertionId: string;
}
/** Trusted server injection only. Must verify exact bytes, signature, pinned algorithm/key and header
 * before returning decoded claims. A decoded JWT or browser {verified:true} is never this port.
 * No crypto, key lookup, network or adapter implementation is supplied in Slice 2A.
 */
export interface BrokerSignatureVerificationPort {
  verify(message: Readonly<UnverifiedBrokerAssertion>, policy: Readonly<BrokerVerificationPolicy>):
    { readonly claims: unknown; readonly signature: unknown } | undefined;
}
declare const assertionProof: unique symbol;
declare const identityProof: unique symbol;
declare const grantProof: unique symbol;
export interface VerifiedBrokerAssertion {
  readonly kind: 'VERIFIED_ASSERTION';
  readonly data: { readonly claims: BrokerAssertionClaims; readonly signature: SignatureMetadata; readonly verifiedAt: number };
  readonly [assertionProof]: true;
}
export interface VerifiedIdentityContext {
  readonly kind: 'VERIFIED_IDENTITY';
  readonly data: IdentityApplicationContext & {
    readonly identityIssuer: 'https://accounts.google.com'; readonly identitySubject: string;
    readonly authenticatedAt: number; readonly authenticationExpiresAt: number;
    readonly provenance: 'OIDC_BROKER_ASSERTION_V1';
  };
  readonly [identityProof]: true;
}
export interface TrustedLoginGrant {
  readonly kind: 'TRUSTED_LOGIN_GRANT';
  readonly data: IdentityApplicationContext & {
    readonly grantId: string; readonly transactionId: string; readonly assertionId: string;
    readonly identity: VerifiedIdentityContext; readonly issuedAt: number; readonly expiresAt: number;
  };
  readonly [grantProof]: true;
}
/** State read from a future authoritative store. Never accept it in a browser request. */
export interface LoginGrantState extends IdentityApplicationContext {
  readonly grantId: string;
  readonly status: 'AVAILABLE' | 'CONSUMED';
  readonly consumedAt: number | null;
}
export interface SessionIssuePlan extends IdentityApplicationContext {
  readonly identityIssuer: 'https://accounts.google.com'; readonly identitySubject: string;
  readonly authenticatedAt: number; readonly authenticationExpiresAt: number;
  readonly issuedAt: number; readonly expiresAt: number; readonly authorizationVersion: number;
}
/** Authoritative server record; sessionId is an opaque lookup identifier/digest, NOT the raw secret. */
export interface AdminSessionRecord extends SessionIssuePlan {
  readonly sessionId: string;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly revokedAt: number | null;
}
/** Raw bearer lives only in browser memory and authenticated RPC body, never URL/storage/logs. */
export interface BrowserSessionCredential { readonly sessionCredential: string }
export interface BrowserLoginBeginRequest { readonly browserProofBinding: string }
export interface BrowserLoginCompleteRequest { readonly transactionId: string; readonly browserProof: string }
export interface PublicSessionStatus {
  readonly environment: AdminEnvironment;
  readonly status: 'NOT_CONNECTED' | 'AUTHENTICATED' | 'BLOCKED' | 'EXPIRED' | 'REVOKED';
  readonly authenticated: boolean;
  readonly expiresAt: number | null;
}
