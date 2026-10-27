import { describe, expect, it } from 'vitest';
import { evaluateGrantReadiness, grantReadinessPolicy } from './grant-readiness';
import { type GrantReadinessInput, RENEWAL_LIMITS } from './renewal-contracts';
import { IDENTITY_TTL } from '../identity-contracts/contracts';
import { durableAdmissionGate } from '../identity-contracts/durable-store-contracts';

const start = 1_800_000_000_000, id = (char: string) => char.repeat(64);
const context = { environment: 'TEST' as const, applicationAudience: 'kub:admin:test', expectedScriptId: 'synthetic-renewal-test-script-000000001' };
function input(remainingMs = 6000): GrantReadinessInput {
  return { grant: { ...context, schemaVersion: 1, grantId: id('a'), transactionId: id('a'), assertionId: id('b'),
    revision: 0, status: 'AVAILABLE', consumedAt: null, issuedAt: start, expiresAt: start + IDENTITY_TTL.grantMs,
    identityIssuer: 'https://accounts.google.com', identitySubject: 'synthetic-visitor', authenticatedAt: start - 1000,
    authenticationExpiresAt: start - 1000 + IDENTITY_TTL.authenticationMaxAgeMs,
    signingKey: { protocolVersion: 1, brokerIssuer: 'https://broker.invalid', keyId: 'synthetic-key', algorithm: 'RS256',
      assertionId: id('b'), assertionIssuedAt: start } },
  binding: { ...context, grantId: id('a'), transactionId: id('a'), assertionId: id('b'), expectedRevision: 0,
    identityIssuer: 'https://accounts.google.com', identitySubject: 'synthetic-visitor' },
  keyPolicy: { version: 1, brokerIssuer: 'https://broker.invalid', keys: [{ ...context, keyId: 'synthetic-key', algorithm: 'RS256',
    signingNotBefore: start - 10_000, signingNotAfter: start + 100_000, verificationNotBefore: start - 10_000,
    verificationNotAfter: start + 200_000, status: 'ACTIVE', revokedAt: null, compromised: false }] },
  clock: { earliestMs: start + 30_000 - remainingMs, latestMs: start + 30_000 - remainingMs }, previousClock: null,
  policy: { minimumRemainingMs: 5000 }, dispatchState: 'BEFORE_DISPATCH', completedGrantAttempts: 0,
  upstreamAuthenticationCap: start - 1000 + IDENTITY_TTL.authenticationMaxAgeMs, rateBudgetStatus: 'ALLOWED' };
}

