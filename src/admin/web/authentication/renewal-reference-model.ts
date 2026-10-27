import { IDENTITY_TTL, type LoginTransaction } from '../identity-contracts/contracts';
import { context, contextFields, matchContext, record, hex, timestamp, addTime, invalid } from '../identity-contracts/validation';
import { transitionLoginTransaction } from '../identity-contracts/lifecycle';
import { assertSignedAssertionLive } from '../identity-contracts/signed-assertion-profile';
import { createTrustedLoginGrant, readTrustedLoginGrant } from '../identity-contracts/verification';
import { durableGrantProjection, type DurableGrantProjection, type DurableGrantBinding } from '../identity-contracts/durable-store-contracts';
import { signingKeyPolicy } from '../identity-contracts/signing-key-policy';
import { atomicOperationDescriptor, type ConsumeGrantCommand } from '../identity-contracts/atomic-store-contracts';
import { CHANNEL } from '../channel-contracts/contracts';
import { expectation } from '../channel-contracts/channel-policy';
import { inspectReceipt } from '../channel-contracts/recovery';
import { recoveryDescriptor, type RecoveryDescriptor } from '../operation-contracts';
import { evaluateGrantReadiness, grantReadinessPolicy, trustedClockInterval } from './grant-readiness';
import { RENEWAL_LIMITS, type RenewalFamilySeed, type RenewalFamilySnapshot, type RenewalReferencePorts,
  type GrantReadinessPolicy, type TrustedClockInterval, type GrantReadinessDecision, type RenewalFailure,
  type RenewalLoginStart, type UnsentRenewalAttempt, type BeforeDispatchRenewalPermit,
  type PossibleDispatchAttempt, type RenewalTransitionResult, type ModelDispatchResult, type RenewalRecoveryResult } from './renewal-contracts';

