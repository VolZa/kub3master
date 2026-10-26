import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { IDENTITY_TTL, type IdentityApplicationContext, type LoginTransaction } from './contracts';
import { browserLoginBegin, browserLoginComplete, browserSessionCredential } from './validation';
import { validateCompactJws, verifySignedAssertion, readSignedAssertion, type SignedAssertionClaimsV1 } from './signed-assertion-profile';
import { signingKeyPolicy, verificationKey, type SigningKeyPolicy, type SigningKeyRule } from './signing-key-policy';
import { atomicOperationDescriptor, type AcceptAssertionCommand, type ConsumeGrantCommand, type OperationLookup } from './atomic-store-contracts';
import { recoveryDescriptor } from '../operation-contracts';
import { AtomicStoreReferenceModel, type ReferenceFault } from './atomic-store-reference-model';
import { type SessionCapacityPolicy } from './session-store-contracts';
import { strictJson, base64urlJson, base64urlBytes } from './strict-json';

const start = 1_800_000_000_000, hex = (c: string) => c.repeat(64);
const expected: IdentityApplicationContext = { environment: 'TEST', applicationAudience: 'kub:admin:test', expectedScriptId: 'synthetic-admin-script-test-000000001' };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const backendOrigin = 'https://auth-test.example.com';
const byteDigest = { digest: (bytes: readonly number[]) => createHash('sha256').update(Buffer.from(bytes)).digest('hex') };

const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const header = { typ: 'kub-admin-login+jws', alg: 'RS256', kid: 'test-signing-key-v1' };
// Deliberately NOT a signature. This suite tests structure and trusted-port semantics only.
// No private keys or real Google credentials are created/stored in fixtures.
const syntheticSignature = Buffer.alloc(256).toString('base64url');
function wire(claims: unknown, h: unknown = header) {
  return { assertion: [b64(JSON.stringify(h)), b64(JSON.stringify(claims)), syntheticSignature].join('.') };
}
function seal<T extends AcceptAssertionCommand | ConsumeGrantCommand>(command: T): T {
  return { ...command, commandDigest: atomicOperationDescriptor(command, byteDigest).commandDigest };
}
function fixture(capacity: Partial<SessionCapacityPolicy> = {}) {
  let backendOffset = 0;
  let now = start, hook: (() => Promise<void>) | undefined;
  let key: SigningKeyRule = { ...expected, keyId: header.kid, algorithm: 'RS256', signingNotBefore: start - 100_000,
    signingNotAfter: start + 1_000_000, verificationNotBefore: start - 100_000, verificationNotAfter: start + 2_000_000,
    status: 'ACTIVE', revokedAt: null, compromised: false };
  let policy: SigningKeyPolicy = { version: 1, brokerIssuer: 'https://broker.invalid', keys: [key] };
  let user = { issuer: 'https://accounts.google.com', subject: 'synthetic-subject', active: true, authorizationVersion: 3 };
  const tx: LoginTransaction = { ...expected, transactionId: hex('a'), nonce: hex('b'), browserProofBinding: hex('c'),
    createdAt: start - 1000, expiresAt: start - 1000 + IDENTITY_TTL.transactionMs, updatedAt: start - 100,
    consumedAt: null, status: 'VERIFYING' };
  const claims: SignedAssertionClaimsV1 = { ...expected, protocolVersion: 1, purpose: 'ADMIN_WEB_LOGIN_V1', issuer: policy.brokerIssuer,
    identityIssuer: 'https://accounts.google.com', subject: user.subject, assertionId: hex('d'), transactionId: tx.transactionId,
    nonce: tx.nonce, browserProofBinding: tx.browserProofBinding, authenticatedAt: start - 2000,
    authenticationExpiresAt: start - 2000 + IDENTITY_TTL.authenticationMaxAgeMs, issuedAt: start - 500,
    expiresAt: start - 500 + IDENTITY_TTL.assertionMs };
  const cryptoPort = { verify: vi.fn(() => true) };
  const model = new AtomicStoreReferenceModel({ context: expected, backendOrigin, clock: () => now + backendOffset, keyPolicy: () => policy,
    directory: () => user, digest: byteDigest, beforeCommit: async () => hook?.(),
    capacity: { maxTransactions: 10, maxGrants: 10, maxSessions: 10, maxReceipts: 20, maxSessionsPerSubject: 3,
      receiptRetentionMs: 120_000, cleanupBatchSize: 100, ...capacity } });
  model.seedTransaction(tx);
  const evidence = () => verifySignedAssertion(wire(claims), expected, policy, tx, () => now, cryptoPort);
  const accept = (operationId = hex('1')): AcceptAssertionCommand => seal({ context: expected, protocolVersion: 1, backendOrigin, operationId, commandDigest: hex('0'),
    expectedRevision: 0, commandCreatedAt: now, assertion: evidence() });
  const issue = (operationId = hex('2'), credentialDigest = sha(hex('e'))): ConsumeGrantCommand => seal({ context: expected, protocolVersion: 1, backendOrigin,
    operationId, commandDigest: hex('0'), expectedRevision: 0, commandCreatedAt: now, grantId: tx.transactionId,
    credentialDigest, expectedAuthorizationVersion: user.authorizationVersion });
  const lookup = (command: AcceptAssertionCommand | ConsumeGrantCommand): OperationLookup => recoveryDescriptor(
    atomicOperationDescriptor(command, byteDigest), command.expectedRevision,
    'assertion' in command ? command.assertion.data.claims.transactionId : command.credentialDigest);
  const sessionLookup = (credentialDigest = sha(hex('e'))) => ({ context: expected, credentialDigest });
  return { model, tx, claims, cryptoPort, evidence, accept, issue, lookup, sessionLookup, policy: () => policy, time: () => now,
    setBackendOffset: (value: number) => { backendOffset = value; },
    setTime: (value: number) => { now = value; }, setHook: (value: (() => Promise<void>) | undefined) => { hook = value; },
    setUser: (value: Partial<typeof user>) => { user = { ...user, ...value }; },
    setKey: (value: Partial<SigningKeyRule>) => { key = { ...key, ...value }; policy = { ...policy, keys: [key] }; },
    setPolicy: (value: SigningKeyPolicy) => { policy = value; } };
}

