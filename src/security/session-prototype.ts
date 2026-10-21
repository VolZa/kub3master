import { IdentityPrototype } from './identity-prototype';
import { PermissionService, verifiedIdentity, type Permission, type UserIdentity, type UserRepository } from './permission-service';

export interface SessionRecord {
  issuer: 'https://accounts.google.com'; subject: string; authorizationVersion: number;
  expiresAt: number;
}
/** Store keys are SHA-256 digests, never raw session secrets. No roles are stored in sessions. */
export interface SessionStore {
  create(key: string, record: Readonly<SessionRecord>): void;
  read(key: string): Readonly<SessionRecord> | undefined;
  revoke(key: string): void;
}
export interface RequestTicket {
  sessionKey: string; permission: Permission; payloadHash: string; expiresAt: number;
}
export interface RequestTicketStore {
  create(key: string, ticket: Readonly<RequestTicket>): void;
  /** Atomic match-and-consume; false on absent, expired or mismatched ticket. */
  consume(key: string, expected: Readonly<RequestTicket>, now: number): boolean;
}
export interface SessionCrypto {
  /** At least 256 CSPRNG bits, encoded as 64 lowercase hex digits. No Math.random/UUID fallback. */
  secret(): string;
  sha256(value: string): string;
}
const deny = (): never => { throw new Error('ACCESS_DENIED'); };
const isSecret = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Isolated composition only. Not imported/registered by production; no real GAS stores or RNG yet. */
export class SessionPrototype {
  private readonly permissions: PermissionService;
  constructor(private readonly users: UserRepository, private readonly sessions: SessionStore,
    private readonly tickets: RequestTicketStore, private readonly crypto: SessionCrypto,
    private readonly now: () => number = Date.now) {
    this.permissions = new PermissionService(users, now);
  }
  login(controller: IdentityPrototype, challengeId: string, binding: string, credential: string) {
    return this.issue(controller.complete(challengeId, binding, credential));
  }
  /** Trusted verifier output only; PermissionService enforces runtime identity provenance. */
  issue(identity: UserIdentity): { session: string; expiresAt: number } {
    const user = this.permissions.require(identity, 'REPORT_VIEW');
    if (!Number.isSafeInteger(user.authorizationVersion) || user.authorizationVersion < 0) return deny();
    const session = this.newSecret(), expiresAt = Math.min(identity.expiresAt, this.now() + 15 * 60_000);
    this.sessions.create(this.key(session), Object.freeze({ issuer: identity.issuer, subject: identity.subject,
      authorizationVersion: user.authorizationVersion, expiresAt }));
    return { session, expiresAt };
  }
  private newSecret(): string { const value = this.crypto.secret(); return isSecret(value) ? value : deny(); }
  private key(secret: unknown): string {
    if (!isSecret(secret)) return deny();
    const digest = this.crypto.sha256(secret); return isSecret(digest) ? digest : deny();
  }
  private resolve(session: unknown, permission: Permission) {
    const key = this.key(session), record = this.sessions.read(key);
    if (!record || record.issuer !== 'https://accounts.google.com' || !record.subject ||
      !Number.isFinite(record.expiresAt) || record.expiresAt <= this.now()) return deny();
    const identity = verifiedIdentity(record.issuer, record.subject, record.expiresAt);
    const user = this.permissions.require(identity, permission);
    if (!Number.isSafeInteger(record.authorizationVersion) || user.authorizationVersion !== record.authorizationVersion) return deny();
    return { key, record, identity };
  }
  ticket(session: unknown, permission: Permission, payloadHash: string) {
    if (!isSecret(payloadHash)) return deny();
    const { key, record } = this.resolve(session, permission), ticket = this.newSecret();
    const expiresAt = Math.min(record.expiresAt, this.now() + 60_000);
    this.tickets.create(this.key(ticket), Object.freeze({ sessionKey: key, permission, payloadHash, expiresAt }));
    return { ticket, expiresAt };
  }
  /** Caller supplies a SERVER-computed hash of fixed handler name + canonical validated payload.
   * Never dispatch a browser-selected permission/function. Consume BEFORE callback; never retry on error.
   */
  invoke<T>(session: unknown, ticket: unknown, ticketExpiresAt: number, permission: Permission,
    payloadHash: string, operation: (identity: UserIdentity) => T): T {
    if (!isSecret(payloadHash) || !Number.isFinite(ticketExpiresAt) || ticketExpiresAt <= this.now()) return deny();
    const { key, record, identity } = this.resolve(session, permission);
    if (ticketExpiresAt > Math.min(record.expiresAt, this.now() + 60_000)) return deny();
    if (!this.tickets.consume(this.key(ticket), { sessionKey: key, permission, payloadHash, expiresAt: ticketExpiresAt }, this.now())) return deny();
    return operation(identity);
  }
  logout(session: unknown): void { this.sessions.revoke(this.key(session)); }
}
