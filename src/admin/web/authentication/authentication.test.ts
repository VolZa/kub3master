import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AtomicStoreReferenceModel } from '../identity-contracts/atomic-store-reference-model';
import { atomicCommandMaterial, type AtomicOutcome, type AtomicStatus, type ConsumeGrantCommand } from '../identity-contracts/atomic-store-contracts';
import { type LoginTransaction, type IdentityApplicationContext, type UnverifiedBrokerAssertion, IDENTITY_TTL } from '../identity-contracts/contracts';
import { type SigningKeyPolicy, type SigningKeyRule } from '../identity-contracts/signing-key-policy';
import { type SignedAssertionClaimsV1 } from '../identity-contracts/signed-assertion-profile';
import { type User, type Permission } from '../../../security/permission-service';
import { composeLocalAuthentication } from './composition';
import { SignedAssertionVerificationService } from './trusted-verification';
import { type LocalAuthenticationPorts } from './ports';
import { SessionResolver } from './session-resolver';
import { SessionAuthorizationAdapter } from './authorization-adapter';

const start = 1_800_000_000_000, rawProof = 'f'.repeat(64), sha = (s: string) => createHash('sha256').update(s).digest('hex');
const b64 = (s: string) => Buffer.from(s).toString('base64url');
function fixture(environment: 'PRODUCTION' | 'TEST' = 'TEST') {
  const expected: IdentityApplicationContext = { environment, expectedScriptId: `synthetic-admin-${environment.toLowerCase()}-script-000001`, applicationAudience: `kub:admin:${environment.toLowerCase()}` };
  let now = start, current: IdentityApplicationContext = expected, sequence = 0;
  let user: Readonly<User> = { issuer: 'https://accounts.google.com', subject: 'synthetic-visitor', active: true, authorizationVersion: 3, roles: ['ADMIN'] };
  let key: SigningKeyRule = { ...expected, keyId: 'synthetic-key-v1', algorithm: 'RS256', signingNotBefore: start - 10_000,
    signingNotAfter: start + 1_000_000, verificationNotBefore: start - 10_000, verificationNotAfter: start + 2_000_000,
    status: 'ACTIVE', revokedAt: null, compromised: false };
  const policy = (): SigningKeyPolicy => ({ version: 1, brokerIssuer: 'https://broker.invalid', keys: [key] });
  const trust = { expectedContext: expected, currentContext: () => current, clock: () => now };
  const transactions = new Map<string, Readonly<LoginTransaction>>();
  let claimsOverride: Partial<SignedAssertionClaimsV1> = {}, afterAccept: ((result: AtomicOutcome) => void | Promise<void>) | undefined;
  const source = vi.fn(async (tx: Readonly<LoginTransaction>): Promise<UnverifiedBrokerAssertion> => {
    const claims: SignedAssertionClaimsV1 = { ...expected, protocolVersion: 1, purpose: 'ADMIN_WEB_LOGIN_V1', issuer: policy().brokerIssuer,
      identityIssuer: 'https://accounts.google.com', subject: user.subject, transactionId: tx.transactionId, nonce: tx.nonce,
      browserProofBinding: tx.browserProofBinding, assertionId: sha(tx.transactionId + ':assertion'), authenticatedAt: start - 1000,
      authenticationExpiresAt: start - 1000 + IDENTITY_TTL.authenticationMaxAgeMs, issuedAt: now, expiresAt: now + IDENTITY_TTL.assertionMs,
      ...claimsOverride };
    // Synthetic bytes ONLY. No private key, real signature or Google identity in this fixture.
    return { assertion: [b64(JSON.stringify({ typ: 'kub-admin-login+jws', alg: 'RS256', kid: key.keyId })), b64(JSON.stringify(claims)),
      Buffer.alloc(256).toString('base64url')].join('.') };
  });
  const syntheticSignature = { verify: vi.fn(() => true) }; // Available ONLY in this test file.
  const signed = new SignedAssertionVerificationService(trust, policy, syntheticSignature);
  const verifier = { assertConfigured: () => signed.assertConfigured(), verify: vi.fn((message: unknown, tx: Readonly<LoginTransaction>) => signed.verify(message, tx)) };
  const model = new AtomicStoreReferenceModel({ context: expected, clock: trust.clock, keyPolicy: policy,
    directory: () => ({ issuer: user.issuer, subject: user.subject, active: user.active, authorizationVersion: user.authorizationVersion }),
    digest: { digest: sha }, capacity: { maxTransactions: 50, maxGrants: 50, maxSessions: 50, maxReceipts: 100,
      maxSessionsPerSubject: 10, receiptRetentionMs: 120_000, cleanupBatchSize: 20 } });
  const transactionPort = {
    create: vi.fn(async (tx: Readonly<LoginTransaction>) => {
      if (transactions.has(tx.transactionId)) return undefined;
      model.seedTransaction(tx); transactions.set(tx.transactionId, tx); return { record: tx, revision: 0 };
    }),
    read: vi.fn(async (id: string, _context: IdentityApplicationContext) => {
      const tx = transactions.get(id); return tx ? { record: tx, revision: 0 } : undefined;
    }),
  };
  const atomic = {
    acceptAssertionAndCreateGrant: vi.fn(async (c: Parameters<typeof model.acceptAssertionAndCreateGrant>[0]) => {
      const result = await model.acceptAssertionAndCreateGrant(c); await afterAccept?.(result); return result;
    }),
    consumeGrantAndCreateSession: vi.fn((c: ConsumeGrantCommand) => model.consumeGrantAndCreateSession(c)),
    getOperationOutcome: vi.fn((c: Parameters<typeof model.getOperationOutcome>[0]) => model.getOperationOutcome(c)),
  };
  const users = { find: vi.fn((_issuer: string, _subject: string) => user) };
  const sessionPort = { readSession: vi.fn((c: Parameters<typeof model.readSession>[0]) => model.readSession(c)),
    revokeSession: (c: Parameters<typeof model.revokeSession>[0]) => model.revokeSession(c), cleanup: (at: number) => model.cleanup(at) };
  const ports: LocalAuthenticationPorts = { ...trust, transactions: transactionPort, atomic, broker: { receive: source }, verifier,
    sessions: sessionPort, trustedSessions: { read: (capability, at) => model.readTrustedSession(capability, at) },
    users, digest: { digest: sha }, secrets: { secret: () => (++sequence).toString(16).padStart(64, '0') }, keyPolicy: policy };
  const app = composeLocalAuthentication(ports);
  const begin = async () => {
    const result = await app.startLogin({ browserProofBinding: sha(rawProof) });
    if (result.status !== 'STARTED') throw Error('synthetic start failed');
    return { transactionId: result.transactionId, browserProof: rawProof };
  };
  const login = async () => {
    const request = await begin(), result = await app.completeLogin(request);
    if (result.status !== 'AUTHENTICATED') throw Error('synthetic login failed: ' + result.code);
    return { request, result, credential: { sessionCredential: result.sessionCredential } };
  };
  return { app, ports, model, atomic, sessionPort, verifier, syntheticSignature, signed, source, transactionPort, transactions, users,
    expected, trust, policy, begin, login, time: () => now, user: () => user,
    setTime: (at: number) => { now = at; }, setContext: (value: IdentityApplicationContext) => { current = value; },
    setUser: (value: Partial<User>) => { user = { ...user, ...value }; },
    setKey: (value: Partial<SigningKeyRule>) => { key = { ...key, ...value }; },
    setClaims: (value: Partial<SignedAssertionClaimsV1>) => { claimsOverride = value; },
    onAccepted: (fn: typeof afterAccept) => { afterAccept = fn; } };
}