describe('Compact JWS application profile (no cryptography)', () => {
  it('keeps exact original signing bytes, milliseconds and a strictly structural result', () => {
    const f = fixture(), message = wire(f.claims), parsed = validateCompactJws(message, expected, f.policy(), start);
    expect(parsed.claims).toEqual(f.claims); expect(parsed.signingInput).toBe(message.assertion.split('.').slice(0, 2).join('.'));
    expect(f.cryptoPort.verify).not.toHaveBeenCalled();
    expect(() => readSignedAssertion(parsed, expected)).toThrow('IDENTITY_CONTRACT_INVALID');
    const proof = f.evidence(); expect(readSignedAssertion(proof, expected).claims).toEqual(f.claims);
    expect(f.cryptoPort.verify).toHaveBeenCalledWith(message.assertion, expect.objectContaining({ keyId: header.kid, algorithm: 'RS256' }));
  });
  it.each(['none', 'HS256', 'RS512', '', null])('rejects algorithm %s before the trusted port', alg => {
    const f = fixture(); expect(() => verifySignedAssertion(wire(f.claims, { ...header, alg }), expected, f.policy(), f.tx, () => start, f.cryptoPort)).toThrow();
    expect(f.cryptoPort.verify).not.toHaveBeenCalled();
  });
  it.each([{ ...header, kid: 'unknown' }, { ...header, kid: '' }, { ...header, typ: 'JWT' }, { ...header, crit: ['x'] },
    { ...header, b64: false }, { ...header, jku: 'https://untrusted.invalid' }, { ...header, jwk: {} }, { ...header, x5u: 'x' }])(
    'rejects unknown keys and unsupported protected header (%#)', h => {
      const f = fixture(); expect(() => validateCompactJws(wire(f.claims, h), expected, f.policy(), start)).toThrow();
    });
  it.each(['protocolVersion', 'purpose', 'issuer', 'identityIssuer', 'subject', 'assertionId', 'transactionId', 'nonce', 'browserProofBinding'])('rejects invalid payload %s', field => {
    const f = fixture(), payload = { ...f.claims, [field]: field === 'protocolVersion' ? 2 : 'invalid' };
    if (field === 'subject') payload.subject = '';
    expect(() => validateCompactJws(wire(payload), expected, f.policy(), start)).toThrow();
  });
  it.each(['environment', 'expectedScriptId', 'applicationAudience'])('rejects profile %s mismatch', field => {
    const f = fixture(), value = field === 'environment' ? 'PRODUCTION' : field === 'expectedScriptId' ? 'synthetic-other-script-000000000001' : 'kub:other';
    expect(() => validateCompactJws(wire({ ...f.claims, [field]: value }), expected, f.policy(), start)).toThrow();
  });
  it.each(['roles', 'permissions', 'email', 'arbitrary'])('rejects extra signed payload field %s', field => {
    const f = fixture(); expect(() => validateCompactJws(wire({ ...f.claims, [field]: 'forged' }), expected, f.policy(), start)).toThrow();
  });
  it('requires every payload field and accepts alternate JSON order without reserializing signed bytes', () => {
    const f = fixture();
    for (const key of Object.keys(f.claims)) {
      const value: any = { ...f.claims }; delete value[key];
      expect(() => validateCompactJws(wire(value), expected, f.policy(), start)).toThrow();
    }
    const reversed = Object.fromEntries(Object.entries(f.claims).reverse());
    const assertion = [b64(JSON.stringify(header, null, 1)), b64(JSON.stringify(reversed, null, 1)), syntheticSignature].join('.');
    expect(validateCompactJws({ assertion }, expected, f.policy(), start).signingInput).toBe(assertion.split('.').slice(0, 2).join('.'));
  });
  it.each(['issuedAt', 'expiresAt', 'authenticatedAt', 'authenticationExpiresAt'])('rejects invalid millisecond %s', field => {
    for (const value of [0, -1, 1.5, Infinity, NaN, '1800000000000', Number.MAX_SAFE_INTEGER + 1]) {
      const f = fixture(); expect(() => validateCompactJws(wire({ ...f.claims, [field]: value }), expected, f.policy(), start)).toThrow();
    }
  });
  it('enforces all payload lifetimes, key boundaries and verifies time again after verifier I/O', () => {
    const f = fixture(); expect(validateCompactJws(wire(f.claims), expected, f.policy(), f.claims.expiresAt - 1)).toBeDefined();
    expect(() => validateCompactJws(wire(f.claims), expected, f.policy(), f.claims.expiresAt)).toThrow();
    for (const delta of [{ issuedAt: start + 1 }, { expiresAt: f.claims.expiresAt + 1 },
      { authenticationExpiresAt: f.claims.authenticationExpiresAt + 1 }, { authenticatedAt: start },
      { authenticationExpiresAt: start - 1 }]) expect(() => validateCompactJws(wire({ ...f.claims, ...delta }), expected, f.policy(), start)).toThrow();
    f.cryptoPort.verify.mockImplementation(() => { f.setTime(f.claims.expiresAt); return true; });
    expect(() => f.evidence()).toThrow();
  });
  it.each(['false', 'throw'])('rejects signature-port %s without leaking its error', mode => {
    const f = fixture(); f.cryptoPort.verify.mockImplementation(() => { if (mode === 'throw') throw Error('PRIVATE_VERIFIER_ERROR'); return false; });
    expect(() => f.evidence()).toThrow('IDENTITY_CONTRACT_INVALID');
  });
  it('rejects duplicate decoded JSON keys in protected header and payload', () => {
    const f = fixture(), payload = JSON.stringify(f.claims);
    for (const h of ['{"typ":"kub-admin-login+jws","alg":"RS256","alg":"RS256","kid":"test-signing-key-v1"}',
      '{"typ":"kub-admin-login+jws","alg":"RS256","\\u0061lg":"RS256","kid":"test-signing-key-v1"}']) {
      expect(() => validateCompactJws({ assertion: [b64(h), b64(payload), syntheticSignature].join('.') }, expected, f.policy(), start)).toThrow();
    }
    const duplicated = payload.slice(0, -1) + ',"protocolVersion":1}';
    expect(() => validateCompactJws({ assertion: [b64(JSON.stringify(header)), b64(duplicated), syntheticSignature].join('.') }, expected, f.policy(), start)).toThrow();
    expect(() => strictJson('{"outer":{"x":1,"x":2}}')).toThrow();
  });
  it.each(['{"x":1,}', '{"x":"unterminated}', '{"x":01}', '{"x":true} trailing', '[1]',
    '{"x":"\\q"}', '{"x":}', ' '.repeat(8193)])('rejects malformed or oversized JSON (%#)', text => expect(() => strictJson(text)).toThrow());
  it('handles escaped strings safely and rejects invalid UTF-8, base64url and framing', () => {
    expect(strictJson('{"x":"a\\\"b\\\\c","y":null,"z":false}')).toEqual({ x: 'a"b\\c', y: null, z: false });
    for (const s of ['', 'a', 'AB', 'AA=', 'AA+', 'AA/', 'AA\n']) expect(() => base64urlBytes(s)).toThrow();
    expect(() => base64urlJson('_w')).toThrow();
    const f = fixture();
    for (const assertion of ['a.b', 'a.b.c.d', 'a'.repeat(8193), wire(f.claims).assertion + '=',
      [b64(JSON.stringify(header)), b64(JSON.stringify(f.claims)), 'AA'].join('.')]) {
      expect(() => validateCompactJws({ assertion }, expected, f.policy(), start)).toThrow();
    }
    expect(() => validateCompactJws({ ...wire(f.claims), verified: true }, expected, f.policy(), start)).toThrow();
  });
  it('does not rehydrate profile evidence from casts, JSON, spreads or reachable constructor', () => {
    const f = fixture(), evidence = f.evidence();
    for (const value of [{ ...evidence }, JSON.parse(JSON.stringify(evidence)), Object.create(evidence), { data: evidence.data }])
      expect(() => readSignedAssertion(value, expected)).toThrow();
    expect(() => new (evidence.constructor as any)({}, evidence.data)).toThrow();
  });
});

