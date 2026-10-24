/** Application roles only; never inferred from position, Drive ownership or GAS execution identity. */
export const ROLES = ['ADMIN', 'MANAGER'] as const;
export type Role = typeof ROLES[number];
export const isRole = (role: unknown): role is Role => role === 'ADMIN' || role === 'MANAGER';
export type SecurityEnvironment = 'PRODUCTION' | 'TEST';
export const REPORT_PERMISSIONS = ['REPORT_GENERATE', 'REPORT_VIEW', 'REPORT_SAVE', 'REPORT_LIST', 'REPORT_RENAME', 'REPORT_DELETE'] as const;
/** Explicit grants only. Defining these permissions does NOT enable a held/unintegrated RPC. */
export const OPERATIONAL_PERMISSIONS = [
  'MANUFACTURING_VIEW', 'MANUFACTURING_CREATE', 'MANUFACTURING_SYNC_ANALYZE', 'MANUFACTURING_SYNC_EXECUTE',
  'PLANNING_VIEW', 'PLANNING_CREATE_DRAFT', 'PLANNING_ADD_PLACEMENT', 'PLANNING_REMOVE_PLACEMENT',
  'PLANNING_APPROVE', 'PLANNING_REOPEN', 'PLANNING_SCHEDULE_PLACEMENT',
] as const;
export const PERMISSIONS = [...REPORT_PERMISSIONS, ...OPERATIONAL_PERMISSIONS, 'BOM_EDIT', 'TECHNOLOGY_EDIT', 'USER_MANAGE'] as const;
export type Permission = typeof PERMISSIONS[number];
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
export class PermissionService {
  constructor(private readonly users: UserRepository, private readonly now: () => number = Date.now,
    private readonly environment: SecurityEnvironment = 'PRODUCTION') {}
  require(identity: UserIdentity | undefined, permission: Permission): Readonly<User> {
    if (!['PRODUCTION', 'TEST'].includes(this.environment) || !(PERMISSIONS as readonly string[]).includes(permission) ||
      !identity || !verifiedIdentities.has(identity) || identity.expiresAt <= this.now()) throw new Error('ACCESS_DENIED');
    const user = this.users.find(identity.issuer, identity.subject);
    if (user?.active !== true || !Array.isArray(user.roles) || !user.roles.length || !user.roles.every(isRole) ||
      new Set(user.roles).size !== user.roles.length || user.issuer !== identity.issuer || user.subject !== identity.subject) throw new Error('ACCESS_DENIED');
    const granted = user.roles.includes('ADMIN') || this.environment === 'PRODUCTION' && user.roles.includes('MANAGER') &&
      ([...REPORT_PERMISSIONS, ...OPERATIONAL_PERMISSIONS] as readonly string[]).includes(permission);
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