const construction = Object.freeze({});
type Purpose = 'LOGIN' | 'UNSENT' | 'RENEWAL' | 'DISPATCH';
class ModelEvidence {
  readonly #owner: object;
  readonly #purpose: Purpose;
  readonly #generation: number;
  constructor(key: unknown, owner: object, purpose: Purpose, generation: number) {
    if (key !== construction) invalid(); this.#owner = owner; this.#purpose = purpose; this.#generation = generation; Object.freeze(this);
  }
  static require(value: unknown, owner: object, purpose: Purpose, generation: number): void {
    if (!value || typeof value !== 'object' || !(#owner in value) || value.#owner !== owner ||
      value.#purpose !== purpose || value.#generation !== generation) throw Error('SAFE_RENEWAL_INVALID_EVIDENCE');
  }
}
class ModelFailure { constructor(readonly reason: RenewalFailure) {} }
const fail = (reason: RenewalFailure): never => { throw new ModelFailure(reason); };
const reason = (error: unknown): RenewalFailure => error instanceof ModelFailure ? error.reason : 'DEPENDENCY_UNAVAILABLE';

/** LOCAL REFERENCE MODEL ONLY. Synchronous transitions serialize actors in this process.
 * No real coordinator, session issuance, transport, RNG, OIDC or distributed proof. Its private
 * capabilities are not durable-store capabilities and cannot open the remote admission gate. */
export class RenewalReferenceModel {
  readonly #seed: Readonly<RenewalFamilySeed>;
  readonly #policy: Readonly<GrantReadinessPolicy>;
  readonly #target;
  readonly #owner = Object.freeze({});
  #capability: ModelEvidence | undefined;
  #state: RenewalFamilySnapshot['state'] = 'LOGIN_REQUIRED';
  #failure: RenewalFailure | null = null;
  #generation = 0;
  #completed = 0;
  #silent = 0;
  #handoffs = 0;
  #epoch = 0;
  #clockHighWater: Readonly<TrustedClockInterval> | null = null;
  #transaction: Readonly<LoginTransaction> | undefined;
  readonly #grants: Readonly<DurableGrantProjection>[] = [];
  readonly #identifiers = new Set<string>();
  #operation: Readonly<RecoveryDescriptor> | undefined;
  #confirmed: 'COMMITTED' | 'REJECTED' | undefined;

  readonly #ports: RenewalReferencePorts;
  #entered = false;

  constructor(seed: RenewalFamilySeed, policy: GrantReadinessPolicy, ports: RenewalReferencePorts) {
    this.#ports = ports;
    const s = record(seed, ['environment', 'applicationAudience', 'expectedScriptId', 'familyId', 'identityIssuer', 'identitySubject',
      'authenticatedAt', 'upstreamAuthenticationCap', 'rateBudgetReference']);
    const c = contextFields(seed), authenticatedAt = timestamp(s.authenticatedAt), cap = timestamp(s.upstreamAuthenticationCap);
    if (s.identityIssuer !== 'https://accounts.google.com' || typeof s.identitySubject !== 'string' ||
      !/^[A-Za-z0-9._-]{1,255}$/.test(s.identitySubject) || cap <= authenticatedAt || cap - authenticatedAt > IDENTITY_TTL.authenticationMaxAgeMs) invalid();
    this.#seed = Object.freeze({ ...c, familyId: hex(s.familyId), identityIssuer: s.identityIssuer,
      identitySubject: s.identitySubject, authenticatedAt, upstreamAuthenticationCap: cap, rateBudgetReference: hex(s.rateBudgetReference) });
    this.#policy = grantReadinessPolicy(policy);
    this.#target = expectation({ ...c, backendOrigin: ports.backendOrigin });
    this.#identifiers.add(this.#seed.familyId); this.#identifiers.add(this.#seed.rateBudgetReference);
  }
  /** Acquired before ANY fixture callback, including clock/rate/secret reads. Rejected nested
   * calls never enter their catch/stop paths. Finally releases only the guard, never model state. */
  #exclusive<T>(action: () => T): T {
    if (this.#entered) throw Error('SAFE_RENEWAL_REENTRANT');
    this.#entered = true;
    try { return action(); } finally { this.#entered = false; }
  }
  #proof(purpose: Purpose): ModelEvidence {
    return this.#capability = new ModelEvidence(construction, this.#owner, purpose, this.#generation);
  }
  #require(value: unknown, purpose: Purpose, states: readonly RenewalFamilySnapshot['state'][]): void {
    ModelEvidence.require(value, this.#owner, purpose, this.#generation);
    if (value !== this.#capability || !states.includes(this.#state)) throw Error('SAFE_RENEWAL_STALE_ATTEMPT');
  }
  #observe(): { at: Readonly<TrustedClockInterval>; previous: Readonly<TrustedClockInterval> | null } {
    try { matchContext(context(this.#ports.currentContext()), contextFields(this.#seed)); }
    catch { return fail('CONTEXT_INVALID'); }
    let at: Readonly<TrustedClockInterval>;
    try { at = trustedClockInterval(this.#ports.clock()); } catch { return fail('CLOCK_INVALID'); }
    const previous = this.#clockHighWater;
    if (previous && (at.earliestMs < previous.earliestMs || at.latestMs < previous.latestMs)) return fail('CLOCK_ROLLBACK');
    // Includes denied observations; process-local only, not cross-worker/restart time authority.
    this.#clockHighWater = at; return { at, previous };
  }
  #rate(claim: boolean, generation = this.#generation): void {
    let status;
    try { status = claim ? this.#ports.rateBudget.claim(this.#seed.rateBudgetReference, this.#seed.familyId, generation) :
      this.#ports.rateBudget.current(this.#seed.rateBudgetReference); } catch { return fail('RATE_UNAVAILABLE'); }
    if (status === 'DENIED') return fail('RATE_LIMITED'); if (status !== 'ALLOWED') return fail('RATE_UNAVAILABLE');
  }
  #stop(failure: RenewalFailure): Readonly<{ status: 'BLOCKED'; reason: RenewalFailure }> {
    if (!this.#entered || !['LOGIN_REQUIRED', 'BEFORE_DISPATCH', 'ABANDONED'].includes(this.#state))
      throw Error('SAFE_RENEWAL_STALE_ATTEMPT');
    if (this.#state === 'BEFORE_DISPATCH') this.#completed++;
    this.#state = 'BLOCKED'; this.#failure = failure; this.#capability = undefined; this.#epoch++;
    return Object.freeze({ status: 'BLOCKED', reason: failure });
  }
  #authenticationCap(): number {
    return this.#grants[this.#grants.length - 1]?.authenticationExpiresAt ?? this.#seed.upstreamAuthenticationCap;
  }
  #start(binding: unknown): RenewalLoginStart {
    const browserProofBinding = hex(binding), transactionId = hex(this.#ports.secret()), nonce = hex(this.#ports.secret());
    const ids = [browserProofBinding, transactionId, nonce];
    if (new Set(ids).size !== ids.length || ids.some(id => this.#identifiers.has(id))) return fail('LOGIN_INVALID');
    const { at } = this.#observe(); // Final observation AFTER rate/silent/secret dependencies.
    if (this.#authenticationCap() <= at.latestMs) return fail('UPSTREAM_EXPIRED');
    const created: LoginTransaction = Object.freeze({ ...contextFields(this.#seed), browserProofBinding, transactionId, nonce,
      createdAt: at.latestMs, expiresAt: addTime(at.latestMs, IDENTITY_TTL.transactionMs), updatedAt: at.latestMs, status: 'CREATED', consumedAt: null });
    const tx = transitionLoginTransaction(transitionLoginTransaction(created, contextFields(this.#seed), 'BOUND', at.latestMs),
      contextFields(this.#seed), 'VERIFYING', at.latestMs);
    ids.forEach(id => this.#identifiers.add(id)); this.#transaction = tx; this.#state = 'LOGIN_REQUIRED'; this.#epoch++;
    return Object.freeze({ transaction: tx, attempt: this.#proof('LOGIN') as unknown as RenewalLoginStart['attempt'] });
  }
  beginInitialLogin(browserProofBinding: unknown): RenewalLoginStart {
    return this.#exclusive(() => {
      if (this.#state !== 'LOGIN_REQUIRED' || this.#capability || this.#grants.length) throw Error('SAFE_RENEWAL_STALE_ATTEMPT');
      try { this.#rate(true); return this.#start(browserProofBinding); }
      catch (error) { const why = reason(error); this.#stop(why); throw Error('SAFE_RENEWAL_' + why); }
    });
  }
  beginRenewal(permit: unknown, browserProofBinding: unknown, mode: 'SILENT' | 'INTERACTIVE'): RenewalLoginStart {
    return this.#exclusive(() => {
      this.#require(permit, 'RENEWAL', ['ABANDONED']);
      try {
        if (this.#grants.length >= RENEWAL_LIMITS.maximumGrantAttempts || this.#completed >= RENEWAL_LIMITS.maximumGrantAttempts)
          return fail('RENEWAL_LIMIT_REACHED');
        if (mode !== 'SILENT' && mode !== 'INTERACTIVE') return fail('LOGIN_INVALID');
        this.#rate(true, this.#generation + 1);
        if (mode === 'SILENT') {
          if (this.#silent >= RENEWAL_LIMITS.maximumSilentRenewals) return fail('RENEWAL_LIMIT_REACHED');
          this.#silent++; if (this.#ports.silentOidcAvailable() !== true) return fail('INTERACTION_REQUIRED');
        }
        this.#generation++; return this.#start(browserProofBinding);
      } catch (error) { const why = reason(error); this.#stop(why); throw Error('SAFE_RENEWAL_' + why); }
    });
  }
  /** Local event for an unsuccessful login, not a network handler or a mutation-outcome classifier.
   * An uncertain acceptance mutation must use its original recovery flow, not this event. */
  loginFailed(attempt: unknown, outcome: 'INTERACTION_REQUIRED' | 'LOGIN_INVALID' | 'DEPENDENCY_UNAVAILABLE') {
    return this.#exclusive(() => {
      this.#require(attempt, 'LOGIN', ['LOGIN_REQUIRED']);
      return this.#stop(['INTERACTION_REQUIRED', 'LOGIN_INVALID', 'DEPENDENCY_UNAVAILABLE'].includes(outcome) ? outcome : 'LOGIN_INVALID');
    });
  }
  /** Existing runtime-private signature evidence is required, never a copied/decoded assertion.
   * This models a successful independent verified login + atomic acceptance; no store is written. */
  completeVerifiedLogin(attempt: unknown, verifiedAssertion: unknown): UnsentRenewalAttempt {
    return this.#exclusive(() => {
      this.#require(attempt, 'LOGIN', ['LOGIN_REQUIRED']);
      try {
        this.#rate(false);
        const policy = signingKeyPolicy(this.#ports.keyPolicy());
        const { at } = this.#observe(); // No external callbacks below this temporal boundary.
        const data = assertSignedAssertionLive(verifiedAssertion, contextFields(this.#seed), policy, at.latestMs), claims = data.claims;
        const tx = this.#transaction!;
        if (claims.identityIssuer !== this.#seed.identityIssuer || claims.subject !== this.#seed.identitySubject ||
          claims.transactionId !== tx.transactionId || claims.nonce !== tx.nonce || claims.browserProofBinding !== tx.browserProofBinding ||
          claims.authenticatedAt !== this.#seed.authenticatedAt || this.#identifiers.has(claims.assertionId)) return fail('LOGIN_INVALID');
        if (claims.authenticationExpiresAt > this.#authenticationCap()) return fail('UPSTREAM_CAP_CHANGED');
        if (claims.issuedAt > at.earliestMs || tx.createdAt > at.earliestMs) return fail('CLOCK_UNCERTAIN');
        const verifiedTx = transitionLoginTransaction(tx, contextFields(this.#seed), 'VERIFIED', at.latestMs);
        const grant = readTrustedLoginGrant(createTrustedLoginGrant(data.legacy, verifiedTx, contextFields(this.#seed), at.latestMs), contextFields(this.#seed), at.latestMs);
        const projection: DurableGrantProjection = { ...contextFields(this.#seed), schemaVersion: 1, grantId: grant.grantId,
          transactionId: grant.transactionId, assertionId: grant.assertionId, revision: 0, status: 'AVAILABLE', consumedAt: null,
          issuedAt: grant.issuedAt, expiresAt: grant.expiresAt, identityIssuer: claims.identityIssuer, identitySubject: claims.subject,
          authenticatedAt: claims.authenticatedAt, authenticationExpiresAt: claims.authenticationExpiresAt,
          signingKey: { protocolVersion: 1, brokerIssuer: claims.issuer, keyId: data.keyId, algorithm: 'RS256', assertionId: claims.assertionId, assertionIssuedAt: claims.issuedAt } };
        if (this.#grants.length >= RENEWAL_LIMITS.maximumGrantAttempts) return fail('RENEWAL_LIMIT_REACHED');
        this.#grants.push(durableGrantProjection(projection, this.#binding(projection)));
        this.#transaction = transitionLoginTransaction(verifiedTx, contextFields(this.#seed), 'CONSUMED', at.latestMs);
        this.#identifiers.add(claims.assertionId); this.#state = 'BEFORE_DISPATCH'; this.#epoch++;
        return this.#proof('UNSENT') as unknown as UnsentRenewalAttempt;
      } catch (error) { const why = reason(error); this.#stop(why); throw Error('SAFE_RENEWAL_' + why); }
    });
  }
  #binding(grant: Readonly<DurableGrantProjection>): DurableGrantBinding {
    return { ...contextFields(this.#seed), grantId: grant.grantId, transactionId: grant.transactionId, assertionId: grant.assertionId,
      expectedRevision: 0, identityIssuer: this.#seed.identityIssuer, identitySubject: this.#seed.identitySubject };
  }
  #assess(attempt: unknown): Readonly<GrantReadinessDecision> {
    this.#require(attempt, 'UNSENT', ['BEFORE_DISPATCH']);
    try {
      this.#rate(false);
      let keyPolicy;
      try { keyPolicy = signingKeyPolicy(this.#ports.keyPolicy()); }
      catch { return Object.freeze({ status: 'BLOCKED', reason: 'KEY_UNAVAILABLE' }); }
      const { at, previous } = this.#observe();
      const grant = this.#grants[this.#grants.length - 1];
      return evaluateGrantReadiness({ grant, binding: this.#binding(grant), keyPolicy, clock: at,
        previousClock: previous, policy: this.#policy, dispatchState: 'BEFORE_DISPATCH', completedGrantAttempts: this.#completed,
        upstreamAuthenticationCap: this.#authenticationCap(), rateBudgetStatus: 'ALLOWED' });
    } catch (error) { return Object.freeze({ status: 'BLOCKED', reason: reason(error) }); }
  }
  assess(attempt: unknown): Readonly<GrantReadinessDecision> {
    return this.#exclusive(() => this.#assess(attempt));
  }
  abandon(attempt: unknown): RenewalTransitionResult {
    return this.#exclusive(() => {
      const decision = this.#assess(attempt);
      if (decision.status === 'BLOCKED') return this.#stop(decision.reason);
      if (decision.status !== 'ABANDON_BEFORE_DISPATCH') throw Error('SAFE_RENEWAL_NOT_ABANDONABLE');
      this.#completed++; this.#state = 'ABANDONED'; this.#epoch++;
      return Object.freeze({ status: 'ABANDONED', renewal: this.#proof('RENEWAL') as unknown as BeforeDispatchRenewalPermit });
    });
  }
  dispatch(attempt: unknown, command: ConsumeGrantCommand): ModelDispatchResult {
    return this.#exclusive(() => {
      this.#require(attempt, 'UNSENT', ['BEFORE_DISPATCH']);
      try {
        const c = record(command, ['context', 'protocolVersion', 'backendOrigin', 'operationId', 'commandDigest', 'expectedRevision',
          'commandCreatedAt', 'grantId', 'credentialDigest', 'expectedAuthorizationVersion']);
        const snapshot = Object.freeze({ ...command, context: context(c.context) });
        matchContext(snapshot.context, contextFields(this.#seed));
        const grant = this.#grants[this.#grants.length - 1], operation = atomicOperationDescriptor(snapshot, this.#ports.digest);
        if (snapshot.grantId !== grant.grantId || snapshot.expectedRevision !== grant.revision ||
          snapshot.commandDigest !== operation.commandDigest || snapshot.backendOrigin !== this.#target.backendOrigin ||
          this.#identifiers.has(hex(snapshot.operationId))) throw Error('SAFE_RENEWAL_INVALID_OPERATION');
        const descriptor = recoveryDescriptor(operation, snapshot.expectedRevision, snapshot.credentialDigest);
        // FINAL local decision after command/digest preparation. No await/adapter work between this
        // check and local handoff-state swap. This is not distributed atomicity or strict commit proof.
        const decision = this.#assess(attempt);
        if (decision.status === 'BLOCKED') return this.#stop(decision.reason);
        if (decision.status !== 'READY_FOR_ATTEMPT') return decision;
        const at = this.#clockHighWater!;
        if (snapshot.commandCreatedAt - at.earliestMs > CHANNEL.futureSkewMs || at.latestMs - snapshot.commandCreatedAt >= CHANNEL.commandAgeMs)
          return this.#stop('LOGIN_INVALID');
        this.#operation = descriptor; this.#state = 'DISPATCH_POSSIBLE'; this.#handoffs++; this.#epoch++;
        return Object.freeze({ status: 'DISPATCH_POSSIBLE', dispatch: this.#proof('DISPATCH') as unknown as PossibleDispatchAttempt });
      } catch { throw Error('SAFE_RENEWAL_INVALID_OPERATION'); }
    });
  }
  /** A persisted intent with unknown handoff is also DISPATCH_POSSIBLE. Never reset to unsent. */
  #markOutcomeUnknown(dispatch: unknown): void {
    this.#require(dispatch, 'DISPATCH', ['DISPATCH_POSSIBLE', 'RECOVERY_REQUIRED']);
    if (this.#state !== 'RECOVERY_REQUIRED') { this.#state = 'RECOVERY_REQUIRED'; this.#epoch++; }
  }
  markOutcomeUnknown(dispatch: unknown): void {
    this.#exclusive(() => this.#markOutcomeUnknown(dispatch));
  }
  async recover(dispatch: unknown): Promise<RenewalRecoveryResult> {
    // Guard invocation of the lookup port, but release BEFORE awaiting. Independent reads can
    // coexist; every completion reacquires the guard and checks its original epoch.
    const read = this.#exclusive(() => {
      this.#markOutcomeUnknown(dispatch);
      const epoch = this.#epoch, descriptor = this.#operation!;
      let pending: Promise<unknown>;
      try { pending = Promise.resolve(this.#ports.recoveryLookup(descriptor)); }
      catch { pending = Promise.resolve({ outcome: 'UNAVAILABLE' }); }
      return { epoch, descriptor, pending };
    });
    try {
      const raw = await read.pending;
      return this.#exclusive((): RenewalRecoveryResult => {
        if (read.epoch !== this.#epoch) return this.#confirmed ? { status: 'CONFIRMED', outcome: this.#confirmed } : { status: 'RECOVERY_REQUIRED' };
        if (raw && typeof raw === 'object' && ['OUTCOME_UNKNOWN', 'UNAVAILABLE'].includes((raw as { outcome?: string }).outcome ?? '')) {
          record(raw, ['outcome']); return { status: 'RECOVERY_REQUIRED' };
        }
        const receipt = inspectReceipt(raw, read.descriptor, this.#observe().at.latestMs);
        if (receipt.outcome === 'COMMITTED' && (receipt.objectId !== read.descriptor.expectedObjectId || receipt.revision !== read.descriptor.expectedRevision + 1))
          return { status: 'RECOVERY_REQUIRED' };
        this.#confirmed = receipt.outcome; this.#completed++; this.#state = 'CONFIRMED'; this.#epoch++;
        // Metadata only. No session, bearer, fresh grant or TTL update is produced here.
        return Object.freeze({ status: 'CONFIRMED', outcome: receipt.outcome });
      });
    } catch { return { status: 'RECOVERY_REQUIRED' }; }
  }
  /** Frozen server-local diagnostic DTOs, never identity or non-dispatch evidence. */
  inspect(): Readonly<RenewalFamilySnapshot> {
    return Object.freeze({ ...this.#seed, effectiveUpstreamAuthenticationCap: this.#authenticationCap(), generation: this.#generation, completedGrantAttempts: this.#completed,
      grantsCreated: this.#grants.length, maximumGrantAttempts: 3, silentRenewalAttempts: this.#silent,
      state: this.#state, terminalState: this.#state === 'BLOCKED' || this.#state === 'CONFIRMED' ? this.#state : null,
      failure: this.#failure, handoffs: this.#handoffs });
  }
  grantSnapshot(generation = this.#generation): Readonly<DurableGrantProjection> | undefined { return this.#grants[generation]; }
}
