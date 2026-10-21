import { expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { IdentityPrototype, type ChallengeStore, type LoginChallenge } from './identity-prototype';
import { PermissionService, SecurityBoundary, securedHandler, unconfiguredIdentityVerifier, type User } from './permission-service';
const { createVerifier } = createRequire(import.meta.url)(resolve('prototype/identity/google-token-verifier.cjs'));
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const now = 1800000000000;
const claims = { iss: 'https://accounts.google.com', aud: 'offline-client', sub: 'google-account-A', iat: now / 1000, exp: now / 1000 + 300, nonce: 'server-nonce' };
function token(change: Record<string, unknown> = {}, header: any = { alg: 'RS256', kid: 'trusted' }, key = pair.privateKey) {
  const input = [header, { ...claims, ...change }].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), key).toString('base64url');
}
function setup() {
  const records = new Map<string, LoginChallenge>(); let counter = 0;
  const challenges: ChallengeStore = {
    issue(binding) { const c = { id: String(++counter), nonce: randomBytes(32).toString('hex'), binding, expiresAt: now + 60000 }; records.set(c.id, c); return c; },
    read: id => records.get(id),
    consume(id, binding, nonce, time) { const c = records.get(id); if (!c || c.binding !== binding || c.nonce !== nonce || c.expiresAt <= time) return false; records.delete(id); return true; },
  };
  const verifier = createVerifier({ audience: 'offline-client', keys: { trusted: publicKey }, now: () => now });
  const prototype = new IdentityPrototype(challenges, verifier, 'offline-client', () => now);
  const binding = 'a'.repeat(64), challenge = prototype.begin(binding);
  const identity = () => prototype.complete(challenge.challengeId, binding, token({ nonce: challenge.nonce }));
  return { verifier, prototype, binding, challenge, identity, records };
}
it('verifies real offline RSA signature and keeps identities of two accounts distinct (not a live Google login)', () => {
  const a = setup(), b = setup();
  expect(a.identity().subject).toBe('google-account-A');
  expect(b.prototype.complete(b.challenge.challengeId, b.binding, token({ nonce: b.challenge.nonce, sub: 'google-account-B' })).subject).toBe('google-account-B');
});
it.each([
  { iss: 'https://attacker.example' }, { aud: 'other-client' }, { exp: now / 1000 }, { sub: '' }, { iat: now / 1000 + 10000 },
])('rejects invalid signed claims %j', change => { expect(() => setup().verifier.verify(token(change))).toThrow('ACCESS_DENIED'); });
it('rejects invalid, forged, unsigned and unknown-key tokens', () => {
  const s = setup(); const rogue = generateKeyPairSync('rsa', { modulusLength: 2048 });
  for (const value of ['', 'not.jwt', token({}, { alg: 'none', kid: 'trusted' }), token({}, { alg: 'HS256', kid: 'trusted' }),
    token({}, { alg: 'RS256', kid: 'other' }), token({}, undefined, rogue.privateKey), token() + 'tamper']) {
    expect(() => s.verifier.verify(value)).toThrow('ACCESS_DENIED');
  }
});
it('binds nonce and browser challenge, rejects replay and expired challenge', () => {
  const s = setup();
  expect(() => s.prototype.complete(s.challenge.challengeId, 'b'.repeat(64), token({ nonce: s.challenge.nonce }))).toThrow('ACCESS_DENIED');
  expect(() => s.prototype.complete(s.challenge.challengeId, s.binding, token({ nonce: 'wrong' }))).toThrow('ACCESS_DENIED');
  s.identity(); expect(() => s.identity()).toThrow('ACCESS_DENIED');
  const t = setup(); t.records.get(t.challenge.challengeId)!.expiresAt = now;
  expect(() => t.identity()).toThrow('ACCESS_DENIED');
});
it('default denies anonymous, unknown, inactive and fabricated identity objects', () => {
  const identity = setup().identity(); const repository = { find: vi.fn((): User | undefined => undefined) };
  const permissions = new PermissionService(repository, () => now);
  for (const value of [undefined, JSON.parse(JSON.stringify(identity)), identity]) expect(() => permissions.require(value, 'REPORT_SAVE')).toThrow('ACCESS_DENIED');
  repository.find.mockReturnValue({ issuer: identity.issuer, subject: identity.subject, active: false, roles: ['ERP_OWNER'], authorizationVersion: 1 });
  expect(() => permissions.require(identity, 'BOM_EDIT')).toThrow('ACCESS_DENIED');
});
it('grants both report roles, restricts BOM/technology/users, and rechecks revoked roles each call', () => {
  const identity = setup().identity();
  const user: User = { issuer: identity.issuer, subject: identity.subject, active: true, roles: ['WORKSHOP_MANAGER'], authorizationVersion: 1 };
  const permissions = new PermissionService({ find: () => user }, () => now);
  for (const permission of ['REPORT_GENERATE', 'REPORT_VIEW', 'REPORT_SAVE', 'REPORT_LIST', 'REPORT_RENAME', 'REPORT_DELETE'] as const) expect(() => permissions.require(identity, permission)).not.toThrow();
  for (const permission of ['BOM_EDIT', 'TECHNOLOGY_EDIT', 'USER_MANAGE'] as const) expect(() => permissions.require(identity, permission)).toThrow('ACCESS_DENIED');
  user.roles = ['ERP_OWNER']; expect(() => permissions.require(identity, 'BOM_EDIT')).not.toThrow();
  user.roles = []; user.authorizationVersion++; expect(() => permissions.require(identity, 'REPORT_SAVE')).toThrow('ACCESS_DENIED');
  user.roles = ['ERP_OWNER']; user.active = false; expect(() => permissions.require(identity, 'REPORT_SAVE')).toThrow('ACCESS_DENIED');
});
it('direct handler invocation cannot bypass boundary with forged browser email or roles', () => {
  const effects = vi.fn();
  const boundary = new SecurityBoundary(unconfiguredIdentityVerifier, new PermissionService({ find: () => undefined }, () => now));
  const handler = securedHandler(boundary, 'REPORT_DELETE', effects);
  expect(() => handler({ credential: { email: 'owner@example.com', roles: ['ERP_OWNER'] }, payload: {} })).toThrow('ACCESS_DENIED');
  expect(effects).not.toHaveBeenCalled();
});
it('enforces expiry even after successful identity verification', () => {
  const identity = setup().identity();
  const permissions = new PermissionService({ find: () => ({ issuer: identity.issuer, subject: identity.subject, active: true, roles: ['ERP_OWNER'], authorizationVersion: 1 }) }, () => now + 301000);
  expect(() => permissions.require(identity, 'REPORT_SAVE')).toThrow('ACCESS_DENIED');
});

