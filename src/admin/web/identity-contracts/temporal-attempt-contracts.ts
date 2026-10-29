import { semanticMetadata, revision, validateTemporalPolicyBinding,
  type TemporalMetadataDescriptor, type TemporalContractValidation } from '../operation-contracts';
import { object, hex, time } from '../channel-contracts/channel-policy';
import type { DatabaseCommitTime } from '../channel-contracts/contracts';
import { durableGrantBinding, durableGrantProjection, type DurableGrantBinding,
  type DurableGrantProjection } from './durable-store-contracts';
import type { CurrentDirectoryUser } from './session-store-contracts';

/** LOCAL DATA ONLY. Profiles version DTO shapes, not approved clock/digest/evidence protocols.
 * ADMITTED/COMMITTED, timestamps, hashes, readonly and freeze establish NO backend authority.
 * No positive evidence issuer, persistence, coordinator, clock or admission capability exists here. */
export interface OperationScopeData {
  readonly profile: 'KUB_ADMIN_OPERATION_SCOPE_V1'; readonly version: 1;
  readonly ownerId: string; readonly namespaceId: string; readonly ownerGeneration: number;
  readonly metadata: Readonly<TemporalMetadataDescriptor>;
  readonly grant: Readonly<DurableGrantBinding>;
  readonly credentialDigest: string; readonly expectedAuthorizationVersion: number;
  readonly effectiveUpstreamCapMs: number;
}
export interface ClockObservationData {
  readonly profile: 'KUB_ADMIN_CLOCK_OBSERVATION_V1'; readonly version: 1;
  readonly observationId: string; readonly attemptId: string; readonly boundaryRef: string;
  /** Claimed source reference only; no clock profile is authenticated by parsing this DTO. */
  readonly clockAuthorityId: string; readonly clockEpoch: string;
  readonly earliestMs: number; readonly latestMs: number;
}
export interface LifetimeAnchorData {
  readonly profile: 'KUB_ADMIN_LIFETIME_ANCHOR_V1'; readonly version: 1;
  readonly scope: Readonly<OperationScopeData>; readonly anchorId: string;
  readonly originAttemptId: string; readonly originDecisionId: string;
  readonly originClock: Readonly<ClockObservationData>; readonly t0Ms: number;
}
/** Subrecord versioned by its enclosing attempt profile. Order is pinned, not normalized. */
export interface DependencyRevisionData {
  readonly authorityId: string; readonly recordId: string; readonly revision: number;
}
export interface TransactionAttemptData {
  readonly profile: 'KUB_ADMIN_TRANSACTION_ATTEMPT_V1'; readonly version: 1;
  readonly attemptId: string; readonly decisionId: string;
  readonly scope: Readonly<OperationScopeData>; readonly anchorId: string;
  readonly clock: Readonly<ClockObservationData>; readonly grantRevision: number;
  readonly dependencies: readonly Readonly<DependencyRevisionData>[];
  /** Claimed digest ONLY. Neither hashing nor an authenticated write-set binding is implemented. */
  readonly writeSetProfile: 'KUB_ADMIN_CLAIMED_WRITESET_V1'; readonly preparedWriteSetDigest: string;
}
export type AdmissionDataDenial = 'INVALID_INPUT' | 'CLOCK_UNVERIFIED' | 'EXPIRED' |
  'BINDING_MISMATCH' | 'ANCHOR_UNAVAILABLE' | 'DEPENDENCY_CHANGED';
