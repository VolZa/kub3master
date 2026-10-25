import { type IdentityApplicationContext, type LoginTransaction, type TrustedLoginGrant } from './contracts';
import { context, matchContext, record, hex, timestamp, invalid, transaction, addTime, validateSessionUse } from './validation';
import { transitionLoginTransaction, availableGrantState, planGrantRedemption } from './lifecycle';
import { createTrustedLoginGrant, readTrustedLoginGrant } from './verification';
import { readSignedAssertion, assertSignedAssertionLive } from './signed-assertion-profile';
import { signingKeyPolicy, verificationKey, sessionProvenanceKey, type SigningKeyPolicy } from './signing-key-policy';
import { atomicCommandMaterial, type AtomicCommand, type AtomicOutcome, type AtomicStatus, type AtomicLoginStorePort,
  type AcceptAssertionCommand, type ConsumeGrantCommand, type OperationLookup, type OperationReceipt, type GrantRecord,
  type VersionedLoginTransaction, type CommandDigestPort } from './atomic-store-contracts';
import { type StoredSession, type TrustedStoredSession, type SessionStorePort, type SessionLookup, type SessionLookupOutcome,
  type RevokeSessionCommand, type CurrentDirectoryUser, type SessionCapacityPolicy } from './session-store-contracts';

export type ReferenceFault = 'UNAVAILABLE' | 'AFTER_TRANSACTION' | 'AFTER_ASSERTION' | 'AFTER_GRANT' |
  'AFTER_SESSION' | 'AFTER_RECEIPT' | 'BEFORE_COMMIT' | 'AFTER_COMMIT';