describe('remote clocks and owned receipt evidence', () => {
  it('does not revive an expired session when the backend clock rolls back after a read', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept()); await f.model.consumeGrantAndCreateSession(f.issue());
    f.setTime(start + IDENTITY_TTL.sessionMs); expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
    const before = f.model.inspect(); f.setTime(start + IDENTITY_TTL.sessionMs - 1);
    expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
    expect(f.model.inspect()).toEqual(before);
  });
  it('does not revive expired receipt evidence after a read-only retention check and clock rollback', async () => {
    const f = fixture(), command = f.accept(), accepted = await f.model.acceptAssertionAndCreateGrant(command);
    if (accepted.status !== 'COMMITTED') throw Error('fixture');
    const descriptor = f.lookup(command), receipt = f.model.readOperationReceipt(accepted.receipt, descriptor);
    f.setTime(receipt.retainUntil); expect(await f.model.getOperationOutcome(descriptor)).toEqual({ status: 'OUTCOME_UNKNOWN' });
    const before = f.model.inspect(); f.setTime(receipt.retainUntil - 1);
    expect(await f.model.getOperationOutcome(descriptor)).toEqual({ status: 'INVALID' });
    expect(() => f.model.readOperationReceipt(accepted.receipt, descriptor)).toThrow();
    expect(f.model.inspect()).toEqual(before);
  });
  it('does not redeem an expired grant after backend time rolls back following a denied decision', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept());
    f.setTime(start + IDENTITY_TTL.grantMs); expect(await f.model.consumeGrantAndCreateSession(f.issue())).toEqual({ status: 'EXPIRED' });
    f.setTime(start + IDENTITY_TTL.grantMs - 1);
    expect(await f.model.consumeGrantAndCreateSession(f.issue())).toEqual({ status: 'INVALID' });
    expect(f.model.inspect()).toMatchObject({ consumedGrants: 0, sessions: 0 });
  });
  it('clones nested command context and freezes all reachable proof and receipt data', async () => {
    const f = fixture(), command = { ...f.accept(), context: { ...expected } }, descriptor = f.lookup(command);
    const proof = command.assertion, legacy = proof.data.legacy;
    const frozen = [proof, proof.data, proof.data.claims, legacy, legacy.data, legacy.data.claims, legacy.data.signature];
    f.setHook(async () => {
      command.context.environment = 'PRODUCTION';
      for (const value of frozen) {
        expect(Object.isFrozen(value)).toBe(true);
        expect(Reflect.set(value, 'injected', true)).toBe(false);
      }
      expect(Reflect.set(proof.data.claims, 'subject', 'forged')).toBe(false);
      expect(Reflect.set(legacy.data.claims, 'expiresAt', Number.MAX_SAFE_INTEGER)).toBe(false);
    });
    const accepted = await f.model.acceptAssertionAndCreateGrant(command); expect(accepted.status).toBe('COMMITTED');
    if (accepted.status !== 'COMMITTED') throw Error('fixture');
    const receipt = f.model.readOperationReceipt(accepted.receipt, descriptor);
    expect(receipt.environment).toBe('TEST');
    for (const value of [accepted.receipt, accepted.receipt.record, accepted.receipt.record.databaseCommittedAt,
      receipt, receipt.databaseCommittedAt]) {
      expect(Object.isFrozen(value)).toBe(true); expect(Reflect.set(value, 'injected', true)).toBe(false);
    }
    expect(Reflect.set(receipt.databaseCommittedAt, 'status', 'KNOWN')).toBe(false);
  });
  it.each([-50, 2000])('uses an independent backend clock with offset %s, without caller equality', async offset => {
    const f = fixture(); f.setTime(start - 100); const verifiedEarlier = f.accept(); f.setTime(start);
    const command = seal({ ...verifiedEarlier, commandCreatedAt: start }); f.setBackendOffset(offset);
    const accepted = await f.model.acceptAssertionAndCreateGrant(command);
    if (accepted.status !== 'COMMITTED') throw Error('fixture');
    const receipt = f.model.readOperationReceipt(accepted.receipt, f.lookup(command));
    expect(receipt.commandCreatedAt).toBe(start); expect(receipt.backendDecisionAt).toBe(start + offset);
    expect(receipt.databaseCommittedAt).toEqual({ status: 'UNAVAILABLE', value: null });
    expect(Object.isFrozen(receipt.databaseCommittedAt)).toBe(true);
    const issue = f.issue(); expect((await f.model.consumeGrantAndCreateSession(issue)).status).toBe('COMMITTED');
    expect(f.model.readSession(f.sessionLookup()).status).toBe('FOUND');
  });
  it('keeps decision time separate from a later state swap without inventing a DB timestamp', async () => {
    const f = fixture(), command = f.accept();
    f.setHook(async () => { f.setTime(start + 1000); });
    const outcome = await f.model.acceptAssertionAndCreateGrant(command);
    if (outcome.status !== 'COMMITTED') throw Error('fixture');
    const receipt = f.model.readOperationReceipt(outcome.receipt, f.lookup(command));
    expect(receipt.backendDecisionAt).toBe(start); expect(f.time()).toBe(start + 1000);
    expect(receipt.databaseCommittedAt).toEqual({ status: 'UNAVAILABLE', value: null });
    expect(receipt).not.toHaveProperty('committedAt');
    expect(JSON.stringify(receipt)).not.toContain(command.assertion.data.assertion);
  });
  it.each([-120_000, -120_001, 5001])('rejects command age/skew boundary offset %s before mutation', async offset => {
    const f = fixture(), c = seal({ ...f.accept(), commandCreatedAt: start + offset });
    expect(await f.model.acceptAssertionAndCreateGrant(c)).toEqual({ status: 'EXPIRED' });
    expect(f.model.inspect().receipts).toBe(0);
  });
  it.each(['backendOrigin', 'protocolVersion'] as const)('rejects command %s mismatch', async field => {
    const f = fixture(), c = { ...f.accept(), [field]: field === 'backendOrigin' ? 'https://auth-other.example.com' : 2 };
    expect(await f.model.acceptAssertionAndCreateGrant(c as any)).toEqual({ status: 'CONTEXT_MISMATCH' });
    expect(f.model.inspect().grants).toBe(0);
  });
  it('pins the verified exact JWS in the shared business body and rejects the legacy command schema', async () => {
    const f = fixture(), c = f.accept(), descriptor = atomicOperationDescriptor(c, byteDigest);
    expect(JSON.parse(descriptor.body)).toEqual({ expectedRevision: 0, assertion: wire(f.claims).assertion });
    expect(readSignedAssertion(c.assertion, expected).assertion).toBe(wire(f.claims).assertion);
    const { commandCreatedAt, ...rest } = c;
    expect(await f.model.acceptAssertionAndCreateGrant({ ...rest, decisionTime: commandCreatedAt } as any)).toEqual({ status: 'INVALID' });
  });
  it('rejects receipt JSON, spreads, prototypes, constructor abuse and cross-store evidence', async () => {
    const f = fixture(), c = f.accept(), accepted = await f.model.acceptAssertionAndCreateGrant(c);
    if (accepted.status !== 'COMMITTED') throw Error('fixture');
    for (const fake of [{ ...accepted.receipt }, JSON.parse(JSON.stringify(accepted.receipt)), Object.create(accepted.receipt),
      { record: accepted.receipt.record }]) expect(() => f.model.readOperationReceipt(fake, f.lookup(c))).toThrow();
    expect(() => new (accepted.receipt.constructor as any)({}, {}, accepted.receipt.record)).toThrow();
    expect(() => fixture().model.readOperationReceipt(accepted.receipt, f.lookup(c))).toThrow();
    expect(() => f.model.readOperationReceipt(accepted.receipt, { ...f.lookup(c), environment: 'PRODUCTION' })).toThrow();
    expect(() => f.model.readOperationReceipt(accepted.receipt, { ...f.lookup(c), expectedObjectId: hex('f') })).toThrow();
    expect(() => f.model.readOperationReceipt(accepted.receipt, { ...f.lookup(c), expectedRevision: 1 })).toThrow();
  });
  it('performs async historical lookup after command/assertion expiry without re-issuing or extending anything', async () => {
    const f = fixture(), c = f.accept(); await f.model.acceptAssertionAndCreateGrant(c); const before = f.model.inspect();
    f.setTime(start + 121_000);
    const pending = f.model.getOperationOutcome(f.lookup(c)); expect(pending).toBeInstanceOf(Promise);
    const result = await pending; expect(result.status).toBe('COMMITTED');
    expect(f.model.inspect()).toEqual(before);
    if (result.status !== 'COMMITTED') throw Error('fixture');
    const r = f.model.readOperationReceipt(result.receipt, f.lookup(c));
    expect(r.commandCreatedAt).toBe(start); expect(r.backendDecisionAt).toBe(start);
    f.setTime(r.retainUntil);
    expect(await f.model.getOperationOutcome(f.lookup(c))).toEqual({ status: 'OUTCOME_UNKNOWN' });
    expect(() => f.model.readOperationReceipt(result.receipt, f.lookup(c))).toThrow();
  });
  it('rejects a backend clock rollback at the final commit boundary', async () => {
    const f = fixture(); f.setHook(async () => { f.setTime(start - 1); });
    expect(await f.model.acceptAssertionAndCreateGrant(f.accept())).toEqual({ status: 'INVALID' });
    expect(f.model.inspect()).toMatchObject({ consumedTransactions: 0, grants: 0, receipts: 0 });
  });
  it('snapshots caller command fields before awaiting and rechecks the original signing proof', async () => {
    const f = fixture(), command = f.accept(), descriptor = f.lookup(command);
    f.setHook(async () => {
      Object.assign(command, { operationId: hex('f'), commandDigest: hex('f'), assertion: {} });
    });
    const accepted = await f.model.acceptAssertionAndCreateGrant(command);
    expect(accepted.status).toBe('COMMITTED');
    if (accepted.status !== 'COMMITTED') throw Error('fixture');
    expect(f.model.readOperationReceipt(accepted.receipt, descriptor).operationId).toBe(descriptor.operationId);
    const issue = f.issue(), issueDescriptor = f.lookup(issue);
    f.setHook(async () => { Object.assign(issue, { credentialDigest: sha('tampered-bearer'), expectedAuthorizationVersion: 999 }); });
    const result = await f.model.consumeGrantAndCreateSession(issue);
    expect(result.status).toBe('COMMITTED');
    if (result.status !== 'COMMITTED') throw Error('fixture');
    expect(f.model.readOperationReceipt(result.receipt, issueDescriptor).objectId).toBe(issueDescriptor.expectedObjectId);
    expect(f.model.readSession(f.sessionLookup()).status).toBe('FOUND');
  });
  it('cannot swap to another valid proof to evade original-key compromise at final commit', async () => {
    const f = fixture(), command = f.accept(), original = f.policy().keys[0], next = { ...original, keyId: 'next-signing-key' };
    f.setPolicy({ ...f.policy(), keys: [original, next] });
    const other = verifySignedAssertion(wire(f.claims, { ...header, kid: next.keyId }), expected, f.policy(), f.tx, f.time, f.cryptoPort);
    f.setHook(async () => {
      Object.assign(command, { assertion: other });
      f.setPolicy({ ...f.policy(), keys: [{ ...original, compromised: true }, next] });
    });
    expect(await f.model.acceptAssertionAndCreateGrant(command)).toEqual({ status: 'INVALID' });
    expect(f.model.inspect()).toMatchObject({ consumedTransactions: 0, grants: 0, receipts: 0 });
  });
});

