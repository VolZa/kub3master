import { expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { LoginBridgePrototype, bridgeReadyMessage } from './login-bridge-prototype';
import { IdentityPrototype, type LoginChallenge } from './identity-prototype';
import { SessionPrototype, type SessionRecord } from './session-prototype';

function setup() {
  let now = 1800000000000, brokerUsed = false, pending = false;
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const proof = randomBytes(32).toString('hex'), rows = new Map<string, LoginChallenge>();
  const challengeStore = {
    issue(binding: string) { const c = { id: randomBytes(32).toString('hex'), nonce: randomBytes(32).toString('hex'), binding, expiresAt: now + 120000 }; rows.set(c.id, c); return c; },
    read: (id: string) => rows.get(id),
    consume(id: string, binding: string, nonce: string, time: number) {
      const c = rows.get(id); if (!c || c.binding !== binding || c.nonce !== nonce || c.expiresAt <= time) return false;
      rows.delete(id); return true;
    },
  };
  let brokerTransaction: { id: string; nonce: string; proofHash: string }, subject = 'bridge-offline-owner', invalid = false;
  const verifier = { verify(credential: string) {
    if (invalid || credential !== 'server-only-google-token-fixture') throw Error('ACCESS_DENIED');
    return { iss: 'https://accounts.google.com', aud: 'bridge-offline-client', sub: subject, nonce: brokerTransaction.nonce, exp: now / 1000 + 300 };
  } };
  const identity = new IdentityPrototype(challengeStore, verifier, 'bridge-offline-client', () => now);
  const records = new Map<string, SessionRecord>();
  const sessions = new SessionPrototype({ find: (iss, sub) => ['bridge-offline-owner', 'bridge-offline-manager'].includes(sub) ? {
    issuer: iss, subject: sub, active: true, roles: [sub === 'bridge-offline-owner' ? 'ERP_OWNER' : 'WORKSHOP_MANAGER'], authorizationVersion: 1,
  } : undefined }, { create: (k, v) => { records.set(k, v); }, read: k => records.get(k), revoke: k => { records.delete(k); } },
  { create() {}, consume: () => false }, { secret: () => randomBytes(32).toString('hex'), sha256: hash }, () => now);
  const redeem = vi.fn((id: string, p: string) => {
    if (id !== brokerTransaction.id || hash(p) !== brokerTransaction.proofHash || brokerUsed) throw Error('ACCESS_DENIED');
    if (pending) return undefined; brokerUsed = true; return 'server-only-google-token-fixture';
  });
  const bridge = new LoginBridgePrototype(challengeStore, identity, sessions, { begin: t => { brokerTransaction = t; }, redeem }, hash, () => now);
  const transaction = bridge.begin(hash(proof));
  return { bridge, proof, transaction, redeem, records, rows, expire: () => { now += 120000; },
    pending: (v: boolean) => { pending = v; }, invalid: () => { invalid = true; }, subject: (v: string) => { subject = v; } };
}
it.each(['bridge-offline-owner', 'bridge-offline-manager'])('composes existing controller/session for %s without returning Google token or roles', sub => {
  const s = setup(); s.subject(sub);
  const result = s.bridge.complete(s.transaction.transactionId, s.proof);
  expect(result.status).toBe('OK'); expect(s.records.size).toBe(1);
  expect([...s.records.values()][0].subject).toBe(sub);
  expect(JSON.stringify(result)).not.toMatch(/server-only|roles|issuer|subject/);
  expect(() => s.bridge.complete(s.transaction.transactionId, s.proof)).toThrow('ACCESS_DENIED');
  expect(s.redeem).toHaveBeenCalledOnce();
});
it.each(['wrong-proof', 'expired', 'other-transaction'] as const)('rejects %s before broker/network', mode => {
  const s = setup(); if (mode === 'expired') s.expire();
  expect(() => s.bridge.complete(mode === 'other-transaction' ? 'attacker' : s.transaction.transactionId,
    mode === 'wrong-proof' ? 'f'.repeat(64) : s.proof)).toThrow('ACCESS_DENIED');
  expect(s.redeem).not.toHaveBeenCalled(); expect(s.records.size).toBe(0);
});
it('pending never issues identity or consumes local challenge; polling is bounded by challenge TTL', () => {
  const s = setup(); s.pending(true);
  expect(s.bridge.complete(s.transaction.transactionId, s.proof)).toEqual({ status: 'PENDING' });
  expect(s.records.size).toBe(0); expect(s.rows.size).toBe(1);
  s.expire(); expect(() => s.bridge.complete(s.transaction.transactionId, s.proof)).toThrow('ACCESS_DENIED');
});
it.each(['forged-token', 'unknown-user'] as const)('fails closed for %s without owner fallback', mode => {
  const s = setup(); if (mode === 'forged-token') s.invalid(); else s.subject('unregistered');
  expect(() => s.bridge.complete(s.transaction.transactionId, s.proof)).toThrow('ACCESS_DENIED');
  expect(s.records.size).toBe(0);
});
it('postMessage origin/source/transaction are all exact; a browser identity assertion is not a bridge-ready event', () => {
  const popup = {}, origin = 'https://login.erbes.com.ua', id = 'transaction';
  const valid = { origin, source: popup, data: { type: 'KUB_BRIDGE_READY', transactionId: id } };
  expect(bridgeReadyMessage(valid, origin, popup, id)).toBe(true);
  for (const event of [{ ...valid, origin: origin + '.attacker.test' }, { ...valid, source: {} },
    { ...valid, data: { type: 'KUB_BRIDGE_READY', transactionId: 'other' } },
    { ...valid, data: { ...valid.data, roles: ['ERP_OWNER'] } }]) expect(bridgeReadyMessage(event, origin, popup, id)).toBe(false);
  expect(bridgeReadyMessage(valid, '*', popup, id)).toBe(false);
});
