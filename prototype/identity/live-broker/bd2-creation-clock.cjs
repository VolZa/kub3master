'use strict';

// Isolated Node-only checks for one trusted creation operation. No Session or authority.
// PROVISIONAL anomaly policy, pending architect review; never a freshness grace period.
const PROVISIONAL_MAX_DISCREPANCY_MS = 1000;
const MAX_GOOGLE_PROOF_AGE_MS = 30_000;
const SESSION_HARD_LIFETIME_MS = 720 * 60_000;
const NS_PER_MS = 1_000_000n;
const MAX_DISCREPANCY_NS = BigInt(PROVISIONAL_MAX_DISCREPANCY_MS) * NS_PER_MS;
const timestamp = value => Number.isSafeInteger(value) && value > 0;
const clockFailure = () => { throw Error('CLOCK_GUARD_FAILED'); };

function progressionMatches(current, reference) {
  const wallElapsedMs = current.wallMs - reference.wallMs;
  const monotonicElapsedNs = current.monotonicNs - reference.monotonicNs;
  if (!Number.isSafeInteger(wallElapsedMs) || wallElapsedMs < 0 || monotonicElapsedNs < 0n) return false;
  // Never convert nanoseconds to Number or truncate fractional milliseconds.
  const discrepancyNs = BigInt(wallElapsedMs) * NS_PER_MS - monotonicElapsedNs;
  return discrepancyNs > -MAX_DISCREPANCY_NS && discrepancyNs < MAX_DISCREPANCY_NS;
}

/** Sources are synchronous trusted Node/test inputs, never request-controlled options.
 * The first successful observation anchors this operation, not global clock health.
 * Platform time synchronization is assumed; this cannot establish UTC accuracy,
 * detect a pre-anchor error, or prove supported-runtime suspend/resume behavior.
 */
function createCreationClockGuard({ wallNow = () => Date.now(), monotonicNow = () => process.hrtime.bigint() } = {}) {
  if (typeof wallNow !== 'function' || typeof monotonicNow !== 'function') throw TypeError('INVALID_CLOCK_SOURCE');
  let anchor, previous, failed = false, observing = false;
  return Object.freeze({
    observe() {
      // Reentrant source callbacks cannot overwrite samples or revive a fault.
      if (failed || observing) { failed = true; return clockFailure(); }
      observing = true;
      try {
        // One synchronous pair, with no await, I/O, resampling or timestamp adjustment.
        const wallMs = wallNow();
        const monotonicNs = monotonicNow();
        // Bigint has no finite upper range; retain it exactly even for long uptimes.
        if (failed || !timestamp(wallMs) || typeof monotonicNs !== 'bigint' || monotonicNs < 0n) clockFailure();
        const current = { wallMs, monotonicNs };
        if (previous && (!progressionMatches(current, previous) || !progressionMatches(current, anchor))) clockFailure();
        anchor ??= current;
        previous = current;
        return wallMs;
      } catch {
        failed = true;
        return clockFailure();
      } finally {
        observing = false;
      }
    },
  });
}

function preFixationMatches(C, V, t, D, G) {
  if (![C, V, t, D, G].every(timestamp)) return false;
  const ageMs = t - V;
  return Number.isSafeInteger(ageMs) && C < D && C <= V && V <= t &&
    t < D && t < G && ageMs >= 0 && ageMs < MAX_GOOGLE_PROOF_AGE_MS;
}

/** Pure scalar predicates only: caller separately needs a fresh healthy guard
 * observation and authoritative original metadata. A true result grants nothing.
 * Before fixation there is no S and no substitute S is created.
 */
function isPreFixationTimeValid(value) {
  try {
    const { C, V, t, D, G } = value;
    return preFixationMatches(C, V, t, D, G);
  } catch { return false; }
}

function isPostFixationTimeValid(value) {
  try {
    const { C, V, S, t, D, G } = value;
    return preFixationMatches(C, V, t, D, G) && timestamp(S) &&
      V <= S && S <= t && timestamp(S + SESSION_HARD_LIFETIME_MS);
  } catch { return false; }
}

module.exports = { PROVISIONAL_MAX_DISCREPANCY_MS, MAX_GOOGLE_PROOF_AGE_MS,
  createCreationClockGuard, isPreFixationTimeValid, isPostFixationTimeValid };
