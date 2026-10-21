import { expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { SessionPrototype, type SessionRecord, type RequestTicket } from './session-prototype';
import { PropertyUserRepository } from './property-user-repository';
import { IdentityPrototype } from './identity-prototype';
import { verifiedIdentity, type User } from './permission-service';

function setup() {
  let now = 1800000000000;
  const user: User = { issuer: 'https://accounts.google.com', subject: 'session-offline-A', active: true, roles: ['ERP_OWNER'], authorizationVersion: 1 };
  const sessions = new Map<string, SessionRecord>(), tickets = new Map<string, RequestTicket>();
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const service = new SessionPrototype({ find: (iss, sub) => iss === user.issuer && sub === user.subject ? user : undefined }, {
    create(key, value) { if (sessions.has(key)) throw Error('collision'); sessions.set(key, value); },
    read: key => sessions.get(key), revoke: key => { sessions.delete(key); },
  }, {
    create(key, value) { if (tickets.has(key)) throw Error('collision'); tickets.set(key, value); },
    consume(key, expected, time) {
      const row = tickets.get(key);
      if (!row || row.expiresAt <= time || JSON.stringify(row) !== JSON.stringify(expected)) return false;
      tickets.delete(key); return true;
    },
  }, { secret: () => randomBytes(32).toString('hex'), sha256: hash }, () => now);
  const identity = verifiedIdentity(user.issuer, user.subject, now + 3600_000);
  const login = () => service.issue(identity);
  const payloadHash = hash('fixed-handler|canonical-payload');
  const prepare = () => { const loginResult = login(); return { ...loginResult, ...service.ticket(loginResult.session, 'REPORT_SAVE', payloadHash) }; };
  return { service, user, sessions, tickets, hash, identity, login, prepare, payloadHash, advance: (ms: number) => { now += ms; } };
}
it('issues opaque hash-stored session, caps lifetime, and authorizes a single-use payload-bound request', () => {
  const s = setup(), p = s.prepare(), effect = vi.fn();
  expect([...s.sessions.keys()]).toEqual([s.hash(p.session)]);
  expect([...s.sessions.values()][0].expiresAt).toBe(1800000000000 + 900_000);
  expect([...s.sessions.values()][0]).not.toHaveProperty('roles');
  s.service.invoke(p.session, p.ticket, p.expiresAt, 'REPORT_SAVE', s.payloadHash, effect);
  expect(effect).toHaveBeenCalledOnce();
  expect(() => s.service.invoke(p.session, p.ticket, p.expiresAt, 'REPORT_SAVE', s.payloadHash, effect)).toThrow('ACCESS_DENIED');
  expect(effect).toHaveBeenCalledOnce();
});
it.each(['expired', 'inactive', 'version', 'role', 'logout', 'unknown'] as const)('denies %s session before operation', mode => {
  const s = setup(), p = s.prepare(), effect = vi.fn();
  if (mode === 'expired') s.advance(900_000);
  if (mode === 'inactive') s.user.active = false;
  if (mode === 'version') s.user.authorizationVersion++;
  if (mode === 'role') s.user.roles = ['TECHNOLOGIST'];
  if (mode === 'logout') s.service.logout(p.session);
  const session = mode === 'unknown' ? 'b'.repeat(64) : p.session;
  expect(() => s.service.invoke(session, p.ticket, p.expiresAt, 'REPORT_SAVE', s.payloadHash, effect)).toThrow('ACCESS_DENIED');
  expect(effect).not.toHaveBeenCalled();
});
it('rejects fabricated identity and role claims; workshop receives reporting only', () => {
  const s = setup();
  expect(() => s.service.issue(JSON.parse(JSON.stringify(s.identity)))).toThrow('ACCESS_DENIED');
  s.user.roles = ['WORKSHOP_MANAGER']; const p = s.prepare();
  expect(() => s.service.ticket(p.session, 'BOM_EDIT', s.payloadHash)).toThrow('ACCESS_DENIED');
  expect(() => s.service.ticket({ session: p.session, roles: ['ERP_OWNER'] }, 'REPORT_SAVE', s.payloadHash)).toThrow('ACCESS_DENIED');
});
it('rejects payload/permission/ticket substitution, ticket expiry and cross-session use', () => {
  const s = setup(), p = s.prepare(), other = s.login(); const effect = vi.fn();
  for (const [session, ticket, permission, hash] of [
    [other.session, p.ticket, 'REPORT_SAVE', s.payloadHash], [p.session, p.ticket, 'REPORT_DELETE', s.payloadHash],
    [p.session, p.ticket, 'REPORT_SAVE', 'c'.repeat(64)], [p.session, 'd'.repeat(64), 'REPORT_SAVE', s.payloadHash],
  ] as const) expect(() => s.service.invoke(session, ticket, p.expiresAt, permission, hash, effect)).toThrow('ACCESS_DENIED');
  s.advance(60_000);
  expect(() => s.service.invoke(p.session, p.ticket, p.expiresAt, 'REPORT_SAVE', s.payloadHash, effect)).toThrow('ACCESS_DENIED');
  expect(effect).not.toHaveBeenCalled();
});
it('consumes before operation failure; no automatic retry and concurrent distinct tickets remain independent', () => {
  const s = setup(), p = s.prepare(), second = s.service.ticket(p.session, 'REPORT_SAVE', s.payloadHash);
  const effect = vi.fn(() => { throw Error('write-outcome-unknown'); });
  expect(() => s.service.invoke(p.session, p.ticket, p.expiresAt, 'REPORT_SAVE', s.payloadHash, effect)).toThrow('write-outcome-unknown');
  expect(() => s.service.invoke(p.session, p.ticket, p.expiresAt, 'REPORT_SAVE', s.payloadHash, effect)).toThrow('ACCESS_DENIED');
  expect(s.service.invoke(p.session, second.ticket, second.expiresAt, 'REPORT_SAVE', s.payloadHash, () => 'independent')).toBe('independent');
  expect(effect).toHaveBeenCalledOnce();
});
it('reuses existing challenge controller: invalid token creates no session; challenge cannot be reused', () => {
  const s = setup(); let consumed = false;
  const challenge = { id: 'one', binding: 'a'.repeat(64), nonce: 'nonce', expiresAt: 1800000060000 };
  const controller = new IdentityPrototype({ issue: () => challenge, read: () => consumed ? undefined : challenge,
    consume: () => { if (consumed) return false; consumed = true; return true; } }, {
    verify(token) { if (token !== 'isolated-verified-fixture') throw Error('invalid-signature');
      return { iss: s.user.issuer, sub: s.user.subject, aud: 'isolated-client', exp: 1800000300, nonce: 'nonce' }; },
  }, 'isolated-client', () => 1800000000000);
  expect(() => s.service.login(controller, 'one', challenge.binding, 'forged')).toThrow('ACCESS_DENIED');
  expect(s.sessions.size).toBe(0);
  s.service.login(controller, 'one', challenge.binding, 'isolated-verified-fixture');
  expect(() => s.service.login(controller, 'one', challenge.binding, 'isolated-verified-fixture')).toThrow('ACCESS_DENIED');
  expect(s.sessions.size).toBe(1);
});
it('directory reads stable subject, never grants by email, and returns immutable roles', () => {
  const s = setup(), row = { ...s.user, email: 'informational@example.invalid' };
  const repo = new PropertyUserRepository({ getProperty: () => JSON.stringify({ version: 1, users: [row] }) });
  expect(repo.find(s.user.issuer, s.user.subject)?.roles).toEqual(['ERP_OWNER']);
  expect(repo.find(s.user.issuer, row.email)).toBeUndefined();
  expect(Object.isFrozen(repo.find(s.user.issuer, s.user.subject)?.roles)).toBe(true);
});
it.each(['duplicate', 'role', 'version', 'malformed'] as const)('fails closed for %s directory', kind => {
  const s = setup(), row = { ...s.user, email: 'info@example.invalid' };
  const doc = { version: 1, users: kind === 'duplicate' ? [row, row] : [row] };
  if (kind === 'role') row.roles = ['BROWSER_OWNER'] as any;
  if (kind === 'version') row.authorizationVersion = NaN;
  const repo = new PropertyUserRepository({ getProperty: () => kind === 'malformed' ? '{' : JSON.stringify(doc) });
  expect(() => repo.find(s.user.issuer, s.user.subject)).toThrow('ACCESS_DENIED');
});