export interface ReferenceModelPorts {
  readonly context: IdentityApplicationContext;
  readonly clock: () => number;
  readonly keyPolicy: () => SigningKeyPolicy;
  readonly directory: (issuer: string, subject: string) => CurrentDirectoryUser | undefined;
  readonly digest: CommandDigestPort;
  readonly capacity: SessionCapacityPolicy;
  /** Test-controlled scheduling point AFTER snapshot work, BEFORE compare/commit. */
  readonly beforeCommit?: () => Promise<void>;
}
class Denied { constructor(readonly status: Exclude<AtomicStatus, 'COMMITTED'>) {} }
function deny(status: Exclude<AtomicStatus, 'COMMITTED'>): never { throw new Denied(status); }
const revision = (v: unknown): number => {
  if (!Number.isSafeInteger(v) || (v as number) < 0) return invalid(); return v as number;
};
const outcome = (error: unknown): AtomicOutcome => ({ status: error instanceof Denied ? error.status : 'INVALID' });
const lookupKeys = ['context', 'credentialDigest', 'decisionTime'];
const baseKeys = ['context', 'operationId', 'commandDigest', 'expectedRevision', 'decisionTime'];
const sessionCapability = Object.freeze({});
class StoredEvidence {
  readonly #owner: object;
  constructor(capability: unknown, owner: object, readonly record: Readonly<StoredSession>) {
    if (capability !== sessionCapability) invalid(); this.#owner = owner; Object.freeze(this);
  }
  static read(value: unknown, owner: object): Readonly<StoredSession> {
    if (!value || typeof value !== 'object' || !(#owner in value) || value.#owner !== owner) return invalid(); return value.record;
  }
}
interface ModelGrant { readonly record: Readonly<GrantRecord>; readonly evidence: TrustedLoginGrant }
interface State {
  transactions: Map<string, VersionedLoginTransaction>;
  assertions: Map<string, number>;
  grants: Map<string, ModelGrant>;
  sessions: Map<string, Readonly<StoredSession>>;
  receipts: Map<string, Readonly<OperationReceipt>>;
}
/** LOCAL TEST MODEL ONLY. Optimistic serializable snapshots + one synchronous state swap.
 * No persistence, distributed coordination, crypto, RNG, Google APIs or implicit clock.
 * Session/grant provenance is request/process-local; this is NOT a durable restore adapter. */
export class AtomicStoreReferenceModel implements AtomicLoginStorePort, SessionStorePort {
  private readonly expected: Readonly<IdentityApplicationContext>;
  private readonly limits: Readonly<SessionCapacityPolicy>;
  private readonly owner = Object.freeze({});
  private state: State = { transactions: new Map(), assertions: new Map(), grants: new Map(), sessions: new Map(), receipts: new Map() };
  private epoch = 0;
  private lastDecision = 0;
  private fault: ReferenceFault | undefined;
  private unavailable = false;
  constructor(private readonly ports: ReferenceModelPorts) {
    this.expected = context(ports.context);
    const p = record(ports.capacity, ['maxTransactions', 'maxGrants', 'maxSessions', 'maxReceipts', 'maxSessionsPerSubject', 'receiptRetentionMs', 'cleanupBatchSize']);
    for (const value of Object.values(p)) if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
    this.limits = Object.freeze({ ...ports.capacity });
  }
  /** Fixture-only authoritative seeding; never an RPC or arbitrary restore operation. */
  seedTransaction(value: LoginTransaction, expectedRevision = 0): void {
    const tx = transaction(value, this.expected), rev = revision(expectedRevision);
    if (tx.status !== 'VERIFYING' || this.state.transactions.has(tx.transactionId) ||
      this.state.transactions.size >= this.limits.maxTransactions) invalid();
    this.state.transactions.set(tx.transactionId, Object.freeze({ record: tx, revision: rev })); this.epoch++;
  }
  setAvailable(available: boolean): void { this.unavailable = !available; }
  failNext(fault: ReferenceFault): void { this.fault = fault; }
  private time(decisionTime: number): number {
    if (this.unavailable) deny('UNAVAILABLE');
    const now = timestamp(this.ports.clock()); timestamp(decisionTime);
    if (decisionTime !== now || now < this.lastDecision) deny('INVALID'); return now;
  }
  private application(value: IdentityApplicationContext): void {
    try { matchContext(value, this.expected); } catch { deny('CONTEXT_MISMATCH'); }
  }
  private base(command: AtomicCommand): number {
    this.application(command.context); hex(command.operationId); hex(command.commandDigest); revision(command.expectedRevision);
    return this.time(command.decisionTime);
  }
  private prior(command: AtomicCommand | OperationLookup): AtomicOutcome | undefined {
    const prior = this.state.receipts.get(command.operationId);
    if (!prior) return undefined;
    if (prior.commandDigest !== command.commandDigest) deny('CONFLICT');
    return { status: 'COMMITTED', receipt: prior, recovered: true };
  }
  private snapshot(): State {
    return { transactions: new Map(this.state.transactions), assertions: new Map(this.state.assertions),
      grants: new Map(this.state.grants), sessions: new Map(this.state.sessions), receipts: new Map(this.state.receipts) };
  }
  private checkpoint(fault: ReferenceFault | undefined, point: ReferenceFault): void { if (fault === point) deny('UNAVAILABLE'); }
  private checkDigest(command: AcceptAssertionCommand | ConsumeGrantCommand): void {
    if (hex(this.ports.digest.digest(atomicCommandMaterial(command))) !== command.commandDigest) deny('CONFLICT');
  }
  private receipt(snapshot: State, command: AtomicCommand, kind: OperationReceipt['kind'], objectId: string, until: number) {
    if (snapshot.receipts.size >= this.limits.maxReceipts) deny('CAPACITY_EXCEEDED');
    const result: Readonly<OperationReceipt> = Object.freeze({ ...this.expected, operationId: command.operationId,
      commandDigest: command.commandDigest, kind, objectId, committedAt: command.decisionTime,
      revision: command.expectedRevision + 1, retainUntil: addTime(until, this.limits.receiptRetentionMs) });
    revision(result.revision); snapshot.receipts.set(command.operationId, result); return result;
  }
  private async commit(snapshot: State, epoch: number, command: AtomicCommand, receipt: Readonly<OperationReceipt>,
    fault: ReferenceFault | undefined, recheck: (now: number) => void): Promise<AtomicOutcome> {
    try { await this.ports.beforeCommit?.(); } catch { deny('UNAVAILABLE'); }
    this.checkpoint(fault, 'BEFORE_COMMIT');
    if (this.unavailable) deny('UNAVAILABLE');
    if (epoch !== this.epoch) {
      const prior = this.prior(command); if (prior) return prior; deny('CONFLICT');
    }
    const now = timestamp(this.ports.clock()); if (now < command.decisionTime || now < this.lastDecision) deny('INVALID');
    recheck(now);
    // Sole commit point. Any earlier throw discards ALL staged maps/receipt changes.
    this.state = snapshot; this.epoch++; this.lastDecision = now;
    if (fault === 'AFTER_COMMIT') return { status: 'OUTCOME_UNKNOWN' };
    return { status: 'COMMITTED', receipt, recovered: false };
  }
  async acceptAssertionAndCreateGrant(command: AcceptAssertionCommand): Promise<AtomicOutcome> {
    try {
      record(command, [...baseKeys, 'assertion']); const now = this.base(command);
      const data = readSignedAssertion(command.assertion, this.expected); this.checkDigest(command);
      const prior = this.prior(command); if (prior) return prior;
      const tx = this.state.transactions.get(data.claims.transactionId);
      if (!tx) deny('CONFLICT');
      if (tx.record.status === 'CONSUMED' || this.state.assertions.has(data.claims.assertionId)) deny('REPLAY');
      if (now >= tx.record.expiresAt || now >= data.claims.expiresAt) deny('EXPIRED');
      if (tx.revision !== command.expectedRevision) deny('CONFLICT');
      assertSignedAssertionLive(command.assertion, this.expected, this.ports.keyPolicy(), now);
      const verifiedTx = transitionLoginTransaction(tx.record, this.expected, 'VERIFIED', now);
      const grant = createTrustedLoginGrant(data.legacy, verifiedTx, this.expected, now), g = readTrustedLoginGrant(grant, this.expected, now);
      if (this.state.grants.has(g.grantId)) deny('REPLAY');
      if (this.state.grants.size >= this.limits.maxGrants) deny('CAPACITY_EXCEEDED');
      const fault = this.fault; this.fault = undefined; this.checkpoint(fault, 'UNAVAILABLE');
      const epoch = this.epoch, snapshot = this.snapshot();
      const consumed = transitionLoginTransaction(verifiedTx, this.expected, 'CONSUMED', now);
      snapshot.transactions.set(tx.record.transactionId, Object.freeze({ record: consumed, revision: revision(tx.revision + 1) }));
      this.checkpoint(fault, 'AFTER_TRANSACTION');
      snapshot.assertions.set(data.claims.assertionId, addTime(Math.max(tx.record.expiresAt, data.claims.expiresAt), this.limits.receiptRetentionMs));
      this.checkpoint(fault, 'AFTER_ASSERTION');
      const signingKey = Object.freeze({ protocolVersion: 1 as const, brokerIssuer: data.claims.issuer, keyId: data.keyId,
        algorithm: 'RS256' as const, assertionId: data.claims.assertionId, assertionIssuedAt: data.claims.issuedAt });
      snapshot.grants.set(g.grantId, Object.freeze({ evidence: grant, record: Object.freeze({ ...this.expected,
        grantId: g.grantId, transactionId: g.transactionId, assertionId: g.assertionId, revision: 0, status: 'AVAILABLE',
        consumedAt: null, issuedAt: g.issuedAt, expiresAt: g.expiresAt, signingKey }) }));
      this.checkpoint(fault, 'AFTER_GRANT');
      const receipt = this.receipt(snapshot, command, 'ACCEPT_ASSERTION', g.grantId, Math.max(tx.record.expiresAt, g.expiresAt));
      this.checkpoint(fault, 'AFTER_RECEIPT');
      return await this.commit(snapshot, epoch, command, receipt, fault, at => {
        if (at >= tx.record.expiresAt || at >= data.claims.expiresAt || at >= g.expiresAt) deny('EXPIRED');
        assertSignedAssertionLive(command.assertion, this.expected, this.ports.keyPolicy(), at);
      });
    } catch (error) { return outcome(error); }
  }
  private user(issuer: string, subject: string, version: number): CurrentDirectoryUser {
    const raw = this.ports.directory(issuer, subject);
    const u = record(raw, ['issuer', 'subject', 'active', 'authorizationVersion']);
    if (u.issuer !== issuer || u.subject !== subject || u.active !== true || revision(u.authorizationVersion) !== revision(version)) deny('CONFLICT');
    return Object.freeze({ issuer, subject, active: true, authorizationVersion: version });
  }
  private provenanceKey(key: StoredSession['signingKey'], now: number) {
    const policy = signingKeyPolicy(this.ports.keyPolicy());
    if (policy.brokerIssuer !== key.brokerIssuer) deny('INVALID');
    return verificationKey(policy, key.keyId, this.expected, key.assertionIssuedAt, now);
  }
  private sessionKey(key: StoredSession['signingKey']) {
    const policy = signingKeyPolicy(this.ports.keyPolicy());
    if (policy.brokerIssuer !== key.brokerIssuer) deny('INVALID');
    return sessionProvenanceKey(policy, key.keyId, this.expected, key.assertionIssuedAt);
  }
  async consumeGrantAndCreateSession(command: ConsumeGrantCommand): Promise<AtomicOutcome> {
    try {
      record(command, [...baseKeys, 'grantId', 'credentialDigest', 'expectedAuthorizationVersion']); const now = this.base(command);
      hex(command.grantId); hex(command.credentialDigest); revision(command.expectedAuthorizationVersion); this.checkDigest(command);
      const prior = this.prior(command); if (prior) return prior;
      const grant = this.state.grants.get(command.grantId); if (!grant) deny('CONFLICT');
      if (grant.record.status !== 'AVAILABLE') deny('REPLAY');
      if (now >= grant.record.expiresAt) deny('EXPIRED');
      if (grant.record.revision !== command.expectedRevision || this.state.sessions.has(command.credentialDigest)) deny('CONFLICT');
      const data = readTrustedLoginGrant(grant.evidence, this.expected, now), identity = data.identity.data;
      const user = this.user(identity.identityIssuer, identity.identitySubject, command.expectedAuthorizationVersion);
      const provenance = grant.record.signingKey; this.provenanceKey(provenance, now);
      const sameSubject = [...this.state.sessions.values()].filter(s => s.identityIssuer === user.issuer && s.identitySubject === user.subject &&
        s.status === 'ACTIVE' && s.expiresAt > now).length;
      if (this.state.sessions.size >= this.limits.maxSessions || sameSubject >= this.limits.maxSessionsPerSubject) deny('CAPACITY_EXCEEDED');
      const plan = planGrantRedemption(grant.evidence, availableGrantState(grant.evidence, this.expected, now), this.expected, user, now);
      const fault = this.fault; this.fault = undefined; this.checkpoint(fault, 'UNAVAILABLE');
      const epoch = this.epoch, snapshot = this.snapshot();
      snapshot.grants.set(command.grantId, Object.freeze({ ...grant, record: Object.freeze({ ...grant.record, status: 'CONSUMED',
        consumedAt: now, revision: revision(grant.record.revision + 1) }) }));
      this.checkpoint(fault, 'AFTER_GRANT');
      const session: Readonly<StoredSession> = Object.freeze({ ...plan.sessionPlan, sessionId: command.credentialDigest,
        status: 'ACTIVE', revokedAt: null, revision: 0, grantId: command.grantId, signingKey: provenance });
      snapshot.sessions.set(command.credentialDigest, session); this.checkpoint(fault, 'AFTER_SESSION');
      const receipt = this.receipt(snapshot, command, 'ISSUE_SESSION', command.credentialDigest, session.expiresAt);
      this.checkpoint(fault, 'AFTER_RECEIPT');
      return await this.commit(snapshot, epoch, command, receipt, fault, at => {
        if (at >= grant.record.expiresAt || at >= session.expiresAt) deny('EXPIRED');
        this.user(user.issuer, user.subject, user.authorizationVersion);
        this.provenanceKey(provenance, at);
      });
    } catch (error) { return outcome(error); }
  }
  getOperationOutcome(command: OperationLookup): AtomicOutcome {
    try {
      record(command, baseKeys); this.application(command.context);
      if (command.expectedRevision !== null) invalid(); hex(command.operationId); hex(command.commandDigest); this.time(command.decisionTime);
      return this.prior(command) || { status: 'OUTCOME_UNKNOWN' };
    } catch (error) { return outcome(error); }
  }
  private readLookup(command: SessionLookup) {
    this.application(command.context); hex(command.credentialDigest); const now = this.time(command.decisionTime);
    const s = this.state.sessions.get(command.credentialDigest); if (!s) invalid();
    const u = this.user(s.identityIssuer, s.identitySubject, s.authorizationVersion);
    const { revision: _rev, grantId: _grant, signingKey: key, ...legacy } = s;
    validateSessionUse(legacy, this.expected, u, now);
    this.sessionKey(key); return s;
  }
  readSession(command: SessionLookup): SessionLookupOutcome {
    try {
      record(command, lookupKeys); const s = this.readLookup(command);
      return { status: 'FOUND', session: new StoredEvidence(sessionCapability, this.owner, s) as unknown as TrustedStoredSession };
    } catch { return { status: this.unavailable ? 'UNAVAILABLE' : 'BLOCKED' }; }
  }
  /** Model-specific capability reader rechecks current record/version/directory/key policy.
   * A cast, JSON copy, capability from another model or stale record cannot restore trust. */
  readTrustedSession(value: unknown, decisionTime: number): Readonly<StoredSession> {
    const stored = StoredEvidence.read(value, this.owner);
    const current = this.readLookup({ context: this.expected, credentialDigest: stored.sessionId, decisionTime });
    if (current !== stored) return invalid(); return current;
  }
  revokeSession(command: RevokeSessionCommand): 'REVOKED' | 'CONFLICT' | 'BLOCKED' | 'UNAVAILABLE' {
    try {
      record(command, [...lookupKeys, 'expectedRevision']); this.application(command.context); hex(command.credentialDigest);
      const now = this.time(command.decisionTime), s = this.state.sessions.get(command.credentialDigest);
      if (!s || s.status !== 'ACTIVE' || now < s.issuedAt) return 'BLOCKED';
      if (s.revision !== revision(command.expectedRevision)) return 'CONFLICT';
      this.state.sessions.set(s.sessionId, Object.freeze({ ...s, status: 'REVOKED', revokedAt: now, revision: revision(s.revision + 1) }));
      this.epoch++; this.lastDecision = now; return 'REVOKED';
    } catch { return this.unavailable ? 'UNAVAILABLE' : 'BLOCKED'; }
  }
  cleanup(decisionTime: number): number {
    const now = this.time(decisionTime); let removed = 0;
    const remove = <T>(map: Map<string, T>, expired: (value: T) => boolean) => {
      for (const [key, value] of map) if (removed < this.limits.cleanupBatchSize && expired(value)) { map.delete(key); removed++; }
    };
    remove(this.state.sessions, s => s.expiresAt <= now);
    remove(this.state.receipts, r => r.retainUntil <= now);
    remove(this.state.assertions, until => until <= now);
    remove(this.state.grants, g => addTime(g.record.expiresAt, this.limits.receiptRetentionMs) <= now);
    remove(this.state.transactions, t => addTime(t.record.expiresAt, this.limits.receiptRetentionMs) <= now);
    if (removed) { this.epoch++; this.lastDecision = now; } return removed;
  }
  /** Counts only, never records, credentials or identity values. Local assertions only. */
  inspect() { return Object.freeze({ transactions: this.state.transactions.size,
    consumedTransactions: [...this.state.transactions.values()].filter(t => t.record.status === 'CONSUMED').length,
    assertions: this.state.assertions.size, grants: this.state.grants.size,
    consumedGrants: [...this.state.grants.values()].filter(g => g.record.status === 'CONSUMED').length,
    sessions: this.state.sessions.size, receipts: this.state.receipts.size }); }
}
