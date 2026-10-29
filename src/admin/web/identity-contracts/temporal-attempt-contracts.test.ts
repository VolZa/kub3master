import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { operationDescriptor, recoveryDescriptor, TEMPORAL_METADATA_PROFILE } from '../operation-contracts';
import { validateOperationScopeData, validateClockObservationData, validateLifetimeAnchorData,
  validateTransactionAttemptData, validateAdmissionDecisionData, validateCommittedAttemptData,
  validateAnchoredPlanningInput, type AnchoredPlanningInput } from './temporal-attempt-contracts';
import { durableAdmissionGate, requireDurableAdmissionGuarantees, type VerifiedDurableGuarantees } from './durable-store-contracts';
import { readTrustedLoginGrant } from './verification';
import { composeRemoteDurableAuthentication } from '../authentication/composition';

const id = (c: string) => c.repeat(64), now = 1_800_000_000_000;
const hash = { digest: (bytes: readonly number[]) => createHash('sha256').update(Buffer.from(bytes)).digest('hex') };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function fixture() {
  // SYNTHETIC DTOs only. These records have no backend/clock/approval provenance.
  const context = { environment: 'TEST' as const, applicationAudience: 'kub:admin:test', expectedScriptId: 'synthetic-admin-script-test-000000001' };
  const op = operationDescriptor({ ...context, protocolVersion: 1, backendOrigin: 'https://auth-test.example.com',
    operationKind: 'ISSUE_SESSION', operationId: id('f'), commandCreatedAt: now },
  { expectedRevision: 0, grantId: id('b'), credentialDigest: id('c'), expectedAuthorizationVersion: 3 }, hash);
  const grantBinding = { ...context, grantId: id('b'), transactionId: id('b'), assertionId: id('d'), expectedRevision: 0,
    identityIssuer: 'https://accounts.google.com' as const, identitySubject: 'synthetic-subject' };
  const scope = { profile: 'KUB_ADMIN_OPERATION_SCOPE_V1' as const, version: 1 as const,
    ownerId: id('a'), namespaceId: id('e'), ownerGeneration: 1,
    metadata: { recovery: recoveryDescriptor(op, 0, id('c')), binding: { profile: TEMPORAL_METADATA_PROFILE, version: 1 as const,
      policy: { operation: 'ISSUE_SESSION' as const, mode: 'STRICT_BACKEND_ADMISSION' as const }, approvalId: id('8'), approvalRevision: 1 } },
    grant: grantBinding, credentialDigest: id('c'), expectedAuthorizationVersion: 3, effectiveUpstreamCapMs: now + 3_400_000 };
  const clock = { profile: 'KUB_ADMIN_CLOCK_OBSERVATION_V1' as const, version: 1 as const, observationId: id('4'),
    attemptId: id('1'), boundaryRef: id('7'), clockAuthorityId: id('6'), clockEpoch: id('5'), earliestMs: now + 100, latestMs: now + 200 };
  const attempt = { profile: 'KUB_ADMIN_TRANSACTION_ATTEMPT_V1' as const, version: 1 as const, attemptId: id('1'), decisionId: id('2'),
    scope, anchorId: id('3'), clock, grantRevision: 0, dependencies: [{ authorityId: id('a'), recordId: id('b'), revision: 0 }],
    writeSetProfile: 'KUB_ADMIN_CLAIMED_WRITESET_V1' as const, preparedWriteSetDigest: id('9') };
  const anchor = { profile: 'KUB_ADMIN_LIFETIME_ANCHOR_V1' as const, version: 1 as const,
    scope, anchorId: id('3'), originAttemptId: id('1'), originDecisionId: id('2'), originClock: clock, t0Ms: now + 100 };
  const decision = { profile: 'KUB_ADMIN_ADMISSION_DECISION_V1' as const, version: 1 as const,
    decisionId: id('2'), attempt, status: 'ADMITTED' as const, reason: null };
  const committed = { profile: 'KUB_ADMIN_COMMITTED_ATTEMPT_V1' as const, version: 1 as const, status: 'COMMITTED' as const,
    commitRecordId: id('0'), receiptId: id('f'), attemptId: id('1'), decisionId: id('2'), anchorId: id('3'),
    preparedWriteSetDigest: id('9'), decision, databaseCommittedAt: { status: 'UNAVAILABLE' as const, value: null } };
  const grant = { ...context, schemaVersion: 1 as const, grantId: id('b'), transactionId: id('b'), assertionId: id('d'), revision: 0,
    status: 'AVAILABLE' as const, consumedAt: null, issuedAt: now, expiresAt: now + 30_000,
    signingKey: { protocolVersion: 1 as const, brokerIssuer: 'https://broker.example.com', keyId: 'test-key', algorithm: 'RS256' as const,
      assertionId: id('d'), assertionIssuedAt: now - 500 }, identityIssuer: grantBinding.identityIssuer,
    identitySubject: grantBinding.identitySubject, authenticatedAt: now - 1000, authenticationExpiresAt: now + 3_500_000 };
  const input: AnchoredPlanningInput = { profile: 'KUB_ADMIN_ANCHORED_PLANNING_INPUT_V1', version: 1, attempt, anchor,
    admissionInterval: clock, grant, effectiveUpstreamCapMs: scope.effectiveUpstreamCapMs,
    user: { issuer: grant.identityIssuer, subject: grant.identitySubject, active: true, authorizationVersion: 3 }, attemptState: 'PREPARED' };
  return clone({ scope, clock, anchor, attempt, decision, committed, input });
}
const invalid = { status: 'INVALID_DATA', reason: 'INVALID_INPUT' };
const mismatch = { status: 'INVALID_DATA', reason: 'BINDING_MISMATCH' };
const models = [
  ['scope', validateOperationScopeData], ['clock', validateClockObservationData], ['anchor', validateLifetimeAnchorData],
  ['attempt', validateTransactionAttemptData], ['decision', validateAdmissionDecisionData], ['committed', validateCommittedAttemptData],
  ['input', validateAnchoredPlanningInput],
] as const;
function change(v: any, path: string, value: unknown) {
  const fields = path.split('.'), key = fields.pop()!; let parent = v;
  for (const field of fields) parent = parent[field]; parent[key] = value;
}
function frozen(v: any): void {
  if (!v || typeof v !== 'object') return;
  expect(Object.isFrozen(v)).toBe(true); for (const child of Object.values(v)) frozen(child);
}

