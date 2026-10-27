import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { RenewalReferenceModel } from './renewal-reference-model';
import type { BeforeDispatchRenewalPermit, RenewalFamilySeed, RenewalReferencePorts, RenewalLoginStart } from './renewal-contracts';
import { IDENTITY_TTL, type IdentityApplicationContext, type LoginTransaction } from '../identity-contracts/contracts';
import { verifySignedAssertion, type SignedAssertionClaimsV1 } from '../identity-contracts/signed-assertion-profile';
import { type SigningKeyPolicy, type SigningKeyRule } from '../identity-contracts/signing-key-policy';
import { atomicOperationDescriptor, type ConsumeGrantCommand } from '../identity-contracts/atomic-store-contracts';
import { availableGrantState, planGrantRedemption, transitionLoginTransaction } from '../identity-contracts/lifecycle';
import { createTrustedLoginGrant } from '../identity-contracts/verification';
import { durableAdmissionGate } from '../identity-contracts/durable-store-contracts';
import { composeRemoteDurableAuthentication } from './composition';
import type { RecoveryDescriptor } from '../operation-contracts';

const start = 1_800_000_000_000, hash = (s: string) => createHash('sha256').update(s).digest('hex');
const bytes = { digest: (data: readonly number[]) => createHash('sha256').update(Buffer.from(data)).digest('hex') };
const context: IdentityApplicationContext = { environment: 'TEST', applicationAudience: 'kub:admin:test', expectedScriptId: 'synthetic-renewal-test-script-000000001' };
const seed: RenewalFamilySeed = { ...context, familyId: hash('family'), identityIssuer: 'https://accounts.google.com',
  identitySubject: 'synthetic-visitor', authenticatedAt: start - 1000, upstreamAuthenticationCap: start + 1_200_000,
  rateBudgetReference: hash('rate-reference') };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function fixture() {
  let time = { earliestMs: start, latestMs: start }, current = context, rate = 'ALLOWED' as 'ALLOWED' | 'DENIED' | 'UNAVAILABLE';
  let sequence = 100, binding = 0, commandSequence = 0, silentAvailable = true;
  let key: SigningKeyRule = { ...context, keyId: 'synthetic-key', algorithm: 'RS256', signingNotBefore: start - 10_000,
    signingNotAfter: start + 7_200_000, verificationNotBefore: start - 10_000, verificationNotAfter: start + 7_200_000,
    status: 'ACTIVE', revokedAt: null, compromised: false };
  const policy = (): SigningKeyPolicy => ({ version: 1, brokerIssuer: 'https://broker.invalid', keys: [key] });
  const signature = { verify: vi.fn(() => true) }; // SYNTHETIC verifier ONLY in tests.
  const rateBudget = { claim: vi.fn(() => rate), current: vi.fn(() => rate) };
  const lookup = vi.fn(async (_d: Readonly<RecoveryDescriptor>): Promise<unknown> => ({ outcome: 'OUTCOME_UNKNOWN' }));
  const ports: RenewalReferencePorts = { currentContext: () => current, clock: () => time, keyPolicy: policy,
    secret: vi.fn(() => (++sequence).toString(16).padStart(64, '0')), digest: { ...bytes }, rateBudget,
    silentOidcAvailable: () => silentAvailable, recoveryLookup: lookup, backendOrigin: 'https://auth-test.example.com' };
  const model = new RenewalReferenceModel(seed, { minimumRemainingMs: 5000 }, ports);
  const nextBinding = () => hash('binding-' + ++binding);
  const proof = (tx: Readonly<LoginTransaction>, change: Partial<SignedAssertionClaimsV1> = {}) => {
    const claims: SignedAssertionClaimsV1 = { ...context, protocolVersion: 1, purpose: 'ADMIN_WEB_LOGIN_V1', issuer: policy().brokerIssuer,
      identityIssuer: seed.identityIssuer, subject: seed.identitySubject, authenticatedAt: seed.authenticatedAt,
      authenticationExpiresAt: seed.upstreamAuthenticationCap, transactionId: tx.transactionId, nonce: tx.nonce,
      browserProofBinding: tx.browserProofBinding, assertionId: hash(tx.transactionId + ':assertion'), issuedAt: time.latestMs,
      expiresAt: Math.min(time.latestMs + IDENTITY_TTL.assertionMs, seed.upstreamAuthenticationCap), ...change };
    const message = { assertion: [b64({ typ: 'kub-admin-login+jws', alg: 'RS256', kid: key.keyId }), b64(claims),
      Buffer.alloc(256).toString('base64url')].join('.') };
    return verifySignedAssertion(message, context, policy(), tx, () => time.latestMs, signature);
  };
  const finish = (login: RenewalLoginStart) => {
    const verified = proof(login.transaction), unsent = model.completeVerifiedLogin(login.attempt, verified);
    return { login, verified, unsent };
  };
  const initial = () => finish(model.beginInitialLogin(nextBinding()));
  const renewal = (permit: BeforeDispatchRenewalPermit, mode: 'SILENT' | 'INTERACTIVE' = 'SILENT') =>
    finish(model.beginRenewal(permit, nextBinding(), mode));
  const command = (): ConsumeGrantCommand => {
    const draft: ConsumeGrantCommand = { context, protocolVersion: 1, backendOrigin: ports.backendOrigin,
      operationId: hash('operation-' + ++commandSequence), commandDigest: '', expectedRevision: 0, commandCreatedAt: time.latestMs,
      grantId: model.grantSnapshot()!.grantId, credentialDigest: hash('credential-' + commandSequence), expectedAuthorizationVersion: 3 };
    return { ...draft, commandDigest: atomicOperationDescriptor(draft, bytes).commandDigest };
  };
  const receipt = (d: Readonly<RecoveryDescriptor>, outcome: 'COMMITTED' | 'REJECTED' = 'COMMITTED') => ({ ...context,
    operationKind: d.operationKind, operationId: d.operationId, commandDigest: d.commandDigest, commandCreatedAt: d.commandCreatedAt,
    backendDecisionAt: d.commandCreatedAt, databaseCommittedAt: { status: 'UNAVAILABLE', value: null }, outcome,
    receiptId: d.operationId, objectId: outcome === 'COMMITTED' ? d.expectedObjectId : null,
    revision: outcome === 'COMMITTED' ? d.expectedRevision + 1 : null, code: outcome === 'COMMITTED' ? null : 'EXPIRED',
    retainUntil: seed.upstreamAuthenticationCap });
  const dispatch = (unsent: unknown) => {
    const result = model.dispatch(unsent, command()); if (result.status !== 'DISPATCH_POSSIBLE') throw Error('fixture dispatch failed');
    return result.dispatch;
  };
  const abandon = (unsent: unknown) => {
    const result = model.abandon(unsent); if (result.status !== 'ABANDONED') throw Error('fixture abandon failed'); return result.renewal;
  };
  return { model, ports, rateBudget, lookup, signature, policy, initial, renewal, finish, proof, nextBinding, command, receipt, dispatch, abandon,
    setTime: (now: number) => { time = { earliestMs: now, latestMs: now }; }, setInterval: (value: typeof time) => { time = value; },
    setRate: (value: typeof rate) => { rate = value; }, setSilent: (value: boolean) => { silentAvailable = value; },
    setKey: (value: Partial<SigningKeyRule>) => { key = { ...key, ...value }; }, setContext: (value: typeof context) => { current = value; } };
}

