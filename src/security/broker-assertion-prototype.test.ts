import { expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { BrokerAssertionPrototype } from './broker-assertion-prototype';
import { PermissionService, SecurityBoundary, type User } from './permission-service';
const { createAssertionSigner, assertionSignatureVerifier } = createRequire(import.meta.url)(resolve('prototype/identity/live-broker/security.cjs'));
function setup() {
  let now = 1800000000000;
  const secret = randomBytes(32), issuer = 'https://isolated-broker.invalid', audience = 'isolated-gas-probe-only';
  const tx = { id: 'a'.repeat(64), nonce: 'b'.repeat(64), proofHash: 'c'.repeat(64), expiresAt: now + 120000 };
  const seen = new Set<string>();
  const replay = { consume: vi.fn((id: string, transaction: string) => {
    if (seen.has(id) || seen.has(transaction)) return false; seen.add(id); seen.add(transaction); return true;
  }) };
  const signature = assertionSignatureVerifier(secret);
  const signer = createAssertionSigner({ secret, issuer, audience, now: () => now });
  const assertion = () => signer({ subject: 'isolated-assertion-account', expiresAt: now + 300000,
    transactionId: tx.id, nonce: tx.nonce, proofHash: tx.proofHash });
  const verifier = new BrokerAssertionPrototype(signature, issuer, audience, () => tx, replay, () => now);
  const user: User = { issuer: 'https://accounts.google.com', subject: 'isolated-assertion-account', active: true,
    roles: ['WORKSHOP_MANAGER'], authorizationVersion: 1 };
  const users = { find: () => user };
  return { verifier, signature, signer, assertion, tx, replay, user, users,
    boundary: new SecurityBoundary(verifier, new PermissionService(users, () => now)),
    advance: (ms: number) => { now += ms; } };
}
it('server verifies signed broker assertion then checks current ERP UserRepository; browser never assigns roles', () => {
  const s = setup(), callback = vi.fn(() => 'read-only');
  expect(s.boundary.invoke(s.assertion(), 'REPORT_VIEW', callback)).toBe('read-only');
  expect(callback).toHaveBeenCalledOnce();
});
it.each(['issuer', 'audience', 'nonce', 'transaction', 'proof', 'expiry'] as const)('rejects %s mismatch before ERP callback', mode => {
  const s = setup(), assertion = s.assertion();
  if (mode === 'nonce') s.tx.nonce = 'd'.repeat(64);
  if (mode === 'transaction') s.tx.id = 'd'.repeat(64);
  if (mode === 'proof') s.tx.proofHash = 'd'.repeat(64);
  if (mode === 'expiry') s.advance(20000);
  const verifier = mode === 'issuer' || mode === 'audience'
    ? new BrokerAssertionPrototype(s.signature, mode === 'issuer' ? 'https://other.invalid' : 'https://isolated-broker.invalid',
      mode === 'audience' ? 'other' : 'isolated-gas-probe-only', () => s.tx, s.replay, () => 1800000000000)
    : s.verifier;
  expect(() => verifier.verify(assertion)).toThrow('ACCESS_DENIED'); expect(s.replay.consume).not.toHaveBeenCalled();
});
it('rejects tampering, replay of assertion and a new assertion for an already consumed transaction', () => {
  const s = setup(), assertion = s.assertion();
  const parts = assertion.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), roles: ['ERP_OWNER'] })).toString('base64url');
  expect(() => s.verifier.verify(parts.join('.'))).toThrow('ACCESS_DENIED');
  s.verifier.verify(assertion);
  expect(() => s.verifier.verify(assertion)).toThrow('ACCESS_DENIED');
  expect(() => s.verifier.verify(s.assertion())).toThrow('ACCESS_DENIED');
});
it('revoked/unknown user and workshop BOM permission fail despite a valid broker signature', () => {
  for (const mode of ['inactive', 'unknown', 'BOM'] as const) {
    const s = setup(), callback = vi.fn();
    if (mode === 'inactive') s.user.active = false;
    if (mode === 'unknown') s.user.subject = 'another';
    expect(() => s.boundary.invoke(s.assertion(), mode === 'BOM' ? 'BOM_EDIT' : 'REPORT_VIEW', callback)).toThrow('ACCESS_DENIED');
    expect(callback).not.toHaveBeenCalled();
  }
});
it('unavailable assertion replay store fails closed; no fallback identity', () => {
  const s = setup(); s.replay.consume.mockImplementation(() => { throw Error('store-unavailable'); });
  expect(() => s.verifier.verify(s.assertion())).toThrow('ACCESS_DENIED');
  expect(() => s.verifier.verify({ email: 'owner', roles: ['ERP_OWNER'] })).toThrow('ACCESS_DENIED');
});