describe('pure grant readiness (data only, no durable admission)', () => {
  it('accepts sufficient remaining time without changing the grant or treating original assertion expiry as grant expiry', () => {
    const value = input(), before = JSON.stringify(value);
    expect(evaluateGrantReadiness(value)).toEqual({ status: 'READY_FOR_ATTEMPT', remainingMs: 6000 });
    expect(value.clock.latestMs).toBeGreaterThan(start + IDENTITY_TTL.assertionMs);
    expect(JSON.stringify(value)).toBe(before);
    expect(evaluateGrantReadiness(value)).not.toHaveProperty('authorized');
    expect(durableAdmissionGate(evaluateGrantReadiness(value)).status).toBe('BLOCKED');
  });
  it.each([[4999, 'ABANDON_BEFORE_DISPATCH'], [5000, 'READY_FOR_ATTEMPT'], [5001, 'READY_FOR_ATTEMPT']] as const)(
    'uses the exact remaining boundary %s', (remaining, status) => {
      expect(evaluateGrantReadiness(input(remaining))).toMatchObject({ status, remainingMs: remaining });
    });
  it('abandons a 1ms grant before dispatch without consuming it', () => {
    const value = input(1);
    expect(evaluateGrantReadiness(value)).toEqual({ status: 'ABANDON_BEFORE_DISPATCH', reason: 'INSUFFICIENT_LIFETIME', remainingMs: 1 });
    expect(value.grant).toMatchObject({ status: 'AVAILABLE', consumedAt: null, expiresAt: start + 30_000 });
  });
  it.each([0, -1])('can abandon an already expired grant at remaining %s, only before dispatch', remaining => {
    expect(evaluateGrantReadiness(input(remaining))).toEqual({ status: 'ABANDON_BEFORE_DISPATCH', reason: 'GRANT_EXPIRED', remainingMs: remaining });
  });
  it('uses the upper clock bound and does not add uncertainty as expiry grace', () => {
    const value = input(7000);
    expect(evaluateGrantReadiness({ ...value, clock: { earliestMs: value.clock.earliestMs, latestMs: start + 27_000 } }))
      .toEqual({ status: 'ABANDON_BEFORE_DISPATCH', reason: 'INSUFFICIENT_LIFETIME', remainingMs: 3000 });
    expect(evaluateGrantReadiness({ ...value, clock: { earliestMs: start - 1, latestMs: start } }))
      .toEqual({ status: 'BLOCKED', reason: 'CLOCK_UNCERTAIN' });
  });
  it.each([undefined, {}, { earliestMs: 0, latestMs: start }, { earliestMs: start + 1, latestMs: start },
    { earliestMs: NaN, latestMs: start }, { earliestMs: start, latestMs: Infinity },
    { earliestMs: start, latestMs: start + 0.5 }, { earliestMs: start, latestMs: 'now' }])('rejects invalid clock (%#)', clock => {
      expect(evaluateGrantReadiness({ ...input(), clock })).toEqual({ status: 'BLOCKED', reason: 'CLOCK_INVALID' });
    });
  it.each(['earliestMs', 'latestMs'] as const)('rejects rollback of %s', field => {
    const value = input(), previousClock = { ...value.clock, [field]: value.clock[field] + 1 };
    // Keep both intervals well formed when independently lowering an endpoint.
    if (field === 'earliestMs') previousClock.latestMs++;
    expect(evaluateGrantReadiness({ ...value, previousClock })).toEqual({ status: 'BLOCKED', reason: 'CLOCK_ROLLBACK' });
  });
  it.each([undefined, 0, -1, 30_000, 30_001, NaN, Infinity, 1.5, '5000'])('has no default for invalid minimum %s', minimumRemainingMs => {
    expect(() => grantReadinessPolicy({ minimumRemainingMs })).toThrow();
    expect(evaluateGrantReadiness({ ...input(), policy: { minimumRemainingMs } }).status).toBe('BLOCKED');
  });
  it.each(['DISPATCH_POSSIBLE', 'RECOVERY_REQUIRED', 'UNKNOWN'] as const)('never abandons dispatch state %s', dispatchState => {
    expect(evaluateGrantReadiness({ ...input(1), dispatchState, clock: undefined }))
      .toEqual({ status: 'RECOVERY_REQUIRED', reason: 'DISPATCH_POSSIBLE' });
  });
  it.each(['ABANDONED', 'CONFIRMED', 'BLOCKED', 'FORGED'])('does not reopen state %s', dispatchState => {
    expect(evaluateGrantReadiness({ ...input(), dispatchState })).toEqual({ status: 'BLOCKED', reason: 'STALE_ATTEMPT' });
  });
  it('permits the third sufficient grant but terminates the third insufficient grant', () => {
    expect(evaluateGrantReadiness({ ...input(), completedGrantAttempts: 2 }).status).toBe('READY_FOR_ATTEMPT');
    expect(evaluateGrantReadiness({ ...input(1), completedGrantAttempts: 2 })).toEqual({ status: 'BLOCKED', reason: 'RENEWAL_LIMIT_REACHED' });
    expect(evaluateGrantReadiness({ ...input(), completedGrantAttempts: 3 })).toEqual({ status: 'BLOCKED', reason: 'RENEWAL_LIMIT_REACHED' });
    expect(RENEWAL_LIMITS).toEqual({ maximumGrantAttempts: 3, maximumSilentRenewals: 2 });
  });
  it.each([-1, 4, 1.5, NaN, '0'])('rejects a forged completed counter %s', completedGrantAttempts => {
    expect(evaluateGrantReadiness({ ...input(), completedGrantAttempts })).toEqual({ status: 'BLOCKED', reason: 'INVALID_INPUT' });
  });
  it.each([['UNAVAILABLE', 'RATE_UNAVAILABLE'], ['DENIED', 'RATE_LIMITED'], ['FORGED', 'INVALID_INPUT']] as const)(
    'does not bypass rate status %s', (rateBudgetStatus, reason) => {
      expect(evaluateGrantReadiness({ ...input(), rateBudgetStatus })).toEqual({ status: 'BLOCKED', reason });
    });
  it('does not extend upstream cap or renew expired authentication', () => {
    const value = input();
    expect(evaluateGrantReadiness({ ...value, upstreamAuthenticationCap: value.upstreamAuthenticationCap - 1 }))
      .toEqual({ status: 'BLOCKED', reason: 'UPSTREAM_CAP_CHANGED' });
    expect(evaluateGrantReadiness({ ...value, clock: { earliestMs: value.upstreamAuthenticationCap, latestMs: value.upstreamAuthenticationCap } }))
      .toEqual({ status: 'BLOCKED', reason: 'UPSTREAM_EXPIRED' });
  });
  it.each([{ compromised: true }, { status: 'REVOKED', revokedAt: start }, { status: 'RETIRED' },
    { verificationNotAfter: start + 24_000, signingNotAfter: start + 20_000 }])('blocks unusable signing provenance (%#)', change => {
      const value = input();
      expect(evaluateGrantReadiness({ ...value, keyPolicy: { ...value.keyPolicy, keys: [{ ...value.keyPolicy.keys[0], ...change }] } }))
        .toEqual({ status: 'BLOCKED', reason: 'KEY_UNAVAILABLE' });
    });
  it('does not waste renewal attempts when the unchanged upstream cap cannot fit the minimum', () => {
    const value = input(1), cap = value.clock.latestMs + 1000;
    expect(evaluateGrantReadiness({ ...value, upstreamAuthenticationCap: cap,
      grant: { ...value.grant, authenticationExpiresAt: cap } }))
      .toEqual({ status: 'BLOCKED', reason: 'UPSTREAM_INSUFFICIENT' });
  });
  it('rejects consumed grants and unsupported revocation/schema values without inventing new grant states', () => {
    const value = input();
    expect(evaluateGrantReadiness({ ...value, grant: { ...value.grant, revision: 1, status: 'CONSUMED', consumedAt: start + 1 },
      binding: { ...value.binding, expectedRevision: 1 } })).toEqual({ status: 'BLOCKED', reason: 'GRANT_UNAVAILABLE' });
    expect(evaluateGrantReadiness({ ...value, grant: { ...value.grant, status: 'REVOKED' } }))
      .toEqual({ status: 'BLOCKED', reason: 'GRANT_INVALID' });
  });
  it.each(['environment', 'applicationAudience', 'expectedScriptId', 'identitySubject', 'assertionId'] as const)(
    'rejects projection/binding mismatch %s', field => {
      const value = input();
      expect(evaluateGrantReadiness({ ...value, grant: { ...value.grant, [field]: 'forged' } }))
        .toEqual({ status: 'BLOCKED', reason: 'GRANT_INVALID' });
    });
  it.each([null, {}, { permissions: ['ADMIN'] }, { ...input(), permission: 'USER_MANAGE' },
    { ...input(), policy: { minimumRemainingMs: 5000, maximumGrantAttempts: 4 } }])('fails closed for unknown input (%#)', value => {
      expect(evaluateGrantReadiness(value)).toEqual({ status: 'BLOCKED', reason: 'INVALID_INPUT' });
    });
});
