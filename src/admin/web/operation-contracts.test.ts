import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { operationDescriptor, encodeBusinessBody, canonicalSemanticBytes, recoveryDescriptor,
  inspectRecoveryDescriptor, type SemanticMetadata } from './operation-contracts';
import { canonicalCommandBytes, canonicalRequestBytes } from './channel-contracts/validation';
import { utf8 } from './channel-contracts/encoding';
import type { RequestHeader } from './channel-contracts/contracts';
import { TEMPORAL_METADATA_PROFILE, validateTemporalAdmissionPolicy, validateTemporalPolicyBinding,
  validateTemporalMetadataDescriptor, type TemporalAdmissionPolicy, type TemporalMetadataDescriptor,
  type TemporalContractValidation } from './operation-contracts';
import { durableAdmissionGate, requireDurableAdmissionGuarantees,
  type VerifiedDurableGuarantees } from './identity-contracts/durable-store-contracts';
import { composeRemoteDurableAuthentication } from './authentication/composition';
import { readSignedAssertion } from './identity-contracts/signed-assertion-profile';
import { readTrustedLoginGrant } from './identity-contracts/verification';

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

const temporalPolicies: readonly TemporalAdmissionPolicy[] = [
  { operation: 'ACCEPT_ASSERTION', mode: 'STRICT_COMMIT_TIME' },
  { operation: 'ISSUE_SESSION', mode: 'STRICT_COMMIT_TIME' },
  { operation: 'ISSUE_SESSION', mode: 'STRICT_BACKEND_ADMISSION' },
];
function temporalFixture(policy: TemporalAdmissionPolicy = temporalPolicies[1]): TemporalMetadataDescriptor {
  // SYNTHETIC data only, including approvalId. This fixture approves/activates nothing.
  const op = operationDescriptor({ ...metadata, operationKind: policy.operation }, policy.operation === 'ACCEPT_ASSERTION' ?
    { expectedRevision: 0, assertion: 'e30.e30.AA' } : body, digest);
  return { recovery: { ...recoveryDescriptor(op, 0, policy.operation === 'ISSUE_SESSION' ? body.credentialDigest : id('b')) },
    binding: { profile: TEMPORAL_METADATA_PROFILE, version: 1, policy: { ...policy }, approvalId: id('f'), approvalRevision: 3 } };
}
function temporalValue<T>(result: TemporalContractValidation<T>): Readonly<T> {
  if (result.status !== 'VALID_DATA') throw Error('fixture expected valid data'); return result.value;
}
const checkTemporal = (value: unknown, pinned: unknown) => validateTemporalMetadataDescriptor(value, pinned, target, digest);
const invalidTemporal = { status: 'INVALID_DATA', reason: 'INVALID_INPUT' };