describe('bounded renewal family and independent verified login (local model only)', () => {
  it('keeps immutable server context/cap/rate reference and rejects browser counters or permissions', () => {
    const f = fixture(), snapshot = f.model.inspect();
    expect(snapshot).toMatchObject({ ...seed, generation: 0, completedGrantAttempts: 0, grantsCreated: 0, maximumGrantAttempts: 3 });
    expect(Object.isFrozen(snapshot)).toBe(true); expect(Reflect.set(snapshot, 'maximumGrantAttempts', 4)).toBe(false);
    for (const extra of [{ maximumGrantAttempts: 4 }, { generation: 0 }, { permissions: ['ADMIN'] }])
      expect(() => new RenewalReferenceModel({ ...seed, ...extra } as any, { minimumRemainingMs: 5000 }, f.ports)).toThrow();
    expect(() => new RenewalReferenceModel(snapshot as any, { minimumRemainingMs: 5000 }, f.ports)).toThrow();
    expect(() => f.model.beginInitialLogin({ browserProofBinding: f.nextBinding(), roles: ['ADMIN'] })).toThrow();
    expect(f.model.inspect().terminalState).toBe('BLOCKED');
  });
  it('does not create a second family or restart an existing family with another initial transaction', () => {
    const f = fixture(); f.initial(); expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow();
    expect(f.model.inspect()).toMatchObject({ familyId: seed.familyId, grantsCreated: 1, generation: 0 });
    expect(f.rateBudget.claim).toHaveBeenCalledTimes(1);
  });
  it('abandons first and second insufficient grants, then dispatches the third without extending any grant TTL', () => {
    const f = fixture(), first = f.initial(), g1 = f.model.grantSnapshot()!;
    f.setTime(g1.expiresAt - 1); const second = f.renewal(f.abandon(first.unsent)), g2 = f.model.grantSnapshot()!;
    expect(g2.issuedAt).toBeLessThan(g1.expiresAt); // No requirement to wait for old grant expiry.
    f.setTime(g2.expiresAt - 1); const third = f.renewal(f.abandon(second.unsent)), g3 = f.model.grantSnapshot()!;
    expect(f.model.assess(third.unsent).status).toBe('READY_FOR_ATTEMPT'); f.dispatch(third.unsent);
    expect(f.model.inspect()).toMatchObject({ familyId: seed.familyId, generation: 2, completedGrantAttempts: 2,
      grantsCreated: 3, maximumGrantAttempts: 3, silentRenewalAttempts: 2, state: 'DISPATCH_POSSIBLE', handoffs: 1 });
    for (const [i, grant] of [g1, g2, g3].entries()) {
      expect(grant.grantId).toBe(grant.transactionId); expect(grant.expiresAt - grant.issuedAt).toBe(30_000);
      expect(grant.authenticationExpiresAt).toBe(seed.upstreamAuthenticationCap);
      expect(f.model.grantSnapshot(i)).toBe(grant); expect(grant.consumedAt).toBeNull();
    }
    expect(new Set([g1.transactionId, g2.transactionId, g3.transactionId]).size).toBe(3);
    expect(new Set([g1.assertionId, g2.assertionId, g3.assertionId]).size).toBe(3);
    expect(new Set([first.login.transaction.nonce, second.login.transaction.nonce, third.login.transaction.nonce]).size).toBe(3);
    expect(new Set([first.login.transaction.browserProofBinding, second.login.transaction.browserProofBinding, third.login.transaction.browserProofBinding]).size).toBe(3);
    expect(f.signature.verify).toHaveBeenCalledTimes(3); expect(f.rateBudget.claim).toHaveBeenCalledTimes(3);
    expect(f.rateBudget.claim.mock.calls).toEqual([[seed.rateBudgetReference, seed.familyId, 0], [seed.rateBudgetReference, seed.familyId, 1],
      [seed.rateBudgetReference, seed.familyId, 2]]);
  });
  it('terminates after the third insufficient grant with no fourth automatic transaction or silent attempt', () => {
    const f = fixture(); let active = f.initial(), lastPermit!: BeforeDispatchRenewalPermit;
    for (let n = 0; n < 2; n++) {
      f.setTime(f.model.grantSnapshot()!.expiresAt - 1); lastPermit = f.abandon(active.unsent); active = f.renewal(lastPermit);
    }
    f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    expect(f.model.abandon(active.unsent)).toEqual({ status: 'BLOCKED', reason: 'RENEWAL_LIMIT_REACHED' });
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 3, completedGrantAttempts: 3, generation: 2, terminalState: 'BLOCKED', handoffs: 0 });
    const calls = vi.mocked(f.ports.secret).mock.calls.length;
    expect(() => f.model.beginRenewal(lastPermit, f.nextBinding(), 'SILENT')).toThrow();
    expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow();
    expect(vi.mocked(f.ports.secret)).toHaveBeenCalledTimes(calls); expect(f.rateBudget.claim).toHaveBeenCalledTimes(3);
  });
  it('abandons expired grants without consumption, if upstream authentication is still live', () => {
    const f = fixture(), first = f.initial(), grant = f.model.grantSnapshot()!; f.setTime(grant.expiresAt);
    expect(f.model.assess(first.unsent)).toMatchObject({ status: 'ABANDON_BEFORE_DISPATCH', reason: 'GRANT_EXPIRED' });
    const permit = f.abandon(first.unsent); f.renewal(permit);
    expect(f.model.grantSnapshot(0)).toBe(grant); expect(grant).toMatchObject({ status: 'AVAILABLE', consumedAt: null });
  });
  it('preserves the transaction lifetime cap and renews using a different transaction before old expiry', () => {
    const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding());
    f.setTime(login.transaction.expiresAt - 1); const first = f.finish(login), grant = f.model.grantSnapshot()!;
    expect(grant.expiresAt).toBe(login.transaction.expiresAt); expect(grant.expiresAt - grant.issuedAt).toBe(1);
    const next = f.renewal(f.abandon(first.unsent));
    expect(next.login.transaction.transactionId).not.toBe(login.transaction.transactionId);
    expect(f.model.grantSnapshot()!.expiresAt - f.model.grantSnapshot()!.issuedAt).toBe(30_000);
    expect(f.model.grantSnapshot(0)).toBe(grant);
  });
  it('rejects reuse of a consumed assertion instead of creating another grant', () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 6000);
    // Initial proof is expired here too; either runtime freshness or binding/replay must deny.
    f.setTime(f.model.grantSnapshot()!.expiresAt - 1); const permit = f.abandon(first.unsent);
    const next = f.model.beginRenewal(permit, f.nextBinding(), 'SILENT');
    expect(() => f.model.completeVerifiedLogin(next.attempt, first.verified)).toThrow();
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, terminalState: 'BLOCKED' });
  });
  it('rejects a still-live independently verified assertion that reuses an earlier assertion ID', () => {
    const f = fixture(), first = f.initial(), original = f.model.grantSnapshot()!;
    f.setTime(original.expiresAt - 1); const next = f.model.beginRenewal(f.abandon(first.unsent), f.nextBinding(), 'SILENT');
    const repeated = f.proof(next.transaction, { assertionId: original.assertionId });
    expect(() => f.model.completeVerifiedLogin(next.attempt, repeated)).toThrow('LOGIN_INVALID');
    expect(f.model.inspect().grantsCreated).toBe(1);
  });
  it.each([{ subject: 'another-user' }, { authenticationExpiresAt: seed.upstreamAuthenticationCap + 1, authenticatedAt: seed.authenticatedAt + 1 },
    { authenticationExpiresAt: seed.upstreamAuthenticationCap + 1 }])('rejects changed identity or unsupported upstream renewal (%#)', change => {
      const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding());
      const proof = f.proof(login.transaction, change);
      expect(() => f.model.completeVerifiedLogin(login.attempt, proof)).toThrow();
      expect(f.model.inspect()).toMatchObject({ grantsCreated: 0, terminalState: 'BLOCKED', upstreamAuthenticationCap: seed.upstreamAuthenticationCap });
    });
  it('rejects a different issuer before it can produce verified login evidence', () => {
    const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding());
    expect(() => f.proof(login.transaction, { identityIssuer: 'https://evil.invalid' as any })).toThrow();
    expect(f.model.inspect().grantsCreated).toBe(0);
  });
  it('never raises a shortened signed upstream cap back to the original family cap', () => {
    const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding()), cap = seed.upstreamAuthenticationCap - 1000;
    const proof = f.proof(login.transaction, { authenticationExpiresAt: cap });
    const unsent = f.model.completeVerifiedLogin(login.attempt, proof);
    f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const next = f.model.beginRenewal(f.abandon(unsent), f.nextBinding(), 'SILENT');
    expect(() => f.model.completeVerifiedLogin(next.attempt, f.proof(next.transaction))).toThrow('UPSTREAM_CAP_CHANGED');
    expect(f.model.inspect()).toMatchObject({ upstreamAuthenticationCap: seed.upstreamAuthenticationCap,
      effectiveUpstreamAuthenticationCap: cap, grantsCreated: 1, terminalState: 'BLOCKED' });
  });
  it('rejects JSON/casts of verification evidence', () => {
    const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding()), proof = f.proof(login.transaction);
    expect(() => f.model.completeVerifiedLogin(login.attempt, JSON.parse(JSON.stringify(proof)))).toThrow();
    expect(f.model.inspect().grantsCreated).toBe(0);
  });
  it('requires a new browser proof binding on renewal', () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const permit = f.abandon(first.unsent);
    expect(() => f.model.beginRenewal(permit, first.login.transaction.browserProofBinding, 'SILENT')).toThrow('LOGIN_INVALID');
    expect(f.model.inspect().grantsCreated).toBe(1);
  });
  it.each(['UNAVAILABLE', 'DENIED'] as const)('blocks unavailable or exhausted rate budget %s', status => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const permit = f.abandon(first.unsent); f.setRate(status);
    expect(() => f.renewal(permit)).toThrow(); expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, terminalState: 'BLOCKED' });
  });
  it('treats throwing rate dependencies as unavailable without exposing their messages', () => {
    const f = fixture(); f.rateBudget.claim.mockImplementation(() => { throw Error('PRIVATE_RATE_FAILURE'); });
    expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow('SAFE_RENEWAL_RATE_UNAVAILABLE');
    expect(f.model.inspect().failure).toBe('RATE_UNAVAILABLE');
  });
  it('stops on silent OIDC failure and cannot turn it into an automatic interactive loop', () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const permit = f.abandon(first.unsent); f.setSilent(false);
    expect(() => f.renewal(permit)).toThrow('INTERACTION_REQUIRED');
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, silentRenewalAttempts: 1, terminalState: 'BLOCKED' });
    expect(() => f.renewal(permit, 'INTERACTIVE')).toThrow(); expect(f.signature.verify).toHaveBeenCalledTimes(1);
  });
  it('terminates a started silent flow on interaction-required instead of issuing a grant or retrying', () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const permit = f.abandon(first.unsent), next = f.model.beginRenewal(permit, f.nextBinding(), 'SILENT');
    expect(f.model.loginFailed(next.attempt, 'INTERACTION_REQUIRED')).toEqual({ status: 'BLOCKED', reason: 'INTERACTION_REQUIRED' });
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, silentRenewalAttempts: 1, terminalState: 'BLOCKED' });
    expect(() => f.renewal(permit)).toThrow(); expect(() => f.finish(next)).toThrow();
  });
  it('blocks expired upstream authentication and does not restore it with another grant', () => {
    const f = fixture(), first = f.initial(); f.setTime(seed.upstreamAuthenticationCap);
    expect(f.model.abandon(first.unsent)).toEqual({ status: 'BLOCKED', reason: 'UPSTREAM_EXPIRED' });
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, terminalState: 'BLOCKED' });
  });
  it('honors lifetime caps near upstream expiry and keeps the 30s maximum unchanged', () => {
    const f = fixture(); f.setTime(seed.upstreamAuthenticationCap - 25_000);
    const first = f.initial(), grant = f.model.grantSnapshot()!;
    expect(grant.expiresAt).toBe(seed.upstreamAuthenticationCap); expect(grant.expiresAt - grant.issuedAt).toBe(25_000);
    f.setTime(grant.expiresAt - 4999);
    expect(f.model.abandon(first.unsent)).toEqual({ status: 'BLOCKED', reason: 'UPSTREAM_INSUFFICIENT' });
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, silentRenewalAttempts: 0 });
  });
});

