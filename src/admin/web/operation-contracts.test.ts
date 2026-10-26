import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { operationDescriptor, encodeBusinessBody, canonicalSemanticBytes, recoveryDescriptor,
  inspectRecoveryDescriptor, type SemanticMetadata } from './operation-contracts';
import { canonicalCommandBytes, canonicalRequestBytes } from './channel-contracts/validation';
import { utf8 } from './channel-contracts/encoding';
import type { RequestHeader } from './channel-contracts/contracts';

// Test-only SHA-256. No HMAC, network or runtime digest adapter.
const digest = { digest: (bytes: readonly number[]) => createHash('sha256').update(Buffer.from(bytes)).digest('hex') };
const id = (c: string) => c.repeat(64), now = 1_800_000_000_000;
const metadata: SemanticMetadata = { protocolVersion: 1, backendOrigin: 'https://auth-test.example.com', environment: 'TEST',
  applicationAudience: 'kub:admin:test', expectedScriptId: 'synthetic-admin-script-test-000000001',
  operationKind: 'ISSUE_SESSION', operationId: id('a'), commandCreatedAt: now };
const target = { backendOrigin: metadata.backendOrigin, environment: metadata.environment,
  applicationAudience: metadata.applicationAudience, expectedScriptId: metadata.expectedScriptId };
const body = { expectedRevision: 0, grantId: id('b'), credentialDigest: id('c'), expectedAuthorizationVersion: 3 };
function header(): RequestHeader {
  const op = operationDescriptor(metadata, body, digest);
  return { ...metadata, commandDigest: op.commandDigest, algorithm: 'HMAC-SHA256', keyId: 'key-1',
    requestId: id('d'), nonce: id('e'), timestamp: now, method: 'POST', backendPath: '/v1/operations',
    requestKind: 'MUTATION', bodyDigest: op.originalBodyDigest };
}