export interface AdmissionDecisionData {
  readonly profile: 'KUB_ADMIN_ADMISSION_DECISION_V1'; readonly version: 1;
  readonly decisionId: string; readonly attempt: Readonly<TransactionAttemptData>;
  readonly status: 'ADMITTED' | 'DENIED'; readonly reason: AdmissionDataDenial | null;
}
export interface CommittedAttemptData {
  readonly profile: 'KUB_ADMIN_COMMITTED_ATTEMPT_V1'; readonly version: 1;
  readonly status: 'COMMITTED'; readonly commitRecordId: string; readonly receiptId: string;
  readonly attemptId: string; readonly decisionId: string; readonly anchorId: string;
  readonly preparedWriteSetDigest: string; readonly decision: Readonly<AdmissionDecisionData>;
  readonly databaseCommittedAt: Readonly<DatabaseCommitTime>;
}
export interface AnchoredPlanningInput {
  readonly profile: 'KUB_ADMIN_ANCHORED_PLANNING_INPUT_V1'; readonly version: 1;
  readonly attempt: Readonly<TransactionAttemptData>; readonly anchor: Readonly<LifetimeAnchorData>;
  readonly admissionInterval: Readonly<ClockObservationData>;
  /** Reader verification is a caller obligation; a projection is not verified grant evidence. */
  readonly grant: Readonly<DurableGrantProjection>; readonly effectiveUpstreamCapMs: number;
  readonly user: Readonly<CurrentDirectoryUser>;
  /** Claimed state only. UNKNOWN never supplies replacement permission. */
  readonly attemptState: 'PREPARED' | 'ABORTED' | 'COMMITTED' | 'OUTCOME_UNKNOWN';
}

function invalid(): never { throw Error('TEMPORAL_DATA_INVALID'); }
function requireData(condition: unknown): asserts condition { if (!condition) invalid(); }
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** Bounded, detached descriptor snapshots: no getters, toJSON, iterators or digest callbacks.
 * Reject cycles, custom prototypes, symbols, hidden fields and exceptional/revoked proxies.
 * ES2019 cannot identify every transparent Proxy. No captured shape authenticates its source. */
