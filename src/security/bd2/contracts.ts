import type { Role, SecurityEnvironment } from '../permission-service';

/** Data profile only. A matching DTO is never verification, enrollment or store provenance. */
export const BD2_PROFILE = 'KUB_ERP_SESSION_BD2_V1' as const;
export interface CanonicalPrincipal {
  readonly issuer: 'https://accounts.google.com';
  readonly sub: string;
}
export interface Bd2Context {
  readonly environment: SecurityEnvironment;
  readonly applicationAudience: string;
  readonly expectedScriptId: string;
}
interface Bd2Record {
  readonly profile: typeof BD2_PROFILE;
  readonly schemaVersion: 1;
  readonly context: Bd2Context;
}
export interface Bd2User extends Bd2Record {
  readonly principal: CanonicalPrincipal;
  readonly active: boolean;
  readonly roles: readonly Role[];
  readonly authorizationVersion: number;
  readonly revision: number;
}
export interface CapturedSessionPolicy {
  readonly policyVersion: number;
  readonly idleTimeoutMinutes: number;
  readonly absoluteTimeoutMinutes: 720;
}
export interface SessionPolicyConfig extends Bd2Record, CapturedSessionPolicy {
  readonly appliesTo: 'NEW_SESSIONS_ONLY';
  readonly updatedAtMs: number;
  readonly updatedBy: CanonicalPrincipal;
}
export interface Bd2Session extends Bd2Record {
  readonly sessionDigest: string;
  readonly createOperationId: string;
  readonly principal: CanonicalPrincipal;
  readonly createdAtMs: number;               // Immutable original logical creation time S.
  readonly lastEligibleActivityAtMs: number;  // A; this adapter never touches it.
  readonly policySnapshot: CapturedSessionPolicy;
  readonly authorizationVersionAtIssue: number;
  readonly revision: number;
  readonly status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  readonly revokedAtMs: number | null;
}
