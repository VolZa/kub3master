/** Application roles; ERP_OWNER is never inferred from Drive ownership or GAS execution identity.
 * TECHNOLOGIST is reserved and has no grants until its permission matrix is approved.
 */
export type Role = 'ERP_OWNER' | 'WORKSHOP_MANAGER' | 'TECHNOLOGIST';
export type Permission = 'REPORT_GENERATE' | 'REPORT_VIEW' | 'REPORT_SAVE' | 'REPORT_LIST' | 'REPORT_RENAME' | 'REPORT_DELETE' |
  'BOM_EDIT' | 'TECHNOLOGY_EDIT' | 'USER_MANAGE';
export interface UserIdentity { readonly issuer: 'https://accounts.google.com'; readonly subject: string; readonly expiresAt: number }
export interface User { issuer: string; subject: string; active: boolean; roles: readonly Role[]; authorizationVersion: number }
export interface UserRepository { find(issuer: string, subject: string): Readonly<User> | undefined }
export interface IdentityVerifier { verify(credential: unknown): UserIdentity }
const verifiedIdentities = new WeakSet<object>();
/** Trusted adapter boundary only; never expose as a GAS entrypoint or deserialize as proof. */
export function verifiedIdentity(issuer: string, subject: string, expiresAt: number): UserIdentity {
  if (issuer !== 'https://accounts.google.com' || !subject || !Number.isFinite(expiresAt)) throw new Error('ACCESS_DENIED');
  const identity: UserIdentity = Object.freeze({ issuer, subject, expiresAt }); verifiedIdentities.add(identity); return identity;
}
const reportPermissions: readonly Permission[] = ['REPORT_GENERATE', 'REPORT_VIEW', 'REPORT_SAVE', 'REPORT_LIST', 'REPORT_RENAME', 'REPORT_DELETE'];
export class PermissionService {
  constructor(private readonly users: UserRepository, private readonly now: () => number = Date.now) {}
  require(identity: UserIdentity | undefined, permission: Permission): Readonly<User> {
    if (!identity || !verifiedIdentities.has(identity) || identity.expiresAt <= this.now()) throw new Error('ACCESS_DENIED');
    const user = this.users.find(identity.issuer, identity.subject);
    if (!user?.active || !Array.isArray(user.roles) || user.issuer !== identity.issuer || user.subject !== identity.subject) throw new Error('ACCESS_DENIED');
    const granted = user.roles.includes('ERP_OWNER') && [...reportPermissions, 'BOM_EDIT', 'TECHNOLOGY_EDIT', 'USER_MANAGE'].includes(permission) ||
      user.roles.includes('WORKSHOP_MANAGER') && reportPermissions.includes(permission);
    if (!granted) throw new Error('ACCESS_DENIED');
    return user;
  }
}
export class SecurityBoundary {
  constructor(private readonly verifier: IdentityVerifier, private readonly permissions: PermissionService) {}
  invoke<T>(credential: unknown, permission: Permission, operation: () => T): T {
    let identity: UserIdentity;
    try { identity = this.verifier.verify(credential); } catch { throw new Error('ACCESS_DENIED'); }
    this.permissions.require(identity, permission);
    return operation();
  }
}
/** Production must remain denied until a trusted verifier/session adapter is approved. */
export const unconfiguredIdentityVerifier: IdentityVerifier = { verify() { throw new Error('ACCESS_DENIED'); } };

/** Server-handler adapter: ignores all client identity/role fields, accepts only verifier credential. */
export function securedHandler<T>(boundary: SecurityBoundary, permission: Permission, operation: (payload: unknown) => T) {
  return (request: { credential?: unknown; payload?: unknown }) => boundary.invoke(request?.credential, permission, () => operation(request?.payload));
}