describe('operation-scoped temporal metadata (data only, no runtime approval)', () => {
  it('captures nested pinned metadata and target before inspecting the candidate', () => {
    const candidate = temporalFixture(), pinned = temporalFixture(), pinnedTarget = { ...target };
    const descriptors = vi.spyOn(Object, 'getOwnPropertyDescriptors');
    let result: TemporalContractValidation<TemporalMetadataDescriptor>, inspected: unknown[];
    try {
      result = validateTemporalMetadataDescriptor(candidate, pinned, pinnedTarget, digest);
      inspected = descriptors.mock.calls.map(([value]) => value);
    } finally { descriptors.mockRestore(); }
    expect(result.status).toBe('VALID_DATA');
    const candidateIndex = inspected.indexOf(candidate);
    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    const targetIndex = inspected.indexOf(pinnedTarget);
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    expect(targetIndex).toBeLessThan(candidateIndex);
    for (const expected of [pinned, pinned.recovery, pinned.binding, pinned.binding.policy]) {
      expect(inspected.indexOf(expected)).toBeGreaterThanOrEqual(0);
      expect(inspected.indexOf(expected)).toBeLessThan(targetIndex);
    }
  });
  it('rejects invalid pinned metadata without inspecting the candidate', () => {
    const candidate = temporalFixture(), original = temporalFixture();
    const pinned = { ...original, binding: { ...original.binding, version: 2 } };
    const descriptors = vi.spyOn(Object, 'getOwnPropertyDescriptors');
    let result: TemporalContractValidation<TemporalMetadataDescriptor>, inspected: unknown[];
    try {
      result = checkTemporal(candidate, pinned);
      inspected = descriptors.mock.calls.map(([value]) => value);
    } finally { descriptors.mockRestore(); }
    expect(result).toEqual(invalidTemporal);
    expect(inspected).toContain(pinned);
    for (const value of [candidate, candidate.recovery, candidate.binding, candidate.binding.policy])
      expect(inspected).not.toContain(value);
  });
  it.each(temporalPolicies)('validates the allowed pair $operation / $mode as data only', policy => {
    const candidate = temporalFixture(policy), pinned = temporalFixture(policy);
    expect(validateTemporalAdmissionPolicy(policy)).toEqual({ status: 'VALID_DATA', value: policy });
    expect(validateTemporalPolicyBinding(candidate.binding)).toEqual({ status: 'VALID_DATA', value: candidate.binding });
    expect(checkTemporal(candidate, pinned)).toEqual({ status: 'VALID_DATA', value: candidate });
  });
  it('rejects ACCEPT_ASSERTION + B at both the type and runtime boundaries', () => {
    const forbidden = { operation: 'ACCEPT_ASSERTION', mode: 'STRICT_BACKEND_ADMISSION' } as const;
    // @ts-expect-error The closed union forbids this operation/policy pair.
    const invalidPolicy: TemporalAdmissionPolicy = forbidden;
    expect(validateTemporalAdmissionPolicy(invalidPolicy)).toEqual(invalidTemporal);
    const candidate = temporalFixture();
    expect(checkTemporal({ ...candidate, binding: { ...candidate.binding, policy: forbidden } }, candidate)).toEqual(invalidTemporal);
  });
  it.each([null, undefined, [], {}, { operation: 'UNKNOWN', mode: 'STRICT_COMMIT_TIME' },
    { operation: 'ISSUE_SESSION', mode: 'UNKNOWN' }, { operation: 'ISSUE_SESSION' },
    { operation: 'ISSUE_SESSION', mode: true }, { operation: 'ISSUE_SESSION', mode: 'strict_commit_time' },
    { operation: 'ISSUE_SESSION', mode: 'STRICT_COMMIT_TIME', approved: true }])('fails closed for invalid policy (%#)', value => {
      expect(validateTemporalAdmissionPolicy(value)).toEqual(invalidTemporal);
    });
  it.each([undefined, null, 0, 2, '1', 1.5, NaN, Infinity])('rejects unknown/malformed temporal version %s', version => {
    const pinned = temporalFixture(), candidate = { ...pinned, binding: { ...pinned.binding, version } };
    expect(validateTemporalPolicyBinding(candidate.binding)).toEqual(invalidTemporal);
    expect(checkTemporal(candidate, pinned)).toEqual(invalidTemporal);
  });
  it.each(['UNKNOWN', 'KUB_ADMIN_CHANNEL_COMMAND_V1', 'KUB_ADMIN_TEMPORAL_METADATA_V2', ''])('rejects unknown profile %s', profile => {
    const pinned = temporalFixture();
    expect(checkTemporal({ ...pinned, binding: { ...pinned.binding, profile } }, pinned)).toEqual(invalidTemporal);
  });
  it.each(['descriptor', 'recovery', 'binding', 'policy'])('rejects extra authority fields on %s', level => {
    const candidate: any = temporalFixture(), pinned = temporalFixture();
    const nested = level === 'descriptor' ? candidate : level === 'recovery' ? candidate.recovery :
      level === 'binding' ? candidate.binding : candidate.binding.policy;
    nested.approved = true;
    expect(checkTemporal(candidate, pinned)).toEqual(invalidTemporal);
  });
  it.each(['binding', 'policy', 'profile', 'version', 'approvalId', 'approvalRevision'])('rejects missing immutable %s', field => {
    const candidate: any = temporalFixture(), pinned = temporalFixture();
    if (field === 'binding') delete candidate.binding; else delete candidate.binding[field];
    expect(checkTemporal(candidate, pinned)).toEqual(invalidTemporal);
  });
  it.each(['policy', 'approvalId', 'approvalRevision'])('rejects a changed pinned %s in either direction', field => {
    const candidate: any = temporalFixture(), pinned = temporalFixture();
    if (field === 'policy') candidate.binding.policy.mode = 'STRICT_BACKEND_ADMISSION';
    else if (field === 'approvalId') candidate.binding.approvalId = id('e');
    else candidate.binding.approvalRevision++;
    const rejected = { status: 'INVALID_DATA', reason: 'BINDING_MISMATCH' };
    expect(checkTemporal(candidate, pinned)).toEqual(rejected);
    expect(checkTemporal(pinned, candidate)).toEqual(rejected);
  });
  it('binds the policy operation to the recovered operation even with matching supplied DTOs', () => {
    const candidate: any = temporalFixture(); candidate.binding.policy = { ...temporalPolicies[0] };
    expect(checkTemporal(candidate, JSON.parse(JSON.stringify(candidate))))
      .toEqual({ status: 'INVALID_DATA', reason: 'BINDING_MISMATCH' });
  });
  it.each(['environment', 'applicationAudience', 'expectedScriptId', 'backendOrigin', 'operationId', 'commandCreatedAt'] as const)(
    'rejects a different valid operation/context (%s)', field => {
      const pinned = temporalFixture(), changed = { environment: 'PRODUCTION', applicationAudience: 'kub:other',
        expectedScriptId: 'synthetic-other-script-000000000001', backendOrigin: 'https://auth-other.example.com',
        operationId: id('9'), commandCreatedAt: now + 1 };
      const op = operationDescriptor({ ...metadata, [field]: changed[field] } as SemanticMetadata, body, digest);
      const candidate = { ...pinned, recovery: recoveryDescriptor(op, 0, body.credentialDigest) };
      expect(checkTemporal(candidate, pinned).status).toBe('INVALID_DATA');
    });
  it.each(['expectedRevision', 'expectedObjectId'] as const)('compares independent recovery %s not covered by metadata framing', field => {
    const candidate = temporalFixture(), pinned = temporalFixture();
    const recovery = { ...candidate.recovery, [field]: field === 'expectedRevision' ? 1 : id('e') };
    expect(checkTemporal({ ...candidate, recovery }, pinned)).toEqual({ status: 'INVALID_DATA', reason: 'BINDING_MISMATCH' });
  });
  it.each(['operationId', 'commandDigest', 'originalBodyDigest', 'expectedObjectId'])('rejects malformed recovery %s', field => {
    const pinned = temporalFixture(), candidate = { ...pinned, recovery: { ...pinned.recovery, [field]: 'malformed-id' } };
    expect(checkTemporal(candidate, pinned)).toEqual(invalidTemporal);
  });
  it.each([undefined, '', 'F'.repeat(64), 'f'.repeat(63), 'f'.repeat(65), 123])('rejects malformed approval ID (%#)', approvalId => {
    const pinned = temporalFixture();
    expect(checkTemporal({ ...pinned, binding: { ...pinned.binding, approvalId } }, pinned)).toEqual(invalidTemporal);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '3'])('rejects malformed approval revision %s', approvalRevision => {
    const pinned = temporalFixture();
    expect(checkTemporal({ ...pinned, binding: { ...pinned.binding, approvalRevision } }, pinned)).toEqual(invalidTemporal);
  });
  it.each(['body', 'assertion', 'sessionCredential', 'browserProof', 'roles', 'permissions', 'enablePolicyB'])(
    'rejects browser-forged/sensitive metadata field %s', field => {
      const pinned = temporalFixture();
      expect(checkTemporal({ ...pinned, [field]: 'browser-supplied' }, pinned)).toEqual(invalidTemporal);
    });
  it('rejects getters, hidden/symbol fields and inherited-only binding instead of reading them as approval', () => {
    const pinned = temporalFixture(); let reads = 0;
    const getter = { ...pinned.binding, get approvalId() { reads++; return id('f'); } };
    expect(checkTemporal({ ...pinned, binding: getter }, pinned)).toEqual(invalidTemporal); expect(reads).toBe(0);
    const hidden = Object.defineProperty({ ...pinned.binding }, 'trusted', { value: true });
    expect(checkTemporal({ ...pinned, binding: hidden }, pinned)).toEqual(invalidTemporal);
    expect(checkTemporal({ ...pinned, binding: { ...pinned.binding, [Symbol('proof')]: true } }, pinned)).toEqual(invalidTemporal);
    expect(checkTemporal(Object.create(pinned), pinned)).toEqual(invalidTemporal);
  });
  it('detaches and deeply freezes results without retaining mutable policy/recovery input', () => {
    const candidate: any = temporalFixture(), pinned: any = temporalFixture();
    const result = checkTemporal(candidate, pinned), value = temporalValue(result), before = JSON.stringify(value);
    for (const object of [result, value, value.binding, value.binding.policy, value.recovery]) expect(Object.isFrozen(object)).toBe(true);
    candidate.binding.policy.mode = 'STRICT_BACKEND_ADMISSION'; candidate.recovery.expectedObjectId = id('e');
    pinned.binding.approvalId = id('e');
    expect(JSON.stringify(value)).toBe(before);
    expect(Reflect.set(value.binding.policy, 'mode', 'STRICT_BACKEND_ADMISSION')).toBe(false);
    expect(Reflect.set(value.binding, 'approvalId', id('e'))).toBe(false);
  });
  it('snapshots both original expectations and target before a digest callback can mutate them', () => {
    const candidate: any = temporalFixture(), pinned: any = temporalFixture(), mutableTarget = { ...target };
    const changingDigest = { digest(bytes: readonly number[]) {
      candidate.binding.policy.mode = 'STRICT_BACKEND_ADMISSION'; pinned.binding.approvalId = id('e');
      mutableTarget.environment = 'PRODUCTION'; return digest.digest(bytes);
    } };
    const value = temporalValue(validateTemporalMetadataDescriptor(candidate, pinned, mutableTarget, changingDigest));
    expect(value.binding.policy.mode).toBe('STRICT_COMMIT_TIME'); expect(value.binding.approvalId).toBe(id('f'));
  });
  it('cannot hide an original approval mismatch by mutating expectations during hashing', () => {
    const candidate: any = temporalFixture(), pinned: any = temporalFixture(); candidate.binding.approvalId = id('e');
    const changingDigest = { digest(bytes: readonly number[]) { pinned.binding.approvalId = id('e'); return digest.digest(bytes); } };
    expect(validateTemporalMetadataDescriptor(candidate, pinned, target, changingDigest))
      .toEqual({ status: 'INVALID_DATA', reason: 'BINDING_MISMATCH' });
  });
  it('returns a fixed fail-closed result for a throwing dependency or invalid target', () => {
    const candidate = temporalFixture(), pinned = temporalFixture();
    expect(validateTemporalMetadataDescriptor(candidate, pinned, target, { digest: () => { throw Error('PRIVATE_ADAPTER_ERROR'); } }))
      .toEqual(invalidTemporal);
    expect(validateTemporalMetadataDescriptor(candidate, pinned, { ...target, approved: true } as any, digest)).toEqual(invalidTemporal);
    expect(Object.isFrozen(checkTemporal(null, pinned))).toBe(true);
  });
  it('never assigns a current default policy to missing, changed or unreadable recovery metadata', () => {
    const pinned = temporalFixture(temporalPolicies[2]);
    for (const candidate of [pinned.recovery, { recovery: pinned.recovery }, null, undefined])
      expect(checkTemporal(candidate, pinned)).toEqual(invalidTemporal);
    expect(checkTemporal(pinned, undefined)).toEqual(invalidTemporal);
    expect(checkTemporal(pinned, { recovery: pinned.recovery })).toEqual(invalidTemporal);
    expect(checkTemporal(temporalFixture(), pinned)).toEqual({ status: 'INVALID_DATA', reason: 'BINDING_MISMATCH' });
  });
  it('keeps temporal sidecars out of Wire v1 command bytes, IDs, digests and legacy recovery schema', () => {
    const op = operationDescriptor(metadata, body, digest), before = JSON.stringify(op);
    const originalBytes = canonicalCommandBytes(header(), op.originalBodyDigest), r = recoveryDescriptor(op, 0, body.credentialDigest);
    for (const policy of temporalPolicies.filter(p => p.operation === 'ISSUE_SESSION')) {
      const candidate = temporalFixture(policy); expect(checkTemporal(candidate, temporalFixture(policy)).status).toBe('VALID_DATA');
      expect(operationDescriptor(metadata, body, digest)).toEqual(op);
      expect(canonicalCommandBytes(header(), op.originalBodyDigest)).toEqual(originalBytes);
      expect(() => encodeBusinessBody('ISSUE_SESSION', { ...body, temporal: candidate })).toThrow();
      expect(() => inspectRecoveryDescriptor({ ...r, binding: candidate.binding }, target, digest)).toThrow();
    }
    expect(JSON.stringify(op)).toBe(before);
    expect(checkTemporal({ recovery: op, binding: temporalFixture().binding }, temporalFixture())).toEqual(invalidTemporal);
  });
  it('accepts JSON only as data: fabricated positive DTOs/casts never become production trust or activation', async () => {
    const pinned = temporalFixture(temporalPolicies[2]), json = JSON.parse(JSON.stringify(pinned));
    const result = checkTemporal(json, pinned), value = temporalValue(result);
    // @ts-expect-error Validated metadata has no durable-guarantee provenance brand.
    const notEvidence: VerifiedDurableGuarantees = value;
    for (const fake of [value, result, notEvidence, json, { ...json, approved: true }, json as unknown as VerifiedDurableGuarantees]) {
      expect(() => requireDurableAdmissionGuarantees(fake)).toThrow('DURABLE_ADMISSION_BLOCKED');
      expect(durableAdmissionGate(fake).status).toBe('BLOCKED');
      expect(() => readSignedAssertion(fake, metadata)).toThrow();
      expect(() => readTrustedLoginGrant(fake, metadata, now)).toThrow();
      const remote = composeRemoteDurableAuthentication(fake);
      expect(await remote.startLogin({ temporal: fake })).toEqual({ status: 'BLOCKED', code: 'NOT_CONFIGURED' });
      expect(await remote.authorize({ temporal: fake }, 'USER_MANAGE')).toEqual({ status: 'DENIED' });
    }
    expect(result).not.toHaveProperty('authorized'); expect(value).not.toHaveProperty('sessionCredential');
  });
});
