import { isRole, ROLES, type Role } from '../permission-service';
import { BD2_PROFILE, type Bd2Context, type Bd2User, type Bd2Session,
  type CanonicalPrincipal, type CapturedSessionPolicy, type SessionPolicyConfig } from './contracts';

export function denied(): never { throw new Error('ACCESS_DENIED'); }
/** Exact own data fields only. Never invoke DTO getters or retain mutable input objects. */
export function data(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) denied();
  const descriptors = Object.getOwnPropertyDescriptors(value), own = Reflect.ownKeys(descriptors);
  if (own.length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(descriptors, k)) || own.some(k =>
    typeof k !== 'string' || !keys.includes(k) || !Object.prototype.hasOwnProperty.call(descriptors[k], 'value') || !descriptors[k].enumerable)) denied();
  return Object.fromEntries(keys.map(k => [k, descriptors[k].value]));
}
function checked<T>(read: () => T): T { try { return read(); } catch { return denied(); } }
export function integer(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) denied();
  return value;
}
function timestamp(value: unknown): number { return integer(value, 1); }
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) denied(); return value;
}
function principal(value: unknown): CanonicalPrincipal {
  const p = data(value, ['issuer', 'sub']);
  if (p.issuer !== 'https://accounts.google.com' || typeof p.sub !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(p.sub)) denied();
  return Object.freeze({ issuer: 'https://accounts.google.com', sub: p.sub });
}
function context(value: unknown): Bd2Context {
  const c = data(value, ['environment', 'applicationAudience', 'expectedScriptId']);
  if ((c.environment !== 'TEST' && c.environment !== 'PRODUCTION') || typeof c.applicationAudience !== 'string' ||
    !/^[A-Za-z0-9._:/-]{1,200}$/.test(c.applicationAudience) || typeof c.expectedScriptId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(c.expectedScriptId)) denied();
  return Object.freeze({ environment: c.environment, applicationAudience: c.applicationAudience, expectedScriptId: c.expectedScriptId });
}
function header(r: Record<string, unknown>, expected: Bd2Context) {
  const c = context(r.context), target = context(expected);
  if (r.profile !== BD2_PROFILE || r.schemaVersion !== 1 || c.environment !== target.environment ||
    c.applicationAudience !== target.applicationAudience || c.expectedScriptId !== target.expectedScriptId) denied();
  return { profile: BD2_PROFILE, schemaVersion: 1, context: c } as const;
}
function roles(value: unknown): readonly Role[] {
  if (!Array.isArray(value)) denied();
  const descriptors = Object.getOwnPropertyDescriptors(value as object);
  const size = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(size) || size < 0 || size > ROLES.length || Reflect.ownKeys(descriptors).length !== size + 1) denied();
  const result: Role[] = [];
  for (let i = 0; i < size; i++) {
    const item = descriptors[String(i)];
    if (!item || !Object.prototype.hasOwnProperty.call(item, 'value') || !item.enumerable || !isRole(item.value)) denied();
    result.push(item.value);
  }
  if (new Set(result).size !== result.length) denied();
  return Object.freeze(result); // Empty roles are data; the unchanged PermissionService denies them.
}
function policy(r: Record<string, unknown>): CapturedSessionPolicy {
  const idle = integer(r.idleTimeoutMinutes, 30);
  if (idle > 360 || r.absoluteTimeoutMinutes !== 720) denied();
  return Object.freeze({ policyVersion: integer(r.policyVersion, 1), idleTimeoutMinutes: idle, absoluteTimeoutMinutes: 720 });
}
export function validateCanonicalPrincipal(value: unknown): CanonicalPrincipal { return checked(() => principal(value)); }
export function validateBd2Context(value: unknown): Bd2Context { return checked(() => context(value)); }
export function validateBd2User(value: unknown, expected: Bd2Context): Bd2User {
  return checked(() => {
    const r = data(value, ['profile', 'schemaVersion', 'context', 'principal', 'active', 'roles', 'authorizationVersion', 'revision']);
    if (typeof r.active !== 'boolean') denied();
    return Object.freeze({ ...header(r, expected), principal: principal(r.principal), active: r.active, roles: roles(r.roles),
      authorizationVersion: integer(r.authorizationVersion, 0), revision: integer(r.revision, 0) });
  });
}
export function validateSessionPolicyConfig(value: unknown, expected: Bd2Context): SessionPolicyConfig {
  return checked(() => {
    const r = data(value, ['profile', 'schemaVersion', 'context', 'policyVersion', 'idleTimeoutMinutes',
      'absoluteTimeoutMinutes', 'appliesTo', 'updatedAtMs', 'updatedBy']);
    if (r.appliesTo !== 'NEW_SESSIONS_ONLY') denied();
    return Object.freeze({ ...header(r, expected), ...policy(r), appliesTo: 'NEW_SESSIONS_ONLY',
      updatedAtMs: timestamp(r.updatedAtMs), updatedBy: principal(r.updatedBy) });
  });
}
/** Pure arithmetic on validated data. Not a clock, persistence or continuation proof. */
export function effectiveSessionExpiry(session: Bd2Session): number {
  const hard = session.createdAtMs + session.policySnapshot.absoluteTimeoutMinutes * 60_000;
  const idle = session.lastEligibleActivityAtMs + session.policySnapshot.idleTimeoutMinutes * 60_000;
  timestamp(hard); timestamp(idle); return Math.min(hard, idle);
}
export function validateBd2Session(value: unknown, expected: Bd2Context): Bd2Session {
  return checked(() => {
    const r = data(value, ['profile', 'schemaVersion', 'context', 'sessionDigest', 'createOperationId', 'principal',
      'createdAtMs', 'lastEligibleActivityAtMs', 'policySnapshot', 'authorizationVersionAtIssue', 'revision', 'status', 'revokedAtMs']);
    const captured = policy(data(r.policySnapshot, ['policyVersion', 'idleTimeoutMinutes', 'absoluteTimeoutMinutes']));
    const s = timestamp(r.createdAtMs), a = timestamp(r.lastEligibleActivityAtMs);
    if (a < s || a >= s + captured.absoluteTimeoutMinutes * 60_000 ||
      (r.status !== 'ACTIVE' && r.status !== 'EXPIRED' && r.status !== 'REVOKED')) denied();
    let revokedAtMs: number | null = null;
    if (r.status === 'REVOKED') { revokedAtMs = timestamp(r.revokedAtMs); if (revokedAtMs < s) denied(); }
    else if (r.revokedAtMs !== null) denied();
    const result: Bd2Session = Object.freeze({ ...header(r, expected), sessionDigest: digest(r.sessionDigest),
      createOperationId: digest(r.createOperationId), principal: principal(r.principal), createdAtMs: s,
      lastEligibleActivityAtMs: a, policySnapshot: captured, authorizationVersionAtIssue: integer(r.authorizationVersionAtIssue, 0),
      revision: integer(r.revision, 0), status: r.status, revokedAtMs });
    effectiveSessionExpiry(result); return result;
  });
}
