import { IDENTITY_TTL, type LoginTransaction } from '../identity-contracts/contracts';
import { browserLoginBegin, browserLoginComplete, transaction, lifetime, hex, record, matchContext, timestamp, addTime } from '../identity-contracts/validation';
import { transitionLoginTransaction } from '../identity-contracts/lifecycle';
import { assertSignedAssertionLive } from '../identity-contracts/signed-assertion-profile';
import { atomicCommandMaterial, type AcceptAssertionCommand, type ConsumeGrantCommand, type AtomicOutcome,
  type OperationReceipt, type VersionedLoginTransaction } from '../identity-contracts/atomic-store-contracts';
import { type LocalAuthenticationPorts, type LoginStartResult, type LoginResult, type AuthenticationFailure } from './ports';
import { ApplicationTrustBoundary, currentUser } from './trust-boundaries';
import { SessionResolver } from './session-resolver';

class Blocked { constructor(readonly code: AuthenticationFailure) {} }
function block(code: AuthenticationFailure): never { throw new Blocked(code); }
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) block('ACCESS_DENIED'); return value as number;
}
const statuses = ['REPLAY', 'EXPIRED', 'CONFLICT', 'CONTEXT_MISMATCH', 'UNAVAILABLE', 'OUTCOME_UNKNOWN', 'INVALID', 'CAPACITY_EXCEEDED'];
type Mutation = AcceptAssertionCommand | ConsumeGrantCommand;

/** Sequence only. No local spent-token registry, persistent store, broker transport or credentials
 * adapter. Existing atomic port owns one-time use; receipt recovery NEVER retries a mutation. */
