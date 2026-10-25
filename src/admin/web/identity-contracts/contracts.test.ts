import { expect, it, vi } from 'vitest';
import { IDENTITY_TTL, type IdentityApplicationContext, type BrokerAssertionClaims, type BrokerSignatureVerificationPort,
  type LoginTransaction, type TrustedLoginGrant, type AdminSessionRecord, type VerifiedBrokerAssertion } from './contracts';
import { context, transaction, browserLoginBegin, browserLoginComplete, browserSessionCredential, publicSessionStatus,
  sessionRecord, validateSessionUse, timestamp, addTime } from './validation';
import { verifyBrokerAssertion, readVerifiedAssertion, createTrustedLoginGrant, readTrustedLoginGrant, readVerifiedIdentity } from './verification';
import { transitionLoginTransaction, availableGrantState, planGrantRedemption, revokeSessionRecord } from './lifecycle';
import { PermissionService, type UserIdentity } from '../../../security/permission-service';

const now = 1_800_000_000_000, id = 'a'.repeat(64), nonce = 'b'.repeat(64), proof = 'c'.repeat(64);
const expected: IdentityApplicationContext = { environment: 'TEST', applicationAudience: 'kub:admin:test', expectedScriptId: 'synthetic-admin-test-script-0000001' };
const policy = { brokerIssuer: 'https://broker.invalid', signature: { algorithm: 'HS256' as const, keyId: 'test-key-v1' } };
const user = { issuer: 'https://accounts.google.com', subject: 'synthetic-subject', active: true, authorizationVersion: 3 };
const message = { assertion: 'synthetic.signed.message' };
function fixture() {
  const tx: LoginTransaction = { ...expected, transactionId: id, browserProofBinding: proof, nonce, createdAt: now - 1000,
    expiresAt: now - 1000 + IDENTITY_TTL.transactionMs, updatedAt: now - 100, status: 'VERIFYING', consumedAt: null };
  const claims: BrokerAssertionClaims = { ...expected, purpose: 'ADMIN_WEB_LOGIN_V1', issuer: policy.brokerIssuer, identityIssuer: 'https://accounts.google.com',
    subject: user.subject, authenticatedAt: now - 2000, authenticationExpiresAt: now - 2000 + IDENTITY_TTL.authenticationMaxAgeMs,
    transactionId: id, nonce, browserProofBinding: proof, issuedAt: now - 500, expiresAt: now - 500 + IDENTITY_TTL.assertionMs, assertionId: 'd'.repeat(64) };
  const port = { verify: vi.fn((): { claims: unknown; signature: unknown } | undefined => ({ claims, signature: policy.signature })) };
  const verify = (at = now) => verifyBrokerAssertion(message, expected, policy, tx, at, port);
  function grant() { return createTrustedLoginGrant(verify(), transitionLoginTransaction(tx, expected, 'VERIFIED', now), expected, now); }
  return { tx, claims, port, verify, grant };
}
function serverSession(): AdminSessionRecord {
  const f = fixture(), grant = f.grant(), result = planGrantRedemption(grant, availableGrantState(grant, expected, now), expected, user, now);
  return { ...result.sessionPlan, sessionId: 'e'.repeat(64), status: 'ACTIVE', revokedAt: null };
}