describe('private non-dispatch capabilities and mutually exclusive local transitions', () => {
  it('does not accept an externally supplied READY decision or family JSON as proof of unsent', () => {
    const f = fixture(), first = f.initial();
    for (const fake of [{ ...first.unsent }, JSON.parse(JSON.stringify(first.unsent)), Object.create(first.unsent),
      f.model.inspect(), { status: 'BEFORE_DISPATCH', verified: true }, { status: 'READY_FOR_ATTEMPT' }]) {
      expect(() => f.model.dispatch(fake as any, f.command())).toThrow(); expect(() => f.model.abandon(fake as any)).toThrow();
    }
    expect(() => fixture().model.assess(first.unsent)).toThrow();
    expect(() => new (first.unsent.constructor as any)({}, {}, 'UNSENT', 0)).toThrow();
    expect(f.model.inspect()).toMatchObject({ handoffs: 0, completedGrantAttempts: 0 });
  });
  it('rejects dispatch from abandoned and older generations', () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const permit = f.abandon(first.unsent); expect(() => f.dispatch(first.unsent)).toThrow();
    const next = f.renewal(permit); expect(() => f.model.assess(first.unsent)).toThrow();
    expect(f.model.assess(next.unsent).status).toBe('READY_FOR_ATTEMPT');
    expect(() => f.renewal(permit)).toThrow(); expect(f.model.inspect().handoffs).toBe(0);
  });
  it.each(['abandon-first', 'dispatch-first'] as const)('has one winner for two scheduled actors (%s)', async order => {
    const f = fixture(), first = f.initial(), original = f.model.grantSnapshot()!;
    const abandon = () => { f.setTime(original.expiresAt - 1); return f.model.abandon(first.unsent); };
    const dispatch = () => f.model.dispatch(first.unsent, f.command());
    const actions: Array<() => unknown> = order === 'abandon-first' ? [abandon, dispatch] : [dispatch, abandon];
    const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const state = f.model.inspect(); expect(state.completedGrantAttempts + state.handoffs).toBe(1);
    expect(state.state).toBe(order === 'abandon-first' ? 'ABANDONED' : 'DISPATCH_POSSIBLE');
  });
  it('rechecks remaining time after command preparation instead of trusting an earlier READY result', () => {
    const f = fixture(), first = f.initial(), command = f.command(); expect(f.model.assess(first.unsent).status).toBe('READY_FOR_ATTEMPT');
    const digest = f.ports.digest.digest;
    vi.spyOn(f.ports.digest, 'digest').mockImplementation(data => {
      const result = digest(data); f.setTime(f.model.grantSnapshot()!.expiresAt - 1); return result;
    });
    expect(f.model.dispatch(first.unsent, command).status).toBe('ABANDON_BEFORE_DISPATCH');
    expect(f.model.inspect().handoffs).toBe(0); f.abandon(first.unsent);
  });
  it('does not revive a grant when the clock rolls back after a denied observation', () => {
    const f = fixture(), first = f.initial(), grant = f.model.grantSnapshot()!;
    f.setTime(grant.expiresAt); expect(f.model.assess(first.unsent).status).toBe('ABANDON_BEFORE_DISPATCH');
    f.setTime(grant.issuedAt); expect(f.model.dispatch(first.unsent, f.command())).toEqual({ status: 'BLOCKED', reason: 'CLOCK_ROLLBACK' });
    expect(f.model.inspect()).toMatchObject({ handoffs: 0, terminalState: 'BLOCKED' });
  });
  it('fails closed on an invalid clock and changing runtime context', () => {
    const bad = fixture(), first = bad.initial(); bad.setInterval({ earliestMs: NaN, latestMs: start });
    expect(bad.model.dispatch(first.unsent, bad.command())).toEqual({ status: 'BLOCKED', reason: 'CLOCK_INVALID' });
    const other = fixture(), login = other.initial(); other.setContext({ ...context, environment: 'PRODUCTION' });
    expect(other.model.abandon(login.unsent)).toEqual({ status: 'BLOCKED', reason: 'CONTEXT_INVALID' });
  });
  it('blocks compromised/revoked keys rather than renewing around a security failure', () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1); f.setKey({ compromised: true });
    expect(f.model.abandon(first.unsent)).toEqual({ status: 'BLOCKED', reason: 'KEY_UNAVAILABLE' });
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, handoffs: 0, terminalState: 'BLOCKED' });
  });
  it('rejects changed command binding and never forwards an unsealed mutation', () => {
    const f = fixture(), first = f.initial(), cmd = f.command();
    for (const change of [{ commandDigest: hash('wrong') }, { grantId: hash('wrong') }, { expectedRevision: 1 },
      { context: { ...context, environment: 'PRODUCTION' as const } }, { permissions: ['ADMIN'] }])
      expect(() => f.model.dispatch(first.unsent, { ...cmd, ...change } as any)).toThrow();
    expect(f.model.inspect().handoffs).toBe(0);
  });
  it('does not expose a throwing command-digest adapter error or mark a handoff', () => {
    const f = fixture(), first = f.initial(), cmd = f.command();
    vi.spyOn(f.ports.digest, 'digest').mockImplementation(() => { throw Error('PRIVATE_DIGEST_FAILURE'); });
    expect(() => f.model.dispatch(first.unsent, cmd)).toThrow('SAFE_RENEWAL_INVALID_OPERATION');
    expect(f.model.inspect()).toMatchObject({ handoffs: 0, state: 'BEFORE_DISPATCH' });
  });
  it.each(['UNAVAILABLE', 'DENIED'] as const)('rechecks current rate status %s before handoff', rate => {
    const f = fixture(), first = f.initial(), cmd = f.command(); f.setRate(rate);
    expect(f.model.dispatch(first.unsent, cmd)).toMatchObject({ status: 'BLOCKED' });
    expect(f.model.inspect()).toMatchObject({ handoffs: 0, terminalState: 'BLOCKED', grantsCreated: 1 });
  });
});