describe('local login orchestration (synthetic adapters only)', () => {
  it('composes login and PermissionService without exposing raw identity or short assertion TTL', async () => {
    const f = fixture(), { result, credential } = await f.login();
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'sessionCredential', 'status']);
    expect(result.expiresAt).toBe(start + IDENTITY_TTL.sessionMs);
    expect(f.app.authorize(credential, 'USER_MANAGE')).toEqual({ status: 'AUTHORIZED' });
    expect(f.model.inspect()).toMatchObject({ consumedTransactions: 1, assertions: 1, grants: 1, consumedGrants: 1, sessions: 1, receipts: 2 });
    expect(f.syntheticSignature.verify).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.objectContaining({ algorithm: 'RS256' }));
    const issue = f.atomic.consumeGrantAndCreateSession.mock.calls[0][0]; expect(issue.credentialDigest).toBe(sha(result.sessionCredential));
    expect(JSON.stringify(issue)).not.toContain(result.sessionCredential);
  });
  it.each(['environment', 'expectedScriptId', 'applicationAudience'] as const)('rejects assertion %s mismatch before acceptance', async field => {
    const f = fixture(); f.setClaims({ [field]: field === 'environment' ? 'PRODUCTION' : 'synthetic-other-application-0000001' });
    expect(await f.app.completeLogin(await f.begin())).toEqual({ status: 'BLOCKED', code: 'ACCESS_DENIED' });
    expect(f.atomic.acceptAssertionAndCreateGrant).not.toHaveBeenCalled();
  });
  it.each(['environment', 'expectedScriptId', 'applicationAudience'] as const)('rejects trusted runtime %s changing while awaiting broker', async field => {
    const f = fixture(), request = await f.begin();
    f.source.mockImplementation(async () => { f.setContext({ ...f.expected, [field]: field === 'environment' ? 'PRODUCTION' : 'synthetic-other-context-00000001' }); return { assertion: 'untrusted' }; });
    expect((await f.app.completeLogin(request)).status).toBe('BLOCKED'); expect(f.atomic.acceptAssertionAndCreateGrant).not.toHaveBeenCalled();
  });
  it('blocks absent verifier, absent composition and unconfigured signature adapter', async () => {
    const empty = composeLocalAuthentication();
    expect(await empty.startLogin({})).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
    expect(await empty.completeLogin({})).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
    expect(empty.authorize({}, 'USER_MANAGE')).toEqual({ status: 'DENIED' });
    const f = fixture(), noVerifier = composeLocalAuthentication({ ...f.ports, verifier: undefined });
    expect(await noVerifier.startLogin({ browserProofBinding: sha(rawProof) })).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
    const noSignature = new SignedAssertionVerificationService(f.trust, f.policy);
    const app = composeLocalAuthentication({ ...f.ports, verifier: noSignature });
    expect(await app.startLogin({ browserProofBinding: sha(rawProof) })).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
    expect(await app.completeLogin({ transactionId: '0'.repeat(64), browserProof: rawProof })).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
    expect(f.model.inspect().sessions).toBe(0);
  });
  it('blocks expired assertion and transaction, wrong nonce and wrong browser proof', async () => {
    const f = fixture(); f.setClaims({ issuedAt: start - 1, expiresAt: start });
    expect((await f.app.completeLogin(await f.begin())).status).toBe('BLOCKED');
    const expired = fixture(), request = await expired.begin(); expired.setTime(start + IDENTITY_TTL.transactionMs);
    expect(await expired.app.completeLogin(request)).toEqual({ status: 'BLOCKED', code: 'EXPIRED' }); expect(expired.source).not.toHaveBeenCalled();
    const nonce = fixture(); nonce.setClaims({ nonce: '0'.repeat(64) }); expect((await nonce.app.completeLogin(await nonce.begin())).status).toBe('BLOCKED');
    const wrong = fixture(), wrongRequest = await wrong.begin();
    expect((await wrong.app.completeLogin({ ...wrongRequest, browserProof: '0'.repeat(64) })).status).toBe('BLOCKED'); expect(wrong.source).not.toHaveBeenCalled();
  });
  it('accepts a fresh assertion once, then redeems the independent grant after assertion expiry', async () => {
    const f = fixture(); f.onAccepted(() => { f.setTime(start + 25_000); });
    const { result, credential } = await f.login(); expect(result.expiresAt).toBe(start + 25_000 + IDENTITY_TTL.sessionMs);
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('AUTHORIZED');
  });
  it('blocks expired grant without resetting the accepted transaction or retrying mutations', async () => {
    const f = fixture(); f.onAccepted(() => { f.setTime(start + IDENTITY_TTL.grantMs); });
    expect(await f.app.completeLogin(await f.begin())).toEqual({ status: 'BLOCKED', code: 'EXPIRED' });
    expect(f.model.inspect()).toMatchObject({ consumedTransactions: 1, grants: 1, consumedGrants: 0, sessions: 0 });
    expect(f.atomic.consumeGrantAndCreateSession).toHaveBeenCalledTimes(1);
  });
  it('rejects assertion replay at the existing atomic store boundary', async () => {
    const f = fixture(), { request } = await f.login();
    expect(await f.app.completeLogin(request)).toEqual({ status: 'BLOCKED', code: 'REPLAY' }); expect(f.model.inspect().sessions).toBe(1);
  });
  it('rejects grant replay when another consumer wins after assertion acceptance', async () => {
    const f = fixture(); f.onAccepted(async result => {
      if (result.status !== 'COMMITTED') return;
      const command: ConsumeGrantCommand = { context: f.expected, operationId: 'e'.repeat(64), commandDigest: '', expectedRevision: 0,
        decisionTime: f.time(), grantId: result.receipt.objectId, credentialDigest: sha('synthetic-other-credential'), expectedAuthorizationVersion: 3 };
      commandDigestSeal(command);
      expect((await f.model.consumeGrantAndCreateSession(command)).status).toBe('COMMITTED');
    });
    expect(await f.app.completeLogin(await f.begin())).toEqual({ status: 'BLOCKED', code: 'REPLAY' }); expect(f.model.inspect().sessions).toBe(1);
  });
  it('permits only one concurrent completion of the same transaction', async () => {
    const f = fixture(), request = await f.begin();
    const results = await Promise.all([f.app.completeLogin(request), f.app.completeLogin(request)]);
    expect(results.filter(r => r.status === 'AUTHENTICATED')).toHaveLength(1);
    expect(results.filter(r => r.status === 'BLOCKED')).toHaveLength(1);
    expect(f.model.inspect()).toMatchObject({ grants: 1, consumedGrants: 1, sessions: 1 });
  });
  it.each(['REPLAY', 'EXPIRED', 'CONFLICT', 'CONTEXT_MISMATCH', 'UNAVAILABLE', 'INVALID', 'CAPACITY_EXCEEDED'] as const)(
    'propagates atomic %s as a fixed blocked outcome without creating a session', async status => {
      const f = fixture(); f.atomic.acceptAssertionAndCreateGrant.mockResolvedValue({ status });
      expect(await f.app.completeLogin(await f.begin())).toEqual({ status: 'BLOCKED', code: status });
      expect(f.atomic.consumeGrantAndCreateSession).not.toHaveBeenCalled();
    });
  it('blocks when the reference store is unavailable', async () => {
    const f = fixture(), request = await f.begin(); f.model.setAvailable(false);
    expect(await f.app.completeLogin(request)).toEqual({ status: 'BLOCKED', code: 'UNAVAILABLE' });
  });
  it.each(['accept', 'issue'] as const)('recovers unknown %s commit from receipt without a second mutation', async stage => {
    const f = fixture(); if (stage === 'accept') f.model.failNext('AFTER_COMMIT'); else f.onAccepted(() => f.model.failNext('AFTER_COMMIT'));
    const { credential } = await f.login(); expect(f.atomic.getOperationOutcome).toHaveBeenCalledTimes(1);
    expect(f.atomic.acceptAssertionAndCreateGrant).toHaveBeenCalledTimes(1); expect(f.atomic.consumeGrantAndCreateSession).toHaveBeenCalledTimes(1);
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('AUTHORIZED');
  });
  it.each(['accept', 'issue'] as const)('does not assume rollback when receipt lookup cannot confirm %s commit', async stage => {
    const f = fixture(); if (stage === 'accept') f.model.failNext('AFTER_COMMIT'); else f.onAccepted(() => f.model.failNext('AFTER_COMMIT'));
    f.atomic.getOperationOutcome.mockReturnValue({ status: 'OUTCOME_UNKNOWN' });
    const result = await f.app.completeLogin(await f.begin()); expect(result).toEqual({ status: 'BLOCKED', code: 'OUTCOME_UNKNOWN' });
    expect(f.model.inspect()).toMatchObject({ consumedTransactions: 1, grants: 1, sessions: stage === 'accept' ? 0 : 1 });
    expect(f.atomic.acceptAssertionAndCreateGrant).toHaveBeenCalledTimes(1);
    expect(f.atomic.consumeGrantAndCreateSession).toHaveBeenCalledTimes(stage === 'accept' ? 0 : 1);
    expect(result).not.toHaveProperty('sessionCredential');
  });
  it('does not issue a session if runtime context changes after committed assertion acceptance', async () => {
    const f = fixture(); f.onAccepted(() => { f.setContext({ ...f.expected, environment: 'PRODUCTION' }); });
    const result = await f.app.completeLogin(await f.begin()); expect(result.status).toBe('BLOCKED'); expect(result).not.toHaveProperty('sessionCredential');
    expect(f.model.inspect()).toMatchObject({ grants: 1, consumedTransactions: 1, sessions: 0 });
    expect(f.atomic.consumeGrantAndCreateSession).not.toHaveBeenCalled();
  });
  it('recovers a thrown response after an actual committed mutation, without exposing raw errors', async () => {
    const f = fixture(); f.atomic.acceptAssertionAndCreateGrant.mockImplementation(async c => {
      await f.model.acceptAssertionAndCreateGrant(c); throw Error('PRIVATE_TRANSPORT_RESPONSE');
    });
    expect((await f.app.completeLogin(await f.begin())).status).toBe('AUTHENTICATED');
    expect(f.atomic.acceptAssertionAndCreateGrant).toHaveBeenCalledTimes(1);
  });
  it('does not release a raw credential for a forged COMMITTED receipt without a stored session', async () => {
    const f = fixture(); f.atomic.consumeGrantAndCreateSession.mockImplementation(async c => ({ status: 'COMMITTED', recovered: false,
      receipt: { ...f.expected, operationId: c.operationId, commandDigest: c.commandDigest, kind: 'ISSUE_SESSION', objectId: c.credentialDigest,
        committedAt: c.decisionTime, revision: c.expectedRevision + 1, retainUntil: c.decisionTime + 100_000 } }));
    const result = await f.app.completeLogin(await f.begin()); expect(result.status).toBe('BLOCKED'); expect(result).not.toHaveProperty('sessionCredential');
  });
  it('keeps receipt recovery read-only and performs each mutation only once', async () => {
    const f = fixture(); f.model.failNext('AFTER_COMMIT');
    f.atomic.getOperationOutcome.mockImplementation(command => {
      const before = f.model.inspect(), result = f.model.getOperationOutcome(command);
      expect(f.model.inspect()).toEqual(before); return result;
    });
    await f.login(); expect(f.atomic.getOperationOutcome).toHaveBeenCalledTimes(1);
    expect(f.atomic.acceptAssertionAndCreateGrant).toHaveBeenCalledTimes(1);
    expect(f.atomic.consumeGrantAndCreateSession).toHaveBeenCalledTimes(1);
  });
  it('rejects forged verification evidence despite its valid-looking JSON payload', async () => {
    const f = fixture(); f.verifier.verify.mockImplementation((m, tx) => ({ ...f.signed.verify(m, tx) }));
    expect((await f.app.completeLogin(await f.begin())).status).toBe('BLOCKED'); expect(f.atomic.acceptAssertionAndCreateGrant).not.toHaveBeenCalled();
  });
  it.each(['roles', 'permissions', 'email', 'subject', 'environment', 'expectedScriptId', 'applicationAudience', 'authorizationVersion'])(
    'rejects browser-controlled %s in begin/complete/session payloads', async field => {
      const f = fixture(); expect((await f.app.startLogin({ browserProofBinding: sha(rawProof), [field]: 'forged' })).status).toBe('BLOCKED');
      const request = await f.begin(); expect((await f.app.completeLogin({ ...request, [field]: 'forged' })).status).toBe('BLOCKED');
      const { credential } = await f.login(); expect(f.app.authorize({ ...credential, [field]: 'forged' }, 'USER_MANAGE').status).toBe('DENIED');
    });
});

