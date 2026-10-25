import { IDENTITY_TTL, type IdentityApplicationContext, type LoginTransaction, type AdminSessionRecord,
  type BrowserLoginBeginRequest, type BrowserLoginCompleteRequest, type BrowserSessionCredential,
  type BrokerVerificationPolicy, type SignatureMetadata, type PublicSessionStatus } from './contracts';

/** Fixed errors only. Structural validation never proves source authenticity or authorizes an RPC. */
export function invalid(): never { throw Error('IDENTITY_CONTRACT_INVALID'); }
export function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(d => d.get || d.set) || Object.getOwnPropertySymbols(value).length) return invalid();
  return value as Record<string, unknown>;
}
export function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalid(); return value;
}
export function addTime(base: number, duration: number): number { return timestamp(timestamp(base) + duration); }
export function hex(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return invalid(); return value;
}
export function context(value: unknown): Readonly<IdentityApplicationContext> {
  const v = record(value, ['environment', 'applicationAudience', 'expectedScriptId']);
  if ((v.environment !== 'PRODUCTION' && v.environment !== 'TEST') ||
    typeof v.applicationAudience !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:/.\-_]{2,199}$/.test(v.applicationAudience) ||
    typeof v.expectedScriptId !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(v.expectedScriptId) || /REPLACE|PLACEHOLDER/i.test(v.expectedScriptId)) return invalid();
  return Object.freeze({ environment: v.environment, applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId });
}
export function contextFields(value: IdentityApplicationContext): Readonly<IdentityApplicationContext> {
  return context({ environment: value.environment, applicationAudience: value.applicationAudience, expectedScriptId: value.expectedScriptId });
}
export function matchContext(value: IdentityApplicationContext, expected: unknown): Readonly<IdentityApplicationContext> {
  const actual = contextFields(value), target = context(expected);
  if (actual.environment !== target.environment || actual.applicationAudience !== target.applicationAudience || actual.expectedScriptId !== target.expectedScriptId) return invalid();
  return target;
}
export function lifetime(issued: unknown, expires: unknown, max: number, now: number): void {
  timestamp(now); const a = timestamp(issued), b = timestamp(expires);
  if (a > now || b <= a || b - a > max || now >= b) return invalid();
}
export function signature(value: unknown): Readonly<SignatureMetadata> {
  const v = record(value, ['algorithm', 'keyId']);
  if ((v.algorithm !== 'HS256' && v.algorithm !== 'RS256') || typeof v.keyId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v.keyId)) return invalid();
  return Object.freeze({ algorithm: v.algorithm, keyId: v.keyId });
}
export function brokerPolicy(value: unknown): Readonly<BrokerVerificationPolicy> {
  const v = record(value, ['brokerIssuer', 'signature']);
  if (typeof v.brokerIssuer !== 'string' || !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/.test(v.brokerIssuer)) return invalid();
  return Object.freeze({ brokerIssuer: v.brokerIssuer, signature: signature(v.signature) });
}
const transactionKeys = ['environment', 'applicationAudience', 'expectedScriptId', 'transactionId', 'browserProofBinding', 'nonce',
  'createdAt', 'expiresAt', 'status', 'updatedAt', 'consumedAt'];
export function transaction(value: unknown, expected: unknown): Readonly<LoginTransaction> {
  const v = record(value, transactionKeys), c = matchContext(v as unknown as IdentityApplicationContext, expected);
  const createdAt = timestamp(v.createdAt), expiresAt = timestamp(v.expiresAt), updatedAt = timestamp(v.updatedAt);
  if (expiresAt <= createdAt || expiresAt - createdAt > IDENTITY_TTL.transactionMs || updatedAt < createdAt ||
    !['CREATED', 'BOUND', 'VERIFYING', 'VERIFIED', 'CONSUMED', 'FAILED', 'EXPIRED'].includes(v.status as string)) return invalid();
  if (v.status === 'EXPIRED' ? updatedAt < expiresAt : updatedAt >= expiresAt) return invalid();
  if (v.status === 'CONSUMED' ? timestamp(v.consumedAt) !== updatedAt : v.consumedAt !== null) return invalid();
  return Object.freeze({ ...c, transactionId: hex(v.transactionId), browserProofBinding: hex(v.browserProofBinding), nonce: hex(v.nonce),
    createdAt, expiresAt, updatedAt, consumedAt: v.consumedAt as number | null, status: v.status as LoginTransaction['status'] });
}
export function browserLoginBegin(value: unknown): Readonly<BrowserLoginBeginRequest> {
  const v = record(value, ['browserProofBinding']); return Object.freeze({ browserProofBinding: hex(v.browserProofBinding) });
}
export function browserLoginComplete(value: unknown): Readonly<BrowserLoginCompleteRequest> {
  const v = record(value, ['transactionId', 'browserProof']); return Object.freeze({ transactionId: hex(v.transactionId), browserProof: hex(v.browserProof) });
}
export function browserSessionCredential(value: unknown): Readonly<BrowserSessionCredential> {
  const v = record(value, ['sessionCredential']); return Object.freeze({ sessionCredential: hex(v.sessionCredential) });
}
const sessionKeys = ['environment', 'applicationAudience', 'expectedScriptId', 'identityIssuer', 'identitySubject', 'authenticatedAt',
  'authenticationExpiresAt', 'issuedAt', 'expiresAt', 'authorizationVersion', 'sessionId', 'status', 'revokedAt'];