describe('versioned signing key policy', () => {
  it('supports verify-only overlap and exact signing/verification half-open intervals', () => {
    const f = fixture(), old = { ...f.policy().keys[0], status: 'VERIFY_ONLY' as const, signingNotAfter: start },
      next = { ...f.policy().keys[0], keyId: 'test-signing-key-v2', signingNotBefore: start };
    const rotation: SigningKeyPolicy = { ...f.policy(), keys: [old, next] };
    expect(verificationKey(rotation, old.keyId, expected, start - 1, start).status).toBe('VERIFY_ONLY');
    expect(verificationKey(rotation, next.keyId, expected, start, start).keyId).toBe(next.keyId);
    expect(() => verificationKey(rotation, old.keyId, expected, start, start)).toThrow();
    expect(() => verificationKey(rotation, next.keyId, expected, start - 1, start)).toThrow();
    expect(() => verificationKey(rotation, old.keyId, expected, start - 1, old.verificationNotAfter)).toThrow();
  });
  it.each(['ACTIVE', 'VERIFY_ONLY', 'RETIRED', 'REVOKED'] as const)('compromise overrides previous status %s', status => {
    const f = fixture(); f.setKey({ status, compromised: true, revokedAt: status === 'REVOKED' ? start : null });
    expect(() => f.evidence()).toThrow();
  });
  it('rejects revoked/retired keys, policy versions, ambiguous key IDs and invalid intervals', () => {
    const f = fixture(), p = f.policy(), key = p.keys[0];
    for (const value of [{ ...p, version: 2 }, { ...p, keys: [] }, { ...p, keys: [key, key] }, { ...p, extra: true },
      { ...p, keys: [{ ...key, algorithm: 'HS256' }] }, { ...p, keys: [{ ...key, signingNotAfter: key.signingNotBefore }] }])
      expect(() => signingKeyPolicy(value)).toThrow();
    for (const change of [{ status: 'RETIRED' as const }, { revokedAt: start }, { status: 'REVOKED' as const, revokedAt: start }]) {
      f.setKey(change); expect(() => f.evidence()).toThrow();
    }
  });
  it.each(['environment', 'expectedScriptId', 'applicationAudience'] as const)('key lookup cannot escape its %s binding', field => {
    const f = fixture(), key = { ...f.policy().keys[0], [field]: field === 'environment' ? 'PRODUCTION' as const : 'synthetic-other-key-context-000000001' };
    expect(() => verificationKey({ ...f.policy(), keys: [key] }, header.kid, expected, f.claims.issuedAt, start)).toThrow();
  });
});

