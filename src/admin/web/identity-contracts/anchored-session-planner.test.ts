import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { operationDescriptor, recoveryDescriptor, TEMPORAL_METADATA_PROFILE } from '../operation-contracts';
import { planAnchoredSessionData } from './anchored-session-planner';
import type { AnchoredPlanningInput } from './temporal-attempt-contracts';
import { planGrantRedemption } from './lifecycle';
import { IDENTITY_TTL } from './contracts';
import { durableAdmissionGate, requireDurableAdmissionGuarantees } from './durable-store-contracts';
import { composeRemoteDurableAuthentication } from '../authentication/composition';

const id = (c: string) => c.repeat(64), now = 1_800_000_000_000;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const hash = { digest: (bytes: readonly number[]) => createHash('sha256').update(Buffer.from(bytes)).digest('hex') };
function fixture(): AnchoredPlanningInput {
  // Independent SYNTHETIC fixtures, not authenticated evidence or a backend simulation.
  const context = { environment: 'TEST' as const, applicationAudience: 'kub:admin:test', expectedScriptId: 'synthetic-admin-script-test-000000001' };
  const op = operationDescriptor({ ...context, protocolVersion: 1, backendOrigin: 'https://auth-test.example.com',
    operationKind: 'ISSUE_SESSION', operationId: id('f'), commandCreatedAt: now },
  { expectedRevision: 0, grantId: id('b'), credentialDigest: id('c'), expectedAuthorizationVersion: 3 }, hash);
  const scope = { profile: 'KUB_ADMIN_OPERATION_SCOPE_V1' as const, version: 1 as const,
    ownerId: id('a'), namespaceId: id('e'), ownerGeneration: 1,
    metadata: { recovery: recoveryDescriptor(op, 0, id('c')), binding: { profile: TEMPORAL_METADATA_PROFILE, version: 1 as const,
      policy: { operation: 'ISSUE_SESSION' as const, mode: 'STRICT_BACKEND_ADMISSION' as const }, approvalId: id('8'), approvalRevision: 1 } },
    grant: { ...context, grantId: id('b'), transactionId: id('b'), assertionId: id('d'), expectedRevision: 0,
      identityIssuer: 'https://accounts.google.com' as const, identitySubject: 'synthetic-subject' },
    credentialDigest: id('c'), expectedAuthorizationVersion: 3, effectiveUpstreamCapMs: now + 3_400_000 };
  const clock = { profile: 'KUB_ADMIN_CLOCK_OBSERVATION_V1' as const, version: 1 as const, observationId: id('4'),
    attemptId: id('1'), boundaryRef: id('7'), clockAuthorityId: id('6'), clockEpoch: id('5'), earliestMs: now + 100, latestMs: now + 200 };
  return clone({ profile: 'KUB_ADMIN_ANCHORED_PLANNING_INPUT_V1', version: 1,
    attempt: { profile: 'KUB_ADMIN_TRANSACTION_ATTEMPT_V1', version: 1, attemptId: id('1'), decisionId: id('2'),
      scope, anchorId: id('3'), clock, grantRevision: 0, dependencies: [{ authorityId: id('a'), recordId: id('b'), revision: 0 }],
      writeSetProfile: 'KUB_ADMIN_CLAIMED_WRITESET_V1', preparedWriteSetDigest: id('9') },
    anchor: { profile: 'KUB_ADMIN_LIFETIME_ANCHOR_V1', version: 1, scope, anchorId: id('3'),
      originAttemptId: id('1'), originDecisionId: id('2'), originClock: clock, t0Ms: now + 100 },
    admissionInterval: clock, grant: { ...context, schemaVersion: 1, grantId: id('b'), transactionId: id('b'), assertionId: id('d'), revision: 0,
      status: 'AVAILABLE', consumedAt: null, issuedAt: now, expiresAt: now + 30_000,
      signingKey: { protocolVersion: 1, brokerIssuer: 'https://broker.example.com', keyId: 'test-key', algorithm: 'RS256', assertionId: id('d'), assertionIssuedAt: now - 500 },
      identityIssuer: 'https://accounts.google.com', identitySubject: 'synthetic-subject', authenticatedAt: now - 1000, authenticationExpiresAt: now + 3_500_000 },
    effectiveUpstreamCapMs: scope.effectiveUpstreamCapMs,
    user: { issuer: 'https://accounts.google.com', subject: 'synthetic-subject', active: true, authorizationVersion: 3 }, attemptState: 'PREPARED' });
}
function retry(original: AnchoredPlanningInput, latestMs: number): AnchoredPlanningInput {
  const p: any = clone(original); p.attempt.attemptId = id('0'); p.attempt.decisionId = id('a');
  p.attempt.clock = { ...p.attempt.clock, attemptId: id('0'), observationId: id('b'), boundaryRef: id('c'), earliestMs: latestMs - 10, latestMs };
  p.admissionInterval = clone(p.attempt.clock); return p;
}
function candidate(p: AnchoredPlanningInput, pinned: AnchoredPlanningInput = clone(p)) {
  const result = planAnchoredSessionData(p, pinned);
  if (result.status !== 'PLAN_CANDIDATE') throw Error('expected synthetic candidate: ' + result.reason); return result.candidate;
}
const invalid = (reason: string) => ({ status: 'INVALID_DATA', reason });
function cap(p: any, value: number) {
  p.effectiveUpstreamCapMs = value; p.attempt.scope.effectiveUpstreamCapMs = value; p.anchor.scope.effectiveUpstreamCapMs = value;
}
function frozen(v: any): void {
  if (!v || typeof v !== 'object') return;
  expect(Object.isFrozen(v)).toBe(true); for (const child of Object.values(v)) frozen(child);
}

