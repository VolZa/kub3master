import { PermissionService, verifiedIdentity, type Permission } from '../../../security/permission-service';
import { matchContext } from '../identity-contracts/validation';
import type { LocalAuthenticationPorts } from './ports';
import { ApplicationTrustBoundary, currentUser } from './trust-boundaries';
import { SessionResolver, type ResolvedSession } from './session-resolver';

/** Server-selected permission only. No generic RPC/handler dispatch or browser role assignment. */
export class SessionAuthorizationAdapter {
  private readonly trust: ApplicationTrustBoundary;
  constructor(private readonly resolver: SessionResolver, private readonly ports: LocalAuthenticationPorts) {
    this.trust = new ApplicationTrustBoundary(ports);
  }
  async require(resolved: ResolvedSession, permission: Permission): Promise<void> {
    if (!this.ports.verifier) throw Error('ACCESS_DENIED');
    this.ports.verifier.assertConfigured();
    this.trust.check(); const session = await this.resolver.read(resolved);
    matchContext(session, this.trust.context);
    // Only AFTER authoritative provenance resolution bridge to PermissionService's WeakSet brand.
    // A TypeScript cast or public DTO cannot pass the resolver boundary above.
    const identity = verifiedIdentity(session.identityIssuer, session.identitySubject, session.expiresAt);
    const permissions = new PermissionService({ find: (issuer, subject) =>
      currentUser(this.ports.users, issuer, subject, session.authorizationVersion) }, () => this.trust.check(), this.trust.context.environment);
    permissions.require(identity, permission);
    const current = await this.resolver.read(resolved); // Fresh async revocation/policy check.
    if (current.sessionId !== session.sessionId || current.identityIssuer !== session.identityIssuer ||
      current.identitySubject !== session.identitySubject || current.authorizationVersion !== session.authorizationVersion ||
      current.revision !== session.revision || current.grantId !== session.grantId || current.expiresAt !== session.expiresAt ||
      current.issuedAt !== session.issuedAt || current.authenticatedAt !== session.authenticatedAt ||
      current.authenticationExpiresAt !== session.authenticationExpiresAt ||
      Object.keys(session.signingKey).some(field => current.signingKey[field as keyof typeof session.signingKey] !==
        session.signingKey[field as keyof typeof session.signingKey]))
      throw Error('ACCESS_DENIED');
    // Permissions can change during the await. The final decision uses current repository data.
    permissions.require(identity, permission);
  }
  async authorize(request: unknown, permission: Permission): Promise<{ readonly status: 'AUTHORIZED' | 'DENIED' }> {
    try { await this.require(await this.resolver.resolve(request), permission); return { status: 'AUTHORIZED' }; }
    catch { return { status: 'DENIED' }; }
  }
}