function commandDigestSeal(command: ConsumeGrantCommand): void {
  Object.assign(command, { commandDigest: sha(atomicCommandMaterial(command)) }); // Test fixture only.
}

describe('session resolution and PermissionService bridge', () => {
  it('checks own session expiry and explicit revocation', async () => {
    const f = fixture(), { credential, result } = await f.login();
    f.setTime(result.expiresAt - 1); expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('AUTHORIZED');
    f.setTime(result.expiresAt); expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
    const revoked = fixture(), login = await revoked.login();
    expect(revoked.model.revokeSession({ context: revoked.expected, credentialDigest: sha(login.result.sessionCredential), decisionTime: revoked.time(), expectedRevision: 0 })).toBe('REVOKED');
    expect(revoked.app.authorize(login.credential, 'USER_MANAGE').status).toBe('DENIED');
  });
  it.each(['inactive', 'version', 'roles'] as const)('uses current directory %s on every protected request', async field => {
    const f = fixture(), { credential } = await f.login();
    f.setUser(field === 'inactive' ? { active: false } : field === 'version' ? { authorizationVersion: 4 } : { roles: ['MANAGER'] });
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
  });
  it('keeps existing environment-aware permission rules without new roles or implicit grants', async () => {
    const f = fixture('PRODUCTION'); f.setUser({ roles: ['MANAGER'] }); const { credential } = await f.login();
    expect(f.app.authorize(credential, 'REPORT_VIEW').status).toBe('AUTHORIZED'); expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
    expect(f.app.authorize(credential, 'UNKNOWN_PERMISSION' as Permission).status).toBe('DENIED');
  });
  it('rechecks authorizationVersion during PermissionService directory lookup', async () => {
    const f = fixture(), { credential } = await f.login(); f.users.find.mockClear();
    f.users.find.mockImplementation(() => { if (f.users.find.mock.calls.length === 3) f.setUser({ authorizationVersion: 4 }); return f.user(); });
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
  });
  it('blocks inactive or unknown users before any grant is accepted', async () => {
    const f = fixture(); f.setUser({ active: false }); expect((await f.app.completeLogin(await f.begin())).status).toBe('BLOCKED');
    expect(f.model.inspect().grants).toBe(0);
  });
  it('rejects forged/cross-resolver runtime evidence and forged store capabilities', async () => {
    const f = fixture(), { credential } = await f.login(), resolver = new SessionResolver(f.ports), adapter = new SessionAuthorizationAdapter(resolver, f.ports);
    const proof = resolver.resolve(credential); expect(() => adapter.require(proof, 'USER_MANAGE')).not.toThrow();
    for (const forged of [{ ...proof }, JSON.parse(JSON.stringify(proof)), Object.create(proof)])
      expect(() => adapter.require(forged as any, 'USER_MANAGE')).toThrow();
    const other = new SessionResolver(f.ports); expect(() => new SessionAuthorizationAdapter(other, f.ports).require(proof, 'USER_MANAGE')).toThrow();
    const original = f.model.readSession({ context: f.expected, credentialDigest: sha(credential.sessionCredential), decisionTime: f.time() });
    if (original.status !== 'FOUND') throw Error('fixture');
    f.sessionPort.readSession.mockReturnValue({ status: 'FOUND', session: JSON.parse(JSON.stringify(original.session)) });
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
  });
  it('documents the trusted-DI limit: a lying server reader is not authenticated by its interface', () => {
    const f = fixture(), credential = 'e'.repeat(64);
    const invented = Object.freeze({ ...f.expected, identityIssuer: 'https://accounts.google.com' as const,
      identitySubject: f.user().subject, authenticatedAt: start - 1000, authenticationExpiresAt: start + 1_000_000,
      issuedAt: start, expiresAt: start + IDENTITY_TTL.sessionMs, authorizationVersion: 3,
      sessionId: sha(credential), status: 'ACTIVE' as const, revokedAt: null, revision: 0, grantId: 'a'.repeat(64),
      signingKey: Object.freeze({ protocolVersion: 1 as const, brokerIssuer: f.policy().brokerIssuer,
        keyId: f.policy().keys[0].keyId, algorithm: 'RS256' as const, assertionId: 'b'.repeat(64), assertionIssuedAt: start }) });
    // Deliberately malicious SERVER injection, never a browser input or a runtime adapter shipped
    // by this slice. These ports lie about storage ownership; schema/readonly types cannot detect it.
    const lyingPorts: LocalAuthenticationPorts = { ...f.ports,
      sessions: { ...f.ports.sessions, readSession: () => ({ status: 'FOUND', session: { record: invented } as any }) },
      trustedSessions: { read: () => invented } };
    expect(composeLocalAuthentication(lyingPorts).authorize({ sessionCredential: credential }, 'USER_MANAGE').status).toBe('AUTHORIZED');
    expect(f.model.inspect().sessions).toBe(0);
    // This is a documented trust assumption, NOT a claimed rejection or proof of durable provenance.
  });
  it('cannot combine TEST resolver evidence with PRODUCTION permission context', async () => {
    const f = fixture('TEST'), production = fixture('PRODUCTION'), { credential } = await f.login();
    const resolver = new SessionResolver(f.ports), proof = resolver.resolve(credential);
    expect(() => new SessionAuthorizationAdapter(resolver, production.ports).require(proof, 'USER_MANAGE')).toThrow();
  });
  it('rejects invalid credential/digest adapters and current runtime context changes', async () => {
    const f = fixture(), { credential } = await f.login();
    const identityDigest = composeLocalAuthentication({ ...f.ports, digest: { digest: s => s } });
    expect(identityDigest.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
    f.setContext({ ...f.expected, expectedScriptId: 'synthetic-other-script-0000000001' });
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
    const bad = fixture(), app = composeLocalAuthentication({ ...bad.ports, secrets: { secret: () => 'not-a-secret' } });
    expect((await app.startLogin({ browserProofBinding: sha(rawProof) })).status).toBe('BLOCKED');
    expect(bad.model.inspect().transactions).toBe(0);
  });
  it('denies pre-existing sessions with no configured signature adapter but tolerates live verifier outage for session use', async () => {
    const f = fixture(), { credential } = await f.login();
    const unconfigured = composeLocalAuthentication({ ...f.ports, verifier: new SignedAssertionVerificationService(f.trust, f.policy) });
    expect(unconfigured.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
    f.syntheticSignature.verify.mockImplementation(() => { throw Error('PRIVATE_VERIFIER_UNAVAILABLE'); });
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('AUTHORIZED');
    expect((await f.app.completeLogin(await f.begin())).status).toBe('BLOCKED');
  });
  it('preserves planned key rotation but blocks key compromise and revocation', async () => {
    const f = fixture(), { credential } = await f.login();
    f.setKey({ signingNotAfter: start + 999, verificationNotAfter: start + 1000, status: 'RETIRED' }); f.setTime(start + 2000);
    expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('AUTHORIZED');
    f.setKey({ compromised: true }); expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
    const r = fixture(), login = await r.login(); r.setKey({ revokedAt: start, status: 'REVOKED' });
    expect(r.app.authorize(login.credential, 'USER_MANAGE').status).toBe('DENIED');
  });
  it('blocks compromised key before login and unknown credentials without owner identity fallback', async () => {
    const f = fixture(); f.setKey({ compromised: true }); expect((await f.app.completeLogin(await f.begin())).status).toBe('BLOCKED');
    expect(f.app.authorize({ sessionCredential: '0'.repeat(64) }, 'USER_MANAGE').status).toBe('DENIED');
  });
  it('rejects expired upstream proof independently of assertion and session policy TTL', async () => {
    const f = fixture(); f.setClaims({ authenticationExpiresAt: start + 60_000 }); const { result, credential } = await f.login();
    expect(result.expiresAt).toBe(start + 60_000); f.setTime(start + 60_000); expect(f.app.authorize(credential, 'USER_MANAGE').status).toBe('DENIED');
  });
});
