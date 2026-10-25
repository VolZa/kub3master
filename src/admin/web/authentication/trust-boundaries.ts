import type { IdentityApplicationContext } from '../identity-contracts/contracts';
import { context, matchContext, timestamp } from '../identity-contracts/validation';
import { isRole, type User, type UserRepository } from '../../../security/permission-service';
import type { ApplicationTrustPorts } from './ports';

export function denied(): never { throw Error('ACCESS_DENIED'); }
export class ApplicationTrustBoundary {
  readonly context: Readonly<IdentityApplicationContext>;
  private lastTime = 0;
  constructor(private readonly ports: ApplicationTrustPorts) { this.context = context(ports.expectedContext); }
  check(): number {
    matchContext(context(this.ports.currentContext()), this.context);
    const now = timestamp(this.ports.clock()); if (now < this.lastTime) return denied(); this.lastTime = now; return now;
  }
}
/** Authoritative current directory only. Email is not used; no role/permission browser input. */
export function currentUser(users: UserRepository, issuer: string, subject: string, version?: number): Readonly<User> {
  const user = users.find(issuer, subject);
  if (!user || issuer !== 'https://accounts.google.com' || user.issuer !== issuer || user.subject !== subject ||
    user.active !== true || !Number.isSafeInteger(user.authorizationVersion) || user.authorizationVersion < 0 ||
    version !== undefined && user.authorizationVersion !== version || !Array.isArray(user.roles) || !user.roles.length ||
    !user.roles.every(isRole) || new Set(user.roles).size !== user.roles.length) return denied();
  return Object.freeze({ issuer, subject, active: true, authorizationVersion: user.authorizationVersion,
    roles: Object.freeze([...user.roles]) });
}