describe('atomic reference semantics (NOT distributed persistence)', () => {
  it('commits acceptance and issuance with one replay marker, grant, session and receipt per operation', async () => {
    const f = fixture(), accept = f.accept(); expect((await f.model.acceptAssertionAndCreateGrant(accept)).status).toBe('COMMITTED');
    const issue = f.issue(); expect((await f.model.consumeGrantAndCreateSession(issue)).status).toBe('COMMITTED');
    expect(f.model.inspect()).toEqual({ transactions: 1, consumedTransactions: 1, assertions: 1, grants: 1, consumedGrants: 1, sessions: 1, receipts: 2 });
    const result = f.model.readSession(f.sessionLookup()); expect(result.status).toBe('FOUND');
    if (result.status !== 'FOUND') throw Error('fixture');
    const s = f.model.readTrustedSession(result.session);
    expect(s.sessionId).toBe(sha(hex('e'))); expect(s).not.toHaveProperty('sessionCredential'); expect(JSON.stringify(s)).not.toContain(hex('e'));
    expect(s.signingKey).toMatchObject({ keyId: header.kid, protocolVersion: 1, assertionId: f.claims.assertionId });
    expect(s).not.toHaveProperty('roles'); expect(s).not.toHaveProperty('permissions');
  });
  it('rejects assertion replay, transaction replay with another assertion, and grant replay', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept());
    expect((await f.model.acceptAssertionAndCreateGrant(f.accept(hex('3')))).status).toBe('REPLAY');
    const changed = { ...f.claims, assertionId: hex('f') };
    const evidence = verifySignedAssertion(wire(changed), expected, f.policy(), f.tx, () => start, f.cryptoPort);
    expect((await f.model.acceptAssertionAndCreateGrant(seal({ ...f.accept(hex('4')), assertion: evidence }))).status).toBe('REPLAY');
    await f.model.consumeGrantAndCreateSession(f.issue());
    expect((await f.model.consumeGrantAndCreateSession(f.issue(hex('5'), sha('second')))).status).toBe('REPLAY');
  });
  it('fences assertion ID globally within this application context, even for another transaction', async () => {
    const f = fixture(), secondTx = { ...f.tx, transactionId: hex('f') }; f.model.seedTransaction(secondTx);
    const proof = verifySignedAssertion(wire({ ...f.claims, transactionId: secondTx.transactionId }), expected, f.policy(), secondTx, () => start, f.cryptoPort);
    await f.model.acceptAssertionAndCreateGrant(f.accept());
    expect((await f.model.acceptAssertionAndCreateGrant(seal({ ...f.accept(hex('3')), assertion: proof }))).status).toBe('REPLAY');
  });
  it.each(['accept', 'issue'] as const)('has exactly one new committed winner for simultaneous %s', async stage => {
    const f = fixture(); if (stage === 'issue') await f.model.acceptAssertionAndCreateGrant(f.accept());
    const waiting: (() => void)[] = [];
    f.setHook(() => new Promise<void>(resolve => { waiting.push(resolve); if (waiting.length === 2) waiting.forEach(done => done()); }));
    const results = await (stage === 'accept' ? Promise.all([f.model.acceptAssertionAndCreateGrant(f.accept()), f.model.acceptAssertionAndCreateGrant(f.accept(hex('3')))]) :
      Promise.all([f.model.consumeGrantAndCreateSession(f.issue()), f.model.consumeGrantAndCreateSession(f.issue(hex('3'), sha('other')))]));
    expect(results.map(r => r.status).sort()).toEqual(['COMMITTED', 'CONFLICT']);
    expect(results.filter(r => r.status === 'COMMITTED' && !r.recovered)).toHaveLength(1);
    expect(f.model.inspect()).toMatchObject(stage === 'accept' ? { grants: 1, assertions: 1, receipts: 1 } : { consumedGrants: 1, sessions: 1, receipts: 2 });
  });
  it('recovers duplicate concurrent same-command delivery without a second consumer', async () => {
    const f = fixture(), command = f.accept(), waiting: (() => void)[] = [];
    f.setHook(() => new Promise<void>(resolve => { waiting.push(resolve); if (waiting.length === 2) waiting.forEach(done => done()); }));
    const results = await Promise.all([f.model.acceptAssertionAndCreateGrant(command), f.model.acceptAssertionAndCreateGrant(command)]);
    expect(results.filter(r => r.status === 'COMMITTED' && !r.recovered)).toHaveLength(1);
    expect(results.filter(r => r.status === 'COMMITTED' && r.recovered)).toHaveLength(1); expect(f.model.inspect().grants).toBe(1);
  });
  it.each(['AFTER_TRANSACTION', 'AFTER_ASSERTION', 'AFTER_GRANT', 'AFTER_RECEIPT', 'BEFORE_COMMIT', 'UNAVAILABLE'] as ReferenceFault[])(
    'rolls back ALL acceptance writes at %s', async fault => {
      const f = fixture(), command = f.accept(), before = f.model.inspect(); f.model.failNext(fault);
      expect((await f.model.acceptAssertionAndCreateGrant(command)).status).toBe('UNAVAILABLE'); expect(f.model.inspect()).toEqual(before);
      expect((await f.model.getOperationOutcome(f.lookup(command))).status).toBe('OUTCOME_UNKNOWN');
      expect((await f.model.acceptAssertionAndCreateGrant(command)).status).toBe('COMMITTED');
    });
  it.each(['AFTER_GRANT', 'AFTER_SESSION', 'AFTER_RECEIPT', 'BEFORE_COMMIT', 'UNAVAILABLE'] as ReferenceFault[])(
    'rolls back grant consumption, session and receipt at %s', async fault => {
      const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept()); const command = f.issue(), before = f.model.inspect();
      f.model.failNext(fault); expect((await f.model.consumeGrantAndCreateSession(command)).status).toBe('UNAVAILABLE');
      expect(f.model.inspect()).toEqual(before); expect((await f.model.consumeGrantAndCreateSession(command)).status).toBe('COMMITTED');
    });
  it.each(['accept', 'issue'] as const)('recovers lost %s response from receipt; never assumes rollback', async stage => {
    const f = fixture(); if (stage === 'issue') await f.model.acceptAssertionAndCreateGrant(f.accept());
    const command = stage === 'accept' ? f.accept() : f.issue(); f.model.failNext('AFTER_COMMIT');
    const run = () => 'assertion' in command ? f.model.acceptAssertionAndCreateGrant(command) : f.model.consumeGrantAndCreateSession(command);
    expect((await run()).status).toBe('OUTCOME_UNKNOWN'); const count = f.model.inspect();
    expect(await f.model.getOperationOutcome(f.lookup(command))).toMatchObject({ status: 'COMMITTED', recovered: true });
    expect(await run()).toMatchObject({ status: 'COMMITTED', recovered: true }); expect(f.model.inspect()).toEqual(count);
  });
  it('binds operation ID to digest and recalculates digest rather than trusting command metadata', async () => {
    const f = fixture(), command = f.accept(); await f.model.acceptAssertionAndCreateGrant(command);
    expect((await f.model.getOperationOutcome({ ...f.lookup(command), commandDigest: hex('f') })).status).toBe('CONFLICT');
    expect((await f.model.acceptAssertionAndCreateGrant({ ...command, commandDigest: hex('f') })).status).toBe('CONFLICT');
    const modified = seal({ ...command, expectedRevision: 1 }); expect((await f.model.acceptAssertionAndCreateGrant(modified)).status).toBe('CONFLICT');
  });
  it.each(['environment', 'expectedScriptId', 'applicationAudience'] as const)('rejects server command context mismatch: %s', async key => {
    const f = fixture(), c = f.accept(), other = { ...expected, [key]: key === 'environment' ? 'PRODUCTION' as const : 'synthetic-other-application-00000001' };
    expect((await f.model.acceptAssertionAndCreateGrant({ ...c, context: other })).status).toBe('CONTEXT_MISMATCH');
    expect((await f.model.getOperationOutcome({ ...f.lookup(c), ...other })).status).toBe('CONTEXT_MISMATCH');
    expect((await f.model.consumeGrantAndCreateSession({ ...f.issue(), context: other })).status).toBe('CONTEXT_MISMATCH');
    expect(f.model.inspect().grants).toBe(0);
  });
  it('rejects stale revisions, forged evidence and extra browser authority fields', async () => {
    const f = fixture(), command = f.accept();
    expect((await f.model.acceptAssertionAndCreateGrant(seal({ ...command, expectedRevision: 1 }))).status).toBe('CONFLICT');
    expect((await f.model.acceptAssertionAndCreateGrant({ ...command, assertion: { ...command.assertion } } as any)).status).toBe('INVALID');
    for (const field of ['roles', 'permissions', 'subject', 'email', 'authorizationVersion']) {
      expect((await f.model.acceptAssertionAndCreateGrant({ ...command, [field]: 'forged' } as any)).status).toBe('INVALID');
      expect(() => browserLoginBegin({ browserProofBinding: hex('c'), [field]: 'forged' })).toThrow();
      expect(() => browserLoginComplete({ transactionId: hex('a'), browserProof: hex('c'), [field]: 'forged' })).toThrow();
      expect(() => browserSessionCredential({ sessionCredential: hex('e'), [field]: 'forged' })).toThrow();
    }
    expect(f.model.inspect().grants).toBe(0);
  });
  it('fails closed on unavailable store, unknown context, missing receipt and invalid command times', async () => {
    const f = fixture(), c = f.accept(); f.model.setAvailable(false);
    expect((await f.model.acceptAssertionAndCreateGrant(c)).status).toBe('UNAVAILABLE');
    expect((await f.model.getOperationOutcome(f.lookup(c))).status).toBe('UNAVAILABLE');
    expect(f.model.readSession(f.sessionLookup()).status).toBe('UNAVAILABLE');
    f.model.setAvailable(true); expect((await f.model.getOperationOutcome(f.lookup(c))).status).toBe('OUTCOME_UNKNOWN');
    for (const commandCreatedAt of [0, -1, NaN]) expect((await f.model.acceptAssertionAndCreateGrant({ ...c, commandCreatedAt })).status).toBe('INVALID');
    expect((await f.model.acceptAssertionAndCreateGrant({ ...c, context: undefined } as any)).status).toBe('CONTEXT_MISMATCH');
  });
  it('rechecks expiry after scheduling and does not commit a stale validation', async () => {
    const f = fixture(), command = f.accept(); f.setHook(async () => { f.setTime(f.claims.expiresAt); });
    expect((await f.model.acceptAssertionAndCreateGrant(command)).status).toBe('EXPIRED'); expect(f.model.inspect().receipts).toBe(0);
  });
  it('checks grant expiry again after a scheduled concurrent wait', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept());
    f.setHook(async () => { f.setTime(start + IDENTITY_TTL.grantMs); });
    expect((await f.model.consumeGrantAndCreateSession(f.issue())).status).toBe('EXPIRED');
    expect(f.model.inspect()).toMatchObject({ consumedGrants: 0, sessions: 0, receipts: 1 });
  });
  it('rolls back when scheduler/store work throws and does not expose its message', async () => {
    const f = fixture(); f.setHook(async () => { throw Error('PRIVATE_BACKEND_ERROR'); });
    expect(await f.model.acceptAssertionAndCreateGrant(f.accept())).toEqual({ status: 'UNAVAILABLE' });
    expect(f.model.inspect()).toMatchObject({ consumedTransactions: 0, grants: 0, assertions: 0, receipts: 0 });
  });
  it('expires a transaction independently of assertion expiry', async () => {
    const f = fixture(); (f.tx as any).expiresAt = start + 1;
    // Independent model receives this authoritative short-lived transaction.
    const model = new AtomicStoreReferenceModel({ context: expected, backendOrigin, clock: f.time, keyPolicy: f.policy, directory: () => undefined,
      digest: byteDigest, capacity: { maxTransactions: 1, maxGrants: 1, maxSessions: 1, maxReceipts: 2, maxSessionsPerSubject: 1, receiptRetentionMs: 1000, cleanupBatchSize: 10 } });
    model.seedTransaction(f.tx); const c = f.accept(); f.setTime(start + 1);
    expect((await model.acceptAssertionAndCreateGrant(seal({ ...c, commandCreatedAt: f.time() }))).status).toBe('EXPIRED');
  });
  it('allows a 15-minute session after the 20-second assertion expires, while grant is live', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept()); f.setTime(start + 25_000);
    expect((await f.model.consumeGrantAndCreateSession(f.issue())).status).toBe('COMMITTED');
    const result = f.model.readSession(f.sessionLookup()); if (result.status !== 'FOUND') throw Error('fixture');
    const s = f.model.readTrustedSession(result.session); expect(s.expiresAt).toBe(f.time() + IDENTITY_TTL.sessionMs);
    expect(s.expiresAt).toBeGreaterThan(f.claims.expiresAt);
    f.setTime(s.expiresAt); expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
  });
  it('rejects grant at exact expiry and caps session by signed upstream proof', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept()); f.setTime(start + IDENTITY_TTL.grantMs);
    expect((await f.model.consumeGrantAndCreateSession(f.issue())).status).toBe('EXPIRED');
    const cap = fixture(); (cap.claims as any).authenticationExpiresAt = start + 60_000;
    await cap.model.acceptAssertionAndCreateGrant(cap.accept()); await cap.model.consumeGrantAndCreateSession(cap.issue());
    const r = cap.model.readSession(cap.sessionLookup()); if (r.status !== 'FOUND') throw Error('fixture');
    expect(r.session.record.expiresAt).toBe(start + 60_000);
    cap.setTime(start + 59_999); expect(cap.model.readSession(cap.sessionLookup()).status).toBe('FOUND');
    cap.setTime(start + 60_000); expect(cap.model.readSession(cap.sessionLookup()).status).toBe('BLOCKED');
  });
  it('fences changed authorization version at issuance, commit and every session lookup', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept()); const c = f.issue(); f.setUser({ authorizationVersion: 4 });
    expect((await f.model.consumeGrantAndCreateSession(c)).status).toBe('CONFLICT');
    f.setUser({ authorizationVersion: 3 }); f.setHook(async () => { f.setUser({ authorizationVersion: 4 }); });
    expect((await f.model.consumeGrantAndCreateSession(c)).status).toBe('CONFLICT'); expect(f.model.inspect().sessions).toBe(0);
    f.setHook(undefined); f.setUser({ authorizationVersion: 3 }); await f.model.consumeGrantAndCreateSession(c);
    f.setUser({ active: false }); expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
    f.setUser({ active: true, authorizationVersion: 4 }); expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
  });
  it('revokes stored session with CAS and rejects stale/copied/cross-store provenance', async () => {
    const f = fixture(); await f.model.acceptAssertionAndCreateGrant(f.accept()); await f.model.consumeGrantAndCreateSession(f.issue());
    const r = f.model.readSession(f.sessionLookup()); if (r.status !== 'FOUND') throw Error('fixture');
    for (const value of [{ ...r.session }, JSON.parse(JSON.stringify(r.session)), Object.create(r.session)])
      expect(() => f.model.readTrustedSession(value)).toThrow();
    expect(() => fixture().model.readTrustedSession(r.session)).toThrow();
    expect(f.model.revokeSession({ ...f.sessionLookup(), expectedRevision: 1 })).toBe('CONFLICT');
    expect(f.model.revokeSession({ ...f.sessionLookup(), expectedRevision: 0 })).toBe('REVOKED');
    expect(() => f.model.readTrustedSession(r.session)).toThrow(); expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
  });
  it('blocks compromised signing provenance at acceptance, issuance and session use', async () => {
    const f = fixture(), c = f.accept(); f.setKey({ compromised: true });
    expect((await f.model.acceptAssertionAndCreateGrant(c)).status).toBe('INVALID');
    f.setKey({ compromised: false }); await f.model.acceptAssertionAndCreateGrant(c); f.setKey({ compromised: true });
    expect((await f.model.consumeGrantAndCreateSession(f.issue())).status).toBe('INVALID');
    f.setKey({ compromised: false }); await f.model.consumeGrantAndCreateSession(f.issue()); f.setKey({ compromised: true });
    expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
  });
  it('rechecks revoked keys and broker issuer at the final commit boundary', async () => {
    const f = fixture(); f.setHook(async () => { f.setKey({ compromised: true }); });
    expect((await f.model.acceptAssertionAndCreateGrant(f.accept())).status).toBe('INVALID');
    expect(f.model.inspect().grants).toBe(0);
    f.setHook(undefined); f.setKey({ compromised: false }); await f.model.acceptAssertionAndCreateGrant(f.accept());
    f.setHook(async () => { f.setPolicy({ ...f.policy(), brokerIssuer: 'https://other-broker.invalid' }); });
    expect((await f.model.consumeGrantAndCreateSession(f.issue())).status).toBe('INVALID');
    expect(f.model.inspect().sessions).toBe(0);
  });
  it('keeps session TTL independent of verification window and rejects digest collision for another grant', async () => {
    const f = fixture(); f.setKey({ signingNotAfter: start + 50_000, verificationNotAfter: start + 60_000 });
    await f.model.acceptAssertionAndCreateGrant(f.accept()); await f.model.consumeGrantAndCreateSession(f.issue());
    const result = f.model.readSession(f.sessionLookup()); if (result.status !== 'FOUND') throw Error('fixture');
    expect(result.session.record.expiresAt).toBe(start + IDENTITY_TTL.sessionMs);
    const secondTx = { ...f.tx, transactionId: hex('f') }; f.model.seedTransaction(secondTx);
    const proof = verifySignedAssertion(wire({ ...f.claims, transactionId: secondTx.transactionId, assertionId: hex('9') }), expected, f.policy(), secondTx, () => start, f.cryptoPort);
    await f.model.acceptAssertionAndCreateGrant(seal({ ...f.accept(hex('3')), assertion: proof }));
    expect((await f.model.consumeGrantAndCreateSession(seal({ ...f.issue(hex('4')), grantId: secondTx.transactionId }))).status).toBe('CONFLICT');
    expect(f.model.inspect().sessions).toBe(1);
    f.setTime(start + 60_000); expect(f.model.readSession(f.sessionLookup()).status).toBe('FOUND');
    f.setKey({ status: 'RETIRED' }); expect(f.model.readSession(f.sessionLookup()).status).toBe('FOUND');
    f.setTime(start + IDENTITY_TTL.sessionMs); expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
  });
  it.each(['ACTIVE', 'VERIFY_ONLY', 'RETIRED'] as const)('preserves issued sessions after planned verification expiry with key %s', async status => {
    const f = fixture(); f.setKey({ signingNotAfter: start + 3000, verificationNotAfter: start + 10_000 });
    await f.model.acceptAssertionAndCreateGrant(f.accept()); await f.model.consumeGrantAndCreateSession(f.issue());
    const initial = f.model.readSession(f.sessionLookup()); if (initial.status !== 'FOUND') throw Error('fixture');
    const verifierCalls = f.cryptoPort.verify.mock.calls.length;
    f.setTime(start + 10_000); f.setKey({ status });
    expect(f.model.readSession(f.sessionLookup()).status).toBe('FOUND');
    expect(f.model.readTrustedSession(initial.session).expiresAt).toBe(start + IDENTITY_TTL.sessionMs);
    expect(f.cryptoPort.verify.mock.calls.length).toBe(verifierCalls);
    // Still-live assertion cannot use the same expired/retired verification key for new admission.
    expect(f.time()).toBeLessThan(f.claims.expiresAt);
    expect(() => validateCompactJws(wire(f.claims), expected, f.policy(), f.time())).toThrow();
  });
  it.each(['compromised', 'revokedAt', 'REVOKED', 'missing', 'context', 'issuer'] as const)(
    'keeps retired-session provenance fail-closed for %s after planned rotation', async change => {
      const f = fixture(); f.setKey({ signingNotAfter: start + 3000, verificationNotAfter: start + 10_000 });
      await f.model.acceptAssertionAndCreateGrant(f.accept()); await f.model.consumeGrantAndCreateSession(f.issue());
      const initial = f.model.readSession(f.sessionLookup()); if (initial.status !== 'FOUND') throw Error('fixture');
      f.setTime(start + 10_000); f.setKey({ status: 'RETIRED' });
      expect(f.model.readSession(f.sessionLookup()).status).toBe('FOUND');
      if (change === 'compromised') f.setKey({ compromised: true });
      if (change === 'revokedAt') f.setKey({ revokedAt: f.time() });
      if (change === 'REVOKED') f.setKey({ status: 'REVOKED', revokedAt: f.time() });
      if (change === 'missing') f.setKey({ keyId: 'another-key' });
      if (change === 'context') f.setKey({ environment: 'PRODUCTION' });
      if (change === 'issuer') f.setPolicy({ ...f.policy(), brokerIssuer: 'https://other-broker.invalid' });
      expect(f.model.readSession(f.sessionLookup()).status).toBe('BLOCKED');
      expect(() => f.model.readTrustedSession(initial.session)).toThrow();
    });
  it('rotates to a new signing key while keeping the retired key provenance for existing sessions', async () => {
    const f = fixture(); f.setKey({ signingNotAfter: start + 3000, verificationNotAfter: start + 10_000 });
    await f.model.acceptAssertionAndCreateGrant(f.accept()); await f.model.consumeGrantAndCreateSession(f.issue());
    f.setTime(start + 10_000);
    const retired = { ...f.policy().keys[0], status: 'RETIRED' as const };
    const next = { ...retired, keyId: 'test-signing-key-v2', status: 'ACTIVE' as const,
      signingNotBefore: f.time(), signingNotAfter: f.time() + 100_000,
      verificationNotBefore: f.time(), verificationNotAfter: f.time() + 200_000 };
    f.setPolicy({ ...f.policy(), keys: [retired, next] });
    expect(f.model.readSession(f.sessionLookup()).status).toBe('FOUND');
    const payload = { ...f.claims, issuedAt: f.time(), expiresAt: f.time() + IDENTITY_TTL.assertionMs };
    expect(validateCompactJws(wire(payload, { ...header, kid: next.keyId }), expected, f.policy(), f.time()).header.kid).toBe(next.keyId);
    expect(() => validateCompactJws(wire(payload), expected, f.policy(), f.time())).toThrow();
  });
  it('enforces capacity without evicting live receipts or sessions and cleans up only eligible state', async () => {
    const f = fixture({ maxReceipts: 1 }); await f.model.acceptAssertionAndCreateGrant(f.accept());
    expect((await f.model.consumeGrantAndCreateSession(f.issue())).status).toBe('CAPACITY_EXCEEDED'); expect(f.model.inspect().consumedGrants).toBe(0);
    expect(f.model.cleanup()).toBe(0); f.setTime(start + 300_000);
    expect(f.model.cleanup()).toBeGreaterThan(0); expect(f.model.inspect().grants).toBe(0);
    const full = fixture({ maxSessions: 1 }); await full.model.acceptAssertionAndCreateGrant(full.accept());
    await full.model.consumeGrantAndCreateSession(full.issue()); expect(full.model.inspect().sessions).toBe(1);
  });
  it.each(['maxGrants', 'maxSessions', 'maxSessionsPerSubject'] as const)('fails closed at %s capacity with another eligible grant', async limit => {
    const f = fixture({ [limit]: 1 }); await f.model.acceptAssertionAndCreateGrant(f.accept());
    if (limit !== 'maxGrants') await f.model.consumeGrantAndCreateSession(f.issue());
    const tx = { ...f.tx, transactionId: hex('f') }; f.model.seedTransaction(tx);
    const evidence = verifySignedAssertion(wire({ ...f.claims, transactionId: tx.transactionId, assertionId: hex('9') }), expected, f.policy(), tx, () => start, f.cryptoPort);
    const accepted = await f.model.acceptAssertionAndCreateGrant(seal({ ...f.accept(hex('3')), assertion: evidence }));
    if (limit === 'maxGrants') expect(accepted.status).toBe('CAPACITY_EXCEEDED');
    else {
      expect(accepted.status).toBe('COMMITTED');
      expect((await f.model.consumeGrantAndCreateSession(seal({ ...f.issue(hex('4'), sha('second')), grantId: tx.transactionId }))).status).toBe('CAPACITY_EXCEEDED');
    }
  });
  it('bounds cleanup batches and keeps committed receipts past assertion/grant expiry for recovery', async () => {
    const f = fixture({ cleanupBatchSize: 1 }), command = f.accept(); await f.model.acceptAssertionAndCreateGrant(command);
    f.setTime(start + 40_000); expect(f.model.cleanup()).toBe(0);
    expect(await f.model.getOperationOutcome(f.lookup(command))).toMatchObject({ status: 'COMMITTED', recovered: true });
    f.setTime(start + 300_000); expect(f.model.cleanup()).toBe(1);
    expect(f.model.inspect().receipts).toBe(0);
  });
});
