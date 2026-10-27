import { IDENTITY_TTL } from '../identity-contracts/contracts';
import { durableGrantBinding, durableGrantProjection } from '../identity-contracts/durable-store-contracts';
import { contextFields, record, timestamp, invalid } from '../identity-contracts/validation';
import { verificationKey, signingKeyPolicy } from '../identity-contracts/signing-key-policy';
import { RENEWAL_LIMITS, type GrantReadinessDecision, type GrantReadinessPolicy,
  type TrustedClockInterval, type RenewalFailure } from './renewal-contracts';

export function grantReadinessPolicy(value: unknown): Readonly<GrantReadinessPolicy> {
  const v = record(value, ['minimumRemainingMs']), min = v.minimumRemainingMs;
  if (!Number.isSafeInteger(min) || (min as number) <= 0 || (min as number) >= IDENTITY_TTL.grantMs) return invalid();
  return Object.freeze({ minimumRemainingMs: min as number });
}
export function trustedClockInterval(value: unknown): Readonly<TrustedClockInterval> {
  const v = record(value, ['earliestMs', 'latestMs']);
  const earliestMs = timestamp(v.earliestMs), latestMs = timestamp(v.latestMs);
  if (earliestMs > latestMs) return invalid(); return Object.freeze({ earliestMs, latestMs });
}
const blocked = (reason: RenewalFailure): GrantReadinessDecision => Object.freeze({ status: 'BLOCKED', reason });
/** DATA-ONLY conservative decision. READY is NOT admission/identity/non-dispatch evidence.
 * Unknown input fails closed. No clock, I/O, state change, crypto adapter or production default. */
export function evaluateGrantReadiness(input: unknown): Readonly<GrantReadinessDecision> {
  try {
    const v = record(input, ['grant', 'binding', 'keyPolicy', 'clock', 'previousClock', 'policy', 'dispatchState',
      'completedGrantAttempts', 'upstreamAuthenticationCap', 'rateBudgetStatus']);
    if (['DISPATCH_POSSIBLE', 'RECOVERY_REQUIRED', 'UNKNOWN'].includes(v.dispatchState as string))
      return Object.freeze({ status: 'RECOVERY_REQUIRED', reason: 'DISPATCH_POSSIBLE' });
    if (v.dispatchState !== 'BEFORE_DISPATCH') return blocked('STALE_ATTEMPT');
    const policy = grantReadinessPolicy(v.policy);
    let at: Readonly<TrustedClockInterval>, previous: Readonly<TrustedClockInterval> | null;
    try { at = trustedClockInterval(v.clock); previous = v.previousClock === null ? null : trustedClockInterval(v.previousClock); }
    catch { return blocked('CLOCK_INVALID'); }
    if (previous && (at.earliestMs < previous.earliestMs || at.latestMs < previous.latestMs)) return blocked('CLOCK_ROLLBACK');
    const completed = v.completedGrantAttempts;
    if (!Number.isSafeInteger(completed) || (completed as number) < 0 || (completed as number) > RENEWAL_LIMITS.maximumGrantAttempts)
      return blocked('INVALID_INPUT');
    if ((completed as number) === RENEWAL_LIMITS.maximumGrantAttempts) return blocked('RENEWAL_LIMIT_REACHED');
    if (v.rateBudgetStatus === 'UNAVAILABLE') return blocked('RATE_UNAVAILABLE');
    if (v.rateBudgetStatus === 'DENIED') return blocked('RATE_LIMITED');
    if (v.rateBudgetStatus !== 'ALLOWED') return blocked('INVALID_INPUT');
    let grant;
    try { grant = durableGrantProjection(v.grant, durableGrantBinding(v.binding)); }
    catch { return blocked('GRANT_INVALID'); }
    const cap = timestamp(v.upstreamAuthenticationCap);
    if (grant.authenticationExpiresAt > cap) return blocked('UPSTREAM_CAP_CHANGED');
    if (Math.min(cap, grant.authenticationExpiresAt) <= at.latestMs) return blocked('UPSTREAM_EXPIRED');
    if (Math.min(cap, grant.authenticationExpiresAt) - at.latestMs < policy.minimumRemainingMs) return blocked('UPSTREAM_INSUFFICIENT');
    if (grant.status !== 'AVAILABLE' || grant.consumedAt !== null) return blocked('GRANT_UNAVAILABLE');
    if (grant.issuedAt > at.earliestMs) return blocked('CLOCK_UNCERTAIN');
    try {
      const keys = signingKeyPolicy(v.keyPolicy), c = contextFields(grant);
      if (keys.brokerIssuer !== grant.signingKey.brokerIssuer) return blocked('KEY_UNAVAILABLE');
      verificationKey(keys, grant.signingKey.keyId, c, grant.signingKey.assertionIssuedAt, at.earliestMs);
      verificationKey(keys, grant.signingKey.keyId, c, grant.signingKey.assertionIssuedAt, at.latestMs);
    } catch { return blocked('KEY_UNAVAILABLE'); }
    const remainingMs = grant.expiresAt - at.latestMs; // Upper bound shrinks usable lifetime; no grace.
    if (remainingMs >= policy.minimumRemainingMs) return Object.freeze({ status: 'READY_FOR_ATTEMPT', remainingMs });
    if ((completed as number) + 1 >= RENEWAL_LIMITS.maximumGrantAttempts) return blocked('RENEWAL_LIMIT_REACHED');
    return Object.freeze({ status: 'ABANDON_BEFORE_DISPATCH', reason: remainingMs <= 0 ? 'GRANT_EXPIRED' : 'INSUFFICIENT_LIFETIME', remainingMs });
  } catch { return blocked('INVALID_INPUT'); }
}
