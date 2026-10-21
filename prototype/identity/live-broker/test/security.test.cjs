'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, randomBytes, createHmac } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { createGoogleVerifier, createChannelGuard, createAssertionSigner, assertionSignatureVerifier, hash } = require('../security.cjs');
const { createBroker } = require('../broker.cjs');
const { createServer } = require('../server.cjs');
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }), now = () => Date.now();
const clientId = 'isolated-probe.apps.googleusercontent.com', nonce = 'a'.repeat(64);
function jwt(change = {}, header = { alg: 'RS256', kid: 'fixture' }, privateKey = pair.privateKey) {
  const claims = { iss: 'https://accounts.google.com', aud: clientId, sub: 'offline-only-probe-user',
    iat: Math.floor(now() / 1000) - 1, exp: Math.floor(now() / 1000) + 300, nonce, ...change };
  const input = [header, claims].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
}
function oauth() {
  const c = new OAuth2Client(clientId);
  c.getFederatedSignonCertsAsync = async () => ({ certs: { fixture: pair.publicKey.export({ type: 'spki', format: 'pem' }) } });
  return c;
}
test('maintained Google library verifies actual RSA fixture signature, not a live Google login', async () => {
  const v = createGoogleVerifier({ clientId, client: oauth() });
  assert.equal((await v.verify(jwt(), nonce)).subject, 'offline-only-probe-user');
});
for (const [label, token] of [
  ['wrong-audience', jwt({ aud: 'attacker' })], ['wrong-issuer', jwt({ iss: 'https://attacker.test' })],
  ['expired', jwt({ exp: Math.floor(now() / 1000) - 1000 })], ['nonce', jwt({ nonce: 'b'.repeat(64) })],
  ['subject', jwt({ sub: '' })], ['azp', jwt({ azp: 'other' })], ['algorithm', jwt({}, { alg: 'none', kid: 'fixture' })],
  ['forged-signature', jwt().slice(0, -20) + 'x'.repeat(20)], ['malformed', 'not.a.token'],
]) test('rejects ' + label, async () => assert.rejects(createGoogleVerifier({ clientId, client: oauth() }).verify(token, nonce)));
test('private channel authenticates exact bytes/path/time and atomically rejects replay', async () => {
  const secret = randomBytes(32), seen = new Set(), clock = 1800000000000;
  const guard = createChannelGuard({ secret, now: () => clock, replay: { async consume(id) { if (seen.has(id)) return false; seen.add(id); return true; } } });
  const r = { method: 'POST', path: '/private/begin', timestamp: String(clock), requestId: 'c'.repeat(64), body: Buffer.from('{}') };
  r.mac = createHmac('sha256', secret).update([r.method, r.path, r.timestamp, r.requestId, hash(r.body)].join('\n')).digest('hex');
  await assert.rejects(guard({ ...r, body: Buffer.from('{ }') }));
  await assert.rejects(guard({ ...r, path: '/private/redeem' }));
  await assert.rejects(guard({ ...r, timestamp: String(clock - 31000) }));
  await guard(r); await assert.rejects(guard(r));
});
test('assertions carry no roles, have a fresh ID and cannot survive signature tampering', () => {
  const secret = randomBytes(32), signer = createAssertionSigner({ secret, issuer: 'https://broker.test', audience: 'isolated-gas-probe' });
  const assertion = signer({ subject: 'subject', expiresAt: now() + 60000, transactionId: nonce, nonce, proofHash: nonce });
  const c = assertionSignatureVerifier(secret).verify(assertion);
  assert.equal(c.aud, 'isolated-gas-probe'); assert.equal(c.sub, 'subject'); assert.equal(c.exp - c.iat, 20); assert.equal(c.roles, undefined);
  assert.throws(() => assertionSignatureVerifier(randomBytes(32)).verify(assertion));
});
function brokerFixture() {
  // Test-only serial atomic store. Deliberately never exported to runtime composition.
  const records = new Map();
  const store = { async createOnce(id, v) { if (records.has(id)) throw Error(); records.set(id, v); },
    async read(id) { return records.get(id); },
    async transition(id, phase, fn) { const row = records.get(id); if (!row || row.phase !== phase) throw Error(); const updated = fn(row); records.set(id, updated); return updated; } };
  const c = oauth(); let accepted = true, codeExchanges = 0;
  c.getToken = async () => { codeExchanges++; return { tokens: { id_token: jwt() } }; };
  const signer = createAssertionSigner({ secret: randomBytes(32), issuer: 'https://broker.test', audience: 'isolated-gas-probe' });
  const broker = createBroker({ store, oauth: c, clientId, redirectUri: 'https://broker.test/oauth/callback',
    users: { isActive: async () => accepted }, signAssertion: signer });
  const id = 'b'.repeat(64), proof = 'd'.repeat(64);
  return { broker, id, proof, store, denyUser: () => { accepted = false; }, exchanges: () => codeExchanges };
}
test('broker transaction binds proof/cookie/state, never accepts a browser role, redeems only once', async () => {
  const f = brokerFixture(); await f.broker.begin({ id: f.id, nonce, proofHash: hash(f.proof), roles: ['ERP_OWNER'] });
  await assert.rejects(f.broker.bind({ id: f.id, proof: 'e'.repeat(64) }));
  const binding = await f.broker.bind({ id: f.id, proof: f.proof }), state = new URL(binding.url).searchParams.get('state');
  await assert.rejects(f.broker.callback({ state, cookie: 'e'.repeat(64), code: 'code' })); assert.equal(f.exchanges(), 0);
  await f.broker.callback({ state, cookie: binding.cookie, code: 'code' });
  await assert.rejects(f.broker.callback({ state, cookie: binding.cookie, code: 'code' }));
  const result = await f.broker.redeem({ id: f.id, proof: f.proof });
  assert.equal(result.status, 'OK'); assert.equal(typeof result.assertion, 'string');
  assert.equal(result.roles, undefined); assert.equal(result.token, undefined);
  await assert.rejects(f.broker.redeem({ id: f.id, proof: f.proof }));
});
test('unknown account leaves a non-retryable processing transaction; no assertion minted', async () => {
  const f = brokerFixture(); await f.broker.begin({ id: f.id, nonce, proofHash: hash(f.proof) });
  const b = await f.broker.bind({ id: f.id, proof: f.proof }); f.denyUser();
  await assert.rejects(f.broker.callback({ state: new URL(b.url).searchParams.get('state'), cookie: b.cookie, code: 'code' }));
  await assert.rejects(f.broker.callback({ state: new URL(b.url).searchParams.get('state'), cookie: b.cookie, code: 'code' }));
  assert.equal(f.exchanges(), 1);
});
test('Cloud Run bootstrap serves health only; every operational route remains blocked', async () => {
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await (await fetch(base + '/healthz')).json()).status, 'BOOTSTRAP_ONLY');
    for (const path of ['/login', '/private/begin', '/private/redeem', '/oauth/callback']) assert.equal((await fetch(base + path)).status, 503);
  } finally { await new Promise(r => server.close(r)); }
});