describe('temporal attempt DTO exact validation, not authority', () => {
  for (const [key, validate] of models) {
    it(`${key}: accepts matching synthetic data and deeply detaches/freezes it`, () => {
      const candidate: any = fixture()[key], pinned: any = fixture()[key], before = clone(candidate);
      const result = validate(candidate, pinned); expect(result.status).toBe('VALID_DATA'); frozen(result);
      if (result.status !== 'VALID_DATA') throw Error('synthetic data');
      expect(result.value).toEqual(candidate); expect(result.value).not.toBe(candidate);
      candidate.version = 2; pinned.profile = 'CHANGED'; expect(result.value).toEqual(before);
      expect(Reflect.set(result.value, 'version', 2)).toBe(false);
    });
    it.each(['profile', 'version'])(`${key}: rejects unknown or missing %s on either argument`, field => {
      const pinned = fixture()[key], changed: any = clone(pinned); changed[field] = field === 'profile' ? 'UNKNOWN' : 2;
      expect(validate(changed, pinned)).toEqual(invalid); expect(validate(pinned, changed)).toEqual(invalid);
      delete changed[field]; expect(validate(changed, pinned)).toEqual(invalid);
    });
    it.each([null, undefined, [], 1, 'ADMITTED'])(`${key}: fails closed on malformed root (%#)`, bad => {
      expect(validate(bad, fixture()[key])).toEqual(invalid); expect(validate(fixture()[key], bad)).toEqual(invalid);
    });
    it(`${key}: rejects extra, symbol, hidden, getter, circular and inherited fields`, () => {
      const p = fixture()[key]; let reads = 0;
      const getter = { ...p, get version() { reads++; return 1; } };
      const cycle: any = { ...p }; cycle.loop = cycle;
      for (const bad of [{ ...p, approved: true }, { ...p, [Symbol('authority')]: true },
        Object.defineProperty({ ...p }, 'hidden', { value: 1 }), getter, cycle, Object.create(p)])
        expect(validate(bad, p)).toEqual(invalid);
      expect(reads).toBe(0);
    });
  }
  it.each([
    ['ownerId', id('0')], ['namespaceId', id('0')], ['ownerGeneration', 2], ['credentialDigest', id('0')],
    ['expectedAuthorizationVersion', 4], ['effectiveUpstreamCapMs', now + 10_000],
    ['metadata.recovery.operationId', id('0')], ['metadata.recovery.commandDigest', id('0')],
    ['metadata.recovery.originalBodyDigest', id('0')], ['metadata.recovery.commandCreatedAt', now + 1],
    ['metadata.binding.policy.mode', 'STRICT_COMMIT_TIME'], ['metadata.binding.approvalId', id('0')],
    ['metadata.binding.approvalRevision', 2], ['grant.assertionId', id('0')], ['grant.identitySubject', 'other-subject'],
  ])('rejects changed pinned operation scope %s', (path, value) => {
    const pinned = fixture().scope, candidate = clone(pinned); change(candidate, path, value);
    expect(validateOperationScopeData(candidate, pinned).status).toBe('INVALID_DATA');
  });
  it.each(['metadata.binding.profile', 'metadata.binding.version', 'metadata.binding.policy.operation'])(
    'rejects unknown policy profile/version/operation %s', path => {
      const candidate = fixture().scope; change(candidate, path, 'UNKNOWN');
      expect(validateOperationScopeData(candidate, candidate)).toEqual(invalid);
    });
  it('does not support ACCEPT_ASSERTION session scope or forbidden ACCEPT_ASSERTION + B', () => {
    for (const mode of ['STRICT_BACKEND_ADMISSION', 'STRICT_COMMIT_TIME']) {
      const p: any = fixture().scope; p.metadata.recovery.operationKind = 'ACCEPT_ASSERTION'; p.metadata.binding.policy = { operation: 'ACCEPT_ASSERTION', mode };
      expect(validateOperationScopeData(p, p)).toEqual(invalid);
    }
  });
  it.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1'])(
    'rejects unsafe owner/revision/clock values (%#)', value => {
      const p = fixture();
      for (const path of ['ownerGeneration', 'grant.expectedRevision', 'expectedAuthorizationVersion']) {
        const c = clone(p.scope); change(c, path, value); expect(validateOperationScopeData(c, c)).toEqual(invalid);
      }
      for (const path of ['earliestMs', 'latestMs']) {
        const c = clone(p.clock); change(c, path, value); expect(validateClockObservationData(c, c)).toEqual(invalid);
      }
    });
  it.each(['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'not-a-digest', 123])('rejects malformed IDs/digests (%#)', value => {
    const p = fixture();
    for (const path of ['attemptId', 'anchorId', 'preparedWriteSetDigest', 'clock.observationId', 'dependencies.0.recordId']) {
      const c = clone(p.attempt); change(c, path, value); expect(validateTransactionAttemptData(c, c)).toEqual(invalid);
    }
  });
  it.each(['preparedWriteSetDigest', 'dependencies.0.revision', 'decisionId', 'clock.observationId', 'clock.boundaryRef'])(
    'compares independent pinned attempt %s', path => {
      const p = fixture().attempt, c = clone(p); change(c, path, path.endsWith('revision') ? 1 : id('0'));
      expect(validateTransactionAttemptData(c, p)).toEqual(mismatch);
      expect(validateTransactionAttemptData(p, c)).toEqual(mismatch);
    });
  it('rejects unknown digest profile and duplicate/sparse/empty/oversized dependency arrays', () => {
    const p = fixture().attempt;
    expect(validateTransactionAttemptData({ ...p, writeSetProfile: 'SHA256_TRUSTED' }, p)).toEqual(invalid);
    for (const dependencies of [[], [p.dependencies[0], p.dependencies[0]], new Array(2), Array(65).fill(p.dependencies[0])])
      expect(validateTransactionAttemptData({ ...p, dependencies }, p)).toEqual(invalid);
    const hidden = [...p.dependencies]; Object.defineProperty(hidden, 'approved', { value: true });
    expect(validateTransactionAttemptData({ ...p, dependencies: hidden }, p)).toEqual(invalid);
  });
  it('rejects reused decisions/clock observations across attempts, including matching forged expectations', () => {
    const p = fixture();
    expect(validateTransactionAttemptData({ ...p.attempt, attemptId: id('0') }, p.attempt)).toEqual(invalid);
    expect(validateAdmissionDecisionData({ ...p.decision, decisionId: id('0') }, p.decision)).toEqual(invalid);
    const c: any = clone(p.input); c.attempt.attemptId = id('0'); c.attempt.clock.attemptId = id('0'); c.admissionInterval.attemptId = id('0');
    expect(validateAnchoredPlanningInput(c, c)).toEqual(invalid);
  });
  it('validates DENIED only with a closed reason and does not reinterpret it as a committed admission', () => {
    const d = { ...fixture().decision, status: 'DENIED', reason: 'EXPIRED' };
    expect(validateAdmissionDecisionData(d, d).status).toBe('VALID_DATA');
    for (const bad of [{ ...d, reason: null }, { ...d, reason: 'ALLOW_ANYWAY' }, { ...d, status: 'UNKNOWN' }])
      expect(validateAdmissionDecisionData(bad, bad)).toEqual(invalid);
    expect(validateCommittedAttemptData({ ...fixture().committed, decision: d }, fixture().committed)).toEqual(invalid);
  });
  it.each(['attemptId', 'decisionId', 'anchorId', 'preparedWriteSetDigest'])(
    'requires committed DTO linkage for %s', field => {
      const p = fixture().committed, c = { ...p, [field]: id('0') };
      expect(validateCommittedAttemptData(c, c)).toEqual(invalid);
    });
  it('preserves honest unavailable commit time and checks claimed known time without inventing it', () => {
    const p = fixture().committed;
    const known = { ...p, databaseCommittedAt: { status: 'KNOWN', value: now + 100_000 } };
    expect(validateCommittedAttemptData(known, known).status).toBe('VALID_DATA'); // Late fact, NOT permission.
    for (const databaseCommittedAt of [{ status: 'UNAVAILABLE', value: now }, { status: 'KNOWN', value: null },
      { status: 'KNOWN', value: now - 1 }, { status: 'ESTIMATED', value: now + 300 }])
      expect(validateCommittedAttemptData({ ...p, databaseCommittedAt }, p)).toEqual(invalid);
  });
  it('fails closed for throwing/revoked proxies, custom prototypes and excessive depth without reading getters', () => {
    const p = fixture().attempt, revoked = Proxy.revocable(p, {}); revoked.revoke();
    const throwing = new Proxy(p, { ownKeys() { throw Error('untrusted trap'); } });
    const getter = new Proxy(p, { get() { throw Error('must not read properties'); } });
    expect(validateTransactionAttemptData(getter, p).status).toBe('VALID_DATA'); // Descriptor snapshot, not Proxy provenance.
    for (const c of [revoked.proxy, throwing, new Date(), Object.create({})])
      expect(validateTransactionAttemptData(c, p)).toEqual(invalid);
    let deep: any = {}; for (let i = 0; i < 30; i++) deep = { child: deep };
    expect(validateTransactionAttemptData(deep, p)).toEqual(invalid);
  });
  it('keeps candidate-echo JSON and synthetic ADMITTED/COMMITTED records outside every production trust gate', async () => {
    const p = fixture(), d = validateAdmissionDecisionData(clone(p.decision), clone(p.decision)), c = validateCommittedAttemptData(p.committed, p.committed);
    expect(d.status).toBe('VALID_DATA'); expect(c.status).toBe('VALID_DATA');
    // @ts-expect-error A structurally valid DTO result has no durable-guarantee capability brand.
    const notEvidence: VerifiedDurableGuarantees = d;
    for (const fake of [p.decision, p.committed, d, c, notEvidence, p.committed as unknown as VerifiedDurableGuarantees]) {
      expect(() => requireDurableAdmissionGuarantees(fake)).toThrow('DURABLE_ADMISSION_BLOCKED');
      expect(durableAdmissionGate(fake).status).toBe('BLOCKED');
      expect(() => readTrustedLoginGrant(fake, p.scope.grant, now)).toThrow();
      const remote = composeRemoteDurableAuthentication(fake);
      expect(await remote.completeLogin(fake)).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
      expect(await remote.authorize(fake, 'USER_MANAGE')).toEqual({ status: 'DENIED' });
    }
  });
  for (const [key, validate] of models) {
    it(`${key}: pins expectations before ownKeys, prototype and descriptor traps inspect the candidate`, () => {
      const paths = { scope: 'ownerGeneration', clock: 'latestMs', anchor: 't0Ms',
        attempt: 'dependencies.0.revision', decision: 'attempt.dependencies.0.revision',
        committed: 'receiptId', input: 'anchor.t0Ms' };
      for (const trap of ['ownKeys', 'getPrototypeOf', 'getOwnPropertyDescriptor']) {
        const pinned: any = fixture()[key], candidate: any = clone(pinned);
        const value = key === 'scope' ? 2 : key === 'clock' ? now + 201 :
          key === 'anchor' || key === 'input' ? now + 99 : key === 'committed' ? id('9') : 1;
        change(candidate, paths[key], value); let calls = 0;
        const mutate = () => { calls++; change(pinned, paths[key], value); };
        const handler: ProxyHandler<object> = trap === 'ownKeys' ? {
          ownKeys(target) { mutate(); return Reflect.ownKeys(target); },
        } : trap === 'getPrototypeOf' ? {
          getPrototypeOf(target) { mutate(); return Reflect.getPrototypeOf(target); },
        } : {
          getOwnPropertyDescriptor(target, property) { mutate(); return Reflect.getOwnPropertyDescriptor(target, property); },
        };
        expect(validate(new Proxy(candidate, handler), pinned)).toEqual(mismatch);
        expect(calls).toBeGreaterThan(0); expect(Object.isFrozen(pinned)).toBe(false);
        // A later call intentionally captures the NEW pinned state: no hidden snapshot cache.
        expect(validate(candidate, pinned).status).toBe('VALID_DATA');
      }
    });
  }
  it('isolates outer pinned snapshots from reentrant validation and later source mutation', () => {
    const pinned: any = fixture().input, changed: any = clone(pinned);
    const original = validateAnchoredPlanningInput(pinned, clone(pinned));
    expect(original.status).toBe('VALID_DATA'); if (original.status !== 'VALID_DATA') throw Error('fixture');
    changed.anchor.t0Ms--; let nested: ReturnType<typeof validateAnchoredPlanningInput> | undefined, entered = false;
    const proxy = new Proxy(changed, { ownKeys(target) {
      if (!entered) {
        entered = true; pinned.anchor.t0Ms = changed.anchor.t0Ms;
        nested = validateAnchoredPlanningInput(changed, pinned);
      }
      return Reflect.ownKeys(target);
    } });
    expect(validateAnchoredPlanningInput(proxy, pinned)).toEqual(mismatch);
    expect(nested?.status).toBe('VALID_DATA');
    expect(original.value.anchor.t0Ms).toBe(now + 100); frozen(original);
    expect(Reflect.set(original.value.anchor, 't0Ms', now + 99)).toBe(false);
    pinned.anchor.scope.ownerGeneration++;
    expect(original.value.anchor.scope.ownerGeneration).toBe(1);
    expect(validateAnchoredPlanningInput(changed, pinned)).toEqual(invalid);
  });
});
