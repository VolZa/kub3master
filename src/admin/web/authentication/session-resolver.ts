import type { StoredSession } from '../identity-contracts/session-store-contracts';
import { browserSessionCredential, hex, record, timestamp, validateSessionUse } from '../identity-contracts/validation';
import { sessionProvenanceKey, signingKeyPolicy } from '../identity-contracts/signing-key-policy';
import type { LocalAuthenticationPorts } from './ports';
import { ApplicationTrustBoundary, currentUser, denied } from './trust-boundaries';

declare const resolvedProof: unique symbol;
export interface ResolvedSession { readonly [resolvedProof]: true }
const construction = Object.freeze({});
class ResolutionEvidence {
  readonly #owner: object;
  constructor(key: unknown, owner: object, readonly credentialDigest: string) {
    if (key !== construction) denied(); this.#owner = owner; Object.freeze(this);
  }
  static read(value: unknown, owner: object): string {
    if (!value || typeof value !== 'object' || !(#owner in value) || value.#owner !== owner) return denied();
    return value.credentialDigest;
  }
}
/** Digest -> store capability -> authoritative reader -> current record/user/policy checks.
 * Never accepts a caller-provided session record as trusted. No raw bearer is retained. */
export class SessionResolver {
  private readonly trust: ApplicationTrustBoundary;
  private readonly owner = Object.freeze({});
  constructor(private readonly ports: LocalAuthenticationPorts) { this.trust = new ApplicationTrustBoundary(ports); }
  resolve(request: unknown): ResolvedSession {
    this.trust.check(); const credential = browserSessionCredential(request);
    const digest = hex(this.ports.digest.digest(credential.sessionCredential));
    if (digest === credential.sessionCredential) return denied();
    this.lookup(digest);
    // Runtime private field establishes provenance; this cast only exposes the opaque interface.
    return new ResolutionEvidence(construction, this.owner, digest) as unknown as ResolvedSession;
  }
  read(value: unknown): Readonly<StoredSession> {
    return this.lookup(ResolutionEvidence.read(value, this.owner));
  }
  private lookup(digest: string): Readonly<StoredSession> {
    const now = this.trust.check();
    const result = this.ports.sessions.readSession({ context: this.trust.context, credentialDigest: digest, decisionTime: now });
    if (result.status !== 'FOUND') return denied(); record(result, ['status', 'session']);
    const s = this.ports.trustedSessions.read(result.session, this.trust.check());
    // This validation supplements the authoritative capability reader; it never replaces provenance.
    record(s, ['environment', 'applicationAudience', 'expectedScriptId', 'identityIssuer', 'identitySubject', 'authenticatedAt',
      'authenticationExpiresAt', 'issuedAt', 'expiresAt', 'authorizationVersion', 'sessionId', 'status', 'revokedAt', 'revision', 'grantId', 'signingKey']);
    if (s.sessionId !== digest || !Number.isSafeInteger(s.revision) || s.revision < 0) return denied(); hex(s.grantId);
    const key = record(s.signingKey, ['protocolVersion', 'brokerIssuer', 'keyId', 'algorithm', 'assertionId', 'assertionIssuedAt']);
    if (key.protocolVersion !== 1 || key.algorithm !== 'RS256' || typeof key.keyId !== 'string') return denied();
    hex(key.assertionId); timestamp(key.assertionIssuedAt);
    if ((key.assertionIssuedAt as number) > s.issuedAt) return denied();
    const user = currentUser(this.ports.users, s.identityIssuer, s.identitySubject, s.authorizationVersion);
    const at = this.trust.check(), policy = signingKeyPolicy(this.ports.keyPolicy());
    if (policy.brokerIssuer !== key.brokerIssuer) return denied();
    sessionProvenanceKey(policy, key.keyId, this.trust.context, key.assertionIssuedAt as number);
    const { revision: _revision, grantId: _grant, signingKey: _key, ...legacy } = s;
    validateSessionUse(legacy, this.trust.context, user, at);
    return Object.freeze({ ...s, signingKey: Object.freeze({ ...s.signingKey }) });
  }
}
