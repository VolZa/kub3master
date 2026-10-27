import { describe, expect, it } from 'vitest';
import { IDENTITY_TTL, type IdentityApplicationContext } from './contracts';
import { matchContext, invalid } from './validation';
import { readTrustedLoginGrant } from './verification';
import { type SigningKeyPolicy, type SigningKeyRule } from './signing-key-policy';
import { durableGrantProjection, restorableGrantProjection, durableAdmissionGate, requireDurableAdmissionGuarantees,
  type DurableGrantProjection, type DurableGrantBinding, type GrantRestorationPort, type RestoredGrantReaderPort,
  type TrustedRestoredGrant, type VerifiedDurableGuarantees } from './durable-store-contracts';

const now = 1_800_000_000_000, id = (c: string) => c.repeat(64);
const context: IdentityApplicationContext = { environment: 'TEST', applicationAudience: 'kub:admin:test',
  expectedScriptId: 'synthetic-admin-test-script-000000001' };
const binding: DurableGrantBinding = { ...context, grantId: id('a'), transactionId: id('a'), assertionId: id('b'),
  expectedRevision: 0, identityIssuer: 'https://accounts.google.com', identitySubject: 'synthetic-visitor' };
const initial: DurableGrantProjection = { ...context, schemaVersion: 1, grantId: binding.grantId,
  transactionId: binding.transactionId, assertionId: binding.assertionId, revision: 0, status: 'AVAILABLE', consumedAt: null,
  identityIssuer: binding.identityIssuer, identitySubject: binding.identitySubject, authenticatedAt: now - 1000,
  authenticationExpiresAt: now - 1000 + IDENTITY_TTL.authenticationMaxAgeMs, issuedAt: now, expiresAt: now + IDENTITY_TTL.grantMs,
  signingKey: { protocolVersion: 1, brokerIssuer: 'https://broker.invalid', keyId: 'synthetic-key-v1', algorithm: 'RS256',
    assertionId: binding.assertionId, assertionIssuedAt: now - 100 } };