describe('post-handoff recovery is read-only and cannot create a replacement grant/session', () => {
  it('keeps exceptions and unknown dispatch intent in recovery, never BEFORE_DISPATCH', () => {
    const f = fixture(), first = f.initial(), dispatched = f.dispatch(first.unsent);
    try { throw Error('SYNTHETIC_AFTER_HANDOFF'); } catch { f.model.markOutcomeUnknown(dispatched); }
    expect(f.model.inspect()).toMatchObject({ state: 'RECOVERY_REQUIRED', handoffs: 1, grantsCreated: 1 });
    expect(() => f.model.beginRenewal(dispatched, f.nextBinding(), 'SILENT')).toThrow();
    expect(() => f.model.abandon(first.unsent)).toThrow(); expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow();
  });
  it.each(['OUTCOME_UNKNOWN', 'UNAVAILABLE', 'throw'] as const)('does not infer rollback from %s lookup', async outcome => {
    const f = fixture(), first = f.initial(), dispatched = f.dispatch(first.unsent), before = f.model.grantSnapshot();
    if (outcome === 'throw') f.lookup.mockRejectedValue(Error('PRIVATE_LOOKUP_ERROR'));
    else f.lookup.mockResolvedValue({ outcome });
    expect(await f.model.recover(dispatched)).toEqual({ status: 'RECOVERY_REQUIRED' });
    expect(await f.model.recover(dispatched)).toEqual({ status: 'RECOVERY_REQUIRED' });
    expect(f.model.inspect()).toMatchObject({ state: 'RECOVERY_REQUIRED', handoffs: 1, grantsCreated: 1 });
    expect(f.model.grantSnapshot()).toBe(before); expect(f.rateBudget.claim).toHaveBeenCalledTimes(1);
    expect(vi.mocked(f.ports.secret)).toHaveBeenCalledTimes(2);
    expect(f.lookup.mock.calls[0][0]).toEqual(f.lookup.mock.calls[1][0]);
    expect(Object.isFrozen(f.lookup.mock.calls[0][0])).toBe(true);
  });
  it.each(['COMMITTED', 'REJECTED'] as const)('confirms %s receipt metadata without issuing a credential, new grant or changed TTL', async outcome => {
    const f = fixture(), first = f.initial(), cmd = f.command(), before = f.model.grantSnapshot()!;
    const result = f.model.dispatch(first.unsent, cmd); if (result.status !== 'DISPATCH_POSSIBLE') throw Error('fixture');
    (cmd as { operationId: string }).operationId = hash('mutated-command'); // Caller mutation must not alter captured descriptor.
    f.lookup.mockImplementation(async d => f.receipt(d, outcome));
    f.setTime(before.expiresAt + 10_000); // Historical receipt still resolves; it does not revive the expired grant.
    const recovered = await f.model.recover(result.dispatch);
    expect(recovered).toEqual({ status: 'CONFIRMED', outcome }); expect(recovered).not.toHaveProperty('sessionCredential');
    expect(f.model.inspect()).toMatchObject({ terminalState: 'CONFIRMED', grantsCreated: 1, handoffs: 1, completedGrantAttempts: 1 });
    expect(f.model.grantSnapshot()).toBe(before); expect(f.lookup.mock.calls[0][0].operationId).not.toBe(cmd.operationId);
    expect(() => f.model.beginRenewal(result.dispatch, f.nextBinding(), 'SILENT')).toThrow();
  });
  it.each(['context', 'digest', 'object', 'revision', 'raw-bearer'] as const)('rejects unbound or malformed receipt %s', async mode => {
    const f = fixture(), first = f.initial(), dispatched = f.dispatch(first.unsent);
    f.lookup.mockImplementation(async d => ({ ...f.receipt(d), ...(mode === 'context' ? { environment: 'PRODUCTION' } :
      mode === 'digest' ? { commandDigest: hash('wrong') } : mode === 'object' ? { objectId: hash('wrong') } :
        mode === 'revision' ? { revision: 5 } : { sessionCredential: 'DO_NOT_RETURN' }) }));
    expect(await f.model.recover(dispatched)).toEqual({ status: 'RECOVERY_REQUIRED' });
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, handoffs: 1, state: 'RECOVERY_REQUIRED' });
  });
  it('does not regress confirmed state when an older concurrent lookup finishes unavailable', async () => {
    const f = fixture(), first = f.initial(), dispatched = f.dispatch(first.unsent);
    let release!: (value: unknown) => void;
    f.lookup.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = f.model.recover(dispatched);
    f.lookup.mockImplementationOnce(async d => f.receipt(d));
    expect(await f.model.recover(dispatched)).toEqual({ status: 'CONFIRMED', outcome: 'COMMITTED' });
    release({ outcome: 'UNAVAILABLE' }); expect(await pending).toEqual({ status: 'CONFIRMED', outcome: 'COMMITTED' });
    expect(f.model.inspect()).toMatchObject({ terminalState: 'CONFIRMED', completedGrantAttempts: 1, handoffs: 1 });
  });
  it('rejects forged/cross-owner recovery capability and cannot rehydrate unsent state from JSON', async () => {
    const f = fixture(), first = f.initial(), dispatched = f.dispatch(first.unsent);
    await expect(f.model.recover(JSON.parse(JSON.stringify(dispatched)))).rejects.toThrow();
    await expect(fixture().model.recover(dispatched)).rejects.toThrow(); expect(f.lookup).not.toHaveBeenCalled();
  });
  it('cannot start a replacement while an authoritative read is still pending', async () => {
    const f = fixture(), first = f.initial(), dispatched = f.dispatch(first.unsent);
    let release!: (value: unknown) => void;
    f.lookup.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = f.model.recover(dispatched);
    expect(() => f.model.beginRenewal(dispatched, f.nextBinding(), 'SILENT')).toThrow();
    expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow();
    expect(f.model.inspect()).toMatchObject({ state: 'RECOVERY_REQUIRED', grantsCreated: 1, handoffs: 1 });
    release({ outcome: 'UNAVAILABLE' }); expect(await pending).toEqual({ status: 'RECOVERY_REQUIRED' });
  });
  it('does not reopen a confirmed family as unknown or reuse its dispatch evidence', async () => {
    const f = fixture(), first = f.initial(), dispatched = f.dispatch(first.unsent);
    f.lookup.mockImplementation(async d => f.receipt(d)); await f.model.recover(dispatched);
    expect(() => f.model.markOutcomeUnknown(dispatched)).toThrow();
    await expect(f.model.recover(dispatched)).rejects.toThrow();
    expect(f.lookup).toHaveBeenCalledTimes(1); expect(f.model.inspect().terminalState).toBe('CONFIRMED');
  });
  it('leaves the normative session TTL/upstream cap and remote gate unchanged', async () => {
    const f = fixture(), first = f.initial();
    const verifiedTx = transitionLoginTransaction(first.login.transaction, context, 'VERIFIED', start);
    const grant = createTrustedLoginGrant(first.verified.data.legacy, verifiedTx, context, start);
    const user = { issuer: seed.identityIssuer, subject: seed.identitySubject, active: true, authorizationVersion: 3 };
    const now = start + 25_000;
    const session = planGrantRedemption(grant, availableGrantState(grant, context, now), context, user, now).sessionPlan;
    expect(session.expiresAt).toBe(Math.min(now + 900_000, seed.upstreamAuthenticationCap));
    const original = JSON.stringify(session); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    f.renewal(f.abandon(first.unsent)); expect(JSON.stringify(session)).toBe(original);
    expect(IDENTITY_TTL).toEqual({ transactionMs: 120_000, assertionMs: 20_000, grantMs: 30_000, sessionMs: 900_000, authenticationMaxAgeMs: 3_600_000 });
    expect(durableAdmissionGate(f.model.inspect()).status).toBe('BLOCKED');
    expect(await composeRemoteDurableAuthentication({ readiness: 'READY_FOR_ATTEMPT', family: f.model.inspect() }).authorize({}, 'USER_MANAGE'))
      .toEqual({ status: 'DENIED' });
  });
});

