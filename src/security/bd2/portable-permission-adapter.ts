import { PERMISSIONS, PermissionService, verifiedIdentity, type Permission, type User } from '../permission-service';
import type { Bd2Context } from './contracts';
import { data, denied, integer, validateBd2Context, validateBd2Session, validateBd2User,
  validateSessionPolicyConfig, effectiveSessionExpiry } from './validation';

/** Trusted server injection only. Authenticate handle provenance and read CURRENT authoritative
 * session/user/policy. Never treat browser DTO shape as evidence. No production reader here;
 * this interface cannot authenticate a lying server adapter or prove snapshot/clock ordering. */
export interface TrustedBd2AuthorizationReader { read(handle: unknown): Promise<unknown> }
export interface PortablePermissionAdapter { require(handle: unknown, permission: unknown): Promise<void> }
export interface PortablePermissionAdapterOptions {
  readonly expectedContext: Bd2Context;
  readonly reader: TrustedBd2AuthorizationReader;
  readonly now: () => number;
}
const unconfigured = (): PortablePermissionAdapter => Object.freeze({ async require() { return denied(); } });
/** Local read-only permission decision, not admission/issuance/activity or a transferable capability.
 * All legacy identity construction stays private and uses the SAME core module instance. */
export function createPortablePermissionAdapter(options?: PortablePermissionAdapterOptions): PortablePermissionAdapter {
  let expected: Bd2Context, read: TrustedBd2AuthorizationReader['read'], now: () => number;
  try {
    const o = data(options, ['expectedContext', 'reader', 'now']);
    expected = validateBd2Context(o.expectedContext);
    const reader = o.reader as TrustedBd2AuthorizationReader;
    if (!reader || typeof reader.read !== 'function' || typeof o.now !== 'function') return unconfigured();
    read = reader.read.bind(reader); now = o.now as () => number;
  } catch { return unconfigured(); }
  let highWater = 0;
  function time(): number {
    const at = integer(now(), 1); if (at < highWater) return denied(); highWater = at; return at;
  }
  return Object.freeze({
    async require(handle: unknown, permission: unknown): Promise<void> {
      try {
        if (handle === null || handle === undefined || !(PERMISSIONS as readonly unknown[]).includes(permission)) denied();
        time();
        const raw = data(await read(handle), ['user', 'session', 'currentPolicy']);
        // Detach every nested input before the injected clock/any later work can mutate it.
        const user = validateBd2User(raw.user, expected), session = validateBd2Session(raw.session, expected);
        validateSessionPolicyConfig(raw.currentPolicy, expected); // No missing-config fallback; no snapshot replacement.
        const at = time(), expiry = effectiveSessionExpiry(session);
        if (!user.active || session.status !== 'ACTIVE' || user.principal.issuer !== session.principal.issuer ||
          user.principal.sub !== session.principal.sub || user.authorizationVersion !== session.authorizationVersionAtIssue ||
          session.createdAtMs > at || session.lastEligibleActivityAtMs > at || at >= expiry) denied();
        const projection: Readonly<User> = Object.freeze({ issuer: user.principal.issuer, subject: user.principal.sub,
          active: user.active, roles: user.roles, authorizationVersion: user.authorizationVersion });
        const identity = verifiedIdentity(session.principal.issuer, session.principal.sub, expiry);
        const core = new PermissionService({ find: (issuer, subject) =>
          issuer === projection.issuer && subject === projection.subject ? projection : undefined }, time, expected.environment);
        core.require(identity, permission as Permission);
      } catch { return denied(); }
    },
  });
}