// SYNTHETIC AUTHORITATIVE STORE/READER ONLY IN THIS TEST FILE. No production provenance factory.
const construction = Object.freeze({});
class TestGrantEvidence {
  readonly #owner: object;
  constructor(token: unknown, owner: object, readonly snapshot: Readonly<DurableGrantProjection>) {
    if (token !== construction) invalid(); this.#owner = owner; Object.freeze(this);
  }
  static read(value: unknown, owner: object): Readonly<DurableGrantProjection> {
    if (!value || typeof value !== 'object' || !(#owner in value) || value.#owner !== owner) return invalid(); return value.snapshot;
  }
}
function fixture() {
  let time = now, current: Readonly<DurableGrantProjection> = durableGrantProjection(initial, binding), available = true;
  let rule: SigningKeyRule = { ...context, keyId: initial.signingKey.keyId, algorithm: 'RS256', signingNotBefore: now - 10_000,
    signingNotAfter: now + 100_000, verificationNotBefore: now - 10_000, verificationNotAfter: now + 200_000,
    status: 'ACTIVE', revokedAt: null, compromised: false };
  const policy = (): SigningKeyPolicy => ({ version: 1, brokerIssuer: initial.signingKey.brokerIssuer, keys: [rule] });
  const owner = Object.freeze({});
  const checked = (b: DurableGrantBinding) => {
    if (!available) throw Error('SYNTHETIC_STORE_UNAVAILABLE');
    matchContext(b, context);
    // Independent authoritative transaction/acceptance linkage, never copied from caller's DTO.
    if (b.grantId !== binding.grantId || b.transactionId !== binding.transactionId || b.assertionId !== binding.assertionId ||
      b.identityIssuer !== binding.identityIssuer || b.identitySubject !== binding.identitySubject || current.expiresAt > now + 119_000) return invalid();
    return restorableGrantProjection(current, b, policy(), time);
  };
  const restore: GrantRestorationPort = { restore: async b => {
    await Promise.resolve();
    if (!available) return { status: 'UNAVAILABLE' };
    try { checked(b); return { status: 'RESTORED', grant: new TestGrantEvidence(construction, owner, current) as unknown as TrustedRestoredGrant }; }
    catch { return { status: 'BLOCKED' }; }
  } };
  const reader: RestoredGrantReaderPort = { read: async (proof, b) => {
    await Promise.resolve(); const snapshot = TestGrantEvidence.read(proof, owner);
    if (snapshot !== current) return invalid(); return checked(b);
  } };
  return { restore, reader, policy, setTime: (value: number) => { time = value; }, setAvailable: (value: boolean) => { available = value; },
    replace: (value: DurableGrantProjection) => { current = value; }, setKey: (value: Partial<SigningKeyRule>) => { rule = { ...rule, ...value }; } };
}

describe('durable grant projection (data validation is not provenance)', () => {
  it('validates serializable historical facts, freezes nested data, and never creates a legacy trusted grant', () => {
    const dto = durableGrantProjection(JSON.parse(JSON.stringify(initial)), binding);
    expect(dto).toEqual(initial); expect(Object.isFrozen(dto)).toBe(true); expect(Object.isFrozen(dto.signingKey)).toBe(true);
    expect(() => readTrustedLoginGrant(dto, context, now)).toThrow();
    expect(() => readTrustedLoginGrant({ kind: 'TRUSTED_LOGIN_GRANT', data: dto } as any, context, now)).toThrow();
  });
  it.each(['identityIssuer', 'identitySubject', 'authenticatedAt', 'authenticationExpiresAt', 'grantId', 'transactionId',
    'assertionId', 'revision', 'signingKey', 'schemaVersion'])(
    'rejects missing mandatory field %s', field => {
      const dto: any = { ...initial }; delete dto[field]; expect(() => durableGrantProjection(dto, binding)).toThrow();
    });
  it('preserves the existing deterministic grant ID even when a caller supplies a matching but inconsistent binding', () => {
    expect(() => durableGrantProjection({ ...initial, grantId: id('c') }, { ...binding, grantId: id('c') })).toThrow();
  });
  it.each(['environment', 'expectedScriptId', 'applicationAudience'] as const)('rejects wrong %s', field => {
    const other = field === 'environment' ? 'PRODUCTION' : 'synthetic-other-context-000000001';
    expect(() => durableGrantProjection({ ...initial, [field]: other }, binding)).toThrow();
  });
  it.each([{ identityIssuer: 'https://evil.invalid' }, { identitySubject: 'another-valid-subject' }, { identitySubject: '' },
    { identitySubject: 'subject with spaces' }, { grantId: id('c') }, { transactionId: id('c') }, { assertionId: id('c') },
    { revision: 1 }, { revision: -1 }, { revision: 1.5 }, { schemaVersion: 2 }])('rejects identity/link/revision/schema mismatch (%#)', change => {
    expect(() => durableGrantProjection({ ...initial, ...change }, binding)).toThrow();
  });
  it.each(['sessionCredential', 'browserProof', 'oauthCode', 'privateSigningKey', 'roles', 'permissions', 'email'])(
    'rejects forbidden/unknown field %s', field => expect(() => durableGrantProjection({ ...initial, [field]: 'DO_NOT_STORE' }, binding)).toThrow());
  it.each(['authenticatedAt', 'authenticationExpiresAt', 'issuedAt', 'expiresAt'] as const)('rejects invalid timestamp %s', field => {
    for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '1800000000000'])
      expect(() => durableGrantProjection({ ...initial, [field]: value }, binding)).toThrow();
  });
  it('preserves grant/upstream caps and lifecycle without requiring a live original assertion', () => {
    const f = fixture(); expect(restorableGrantProjection(initial, binding, f.policy(), now + 25_000)).toEqual(initial);
    for (const change of [{ expiresAt: initial.expiresAt + 1 }, { authenticationExpiresAt: initial.expiresAt - 1 },
      { authenticatedAt: now + 1 }, { status: 'UNKNOWN' }, { consumedAt: now + 1 }])
      expect(() => durableGrantProjection({ ...initial, ...change }, binding)).toThrow();
    const consumed = { ...initial, revision: 1, status: 'CONSUMED' as const, consumedAt: now + 1 }, b = { ...binding, expectedRevision: 1 };
    expect(durableGrantProjection(consumed, b)).toEqual(consumed);
    expect(() => restorableGrantProjection(consumed, b, f.policy(), now + 2)).toThrow();
    expect(() => restorableGrantProjection(initial, binding, f.policy(), initial.expiresAt)).toThrow();
    expect(() => restorableGrantProjection(initial, binding, f.policy(), now - 1)).toThrow();
  });
  it('binds signing metadata and applies fresh issuer/key policy', () => {
    const f = fixture();
    for (const change of [{ protocolVersion: 2 }, { algorithm: 'HS256' }, { assertionId: id('c') },
      { assertionIssuedAt: now + 1 }, { keyId: '' }])
      expect(() => durableGrantProjection({ ...initial, signingKey: { ...initial.signingKey, ...change } }, binding)).toThrow();
    f.setKey({ revokedAt: now, status: 'REVOKED' }); expect(() => restorableGrantProjection(initial, binding, f.policy(), now)).toThrow();
    expect(() => restorableGrantProjection(initial, binding, { ...fixture().policy(), brokerIssuer: 'https://other.invalid' }, now)).toThrow();
  });
});