it('separates unverified broker bytes, cryptographic evidence, grant and verified identity with explicit context', () => {
  const f = fixture(), evidence = f.verify();
  expect(f.port.verify).toHaveBeenCalledExactlyOnceWith(message, policy);
  expect(readVerifiedAssertion(evidence, expected, now).claims).toEqual(f.claims);
  const grant = createTrustedLoginGrant(evidence, transitionLoginTransaction(f.tx, expected, 'VERIFIED', now), expected, now);
  const data = readTrustedLoginGrant(grant, expected, now), identity = readVerifiedIdentity(data.identity, expected);
  expect(identity).toMatchObject({ ...expected, identityIssuer: user.issuer, identitySubject: user.subject,
    authenticatedAt: f.claims.authenticatedAt, provenance: 'OIDC_BROKER_ASSERTION_V1' });
  expect(Object.isFrozen(evidence)).toBe(true); expect(Object.isFrozen(evidence.data.claims)).toBe(true);
  expect(Object.isFrozen(grant)).toBe(true); expect(Object.isFrozen(identity)).toBe(true);
  // This new provenance does not bypass the existing PermissionService identity boundary.
  const permissions = new PermissionService({ find: () => ({ ...user, roles: ['ADMIN'] }) }, () => now, 'TEST');
  expect(() => permissions.require(identity as unknown as UserIdentity, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
});
it.each([null, undefined, {}, [], 'TEST', { ...expected, environment: 'UNKNOWN' }, { ...expected, environment: 'test' },
  { ...expected, applicationAudience: '' }, { ...expected, expectedScriptId: '' }, { ...expected, expectedScriptId: 'REPLACE_WITH_A_SCRIPT_IDENTIFIER' },
  { ...expected, roles: ['ADMIN'] }])('fails closed for unknown or malformed context (%#)', value => {
  expect(() => context(value)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each(['environment', 'applicationAudience', 'expectedScriptId'] as const)('rejects cross-context %s for evidence, transactions, grants and sessions', key => {
  const other = { ...expected, [key]: key === 'environment' ? 'PRODUCTION' : key === 'applicationAudience' ? 'kub:admin:production' : 'synthetic-other-script-00000000001' };
  const f = fixture(), grant = f.grant();
  expect(() => transaction(f.tx, other)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => readVerifiedAssertion(f.verify(), other, now)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => readTrustedLoginGrant(grant, other, now)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => sessionRecord(serverSession(), other)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each([0, -1, NaN, Infinity, -Infinity, 1.5, '1800000000000', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid timestamps (%#)', value => {
  expect(() => timestamp(value)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each(['environment', 'applicationAudience', 'expectedScriptId', 'issuer', 'identityIssuer', 'subject', 'purpose', 'transactionId', 'nonce', 'browserProofBinding', 'assertionId'] as const)(
  'rejects a signed but invalid assertion field %s', field => {
    const f = fixture();
    (f.claims as any)[field] = field === 'environment' ? 'PRODUCTION' : field.endsWith('Id') || field === 'nonce' || field === 'browserProofBinding' ? 'f'.repeat(64) :
      field === 'subject' ? '' : 'wrong-value';
    // Another well-formed assertion ID is allowed; malformed ID must fail.
    if (field === 'assertionId') (f.claims as any)[field] = 'short';
    expect(() => f.verify()).toThrow('IDENTITY_CONTRACT_INVALID');
  });
it.each(['absent', 'throw', 'decoded-only', 'algorithm', 'key', 'extra-claims', 'extra-header'])('fails closed on signature-port %s outcome', mode => {
  const f = fixture();
  if (mode === 'absent') f.port.verify.mockReturnValue(undefined);
  if (mode === 'throw') f.port.verify.mockImplementation(() => { throw Error('PRIVATE_SIGNATURE_ERROR'); });
  if (mode === 'decoded-only') f.port.verify.mockReturnValue({ claims: f.claims, signature: null });
  if (mode === 'algorithm') f.port.verify.mockReturnValue({ claims: f.claims, signature: { ...policy.signature, algorithm: 'none' } });
  if (mode === 'key') f.port.verify.mockReturnValue({ claims: f.claims, signature: { ...policy.signature, keyId: 'untrusted' } });
  if (mode === 'extra-claims') (f.claims as any).roles = ['ADMIN'];
  if (mode === 'extra-header') f.port.verify.mockReturnValue({ claims: f.claims, signature: { ...policy.signature, jku: 'https://evil.invalid' } });
  expect(() => f.verify()).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each([null, {}, { verified: true, claims: {} }, { assertion: '' }, { assertion: 'a'.repeat(8193) }, { assertion: 'a b' },
  { ...message, email: 'forged@example.invalid' }])('rejects invalid broker envelopes before calling the port (%#)', value => {
  const f = fixture(); expect(() => verifyBrokerAssertion(value, expected, policy, f.tx, now, f.port)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(f.port.verify).not.toHaveBeenCalled();
});
it.each(['issuedAt', 'expiresAt', 'authenticatedAt', 'authenticationExpiresAt'] as const)('rejects malformed assertion time %s', field => {
  for (const value of [NaN, Infinity, 1.5, null, 'time']) {
    const f = fixture(); (f.claims as any)[field] = value; expect(() => f.verify()).toThrow('IDENTITY_CONTRACT_INVALID');
  }
});
it('enforces exact assertion expiration, maximum TTL, future times and upstream authentication bounds', () => {
  const f = fixture(); expect(f.verify(f.claims.expiresAt - 1)).toBeDefined();
  expect(() => f.verify(f.claims.expiresAt)).toThrow('IDENTITY_CONTRACT_INVALID');
  (f.claims as any).expiresAt++; expect(() => f.verify()).toThrow('IDENTITY_CONTRACT_INVALID');
  const future = fixture(); (future.claims as any).issuedAt = now + 1; expect(() => future.verify()).toThrow('IDENTITY_CONTRACT_INVALID');
  const upstream = fixture(); (upstream.claims as any).authenticationExpiresAt++; expect(() => upstream.verify()).toThrow('IDENTITY_CONTRACT_INVALID');
  const stale = fixture(); (stale.claims as any).authenticationExpiresAt = now; expect(() => stale.verify()).toThrow('IDENTITY_CONTRACT_INVALID');
});
it('cannot mint provenance with a type assertion, copy, prototype graft, JSON, or a reachable constructor', () => {
  const f = fixture(), evidence = f.verify(), tx = transitionLoginTransaction(f.tx, expected, 'VERIFIED', now), grant = f.grant();
  for (const value of [f.claims, { verified: true, ...evidence }, { ...evidence }, JSON.parse(JSON.stringify(evidence)), Object.create(evidence)])
    expect(() => createTrustedLoginGrant(value as VerifiedBrokerAssertion, tx, expected, now)).toThrow('IDENTITY_CONTRACT_INVALID');
  for (const value of [{ ...grant }, JSON.parse(JSON.stringify(grant)), Object.create(grant), { kind: 'TRUSTED_LOGIN_GRANT', data: grant.data }])
    expect(() => readTrustedLoginGrant(value as TrustedLoginGrant, expected, now)).toThrow('IDENTITY_CONTRACT_INVALID');
  const Constructor = evidence.constructor as any;
  expect(() => new Constructor({}, 'VERIFIED_ASSERTION', evidence.data)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => readVerifiedIdentity({ ...grant.data.identity }, expected)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it('does not derive a 20-second ERP session from assertion expiry; all four TTL policies are independent', () => {
  expect(IDENTITY_TTL).toMatchObject({ transactionMs: 120000, assertionMs: 20000, grantMs: 30000, sessionMs: 900000 });
  const f = fixture(), grant = f.grant(), state = availableGrantState(grant, expected, now), redeemAt = now + 25000;
  expect(redeemAt).toBeGreaterThan(f.claims.expiresAt);
  const result = planGrantRedemption(grant, state, expected, user, redeemAt);
  expect(result.sessionPlan.expiresAt).toBe(redeemAt + IDENTITY_TTL.sessionMs);
  expect(result.sessionPlan.expiresAt).toBeGreaterThan(grant.data.expiresAt);
  expect(() => planGrantRedemption(grant, state, expected, user, grant.data.expiresAt)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => createTrustedLoginGrant(f.verify(), transitionLoginTransaction(f.tx, expected, 'VERIFIED', now), expected, f.claims.expiresAt)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it('caps grant by transaction and session by signed upstream validity, with no overflow', () => {
  const f = fixture(); (f.claims as any).authenticationExpiresAt = now + 100000;
  const grant = f.grant(), plan = planGrantRedemption(grant, availableGrantState(grant, expected, now), expected, user, now).sessionPlan;
  expect(plan.expiresAt).toBe(now + 100000);
  const end = fixture(); (end.tx as any).expiresAt = now + 10; expect(end.grant().data.expiresAt).toBe(now + 10);
  expect(() => planGrantRedemption(grant, availableGrantState(grant, expected, now), expected, user, Number.MAX_SAFE_INTEGER)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it('validates sequential single use while explicitly not providing atomic persistent redemption', () => {
  const grant = fixture().grant(), state = availableGrantState(grant, expected, now), before = JSON.stringify(state);
  const first = planGrantRedemption(grant, state, expected, user, now);
  expect(() => planGrantRedemption(grant, first.consumedState, expected, user, now)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(JSON.stringify(state)).toBe(before);
  // Two readers of the SAME old state both get candidate plans. Only a future store CAS can fence them.
  expect(planGrantRedemption(grant, state, expected, user, now)).toEqual(first);
  expect(fixture().grant().data.grantId).toBe(grant.data.grantId);
});
it.each(['inactive', 'subject', 'issuer', 'version'])('does not plan a session for invalid server directory snapshot: %s', field => {
  const grant = fixture().grant(), current: any = { ...user };
  if (field === 'inactive') current.active = false;
  if (field === 'subject') current.subject = 'other';
  if (field === 'issuer') current.issuer = 'https://evil.invalid';
  if (field === 'version') current.authorizationVersion = NaN;
  expect(() => planGrantRedemption(grant, availableGrantState(grant, expected, now), expected, current, now)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it('validates the complete transaction lifecycle and rejects skipped/repeated/terminal transitions', () => {
  const start = { ...fixture().tx, status: 'CREATED', updatedAt: now - 1000 };
  let tx = transaction(start, expected);
  for (const status of ['BOUND', 'VERIFYING', 'VERIFIED', 'CONSUMED'] as const) tx = transitionLoginTransaction(tx, expected, status, now);
  expect(tx.consumedAt).toBe(now); expect(start.status).toBe('CREATED');
  for (const status of ['BOUND', 'VERIFIED', 'CONSUMED', 'FAILED', 'EXPIRED'] as const)
    expect(() => transitionLoginTransaction(tx, expected, status, now)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => transitionLoginTransaction(start, expected, 'VERIFIED', now)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => transitionLoginTransaction(start, expected, 'EXPIRED', start.expiresAt - 1)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(transitionLoginTransaction(start, expected, 'EXPIRED', start.expiresAt).status).toBe('EXPIRED');
  expect(() => transitionLoginTransaction(start, expected, 'BOUND', start.expiresAt)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => transitionLoginTransaction(start, expected, 'BOUND', start.createdAt - 1)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each(['CREATED', 'BOUND', 'VERIFIED', 'CONSUMED', 'FAILED', 'EXPIRED'])('cannot verify an assertion in transaction state %s', status => {
  const f = fixture(); (f.tx as any).status = status;
  expect(() => f.verify()).toThrow('IDENTITY_CONTRACT_INVALID'); expect(f.port.verify).not.toHaveBeenCalled();
});
it.each(['roles', 'permissions', 'email', 'subject', 'environment', 'expectedScriptId', 'applicationAudience', 'authorizationVersion'])('browser cannot assign %s', field => {
  for (const [validator, input] of [[browserLoginBegin, { browserProofBinding: proof }], [browserLoginComplete, { transactionId: id, browserProof: proof }],
    [browserSessionCredential, { sessionCredential: 'e'.repeat(64) }]] as const) {
    expect(() => validator({ ...input, [field]: field === 'roles' ? ['ADMIN'] : 'forged' })).toThrow('IDENTITY_CONTRACT_INVALID');
  }
});
it('accepts only minimal browser request fields, rejecting URL credentials and accessor payloads', () => {
  expect(browserLoginBegin({ browserProofBinding: proof })).toEqual({ browserProofBinding: proof });
  expect(browserLoginComplete({ transactionId: id, browserProof: proof })).toEqual({ transactionId: id, browserProof: proof });
  expect(browserSessionCredential({ sessionCredential: proof })).toEqual({ sessionCredential: proof });
  expect(() => browserSessionCredential({ sessionCredential: 'https://example.invalid/?session=' + proof })).toThrow('IDENTITY_CONTRACT_INVALID');
  const payload = Object.defineProperty({}, 'sessionCredential', { enumerable: true, get() { throw Error('PRIVATE_ACCESSOR'); } });
  expect(() => browserSessionCredential(payload)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it('separates server session record, raw browser credential and public status; records have no roles/permissions', () => {
  const session = serverSession(); expect(validateSessionUse(session, expected, user, now)).toEqual(session);
  expect(() => sessionRecord({ ...session, roles: ['ADMIN'] }, expected)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => sessionRecord({ ...session, permissions: ['USER_MANAGE'] }, expected)).toThrow('IDENTITY_CONTRACT_INVALID');
  const dto = publicSessionStatus({ environment: 'TEST', status: 'AUTHENTICATED', authenticated: true, expiresAt: session.expiresAt });
  expect(Object.keys(dto).sort()).toEqual(['authenticated', 'environment', 'expiresAt', 'status']);
  expect(() => publicSessionStatus({ ...dto, sessionCredential: proof })).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(() => publicSessionStatus({ ...dto, status: 'BLOCKED' })).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(publicSessionStatus({ environment: 'TEST', status: 'NOT_CONNECTED', authenticated: false, expiresAt: null })).toBeDefined();
});
it('rejects expired/future/revoked/version-mismatched sessions and requires server-side permission checks separately', () => {
  const session = serverSession();
  expect(validateSessionUse(session, expected, user, session.expiresAt - 1)).toBeDefined();
  for (const [recordValue, currentUser, at] of [[session, user, session.expiresAt], [session, user, now - 1],
    [revokeSessionRecord(session, expected, now), user, now], [session, { ...user, authorizationVersion: 4 }, now],
    [session, { ...user, active: false }, now]] as const)
    expect(() => validateSessionUse(recordValue, expected, currentUser, at)).toThrow('IDENTITY_CONTRACT_INVALID');
  const revoked = revokeSessionRecord(session, expected, now);
  expect(revoked.revokedAt).toBe(now); expect(session.status).toBe('ACTIVE');
  expect(() => revokeSessionRecord(revoked, expected, now)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each(['HS256', 'RS256'] as const)('supports only the server-pinned %s signature policy without implementing it', algorithm => {
  const f = fixture(), currentPolicy = { ...policy, signature: { ...policy.signature, algorithm } };
  f.port.verify.mockReturnValue({ claims: f.claims, signature: currentPolicy.signature });
  expect(verifyBrokerAssertion(message, expected, currentPolicy, f.tx, now, f.port).data.signature.algorithm).toBe(algorithm);
});
it.each([null, {}, { ...policy, brokerIssuer: 'http://broker.invalid' }, { ...policy, brokerIssuer: 'https://broker.invalid/?redirect=evil' },
  { ...policy, signature: { algorithm: 'none', keyId: 'key' } }, { ...policy, signature: { ...policy.signature, keyId: '' } },
  { ...policy, permissions: ['USER_MANAGE'] }])('rejects unconfigured or malformed verification policy before the port (%#)', value => {
  const f = fixture(); expect(() => verifyBrokerAssertion(message, expected, value, f.tx, now, f.port)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(f.port.verify).not.toHaveBeenCalled();
});
it.each(['duration', 'createdAt', 'updatedAt', 'consumedAt', 'status', 'nonce', 'extra'])('rejects invalid transaction %s', field => {
  const f = fixture(), tx: any = { ...f.tx };
  if (field === 'duration') tx.expiresAt++;
  if (field === 'createdAt') tx.createdAt = 0;
  if (field === 'updatedAt') tx.updatedAt = tx.createdAt - 1;
  if (field === 'consumedAt') tx.consumedAt = now;
  if (field === 'status') tx.status = 'UNKNOWN';
  if (field === 'nonce') tx.nonce = 'not-random';
  if (field === 'extra') tx.roles = ['ADMIN'];
  expect(() => transaction(tx, expected)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each(['environment', 'applicationAudience', 'expectedScriptId', 'grantId', 'consumedAt', 'extra'])('rejects inconsistent grant ledger %s', field => {
  const grant = fixture().grant(), state: any = { ...availableGrantState(grant, expected, now) };
  if (field === 'environment') state.environment = 'PRODUCTION';
  if (field === 'applicationAudience') state.applicationAudience = 'kub:other';
  if (field === 'expectedScriptId') state.expectedScriptId = 'synthetic-other-script-00000000001';
  if (field === 'grantId') state.grantId = 'f'.repeat(64);
  if (field === 'consumedAt') state.consumedAt = now;
  if (field === 'extra') state.permissions = ['USER_MANAGE'];
  expect(() => planGrantRedemption(grant, state, expected, user, now)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it.each(['issuedAt', 'expiresAt', 'authenticatedAt', 'authenticationExpiresAt', 'authorizationVersion', 'revokedAt', 'sessionId', 'issuer', 'status'])('rejects malformed session field %s', field => {
  const session: any = { ...serverSession() };
  if (field === 'issuer') session.identityIssuer = 'https://evil.invalid';
  else if (field === 'sessionId') session.sessionId = 'https://evil.invalid/?secret=x';
  else if (field === 'revokedAt') session.revokedAt = now;
  else if (field === 'status') session.status = 'UNKNOWN';
  else session[field] = NaN;
  expect(() => sessionRecord(session, expected)).toThrow('IDENTITY_CONTRACT_INVALID');
});
it('checks arithmetic and clock boundaries without implicit wall clock or mutations', () => {
  expect(() => addTime(Number.MAX_SAFE_INTEGER, 1)).toThrow('IDENTITY_CONTRACT_INVALID');
  const f = fixture(), before = JSON.stringify([f.tx, f.claims, policy, message]);
  expect(() => f.verify(NaN)).toThrow('IDENTITY_CONTRACT_INVALID');
  const evidence = f.verify();
  expect(() => readVerifiedAssertion(evidence, expected, now - 1)).toThrow('IDENTITY_CONTRACT_INVALID');
  expect(JSON.stringify([f.tx, f.claims, policy, message])).toBe(before);
});
