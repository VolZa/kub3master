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
  require(resolved: ResolvedSession, permission: Permission): void {
    if (!this.ports.verifier) throw Error('ACCESS_DENIED');
    this.ports.verifier.assertConfigured();
    this.trust.check(); const session = this.resolver.read(resolved);
    matchContext(session, this.trust.context);
    // Only AFTER authoritative provenance resolution bridge to PermissionService's WeakSet brand.
    // A TypeScript cast or public DTO cannot pass the resolver boundary above.
    const identity = verifiedIdentity(session.identityIssuer, session.identitySubject, session.expiresAt);
    const permissions = new PermissionService({ find: (issuer, subject) =>
      currentUser(this.ports.users, issuer, subject, session.authorizationVersion) }, () => this.trust.check(), this.trust.context.environment);
    permissions.require(identity, permission);
    this.resolver.read(resolved); // Recheck revocation/policy after the current directory permission read.
  }
  authorize(request: unknown, permission: Permission): { readonly status: 'AUTHORIZED' | 'DENIED' } {
    try { this.require(this.resolver.resolve(request), permission); return { status: 'AUTHORIZED' }; }
    catch { return { status: 'DENIED' }; }
  }
}
