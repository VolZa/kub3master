import { IDENTITY_TTL } from './contracts';
import { validateAnchoredPlanningInput, type OperationScopeData, type ClockObservationData } from './temporal-attempt-contracts';

/** A candidate has deliberately named time fields, no consumedAt, bearer or store-session shape.
 * PLAN_CANDIDATE proves only supplied data invariants, never clock/anchor/approval provenance.
 * No distributed PO is closed. Runtime STRICT_COMMIT_TIME and the BLOCKED gate are unchanged. */
export interface AnchoredSessionCandidateData {
  readonly profile: 'KUB_ADMIN_ANCHORED_SESSION_CANDIDATE_V1'; readonly version: 1;
  readonly scope: Readonly<OperationScopeData>; readonly attemptId: string; readonly decisionId: string;
  readonly anchorId: string; readonly admissionInterval: Readonly<ClockObservationData>;
  readonly sessionIssuedAtMs: number; readonly sessionExpiresAtMs: number;
  readonly effectiveUpstreamCapMs: number;
  readonly identityIssuer: 'https://accounts.google.com'; readonly identitySubject: string;
  readonly authenticatedAtMs: number; readonly authorizationVersion: number;
}
export type AnchoredPlanningFailure = 'INVALID_INPUT' | 'BINDING_MISMATCH' | 'RECOVERY_REQUIRED' |
  'ATTEMPT_TERMINAL' | 'GRANT_UNAVAILABLE' | 'USER_INACTIVE' | 'ANCHOR_TIME_INVALID' |
  'GRANT_EXPIRED' | 'UPSTREAM_EXPIRED' | 'SESSION_EXPIRED' | 'TIME_OVERFLOW';
export type AnchoredPlanningResult =
  Readonly<{ status: 'PLAN_CANDIDATE'; candidate: Readonly<AnchoredSessionCandidateData> }> |
  Readonly<{ status: 'INVALID_DATA'; reason: AnchoredPlanningFailure }>;
const invalid = (reason: AnchoredPlanningFailure): AnchoredPlanningResult => Object.freeze({ status: 'INVALID_DATA', reason });

/** Pure local calculation, no callbacks/ports/system clock. Independent pinned DATA is mandatory.
 * New retry expectations may pin a fresh attempt, but must retain the original anchor/scope.
 * This function cannot authenticate those expectations or authorize a retry/replacement. */
export function planAnchoredSessionData(input: unknown, pinned: unknown): AnchoredPlanningResult {
  const checked = validateAnchoredPlanningInput(input, pinned);
  if (checked.status !== 'VALID_DATA') return invalid(checked.reason);
  const v = checked.value, { grant, anchor, admissionInterval: clock } = v, cap = v.effectiveUpstreamCapMs;
  if (v.attemptState === 'OUTCOME_UNKNOWN') return invalid('RECOVERY_REQUIRED');
  if (v.attemptState !== 'PREPARED') return invalid('ATTEMPT_TERMINAL');
  if (grant.status !== 'AVAILABLE' || grant.consumedAt !== null) return invalid('GRANT_UNAVAILABLE');
  if (!v.user.active) return invalid('USER_INACTIVE');
  // Check the ORIGINAL admission interval as well as CURRENT grant validity. Never use t0 as now.
  if (anchor.t0Ms < grant.issuedAt || anchor.t0Ms < grant.authenticatedAt ||
    anchor.originClock.earliestMs < grant.issuedAt || clock.earliestMs < grant.issuedAt) return invalid('ANCHOR_TIME_INVALID');
  if (clock.latestMs >= grant.expiresAt || anchor.originClock.latestMs >= grant.expiresAt) return invalid('GRANT_EXPIRED');
  if (clock.latestMs >= cap || anchor.originClock.latestMs >= cap) return invalid('UPSTREAM_EXPIRED');
  const maximumExpiry = anchor.t0Ms + IDENTITY_TTL.sessionMs;
  if (!Number.isSafeInteger(maximumExpiry)) return invalid('TIME_OVERFLOW');
  const expiry = Math.min(maximumExpiry, cap);
  if (expiry <= anchor.t0Ms || clock.latestMs >= expiry) return invalid('SESSION_EXPIRED');
  return Object.freeze({ status: 'PLAN_CANDIDATE', candidate: Object.freeze({
    profile: 'KUB_ADMIN_ANCHORED_SESSION_CANDIDATE_V1', version: 1, scope: v.attempt.scope,
    attemptId: v.attempt.attemptId, decisionId: v.attempt.decisionId, anchorId: anchor.anchorId,
    admissionInterval: clock, sessionIssuedAtMs: anchor.t0Ms, sessionExpiresAtMs: expiry,
    effectiveUpstreamCapMs: cap, identityIssuer: grant.identityIssuer, identitySubject: grant.identitySubject,
    authenticatedAtMs: grant.authenticatedAt, authorizationVersion: v.user.authorizationVersion,
  }) });
}