function snapshot(value: unknown): unknown {
  const active = new Set<object>(); let nodes = 0;
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 4096 || depth > 20) return invalid();
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'string') { requireData(v.length <= 8192); return v; }
    if (typeof v === 'number') { requireData(Number.isSafeInteger(v)); return v; }
    requireData(typeof v === 'object' && v !== null && !active.has(v));
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    requireData(prototype === (array ? Array.prototype : Object.prototype) || !array && prototype === null);
    requireData(Object.getOwnPropertySymbols(v).length === 0);
    const descriptors = Object.getOwnPropertyDescriptors(v), keys = Object.keys(descriptors);
    requireData(keys.length <= 128);
    active.add(v);
    let result: unknown;
    if (array) {
      const length = descriptors.length;
      requireData(length && 'value' in length && Number.isSafeInteger(length.value) && length.value >= 0 && length.value <= 64);
      requireData(keys.length === length.value + 1);
      const items: unknown[] = [];
      for (let i = 0; i < length.value; i++) {
        const d = descriptors[String(i)]; requireData(d && 'value' in d && d.enumerable && !d.get && !d.set);
        items.push(copy(d.value, depth + 1));
      }
      result = Object.freeze(items);
    } else {
      const fields: Record<string, unknown> = Object.create(null);
      for (const key of keys) {
        const d = descriptors[key]; requireData('value' in d && d.enumerable && !d.get && !d.set);
        fields[key] = copy(d.value, depth + 1);
      }
      result = Object.freeze(fields);
    }
    active.delete(v); return result;
  }
  return copy(value, 0);
}
function envelope(value: unknown, profile: string, keys: readonly string[]) {
  const v = object(value, ['profile', 'version', ...keys]);
  requireData(v.profile === profile && v.version === 1); return v;
}
function scopeData(value: unknown): Readonly<OperationScopeData> {
  const v = envelope(value, 'KUB_ADMIN_OPERATION_SCOPE_V1', ['ownerId', 'namespaceId', 'ownerGeneration',
    'metadata', 'grant', 'credentialDigest', 'expectedAuthorizationVersion', 'effectiveUpstreamCapMs']);
  const m = object(v.metadata, ['recovery', 'binding']);
  const r = object(m.recovery, ['protocolVersion', 'backendOrigin', 'environment', 'applicationAudience', 'expectedScriptId',
    'operationKind', 'operationId', 'commandCreatedAt', 'originalBodyDigest', 'commandDigest', 'expectedRevision', 'expectedObjectId']);
  const semantic = semanticMetadata({ protocolVersion: r.protocolVersion, backendOrigin: r.backendOrigin,
    environment: r.environment, applicationAudience: r.applicationAudience, expectedScriptId: r.expectedScriptId,
    operationKind: r.operationKind, operationId: r.operationId, commandCreatedAt: r.commandCreatedAt });
  const binding = validateTemporalPolicyBinding(m.binding);
  requireData(binding.status === 'VALID_DATA' && semantic.operationKind === 'ISSUE_SESSION' && binding.value.policy.operation === 'ISSUE_SESSION');
  const recovery = Object.freeze({ ...semantic, originalBodyDigest: hex(r.originalBodyDigest), commandDigest: hex(r.commandDigest),
    expectedRevision: revision(r.expectedRevision), expectedObjectId: hex(r.expectedObjectId) });
  const grant = durableGrantBinding(v.grant), credentialDigest = hex(v.credentialDigest);
  requireData(grant.environment === recovery.environment && grant.applicationAudience === recovery.applicationAudience &&
    grant.expectedScriptId === recovery.expectedScriptId && grant.grantId === grant.transactionId &&
    grant.expectedRevision === recovery.expectedRevision && recovery.expectedObjectId === credentialDigest);
  // No recomputation of command/body/metadata hashes. Independent pinned comparisons below are data checks only.
  return Object.freeze({ profile: 'KUB_ADMIN_OPERATION_SCOPE_V1', version: 1, ownerId: hex(v.ownerId),
    namespaceId: hex(v.namespaceId), ownerGeneration: revision(v.ownerGeneration),
    metadata: Object.freeze({ recovery, binding: binding.value }), grant, credentialDigest,
    expectedAuthorizationVersion: revision(v.expectedAuthorizationVersion), effectiveUpstreamCapMs: time(v.effectiveUpstreamCapMs) });
}
function clockData(value: unknown): Readonly<ClockObservationData> {
  const v = envelope(value, 'KUB_ADMIN_CLOCK_OBSERVATION_V1', ['observationId', 'attemptId', 'boundaryRef',
    'clockAuthorityId', 'clockEpoch', 'earliestMs', 'latestMs']);
  const earliestMs = time(v.earliestMs), latestMs = time(v.latestMs); requireData(earliestMs <= latestMs);
  return Object.freeze({ profile: 'KUB_ADMIN_CLOCK_OBSERVATION_V1', version: 1, observationId: hex(v.observationId),
    attemptId: hex(v.attemptId), boundaryRef: hex(v.boundaryRef), clockAuthorityId: hex(v.clockAuthorityId),
    clockEpoch: hex(v.clockEpoch), earliestMs, latestMs });
}
function anchorData(value: unknown): Readonly<LifetimeAnchorData> {
  const v = envelope(value, 'KUB_ADMIN_LIFETIME_ANCHOR_V1', ['scope', 'anchorId', 'originAttemptId', 'originDecisionId', 'originClock', 't0Ms']);
  const originClock = clockData(v.originClock), originAttemptId = hex(v.originAttemptId), t0Ms = time(v.t0Ms);
  requireData(originClock.attemptId === originAttemptId && t0Ms <= originClock.earliestMs);
  return Object.freeze({ profile: 'KUB_ADMIN_LIFETIME_ANCHOR_V1', version: 1, scope: scopeData(v.scope),
    anchorId: hex(v.anchorId), originAttemptId, originDecisionId: hex(v.originDecisionId), originClock, t0Ms });
}
function attemptData(value: unknown): Readonly<TransactionAttemptData> {
  const v = envelope(value, 'KUB_ADMIN_TRANSACTION_ATTEMPT_V1', ['attemptId', 'decisionId', 'scope', 'anchorId',
    'clock', 'grantRevision', 'dependencies', 'writeSetProfile', 'preparedWriteSetDigest']);
  const scope = scopeData(v.scope), clock = clockData(v.clock), attemptId = hex(v.attemptId), grantRevision = revision(v.grantRevision);
  requireData(clock.attemptId === attemptId && grantRevision === scope.grant.expectedRevision &&
    v.writeSetProfile === 'KUB_ADMIN_CLAIMED_WRITESET_V1' && Array.isArray(v.dependencies) && v.dependencies.length > 0);
  const seen = new Set<string>();
  const dependencies = Object.freeze(v.dependencies.map(item => {
    const d = object(item, ['authorityId', 'recordId', 'revision']), authorityId = hex(d.authorityId), recordId = hex(d.recordId);
    const key = authorityId + recordId; requireData(!seen.has(key)); seen.add(key);
    return Object.freeze({ authorityId, recordId, revision: revision(d.revision) });
  }));
  return Object.freeze({ profile: 'KUB_ADMIN_TRANSACTION_ATTEMPT_V1', version: 1, attemptId, decisionId: hex(v.decisionId),
    scope, anchorId: hex(v.anchorId), clock, grantRevision, dependencies,
    writeSetProfile: 'KUB_ADMIN_CLAIMED_WRITESET_V1', preparedWriteSetDigest: hex(v.preparedWriteSetDigest) });
}
function decisionData(value: unknown): Readonly<AdmissionDecisionData> {
  const v = envelope(value, 'KUB_ADMIN_ADMISSION_DECISION_V1', ['decisionId', 'attempt', 'status', 'reason']);
  const attempt = attemptData(v.attempt), decisionId = hex(v.decisionId);
  requireData(decisionId === attempt.decisionId && (v.status === 'ADMITTED' && v.reason === null || v.status === 'DENIED' &&
    ['INVALID_INPUT', 'CLOCK_UNVERIFIED', 'EXPIRED', 'BINDING_MISMATCH', 'ANCHOR_UNAVAILABLE', 'DEPENDENCY_CHANGED'].includes(v.reason as string)));
  return Object.freeze({ profile: 'KUB_ADMIN_ADMISSION_DECISION_V1', version: 1, decisionId, attempt,
    status: v.status as AdmissionDecisionData['status'], reason: v.reason as AdmissionDecisionData['reason'] });
}
function committedData(value: unknown): Readonly<CommittedAttemptData> {
  const v = envelope(value, 'KUB_ADMIN_COMMITTED_ATTEMPT_V1', ['status', 'commitRecordId', 'receiptId', 'attemptId',
    'decisionId', 'anchorId', 'preparedWriteSetDigest', 'decision', 'databaseCommittedAt']);
  const decision = decisionData(v.decision), a = decision.attempt, c = object(v.databaseCommittedAt, ['status', 'value']);
  requireData(v.status === 'COMMITTED' && decision.status === 'ADMITTED' && hex(v.attemptId) === a.attemptId &&
    hex(v.decisionId) === decision.decisionId && hex(v.anchorId) === a.anchorId && hex(v.preparedWriteSetDigest) === a.preparedWriteSetDigest);
  let databaseCommittedAt: Readonly<DatabaseCommitTime>;
  if (c.status === 'UNAVAILABLE') { requireData(c.value === null); databaseCommittedAt = Object.freeze({ status: 'UNAVAILABLE', value: null }); }
  else { requireData(c.status === 'KNOWN'); const at = time(c.value); requireData(at >= a.clock.earliestMs);
    databaseCommittedAt = Object.freeze({ status: 'KNOWN', value: at }); }
  return Object.freeze({ profile: 'KUB_ADMIN_COMMITTED_ATTEMPT_V1', version: 1, status: 'COMMITTED',
    commitRecordId: hex(v.commitRecordId), receiptId: hex(v.receiptId), attemptId: a.attemptId, decisionId: decision.decisionId,
    anchorId: a.anchorId, preparedWriteSetDigest: a.preparedWriteSetDigest, decision, databaseCommittedAt });
}
function planningData(value: unknown): Readonly<AnchoredPlanningInput> {
  const v = envelope(value, 'KUB_ADMIN_ANCHORED_PLANNING_INPUT_V1', ['attempt', 'anchor', 'admissionInterval',
    'grant', 'effectiveUpstreamCapMs', 'user', 'attemptState']);
  const attempt = attemptData(v.attempt), anchor = anchorData(v.anchor), admissionInterval = clockData(v.admissionInterval);
  requireData(equal(attempt.scope, anchor.scope) && attempt.anchorId === anchor.anchorId && equal(attempt.clock, admissionInterval));
  const original = anchor.originClock;
  requireData(admissionInterval.clockAuthorityId === original.clockAuthorityId && admissionInterval.clockEpoch === original.clockEpoch &&
    admissionInterval.earliestMs >= original.earliestMs && admissionInterval.latestMs >= original.latestMs);
  if (attempt.attemptId === anchor.originAttemptId)
    requireData(attempt.decisionId === anchor.originDecisionId && equal(admissionInterval, original));
  else requireData(attempt.decisionId !== anchor.originDecisionId && admissionInterval.observationId !== original.observationId &&
    admissionInterval.boundaryRef !== original.boundaryRef);
  const grant = durableGrantProjection(v.grant, attempt.scope.grant), u = object(v.user, ['issuer', 'subject', 'active', 'authorizationVersion']);
  requireData(u.issuer === grant.identityIssuer && u.subject === grant.identitySubject && typeof u.active === 'boolean');
  const effectiveUpstreamCapMs = time(v.effectiveUpstreamCapMs);
  requireData(effectiveUpstreamCapMs === attempt.scope.effectiveUpstreamCapMs && effectiveUpstreamCapMs <= grant.authenticationExpiresAt &&
    revision(u.authorizationVersion) === attempt.scope.expectedAuthorizationVersion &&
    ['PREPARED', 'ABORTED', 'COMMITTED', 'OUTCOME_UNKNOWN'].includes(v.attemptState as string));
  return Object.freeze({ profile: 'KUB_ADMIN_ANCHORED_PLANNING_INPUT_V1', version: 1, attempt, anchor, admissionInterval, grant,
    effectiveUpstreamCapMs, user: Object.freeze({ issuer: u.issuer, subject: u.subject, active: u.active,
      authorizationVersion: u.authorizationVersion }) as Readonly<CurrentDirectoryUser>, attemptState: v.attemptState as AnchoredPlanningInput['attemptState'] });
}
/** Both arguments are DATA. Callers must obtain pinned expectations independently of browser input.
 * Matching candidate-echo JSON can validate as data; it can never become trusted admission evidence. */