export class LoginOrchestrator {
  private readonly trust: ApplicationTrustBoundary;
  constructor(private readonly ports: LocalAuthenticationPorts, private readonly sessions: SessionResolver) {
    this.trust = new ApplicationTrustBoundary(ports);
  }
  private configured(): void {
    if (!this.ports.verifier) block('NOT_CONFIGURED');
    try { this.ports.verifier.assertConfigured(); } catch { block('NOT_CONFIGURED'); }
  }
  private snapshot(value: VersionedLoginTransaction | undefined): VersionedLoginTransaction {
    const v = record(value, ['record', 'revision']);
    return Object.freeze({ record: transaction(v.record, this.trust.context), revision: version(v.revision) });
  }
  async startLogin(request: unknown): Promise<LoginStartResult> {
    try {
      this.configured(); this.trust.check(); const begin = browserLoginBegin(request);
      const transactionId = hex(this.ports.secrets.secret()), nonce = hex(this.ports.secrets.secret());
      if (transactionId === nonce) block('ACCESS_DENIED');
      const now = this.trust.check();
      const created: LoginTransaction = Object.freeze({ ...this.trust.context, transactionId, nonce, browserProofBinding: begin.browserProofBinding,
        createdAt: now, expiresAt: addTime(now, IDENTITY_TTL.transactionMs), updatedAt: now, status: 'CREATED', consumedAt: null });
      // Pure preparation states: binding is an unverified commitment until completeLogin checks proof.
      const pending = transitionLoginTransaction(transitionLoginTransaction(created, this.trust.context, 'BOUND', now), this.trust.context, 'VERIFYING', now);
      const stored = this.snapshot(await this.ports.transactions.create(pending));
      const after = this.trust.check(); lifetime(stored.record.createdAt, stored.record.expiresAt, IDENTITY_TTL.transactionMs, after);
      if (stored.revision !== 0 || JSON.stringify(stored.record) !== JSON.stringify(transaction(pending, this.trust.context))) block('CONFLICT');
      return { status: 'STARTED', transactionId, expiresAt: stored.record.expiresAt };
    } catch (error) { return { status: 'BLOCKED', code: error instanceof Blocked ? error.code : 'ACCESS_DENIED' }; }
  }
  private seal(command: AcceptAssertionCommand): AcceptAssertionCommand;
  private seal(command: ConsumeGrantCommand): ConsumeGrantCommand;
  private seal(command: Mutation): Mutation {
    return Object.freeze({ ...command, commandDigest: hex(this.ports.digest.digest(atomicCommandMaterial(command))) });
  }
  private checkedOutcome(value: unknown): AtomicOutcome {
    if (!value || typeof value !== 'object') block('ACCESS_DENIED');
    const status = (value as { status?: unknown }).status;
    if (status === 'COMMITTED') {
      const result = record(value, ['status', 'receipt', 'recovered']); if (typeof result.recovered !== 'boolean') block('ACCESS_DENIED');
      return value as AtomicOutcome; // Shape only; receipt never establishes identity or session trust.
    }
    record(value, ['status']); if (typeof status !== 'string' || !statuses.includes(status)) block('ACCESS_DENIED');
    return value as AtomicOutcome;
  }
  private async commit(command: Mutation): Promise<Readonly<OperationReceipt>> {
    let result: AtomicOutcome;
    try {
      result = this.checkedOutcome('assertion' in command ? await this.ports.atomic.acceptAssertionAndCreateGrant(command) :
        await this.ports.atomic.consumeGrantAndCreateSession(command));
    } catch { result = { status: 'OUTCOME_UNKNOWN' }; } // A thrown transport could follow a committed write.
    const after = this.trust.check();
    if (result.status === 'OUTCOME_UNKNOWN') {
      try {
        result = this.checkedOutcome(this.ports.atomic.getOperationOutcome({ context: this.trust.context, operationId: command.operationId,
          commandDigest: command.commandDigest, expectedRevision: null, decisionTime: after }));
      } catch { block('OUTCOME_UNKNOWN'); }
      this.trust.check(); if (result.status !== 'COMMITTED') block(result.status === 'CONFLICT' ? 'CONFLICT' : 'OUTCOME_UNKNOWN');
    }
    if (result.status !== 'COMMITTED') block(result.status);
    const r = record(result.receipt, ['environment', 'applicationAudience', 'expectedScriptId', 'operationId', 'commandDigest', 'kind',
      'objectId', 'committedAt', 'revision', 'retainUntil']);
    matchContext(result.receipt, this.trust.context);
    const accepting = 'assertion' in command, objectId = accepting ? command.assertion.data.claims.transactionId : command.credentialDigest;
    if (r.operationId !== command.operationId || r.commandDigest !== command.commandDigest || r.objectId !== objectId ||
      r.kind !== (accepting ? 'ACCEPT_ASSERTION' : 'ISSUE_SESSION') || timestamp(r.committedAt) !== command.decisionTime ||
      version(r.revision) !== command.expectedRevision + 1 || timestamp(r.retainUntil) <= this.trust.check()) block('CONFLICT');
    return result.receipt;
  }
  async completeLogin(request: unknown): Promise<LoginResult> {
    try {
      this.configured(); this.trust.check(); const complete = browserLoginComplete(request);
      const tx = this.snapshot(await this.ports.transactions.read(complete.transactionId, this.trust.context));
      let now = this.trust.check();
      if (tx.record.transactionId !== complete.transactionId || hex(this.ports.digest.digest(complete.browserProof)) !== tx.record.browserProofBinding) block('ACCESS_DENIED');
      if (now >= tx.record.expiresAt) block('EXPIRED');
      lifetime(tx.record.createdAt, tx.record.expiresAt, IDENTITY_TTL.transactionMs, now);
      if (tx.record.status === 'CONSUMED') block('REPLAY'); if (tx.record.status !== 'VERIFYING') block('ACCESS_DENIED');
      const message = await this.ports.broker.receive(tx.record); this.trust.check();
      const verified = this.ports.verifier!.verify(message, tx.record);
      now = this.trust.check();
      const proof = assertSignedAssertionLive(verified, this.trust.context, this.ports.keyPolicy(), now), claims = proof.claims;
      if (claims.transactionId !== tx.record.transactionId || claims.nonce !== tx.record.nonce || claims.browserProofBinding !== tx.record.browserProofBinding ||
        claims.issuedAt < tx.record.createdAt) block('ACCESS_DENIED');
      currentUser(this.ports.users, claims.identityIssuer, claims.subject);
      const accept: AcceptAssertionCommand = this.seal({ context: this.trust.context, operationId: hex(this.ports.secrets.secret()), commandDigest: '',
        expectedRevision: tx.revision, decisionTime: this.trust.check(), assertion: verified });
      const accepted = await this.commit(accept);
      // Assertion may have expired AFTER acceptance. The store now enforces the grant's own TTL.
      const user = currentUser(this.ports.users, claims.identityIssuer, claims.subject);
      const credential = hex(this.ports.secrets.secret()), credentialDigest = hex(this.ports.digest.digest(credential));
      const operationId = hex(this.ports.secrets.secret());
      if ([tx.record.transactionId, tx.record.nonce, accept.operationId, operationId, credentialDigest].includes(credential)) block('ACCESS_DENIED');
      const issue: ConsumeGrantCommand = this.seal({ context: this.trust.context, operationId, commandDigest: '',
        expectedRevision: 0, decisionTime: this.trust.check(), grantId: accepted.objectId, credentialDigest,
        expectedAuthorizationVersion: user.authorizationVersion });
      await this.commit(issue); this.trust.check();
      // Receipts alone cannot authorize or release a credential: require live authoritative session.
      const resolved = this.sessions.resolve({ sessionCredential: credential }), session = this.sessions.read(resolved);
      if (session.grantId !== accepted.objectId || session.identityIssuer !== claims.identityIssuer || session.identitySubject !== claims.subject) block('ACCESS_DENIED');
      this.trust.check(); return { status: 'AUTHENTICATED', sessionCredential: credential, expiresAt: session.expiresAt };
    } catch (error) { return { status: 'BLOCKED', code: error instanceof Blocked ? error.code : 'ACCESS_DENIED' }; }
  }
}