describe('shared semantic command profile', () => {
  it('snapshots scalar input and supplies frozen detached byte arrays to the digest port', () => {
    const mutableMetadata = { ...metadata }, mutableBody = { ...body }, seen: Array<readonly number[]> = [];
    const checkingDigest = { digest: (bytes: readonly number[]) => {
      seen.push(bytes); const before = [...bytes];
      expect(Object.isFrozen(bytes)).toBe(true); expect(Reflect.set(bytes, '0', 255)).toBe(false);
      expect(() => (bytes as number[]).push(255)).toThrow(); expect(bytes).toEqual(before);
      return digest.digest(bytes);
    } };
    const op = operationDescriptor(mutableMetadata, mutableBody, checkingDigest), before = JSON.stringify(op);
    mutableMetadata.expectedScriptId = 'synthetic-other-script-000000000001'; mutableBody.expectedAuthorizationVersion = 999;
    expect(JSON.stringify(op)).toBe(before); expect(Object.isFrozen(op)).toBe(true);
    expect(op.commandDigest).toBe(operationDescriptor(metadata, body, digest).commandDigest);
    expect(seen).toHaveLength(2); expect(seen[0]).not.toBe(seen[1]);
    const canonical = canonicalSemanticBytes(metadata, op.originalBodyDigest);
    expect(Object.isFrozen(canonical)).toBe(true); expect(Reflect.set(canonical, '0', 255)).toBe(false);
    expect(canonical.every(byte => typeof byte === 'number')).toBe(true);
  });
  it('uses exact existing wire v1 framing independently of transport and object insertion order', () => {
    const op = operationDescriptor(metadata, body, digest);
    // Independent normative v1 encoder: uint32 BE byte lengths; no application framing helper.
    const fields = ['KUB_ADMIN_CHANNEL_COMMAND_V1', '1', metadata.backendOrigin, metadata.environment,
      metadata.applicationAudience, metadata.expectedScriptId, metadata.operationKind, metadata.operationId,
      String(now), op.originalBodyDigest];
    const reference = Buffer.concat(fields.map(field => {
      const text = Buffer.from(field, 'utf8'), length = Buffer.alloc(4); length.writeUInt32BE(text.length); return Buffer.concat([length, text]);
    }));
    expect(canonicalSemanticBytes(metadata, op.originalBodyDigest)).toEqual([...reference]);
    expect(op.commandDigest).toBe(createHash('sha256').update(reference).digest('hex'));
    expect(canonicalCommandBytes(header(), op.originalBodyDigest)).toEqual([...reference]);
    expect(operationDescriptor(metadata, Object.fromEntries(Object.entries(body).reverse()), digest)).toEqual(op);
    expect(op.body).toBe('{"expectedRevision":0,"grantId":"' + id('b') + '","credentialDigest":"' + id('c') + '","expectedAuthorizationVersion":3}');
  });
  it('keeps original command digest during fresh transport retry and receipt lookup', () => {
    const op = operationDescriptor(metadata, body, digest), original = header();
    const lookupBody = JSON.stringify({ operationId: op.operationId, commandDigest: op.commandDigest });
    const lookup: RequestHeader = { ...original, requestKind: 'RECEIPT_LOOKUP', backendPath: '/v1/operations/lookup',
      requestId: id('1'), nonce: id('2'), keyId: 'rotated-request-key', timestamp: now + 40_000,
      bodyDigest: digest.digest(utf8(lookupBody)) };
    expect(lookup.bodyDigest).not.toBe(op.originalBodyDigest);
    expect(digest.digest(canonicalCommandBytes(lookup, op.originalBodyDigest))).toBe(op.commandDigest);
    expect(canonicalRequestBytes(lookup)).not.toEqual(canonicalRequestBytes(original));
    expect(digest.digest(canonicalCommandBytes(lookup, lookup.bodyDigest))).not.toBe(op.commandDigest);
  });
  it.each(['expectedRevision', 'grantId', 'credentialDigest', 'expectedAuthorizationVersion'] as const)(
    'binds business precondition %s', field => {
      const changed = { ...body, [field]: typeof body[field] === 'number' ? 4 : id('f') };
      expect(operationDescriptor(metadata, changed, digest).commandDigest).not.toBe(operationDescriptor(metadata, body, digest).commandDigest);
    });
  it.each(['backendOrigin', 'environment', 'applicationAudience', 'expectedScriptId', 'operationId', 'commandCreatedAt'] as const)(
    'binds semantic metadata %s', field => {
      const other = { backendOrigin: 'https://auth-other.example.com', environment: 'PRODUCTION', applicationAudience: 'kub:other',
        expectedScriptId: 'synthetic-other-script-000000000001', operationId: id('9'), commandCreatedAt: now + 1 };
      expect(operationDescriptor({ ...metadata, [field]: other[field] } as SemanticMetadata, body, digest).commandDigest)
        .not.toBe(operationDescriptor(metadata, body, digest).commandDigest);
    });
  it('hashes exact Compact JWS bytes without normalizing their signed JSON', () => {
    const m = { ...metadata, operationKind: 'ACCEPT_ASSERTION' as const };
    const first = operationDescriptor(m, { expectedRevision: 0, assertion: 'e30.eyJhIjoxfQ.AA' }, digest);
    const second = operationDescriptor(m, { expectedRevision: 0, assertion: 'e30.eyAiYSI6MSB9.AA' }, digest);
    expect(first.commandDigest).not.toBe(second.commandDigest);
    expect(JSON.parse(first.body).assertion).toBe('e30.eyJhIjoxfQ.AA');
    expect(encodeBusinessBody('ACCEPT_ASSERTION', { assertion: 'e30.e30.AA', expectedRevision: 2 }))
      .toBe('{"expectedRevision":2,"assertion":"e30.e30.AA"}');
  });
  it('does not accept the legacy JSON-array command profile as new-profile recovery evidence', () => {
    const op = operationDescriptor(metadata, body, digest), r = recoveryDescriptor(op, 0, body.credentialDigest);
    const legacy = digest.digest(utf8(JSON.stringify(['ISSUE_SESSION', 'TEST', metadata.applicationAudience,
      metadata.expectedScriptId, metadata.operationId, 0, now, body.grantId, body.credentialDigest, 3])));
    expect(legacy).not.toBe(op.commandDigest);
    expect(() => inspectRecoveryDescriptor({ ...r, commandDigest: legacy }, target, digest)).toThrow();
  });
  it('keeps immutable recovery metadata free of assertion, body, proof and bearer', () => {
    const op = operationDescriptor({ ...metadata, operationKind: 'ACCEPT_ASSERTION' }, { expectedRevision: 0, assertion: 'e30.e30.AA' }, digest);
    const r = recoveryDescriptor(op, 0, id('b'));
    expect(Object.isFrozen(op)).toBe(true); expect(Object.isFrozen(r)).toBe(true);
    expect(JSON.stringify(r)).not.toContain('e30.e30.AA');
    for (const field of ['body', 'assertion', 'sessionCredential', 'browserProof']) expect(r).not.toHaveProperty(field);
    expect(() => recoveryDescriptor({ ...op, sessionCredential: id('e') } as any, 0, id('b'))).toThrow();
    expect(inspectRecoveryDescriptor(JSON.parse(JSON.stringify(r)), target, digest)).toEqual(r); // Shape only, never authority.
    expect(() => inspectRecoveryDescriptor({ ...r, body: op.body }, target, digest)).toThrow();
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '1800000000000'])(
    'rejects invalid semantic milliseconds %s', value => {
      expect(() => operationDescriptor({ ...metadata, commandCreatedAt: value } as SemanticMetadata, body, digest)).toThrow();
    });
  it('rejects extra authority fields, invalid version, unsafe revision and untrusted destinations', () => {
    for (const field of ['roles', 'permissions', 'email', 'subject'])
      expect(() => operationDescriptor(metadata, { ...body, [field]: 'forged' }, digest)).toThrow();
    for (const change of [{ protocolVersion: 2 }, { backendOrigin: 'http://auth-test.example.com' }, { environment: 'UNKNOWN' }])
      expect(() => operationDescriptor({ ...metadata, ...change } as SemanticMetadata, body, digest)).toThrow();
    for (const value of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() => encodeBusinessBody('ISSUE_SESSION', { ...body, expectedRevision: value })).toThrow();
    expect(() => encodeBusinessBody('ACCEPT_ASSERTION', { expectedRevision: 0, assertion: 'a'.repeat(8193) })).toThrow();
  });
});