describe('pure anchored session candidate planning', () => {
  it('uses only supplied values, pins t0 and returns frozen data without a session/store/consumption capability', () => {
    const p = fixture(), before = JSON.stringify(p), result = candidate(p);
    expect(result.sessionIssuedAtMs).toBe(p.anchor.t0Ms); expect(result.sessionExpiresAtMs).toBe(p.anchor.t0Ms + IDENTITY_TTL.sessionMs);
    expect(result.scope).toEqual(p.attempt.scope); expect(result.admissionInterval).toEqual(p.admissionInterval);
    frozen(result); expect(JSON.stringify(p)).toBe(before);
    for (const field of ['consumedAt', 'sessionCredential', 'issuedAt', 'expiresAt', 'authorized', 'evidence']) expect(result).not.toHaveProperty(field);
  });
  it('caps the candidate by immutable effective upstream lifetime', () => {
    const p = fixture(); cap(p, now + 20_000);
    expect(candidate(p).sessionExpiresAtMs).toBe(now + 20_000);
  });
  it('keeps lifetime identical after a claimed abort and a later fresh retry, without proving distributed ordering', () => {
    const first = fixture(), firstPlan = candidate(first), aborted = { ...clone(first), attemptState: 'ABORTED' };
    expect(planAnchoredSessionData(aborted, clone(aborted))).toEqual(invalid('ATTEMPT_TERMINAL'));
    const second = retry(first, now + 20_000), secondPlan = candidate(second);
    expect(secondPlan.attemptId).not.toBe(firstPlan.attemptId);
    expect(secondPlan.sessionIssuedAtMs).toBe(firstPlan.sessionIssuedAtMs);
    expect(secondPlan.sessionExpiresAtMs).toBe(firstPlan.sessionExpiresAtMs);
    expect(secondPlan.anchorId).toBe(firstPlan.anchorId);
  });
  it('captures the original pinned anchor before candidate Proxy inspection can move t0', () => {
    const pinned: any = fixture(), offset = 2_000_000_000_000 - now;
    pinned.grant.issuedAt += offset; pinned.grant.expiresAt += offset;
    pinned.grant.authenticatedAt += offset; pinned.grant.authenticationExpiresAt += offset;
    pinned.grant.signingKey.assertionIssuedAt += offset;
    for (const scope of [pinned.attempt.scope, pinned.anchor.scope]) scope.metadata.recovery.commandCreatedAt += offset;
    for (const clock of [pinned.attempt.clock, pinned.anchor.originClock, pinned.admissionInterval]) {
      clock.earliestMs += offset; clock.latestMs += offset;
    }
    cap(pinned, pinned.effectiveUpstreamCapMs + offset);
    pinned.anchor.t0Ms = 2_000_000_000_010;
    const original = candidate(pinned, clone(pinned)), changed = clone(pinned);
    changed.anchor.t0Ms = 2_000_000_000_100;
    let calls = 0;
    const untrusted = new Proxy(changed, { ownKeys(target) {
      calls++; pinned.anchor.t0Ms = 2_000_000_000_100; return Reflect.ownKeys(target);
    } });
    expect(planAnchoredSessionData(untrusted, pinned)).toEqual(invalid('BINDING_MISMATCH'));
    expect(calls).toBeGreaterThan(0); expect(pinned.anchor.t0Ms).toBe(2_000_000_000_100);
    expect(original.sessionIssuedAtMs).toBe(2_000_000_000_010);
    expect(original.sessionExpiresAtMs).toBe(2_000_000_900_010);
    expect(Object.isFrozen(original)).toBe(true); expect(Object.isFrozen(pinned)).toBe(false);
  });
  it.each([0, 1, 10_000])('denies fresh retry at/after grant expiry (+%s)', delta => {
    const p = retry(fixture(), now + 30_000 + delta);
    expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('GRANT_EXPIRED'));
  });
  it('accepts just before grant expiry but uses U, not the earlier t0 or lower bound', () => {
    const p = retry(fixture(), now + 29_999); expect(candidate(p).sessionIssuedAtMs).toBe(now + 100);
    const boundary = retry(fixture(), now + 30_000); expect(boundary.admissionInterval.earliestMs).toBeLessThan(boundary.grant.expiresAt);
    expect(planAnchoredSessionData(boundary, clone(boundary))).toEqual(invalid('GRANT_EXPIRED'));
  });
  it('denies exact upstream cap and session-cap expiry before planning', () => {
    const p = retry(fixture(), now + 20_000); cap(p, now + 20_000);
    expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('UPSTREAM_EXPIRED'));
  });
  it('rejects an already expired 15-minute anchor rather than resurrecting it using a fresh grant', () => {
    const p: any = fixture(); p.anchor.t0Ms = now - IDENTITY_TTL.sessionMs;
    expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('ANCHOR_TIME_INVALID'));
  });
  it.each([0, 1, 1000])('issues no candidate at/after the original session expiry (+%s)', delta => {
    const original = fixture(), expiry = original.anchor.t0Ms + IDENTITY_TTL.sessionMs;
    const p = retry(original, expiry + delta), before = JSON.stringify(p.anchor);
    // With the unchanged 30s grant, grant expiry already forbids admission by this boundary.
    expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('GRANT_EXPIRED'));
    expect(JSON.stringify(p.anchor)).toBe(before);
    expect(p.anchor.t0Ms).toBe(original.anchor.t0Ms);
  });
  it('rejects missing anchor or independent pinned expectations', () => {
    const { anchor: _anchor, ...missing } = fixture();
    expect(planAnchoredSessionData(missing, fixture())).toEqual(invalid('INVALID_INPUT'));
    expect(planAnchoredSessionData(fixture(), undefined)).toEqual(invalid('INVALID_INPUT'));
  });
  it.each(['anchorId', 't0Ms', 'originDecisionId', 'originAttemptId'])(
    'rejects replacing the original pinned anchor %s', field => {
      const p: any = retry(fixture(), now + 10_000), original = clone(p);
      if (field === 't0Ms') p.anchor.t0Ms--;
      else if (field === 'anchorId') { p.anchor.anchorId = id('9'); p.attempt.anchorId = id('9'); }
      else if (field === 'originAttemptId') { p.anchor.originAttemptId = id('9'); p.anchor.originClock.attemptId = id('9'); }
      else p.anchor.originDecisionId = id('9');
      expect(planAnchoredSessionData(p, original)).toEqual(invalid('BINDING_MISMATCH'));
    });
  it.each(['ownerId', 'namespaceId', 'ownerGeneration', 'credentialDigest', 'expectedAuthorizationVersion'])(
    'rejects foreign/inconsistent anchor scope %s', field => {
      const p: any = fixture(); p.anchor.scope[field] = typeof p.anchor.scope[field] === 'number' ? 2 : id('0');
      expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('INVALID_INPUT'));
    });
  it.each(['clockEpoch', 'clockAuthorityId', 'observationId', 'boundaryRef'])(
    'rejects changed source or reused observation on retry (%s)', field => {
      const p: any = retry(fixture(), now + 10_000);
      const value = field === 'clockEpoch' || field === 'clockAuthorityId' ? id('0') : p.anchor.originClock[field];
      p.attempt.clock[field] = value; p.admissionInterval[field] = value;
      expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('INVALID_INPUT'));
    });
  it('rejects inverted, zero, stale and independently changed admission intervals', () => {
    for (const latest of [now + 99, 0]) {
      const p: any = fixture(); p.attempt.clock.latestMs = latest; p.admissionInterval.latestMs = latest;
      expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('INVALID_INPUT'));
    }
    const stale: any = retry(fixture(), now + 190);
    expect(planAnchoredSessionData(stale, clone(stale))).toEqual(invalid('INVALID_INPUT'));
    const changed: any = fixture(); changed.admissionInterval.latestMs++;
    expect(planAnchoredSessionData(changed, clone(changed))).toEqual(invalid('INVALID_INPUT'));
  });
  it('denies invalid original anchor time even if the current interval is valid', () => {
    const p: any = fixture(); p.anchor.t0Ms = now - 1;
    expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('ANCHOR_TIME_INVALID'));
    const later: any = fixture(); later.anchor.t0Ms = now + 201;
    expect(planAnchoredSessionData(later, clone(later))).toEqual(invalid('INVALID_INPUT'));
  });
  it('denies inactive users, consumed grants, changed identity/version and cap increases', () => {
    const inactive = { ...fixture(), user: { ...fixture().user, active: false } };
    expect(planAnchoredSessionData(inactive, clone(inactive))).toEqual(invalid('USER_INACTIVE'));
    const consumed: any = fixture(); consumed.grant.status = 'CONSUMED'; consumed.grant.consumedAt = now + 1;
    consumed.grant.revision = 1; consumed.attempt.grantRevision = 1;
    for (const s of [consumed.attempt.scope, consumed.anchor.scope]) { s.grant.expectedRevision = 1; s.metadata.recovery.expectedRevision = 1; }
    expect(planAnchoredSessionData(consumed, clone(consumed))).toEqual(invalid('GRANT_UNAVAILABLE'));
    for (const mutate of [(p: any) => p.user.authorizationVersion++, (p: any) => p.grant.identitySubject = 'foreign',
      (p: any) => cap(p, p.grant.authenticationExpiresAt + 1)]) {
      const p = fixture(); mutate(p); expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('INVALID_INPUT'));
    }
  });
  it('checks safe arithmetic even when an upstream cap could mask overflow', () => {
    const p: any = fixture(), offset = Number.MAX_SAFE_INTEGER - now - 500_000;
    p.grant.issuedAt += offset; p.grant.expiresAt += offset; p.grant.authenticatedAt += offset;
    p.grant.signingKey.assertionIssuedAt += offset; p.grant.authenticationExpiresAt = Number.MAX_SAFE_INTEGER;
    p.anchor.t0Ms += offset;
    for (const clock of [p.anchor.originClock, p.attempt.clock, p.admissionInterval]) { clock.earliestMs += offset; clock.latestMs += offset; }
    cap(p, Number.MAX_SAFE_INTEGER);
    expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid('TIME_OVERFLOW'));
  });
  it('never changes the input and retains no mutable nested object after planning', () => {
    const p: any = fixture(), pinned: any = clone(p), plan = candidate(p, pinned), before = JSON.stringify(plan);
    p.anchor.t0Ms++; p.attempt.dependencies[0].revision++; pinned.attempt.scope.ownerGeneration++;
    expect(JSON.stringify(plan)).toBe(before); expect(Reflect.set(plan.scope.metadata.binding.policy, 'mode', 'STRICT_COMMIT_TIME')).toBe(false);
  });
  it.each(['OUTCOME_UNKNOWN', 'ABORTED', 'COMMITTED'] as const)('never grants replacement/retry permission for %s', state => {
    const p = { ...fixture(), attemptState: state };
    expect(planAnchoredSessionData(p, clone(p))).toEqual(invalid(state === 'OUTCOME_UNKNOWN' ? 'RECOVERY_REQUIRED' : 'ATTEMPT_TERMINAL'));
  });
  it('keeps plan candidates and JSON/casts outside the strict planner and remote admission', async () => {
    const p = fixture(), plan = candidate(p);
    expect(() => planGrantRedemption(plan, {}, p.attempt.scope.grant, p.user, now + 200)).toThrow();
    for (const fake of [plan, clone(plan), { status: 'ADMITTED', candidate: plan }, { status: 'COMMITTED', candidate: plan }]) {
      expect(durableAdmissionGate(fake).status).toBe('BLOCKED');
      expect(() => requireDurableAdmissionGuarantees(fake)).toThrow('DURABLE_ADMISSION_BLOCKED');
      expect(await composeRemoteDurableAuthentication(fake).startLogin(fake)).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
    }
  });
});