describe('reviewed restoration port contracts (synthetic local fixtures only)', () => {
  it('awaits restoration and current private-owner reads without minting runtime production evidence', async () => {
    const f = fixture(), pending = f.restore.restore(binding); expect(pending).toBeInstanceOf(Promise);
    const result = await pending; if (result.status !== 'RESTORED') throw Error('fixture');
    expect(await f.reader.read(result.grant, binding)).toEqual(initial);
    expect(() => readTrustedLoginGrant(result.grant, context, now)).toThrow();
  });
  it('rejects casts, JSON, copied/prototyped/foreign capabilities and constructor abuse', async () => {
    const f = fixture(), result = await f.restore.restore(binding); if (result.status !== 'RESTORED') throw Error('fixture');
    for (const fake of [{ ...result.grant }, JSON.parse(JSON.stringify(result.grant)), Object.create(result.grant),
      initial as unknown as TrustedRestoredGrant, { verified: true, record: initial }])
      await expect(f.reader.read(fake, binding)).rejects.toThrow();
    await expect(fixture().reader.read(result.grant, binding)).rejects.toThrow();
    expect(() => new (result.grant.constructor as any)({}, {}, initial)).toThrow();
    await expect(f.reader.read(result.grant, { ...binding, environment: 'PRODUCTION' })).rejects.toThrow();
    await expect(f.reader.read(result.grant, { ...binding, expectedRevision: 1 })).rejects.toThrow();
  });
  it.each(['unavailable', 'expired', 'revoked', 'compromised', 'consumed', 'inactive-binding'])(
    'rechecks authoritative state/policy for %s after evidence creation', async change => {
      const f = fixture(), result = await f.restore.restore(binding); if (result.status !== 'RESTORED') throw Error('fixture');
      if (change === 'unavailable') f.setAvailable(false);
      if (change === 'expired') f.setTime(initial.expiresAt);
      if (change === 'revoked') f.setKey({ status: 'REVOKED', revokedAt: now });
      if (change === 'compromised') f.setKey({ compromised: true });
      if (change === 'consumed') f.replace({ ...initial, revision: 1, status: 'CONSUMED', consumedAt: now + 1 });
      const b = change === 'inactive-binding' ? { ...binding, identitySubject: 'another-user' } : binding;
      await expect(f.reader.read(result.grant, b)).rejects.toThrow();
    });
  it('blocks unavailable or misbound restore calls before creating evidence', async () => {
    const f = fixture(); f.setAvailable(false); expect(await f.restore.restore(binding)).toEqual({ status: 'UNAVAILABLE' });
    f.setAvailable(true); expect(await f.restore.restore({ ...binding, identitySubject: 'another-user' })).toEqual({ status: 'BLOCKED' });
  });
});

describe('remote durable admission has no approved positive capability issuer', () => {
  it.each([undefined, null, true, {}, { supported: true }, { expiryAtCommit: 'STRICT', verified: true },
    { expiryAtCommit: 'VERIFIED', clock: 'PROVEN', restoration: 'TRUSTED' }])('rejects unsupported or forged guarantee evidence (%#)', value => {
      expect(() => requireDurableAdmissionGuarantees(value as VerifiedDurableGuarantees)).toThrow('DURABLE_ADMISSION_BLOCKED');
      const gate = durableAdmissionGate(value); expect(gate.status).toBe('BLOCKED'); expect(Object.isFrozen(gate)).toBe(true);
      expect(gate.expiryAtCommit).toBe('UNVERIFIED'); expect(gate.authoritativeClock).toBe('UNVERIFIED');
      expect(gate).not.toHaveProperty('databaseCommittedAt');
    });
});
