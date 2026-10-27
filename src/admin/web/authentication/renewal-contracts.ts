import type { IdentityApplicationContext, LoginTransaction } from '../identity-contracts/contracts';
import type { DurableGrantBinding, DurableGrantProjection } from '../identity-contracts/durable-store-contracts';
import type { SigningKeyPolicy } from '../identity-contracts/signing-key-policy';
import type { BodyDigestPort } from '../channel-contracts/contracts';
import type { RecoveryDescriptor } from '../operation-contracts';

/** Approved family limits, NOT identity TTLs. No minimum-lifetime default is provided. */
export const RENEWAL_LIMITS = Object.freeze({ maximumGrantAttempts: 3 as const, maximumSilentRenewals: 2 as const });
export interface GrantReadinessPolicy { readonly minimumRemainingMs: number }
/** Trusted-server input requirement, not a clock implementation or authenticated JSON format. */
export interface TrustedClockInterval { readonly earliestMs: number; readonly latestMs: number }
export type RenewalDispatchState = 'BEFORE_DISPATCH' | 'ABANDONED' | 'DISPATCH_POSSIBLE' |
  'RECOVERY_REQUIRED' | 'CONFIRMED' | 'BLOCKED' | 'UNKNOWN';
export type RateBudgetStatus = 'ALLOWED' | 'DENIED' | 'UNAVAILABLE';
export type RenewalFailure = 'INVALID_INPUT' | 'CLOCK_INVALID' | 'CLOCK_ROLLBACK' | 'CLOCK_UNCERTAIN' |
  'CONTEXT_INVALID' | 'GRANT_INVALID' | 'GRANT_UNAVAILABLE' | 'KEY_UNAVAILABLE' | 'UPSTREAM_EXPIRED' |
  'UPSTREAM_CAP_CHANGED' | 'UPSTREAM_INSUFFICIENT' | 'RENEWAL_LIMIT_REACHED' | 'RATE_LIMITED' | 'RATE_UNAVAILABLE' |
  'INTERACTION_REQUIRED' | 'LOGIN_INVALID' | 'STALE_ATTEMPT' | 'DEPENDENCY_UNAVAILABLE';
export type GrantReadinessDecision =
  { readonly status: 'READY_FOR_ATTEMPT'; readonly remainingMs: number } |
  { readonly status: 'ABANDON_BEFORE_DISPATCH'; readonly reason: 'INSUFFICIENT_LIFETIME' | 'GRANT_EXPIRED'; readonly remainingMs: number } |
  { readonly status: 'BLOCKED'; readonly reason: RenewalFailure } |
  { readonly status: 'RECOVERY_REQUIRED'; readonly reason: 'DISPATCH_POSSIBLE' };
/** All fields come from trusted server readers/policy, never a browser readiness request.
 * Pure validation cannot prove reader ownership, verified identity or actual non-dispatch. */
export interface GrantReadinessInput {
  readonly grant: Readonly<DurableGrantProjection>;
  readonly binding: Readonly<DurableGrantBinding>;
  readonly keyPolicy: Readonly<SigningKeyPolicy>;
  readonly clock: Readonly<TrustedClockInterval>;
  readonly previousClock: Readonly<TrustedClockInterval> | null;
  readonly policy: Readonly<GrantReadinessPolicy>;
  readonly dispatchState: RenewalDispatchState;
  readonly completedGrantAttempts: number;
  readonly upstreamAuthenticationCap: number;
  readonly rateBudgetStatus: RateBudgetStatus;
}
export interface RenewalFamilySeed extends IdentityApplicationContext {
  readonly familyId: string;
  readonly identityIssuer: 'https://accounts.google.com';
  readonly identitySubject: string;
  readonly authenticatedAt: number;
  readonly upstreamAuthenticationCap: number;
  readonly rateBudgetReference: string;
}
export interface RenewalFamilySnapshot extends RenewalFamilySeed {
  readonly effectiveUpstreamAuthenticationCap: number;
  readonly generation: number;
  readonly completedGrantAttempts: number;
  readonly grantsCreated: number;
  readonly maximumGrantAttempts: 3;
  readonly silentRenewalAttempts: number;
  readonly state: RenewalDispatchState | 'LOGIN_REQUIRED';
  readonly terminalState: 'BLOCKED' | 'CONFIRMED' | null;
  readonly failure: RenewalFailure | null;
  /** Model event count, NOT actual network sends or committed business mutations. */
  readonly handoffs: number;
}
declare const loginAttempt: unique symbol;
declare const unsentAttempt: unique symbol;
declare const renewalPermit: unique symbol;
declare const dispatchAttempt: unique symbol;
export interface RenewalLoginAttempt { readonly [loginAttempt]: true }
export interface UnsentRenewalAttempt { readonly [unsentAttempt]: true }
export interface BeforeDispatchRenewalPermit { readonly [renewalPermit]: true }
export interface PossibleDispatchAttempt { readonly [dispatchAttempt]: true }
/** Server-local result only. The transaction/identity is not a public browser DTO. */
export interface RenewalLoginStart { readonly attempt: RenewalLoginAttempt; readonly transaction: Readonly<LoginTransaction> }
export type RenewalTransitionResult =
  { readonly status: 'ABANDONED'; readonly renewal: BeforeDispatchRenewalPermit } |
  { readonly status: 'BLOCKED'; readonly reason: RenewalFailure };
export type ModelDispatchResult = GrantReadinessDecision |
  { readonly status: 'DISPATCH_POSSIBLE'; readonly dispatch: PossibleDispatchAttempt };
export type RenewalRecoveryResult = { readonly status: 'CONFIRMED'; readonly outcome: 'COMMITTED' | 'REJECTED' } |
  { readonly status: 'RECOVERY_REQUIRED' };

/** SYNCHRONOUS LOCAL FIXTURE PORTS ONLY. Not remote authoritative cache/store adapters.
 * Real cross-worker rate/dispatch/time/receipt ownership implementations are missing.
 * Server DI is trusted; these interfaces cannot authenticate a lying server adapter. */
export interface RenewalReferencePorts {
  readonly currentContext: () => unknown;
  readonly clock: () => unknown;
  readonly keyPolicy: () => unknown;
  readonly secret: () => string;
  readonly digest: BodyDigestPort;
  readonly rateBudget: {
    claim(reference: string, familyId: string, generation: number): RateBudgetStatus;
    current(reference: string): RateBudgetStatus;
  };
  readonly silentOidcAvailable: () => boolean;
  /** Read-only trusted fixture boundary. Returns a bound receipt DTO (not session/identity proof),
   * or {outcome:'OUTCOME_UNKNOWN'|'UNAVAILABLE'}. Never returns/releases a credential. */
  readonly recoveryLookup: (descriptor: Readonly<RecoveryDescriptor>) => Promise<unknown>;
  readonly backendOrigin: string;
}