it('ERP_OWNER has all currently defined permissions; future TECHNOLOGIST has no implicit grants', () => {
  const identity = setup().identity();
  const user: User = { issuer: identity.issuer, subject: identity.subject, active: true, roles: ['ERP_OWNER'], authorizationVersion: 1 };
  const permissions = new PermissionService({ find: () => user }, () => now);
  const all = ['REPORT_GENERATE', 'REPORT_VIEW', 'REPORT_SAVE', 'REPORT_LIST', 'REPORT_RENAME', 'REPORT_DELETE', 'BOM_EDIT', 'TECHNOLOGY_EDIT', 'USER_MANAGE'] as const;
  for (const permission of all) expect(() => permissions.require(identity, permission)).not.toThrow();
  user.roles = ['TECHNOLOGIST']; user.authorizationVersion++;
  for (const permission of all) expect(() => permissions.require(identity, permission)).toThrow('ACCESS_DENIED');
});

it('Google file-owner/deployer labels do not confer ERP_OWNER', () => {
  const identity = setup().identity();
  for (const label of ['GOOGLE_DRIVE_OWNER', 'USER_DEPLOYING']) {
    const user = { issuer: identity.issuer, subject: identity.subject, active: true, roles: [label], authorizationVersion: 1 };
    const permissions = new PermissionService({ find: () => user as unknown as User }, () => now);
    expect(() => permissions.require(identity, 'USER_MANAGE')).toThrow('ACCESS_DENIED');
  }
});