describe('2C.3B.5a reentrancy and fresh-time counterexamples', () => {
  it('R1 rejects nested dispatch during the policy read with at most one handoff', () => {
    const f = fixture(), first = f.initial(), outerCommand = f.command(), nestedCommand = f.command();
    const original = f.ports.keyPolicy; let entered = false, rejection: unknown;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => {
      if (!entered) {
        entered = true;
        try { f.model.dispatch(first.unsent, nestedCommand); } catch (error) { rejection = error; }
      }
      return original();
    });
    expect(f.model.dispatch(first.unsent, outerCommand).status).toBe('DISPATCH_POSSIBLE');
    expect(rejection).toBeInstanceOf(Error); expect(f.model.inspect().handoffs).toBe(1);
    expect(() => f.model.dispatch(first.unsent, outerCommand)).toThrow();
  });
  it('R2 rejects a nested abandon/renewal/dispatch chain and preserves subsequent recovery', async () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const original = f.ports.keyPolicy; let entered = false, rejection: unknown;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => {
      if (!entered) {
        entered = true;
        try {
          const next = f.renewal(f.abandon(first.unsent)), handoff = f.dispatch(next.unsent);
          f.model.markOutcomeUnknown(handoff);
        } catch (error) { rejection = error; }
      }
      return original();
    });
    const permit = f.abandon(first.unsent);
    expect(rejection).toBeInstanceOf(Error);
    expect(f.model.inspect()).toMatchObject({ state: 'ABANDONED', grantsCreated: 1, handoffs: 0 });
    const next = f.renewal(permit), handoff = f.dispatch(next.unsent); f.model.markOutcomeUnknown(handoff);
    expect(() => f.model.abandon(first.unsent)).toThrow(); expect(() => f.renewal(permit)).toThrow();
    expect(f.model.inspect()).toMatchObject({ state: 'RECOVERY_REQUIRED', grantsCreated: 2, handoffs: 1 });
    expect(await f.model.recover(handoff)).toEqual({ status: 'RECOVERY_REQUIRED' });
    f.lookup.mockImplementation(async d => f.receipt(d));
    expect(await f.model.recover(handoff)).toEqual({ status: 'CONFIRMED', outcome: 'COMMITTED' });
  });
  it('R3 checks the final clock after policy latency and never dispatches an expired grant', () => {
    const f = fixture(), first = f.initial(), cmd = f.command(), grant = f.model.grantSnapshot()!;
    const original = f.ports.keyPolicy;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => { f.setTime(grant.expiresAt); return original(); });
    expect(f.model.dispatch(first.unsent, cmd)).toEqual({ status: 'ABANDON_BEFORE_DISPATCH', reason: 'GRANT_EXPIRED', remainingMs: 0 });
    expect(f.model.inspect().handoffs).toBe(0);
  });
  it('R4 rejects an assertion that reaches expiry during the policy read', () => {
    const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding()), verified = f.proof(login.transaction);
    const original = f.ports.keyPolicy;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => { f.setTime(verified.data.claims.expiresAt); return original(); });
    expect(() => f.model.completeVerifiedLogin(login.attempt, verified)).toThrow();
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 0, terminalState: 'BLOCKED' });
    expect(() => f.model.completeVerifiedLogin(login.attempt, verified)).toThrow();
  });
  it.each(['claim', 'secret', 'context', 'clock'] as const)('guards initial login before its first %s callback', stage => {
    const f = fixture(); let entered = false, rejection: unknown;
    const nested = () => {
      if (entered) return; entered = true;
      try { f.model.beginInitialLogin(f.nextBinding()); } catch (error) { rejection = error; }
    };
    if (stage === 'claim') {
      const original = f.rateBudget.claim.getMockImplementation()!;
      f.rateBudget.claim.mockImplementation(() => { nested(); return original(); });
    }
    if (stage === 'secret') {
      const original = vi.mocked(f.ports.secret).getMockImplementation()!;
      vi.spyOn(f.ports, 'secret').mockImplementation(() => { nested(); return original(); });
    }
    if (stage === 'context') {
      const original = f.ports.currentContext; vi.spyOn(f.ports, 'currentContext').mockImplementation(() => { nested(); return original(); });
    }
    if (stage === 'clock') {
      const original = f.ports.clock; vi.spyOn(f.ports, 'clock').mockImplementation(() => { nested(); return original(); });
    }
    const login = f.model.beginInitialLogin(f.nextBinding());
    expect(rejection).toBeInstanceOf(Error); expect((rejection as Error).message).toBe('SAFE_RENEWAL_REENTRANT');
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 0, generation: 0, completedGrantAttempts: 0 });
    f.finish(login); expect(f.model.inspect()).toMatchObject({ grantsCreated: 1, state: 'BEFORE_DISPATCH' });
  });
  it('guards renewal during silent-availability callback without spending another generation', () => {
    const f = fixture(), first = f.initial(); f.setTime(f.model.grantSnapshot()!.expiresAt - 1);
    const permit = f.abandon(first.unsent); let entered = false, rejection: unknown;
    vi.spyOn(f.ports, 'silentOidcAvailable').mockImplementation(() => {
      if (!entered) {
        entered = true;
        try { f.model.beginRenewal(permit, f.nextBinding(), 'SILENT'); } catch (error) { rejection = error; }
      }
      return true;
    });
    f.renewal(permit);
    expect((rejection as Error).message).toBe('SAFE_RENEWAL_REENTRANT');
    expect(f.model.inspect()).toMatchObject({ generation: 1, grantsCreated: 2, completedGrantAttempts: 1, silentRenewalAttempts: 1 });
    expect(f.rateBudget.claim).toHaveBeenCalledTimes(2);
  });
  it('rejects nested loginFailed before it can invoke stop on an active verified-login path', () => {
    const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding()), verified = f.proof(login.transaction);
    const original = f.ports.keyPolicy; let rejection: unknown;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => {
      try { f.model.loginFailed(login.attempt, 'INTERACTION_REQUIRED'); } catch (error) { rejection = error; }
      return original();
    });
    const unsent = f.model.completeVerifiedLogin(login.attempt, verified);
    expect((rejection as Error).message).toBe('SAFE_RENEWAL_REENTRANT');
    expect(f.model.inspect()).toMatchObject({ state: 'BEFORE_DISPATCH', failure: null, grantsCreated: 1 });
    expect(f.model.assess(unsent).status).toBe('READY_FOR_ATTEMPT');
  });
  it('guards assess high-water mutation from nested dispatch in rate.current', () => {
    const f = fixture(), first = f.initial(), command = f.command(); let entered = false, rejection: unknown;
    f.rateBudget.current.mockImplementation(() => {
      if (!entered) {
        entered = true;
        try { f.model.dispatch(first.unsent, command); } catch (error) { rejection = error; }
      }
      return 'ALLOWED';
    });
    expect(f.model.assess(first.unsent).status).toBe('READY_FOR_ATTEMPT');
    expect((rejection as Error).message).toBe('SAFE_RENEWAL_REENTRANT');
    expect(f.model.inspect()).toMatchObject({ state: 'BEFORE_DISPATCH', handoffs: 0 });
    expect(f.model.dispatch(first.unsent, command).status).toBe('DISPATCH_POSSIBLE');
  });
  it('rejects nested assess during a policy callback and releases the guard for a normal later read', () => {
    const f = fixture(), first = f.initial(), original = f.ports.keyPolicy; let entered = false, rejection: unknown;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => {
      if (!entered) {
        entered = true;
        try { f.model.assess(first.unsent); } catch (error) { rejection = error; }
      }
      return original();
    });
    expect(f.model.assess(first.unsent).status).toBe('READY_FOR_ATTEMPT');
    expect((rejection as Error).message).toBe('SAFE_RENEWAL_REENTRANT');
    expect(f.model.assess(first.unsent).status).toBe('READY_FOR_ATTEMPT');
  });
  it('releases the guard after a throwing dependency without restoring terminal state', () => {
    const f = fixture(); vi.spyOn(f.ports, 'secret').mockImplementation(() => { throw Error('PRIVATE_SECRET_FAILURE'); });
    expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow('SAFE_RENEWAL_DEPENDENCY_UNAVAILABLE');
    expect(f.model.inspect()).toMatchObject({ terminalState: 'BLOCKED', grantsCreated: 0 });
    expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow('SAFE_RENEWAL_STALE_ATTEMPT');
  });
  it('releases the guard after a failed assessment without undoing observations', () => {
    const f = fixture(), first = f.initial();
    f.rateBudget.current.mockImplementationOnce(() => { throw Error('PRIVATE_RATE_FAILURE'); });
    expect(f.model.assess(first.unsent)).toEqual({ status: 'BLOCKED', reason: 'RATE_UNAVAILABLE' });
    expect(f.model.assess(first.unsent).status).toBe('READY_FOR_ATTEMPT');
    expect(f.model.inspect()).toMatchObject({ state: 'BEFORE_DISPATCH', handoffs: 0 });
  });
  it('uses runtime-private state/helpers so casts or shadow properties cannot clear the guard or recovery', () => {
    const f = fixture(), first = f.initial(), handoff = f.dispatch(first.unsent); f.model.markOutcomeUnknown(handoff);
    const unsafe = f.model as any;
    expect(unsafe.stop).toBeUndefined(); expect(unsafe.proof).toBeUndefined(); expect(unsafe.capability).toBeUndefined();
    Object.assign(unsafe, { entered: false, state: 'BEFORE_DISPATCH', generation: 0, completed: 0, capability: first.unsent });
    expect(() => f.model.abandon(first.unsent)).toThrow(); expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow();
    expect(f.model.inspect()).toMatchObject({ state: 'RECOVERY_REQUIRED', grantsCreated: 1, handoffs: 1 });
  });
  it('guards recovery setup callbacks and permits later read-only resolution', async () => {
    const f = fixture(), first = f.initial(), handoff = f.dispatch(first.unsent); let rejection: unknown;
    f.lookup.mockImplementationOnce(async d => {
      try { f.model.markOutcomeUnknown(handoff); } catch (error) { rejection = error; }
      return f.receipt(d);
    });
    expect(await f.model.recover(handoff)).toEqual({ status: 'CONFIRMED', outcome: 'COMMITTED' });
    expect((rejection as Error).message).toBe('SAFE_RENEWAL_REENTRANT');
    expect(f.model.inspect()).toMatchObject({ terminalState: 'CONFIRMED', handoffs: 1, grantsCreated: 1 });
  });
  it('rejects async recovery reentry before another lookup while retaining the original obligation', async () => {
    const f = fixture(), first = f.initial(), handoff = f.dispatch(first.unsent);
    let nested!: Promise<unknown>;
    f.lookup.mockImplementationOnce(async () => {
      nested = f.model.recover(handoff); void nested.catch(() => undefined);
      return { outcome: 'UNAVAILABLE' };
    });
    expect(await f.model.recover(handoff)).toEqual({ status: 'RECOVERY_REQUIRED' });
    await expect(nested).rejects.toThrow('SAFE_RENEWAL_REENTRANT'); expect(f.lookup).toHaveBeenCalledTimes(1);
    f.lookup.mockImplementationOnce(async d => f.receipt(d));
    expect(await f.model.recover(handoff)).toEqual({ status: 'CONFIRMED', outcome: 'COMMITTED' });
  });
  it('guards recovery completion clock callbacks without letting nested stop erase the operation', async () => {
    const f = fixture(), first = f.initial(), handoff = f.dispatch(first.unsent), original = f.ports.clock;
    let rejection: unknown;
    vi.spyOn(f.ports, 'clock').mockImplementation(() => {
      try { f.model.loginFailed(handoff as any, 'DEPENDENCY_UNAVAILABLE'); } catch (error) { rejection = error; }
      return original();
    });
    f.lookup.mockImplementation(async d => f.receipt(d));
    expect(await f.model.recover(handoff)).toEqual({ status: 'CONFIRMED', outcome: 'COMMITTED' });
    expect((rejection as Error).message).toBe('SAFE_RENEWAL_REENTRANT'); expect(f.model.inspect().completedGrantAttempts).toBe(1);
  });
  it('preserves recovery after a synchronous throwing lookup and releases its guard', async () => {
    const f = fixture(), first = f.initial(), handoff = f.dispatch(first.unsent);
    f.lookup.mockImplementationOnce(() => { throw Error('PRIVATE_LOOKUP_FAILURE'); });
    expect(await f.model.recover(handoff)).toEqual({ status: 'RECOVERY_REQUIRED' });
    expect(f.model.inspect().state).toBe('RECOVERY_REQUIRED');
    f.lookup.mockImplementationOnce(async d => f.receipt(d));
    expect(await f.model.recover(handoff)).toEqual({ status: 'CONFIRMED', outcome: 'COMMITTED' });
  });
  it('rejects assertion expiry reached during rate.current, after independent verification', () => {
    const f = fixture(), login = f.model.beginInitialLogin(f.nextBinding()), verified = f.proof(login.transaction);
    f.rateBudget.current.mockImplementation(() => { f.setTime(verified.data.claims.expiresAt); return 'ALLOWED'; });
    expect(() => f.model.completeVerifiedLogin(login.attempt, verified)).toThrow();
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 0, terminalState: 'BLOCKED' });
  });
  it.each(['rate', 'policy'] as const)('uses final time after %s latency for the minimum reserve', dependency => {
    const f = fixture(), first = f.initial(), command = f.command(), grant = f.model.grantSnapshot()!;
    if (dependency === 'rate') f.rateBudget.current.mockImplementation(() => { f.setTime(grant.expiresAt - 4999); return 'ALLOWED'; });
    else {
      const original = f.ports.keyPolicy;
      vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => { f.setTime(grant.expiresAt - 4999); return original(); });
    }
    expect(f.model.dispatch(first.unsent, command)).toEqual({ status: 'ABANDON_BEFORE_DISPATCH', reason: 'INSUFFICIENT_LIFETIME', remainingMs: 4999 });
    expect(f.model.inspect().handoffs).toBe(0);
  });
  it('uses final interval uncertainty after policy latency without adding grace', () => {
    const f = fixture(), first = f.initial(), command = f.command(), original = f.ports.keyPolicy;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => {
      f.setInterval({ earliestMs: start + 23_000, latestMs: start + 27_000 }); return original();
    });
    expect(f.model.dispatch(first.unsent, command)).toEqual({ status: 'ABANDON_BEFORE_DISPATCH', reason: 'INSUFFICIENT_LIFETIME', remainingMs: 3000 });
    expect(f.model.inspect().handoffs).toBe(0);
  });
  it('detects rollback introduced during policy read after a prior clock observation', () => {
    const f = fixture(), first = f.initial(), command = f.command(); f.setTime(start + 1000); f.model.assess(first.unsent);
    const original = f.ports.keyPolicy;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => { f.setTime(start); return original(); });
    expect(f.model.dispatch(first.unsent, command)).toEqual({ status: 'BLOCKED', reason: 'CLOCK_ROLLBACK' });
    expect(f.model.inspect()).toMatchObject({ handoffs: 0, terminalState: 'BLOCKED' });
  });
  it.each(['upstream', 'key'] as const)('rechecks final %s expiry after a delayed policy read', boundary => {
    const f = fixture(), first = f.initial(), command = f.command();
    if (boundary === 'key') f.setKey({ signingNotAfter: start + 1000, verificationNotAfter: start + 2000 });
    const original = f.ports.keyPolicy;
    vi.spyOn(f.ports, 'keyPolicy').mockImplementation(() => {
      f.setTime(boundary === 'key' ? start + 2000 : seed.upstreamAuthenticationCap); return original();
    });
    expect(f.model.dispatch(first.unsent, command)).toEqual({ status: 'BLOCKED', reason: boundary === 'key' ? 'KEY_UNAVAILABLE' : 'UPSTREAM_EXPIRED' });
    expect(f.model.inspect().handoffs).toBe(0);
  });
  it('does not create a transaction from a clock sampled before secret generation latency', () => {
    const f = fixture(), original = vi.mocked(f.ports.secret).getMockImplementation()!;
    vi.spyOn(f.ports, 'secret').mockImplementation(() => { f.setTime(seed.upstreamAuthenticationCap); return original(); });
    expect(() => f.model.beginInitialLogin(f.nextBinding())).toThrow('UPSTREAM_EXPIRED');
    expect(f.model.inspect()).toMatchObject({ grantsCreated: 0, terminalState: 'BLOCKED' });
  });
});