export function sessionRecord(value: unknown, expected: unknown): Readonly<AdminSessionRecord> {
  const v = record(value, sessionKeys), c = matchContext(v as unknown as IdentityApplicationContext, expected);
  const authenticatedAt = timestamp(v.authenticatedAt), authenticationExpiresAt = timestamp(v.authenticationExpiresAt),
    issuedAt = timestamp(v.issuedAt), expiresAt = timestamp(v.expiresAt);
  if (v.identityIssuer !== 'https://accounts.google.com' || typeof v.identitySubject !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(v.identitySubject) ||
    authenticatedAt > issuedAt || authenticationExpiresAt <= authenticatedAt || authenticationExpiresAt - authenticatedAt > IDENTITY_TTL.authenticationMaxAgeMs ||
    expiresAt <= issuedAt || expiresAt - issuedAt > IDENTITY_TTL.sessionMs || expiresAt > authenticationExpiresAt ||
    !Number.isSafeInteger(v.authorizationVersion) || (v.authorizationVersion as number) < 0 || (v.status !== 'ACTIVE' && v.status !== 'REVOKED')) return invalid();
  if (v.status === 'ACTIVE' ? v.revokedAt !== null : timestamp(v.revokedAt) < issuedAt) return invalid();
  return Object.freeze({ ...c, identityIssuer: v.identityIssuer, identitySubject: v.identitySubject, authenticatedAt, authenticationExpiresAt,
    issuedAt, expiresAt, authorizationVersion: v.authorizationVersion as number, sessionId: hex(v.sessionId), status: v.status, revokedAt: v.revokedAt as number | null });
}
/** Validate an authoritative server record against a current server-resolved directory snapshot.
 * This does NOT call PermissionService or mint its verifiedIdentity; shape is never provenance.
 */
export function validateSessionUse(value: unknown, expected: unknown, user: {
  readonly issuer: string; readonly subject: string; readonly active: boolean; readonly authorizationVersion: number;
}, now: number): Readonly<AdminSessionRecord> {
  timestamp(now); const v = sessionRecord(value, expected);
  if (v.status !== 'ACTIVE' || v.issuedAt > now || now >= v.expiresAt || !user || user.active !== true ||
    user.issuer !== v.identityIssuer || user.subject !== v.identitySubject || !Number.isSafeInteger(user.authorizationVersion) ||
    user.authorizationVersion !== v.authorizationVersion) return invalid();
  return v;
}
export function publicSessionStatus(value: unknown): Readonly<PublicSessionStatus> {
  const v = record(value, ['environment', 'status', 'authenticated', 'expiresAt']);
  if ((v.environment !== 'PRODUCTION' && v.environment !== 'TEST') ||
    !['NOT_CONNECTED', 'AUTHENTICATED', 'BLOCKED', 'EXPIRED', 'REVOKED'].includes(v.status as string) ||
    v.authenticated !== (v.status === 'AUTHENTICATED') || (v.status === 'AUTHENTICATED' ? !timestamp(v.expiresAt) : v.expiresAt !== null)) return invalid();
  return Object.freeze({ environment: v.environment, status: v.status as PublicSessionStatus['status'], authenticated: v.authenticated as boolean, expiresAt: v.expiresAt as number | null });
}