function validate<T>(value: unknown, pinned: unknown, parse: (v: unknown) => Readonly<T>): TemporalContractValidation<T> {
  try {
    // Candidate Proxy traps may mutate caller-owned expectations. Capture and validate the
    // independent pinned snapshot FIRST; never reread either mutable source after capture.
    const expected = parse(snapshot(pinned));
    const candidate = parse(snapshot(value));
    return equal(candidate, expected) ? Object.freeze({ status: 'VALID_DATA', value: candidate }) :
      Object.freeze({ status: 'INVALID_DATA', reason: 'BINDING_MISMATCH' });
  } catch { return Object.freeze({ status: 'INVALID_DATA', reason: 'INVALID_INPUT' }); }
}
export const validateOperationScopeData = (value: unknown, pinned: unknown) => validate(value, pinned, scopeData);
export const validateClockObservationData = (value: unknown, pinned: unknown) => validate(value, pinned, clockData);
export const validateLifetimeAnchorData = (value: unknown, pinned: unknown) => validate(value, pinned, anchorData);
export const validateTransactionAttemptData = (value: unknown, pinned: unknown) => validate(value, pinned, attemptData);
export const validateAdmissionDecisionData = (value: unknown, pinned: unknown) => validate(value, pinned, decisionData);
export const validateCommittedAttemptData = (value: unknown, pinned: unknown) => validate(value, pinned, committedData);
export const validateAnchoredPlanningInput = (value: unknown, pinned: unknown) => validate(value, pinned, planningData);
