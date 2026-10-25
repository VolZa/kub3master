import { IDENTITY_TTL, type LoginTransaction, type LoginTransactionStatus, type LoginGrantState,
  type IdentityApplicationContext, type SessionIssuePlan, type AdminSessionRecord } from './contracts';
import { invalid, record, context, matchContext, timestamp, lifetime, hex, transaction, addTime, sessionRecord } from './validation';
import { readTrustedLoginGrant, readVerifiedIdentity } from './verification';

const next: Readonly<Record<LoginTransactionStatus, readonly LoginTransactionStatus[]>> = Object.freeze({
  CREATED: Object.freeze(['BOUND', 'FAILED', 'EXPIRED'] as const),
  BOUND: Object.freeze(['VERIFYING', 'FAILED', 'EXPIRED'] as const),
  VERIFYING: Object.freeze(['VERIFIED', 'FAILED', 'EXPIRED'] as const),
  VERIFIED: Object.freeze(['CONSUMED', 'FAILED', 'EXPIRED'] as const),
  CONSUMED: Object.freeze([]), FAILED: Object.freeze([]), EXPIRED: Object.freeze([]),
});
/** Pure candidate transition. A future store must CAS expected status/revision atomically. */
export function transitionLoginTransaction(value: unknown, expected: unknown, status: LoginTransactionStatus, now: number): Readonly<LoginTransaction> {
  timestamp(now); const tx = transaction(value, expected);
  if (now < tx.updatedAt || !next[tx.status].includes(status)) return invalid();
  if (status === 'EXPIRED') { if (now < tx.expiresAt) return invalid(); }
  else lifetime(tx.createdAt, tx.expiresAt, IDENTITY_TTL.transactionMs, now);
  return transaction({ ...tx, status, updatedAt: now, consumedAt: status === 'CONSUMED' ? now : null }, expected);
}
export function availableGrantState(grant: unknown, expected: unknown, now: number): Readonly<LoginGrantState> {
  const data = readTrustedLoginGrant(grant, expected, now);
  return Object.freeze({ ...context(expected), grantId: data.grantId, status: 'AVAILABLE', consumedAt: null });
}
/** Validates a future server directory snapshot, never a browser claim. No roles/permissions
 * are copied into the plan. PermissionService must still authorize each future protected RPC.
 */
export function planGrantRedemption(grant: unknown, stateValue: unknown, expected: unknown,
  user: { readonly issuer: string; readonly subject: string; readonly active: boolean; readonly authorizationVersion: number }, now: number):
  { readonly consumedState: Readonly<LoginGrantState>; readonly sessionPlan: Readonly<SessionIssuePlan> } {
  const data = readTrustedLoginGrant(grant, expected, now), identity = readVerifiedIdentity(data.identity, expected);
  const state = record(stateValue, ['environment', 'applicationAudience', 'expectedScriptId', 'grantId', 'status', 'consumedAt']);
  const c = matchContext(state as unknown as IdentityApplicationContext, expected);
  if (hex(state.grantId) !== data.grantId || state.status !== 'AVAILABLE' || state.consumedAt !== null ||
    !user || user.active !== true || user.issuer !== identity.identityIssuer || user.subject !== identity.identitySubject ||
    !Number.isSafeInteger(user.authorizationVersion) || user.authorizationVersion < 0) return invalid();
  const sessionPlan: SessionIssuePlan = Object.freeze({ ...c, identityIssuer: identity.identityIssuer, identitySubject: identity.identitySubject,
    authenticatedAt: identity.authenticatedAt, authenticationExpiresAt: identity.authenticationExpiresAt,
    issuedAt: now, expiresAt: Math.min(addTime(now, IDENTITY_TTL.sessionMs), identity.authenticationExpiresAt), authorizationVersion: user.authorizationVersion });
  return Object.freeze({ consumedState: Object.freeze({ ...c, grantId: data.grantId, status: 'CONSUMED', consumedAt: now }), sessionPlan });
}
/** Pure revocation candidate; does not persist or invalidate an in-flight operation. */
export function revokeSessionRecord(value: unknown, expected: unknown, now: number): Readonly<AdminSessionRecord> {
  const session = sessionRecord(value, expected); timestamp(now);
  if (session.status !== 'ACTIVE' || now < session.issuedAt) return invalid();
  return sessionRecord({ ...session, status: 'REVOKED', revokedAt: now }, expected);
}
