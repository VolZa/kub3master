'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, randomBytes } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { createGoogleVerifier, hash } = require('../security.cjs');
const { createLoginProofValidator, createGoogleLoginProofValidator } = require('../bd2-login-proof.cjs');

// Test-only keys/store/clock/certificate substitution; nothing here is exported or imported by runtime.
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const certs = { fixture: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
const START = Math.floor(Date.now() / 1000) * 1000;
const config = () => ({ profile: 'KUB_ERP_SESSION_BD2_V1', clientId: 'isolated-bd2.apps.googleusercontent.com',
  context: { environment: 'TEST', applicationAudience: 'kub-erp-bd2-local', expectedScriptId: 'isolated-no-GAS-access' },
  attemptTtlMs: 120_000 });
function token(nonce, changes = {}, header = { alg: 'RS256', kid: 'fixture' }, key = pair.privateKey) {
  const claims = { iss: 'https://accounts.google.com', aud: config().clientId, sub: 'verified-google-subject',
    iat: START / 1000 - 1, exp: START / 1000 + 300, nonce, ...changes };
  const input = [header, claims].map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), key).toString('base64url');
}
function fixture() {
  const records = new Map(), configuration = config();
  let clock = START, verifying = 0, inTransition = false;
  const attempts = {
    async createOnce(id, record) {
      if (records.has(id)) throw Error('CONFLICT');
      records.set(id, structuredClone(record));
    },
    async transition(id, phase, update) {
      const record = records.get(id);
      if (!record || record.phase !== phase) throw Error('CONFLICT');
      inTransition = true;
      try {
        const next = update(structuredClone(record));
        assert.equal(typeof next?.then, 'undefined', 'transaction callback must remain synchronous');
        records.set(id, structuredClone(next));
        return structuredClone(next);
      } finally { inTransition = false; }
    },
  };
  const client = new OAuth2Client(configuration.clientId);
  client.getFederatedSignonCertsAsync = async () => ({ certs });
  const real = createGoogleVerifier({ clientId: configuration.clientId, client, now: () => clock });
  const verifier = { async verify(value, nonce) {
    assert.equal(inTransition, false, 'Google verification must be outside retryable store callback');
    verifying++;
    return real.verify(value, nonce);
  } };
  const options = { configuration, attempts, verifier, now: () => clock };
  const validator = createLoginProofValidator(options);
  return { options, validator, attempts, verifier, client, records, configuration,
    calls: () => verifying, advance: ms => { clock += ms; }, setTime: value => { clock = value; } };
}
async function login(f, proof = randomBytes(32).toString('hex')) {
  const attempt = await f.validator.begin({ browserProofHash: hash(proof) });
  return { ...attempt, browserProof: proof, idToken: token(attempt.nonce) };
}
const request = a => ({ attemptId: a.attemptId, browserProof: a.browserProof, nonce: a.nonce, idToken: a.idToken });
const denied = action => assert.rejects(action, { message: 'ACCESS_DENIED' });

test('Google-backed factory uses actual library RSA verification with test-only certificate retrieval', async t => {
  const f = fixture();
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs }));
  const validator = createGoogleLoginProofValidator({ configuration: config(), attempts: f.attempts, now: () => START });
  const proof = randomBytes(32).toString('hex');
  const a = await validator.begin({ browserProofHash: hash(proof) });
  const result = await validator.verify({ attemptId: a.attemptId, browserProof: proof, nonce: a.nonce, idToken: token(a.nonce) });
  assert.deepEqual(result.principal, { issuer: 'https://accounts.google.com', sub: 'verified-google-subject' });
  assert.equal(result.profile, 'KUB_ERP_SESSION_BD2_V1');
  assert.deepEqual(Object.keys(result).sort(), ['attemptId', 'context', 'googleTokenExpiresAtMs', 'principal', 'profile', 'verifiedAtMs']);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.principal), true);
  assert.equal(f.records.get(a.attemptId).phase, 'CONSUMED');
});
test('canonical principal accepts both documented Google issuer forms, ignoring signed email/role claims', async () => {
  for (const iss of ['accounts.google.com', 'https://accounts.google.com']) {
    const f = fixture(), a = await login(f);
    const result = await f.validator.verify({ ...request(a), idToken: token(a.nonce, { iss, email: 'attacker@example.test', roles: ['ADMIN'] }) });
    assert.deepEqual(result.principal, { issuer: 'https://accounts.google.com', sub: 'verified-google-subject' });
    assert.equal(result.roles, undefined); assert.equal(result.session, undefined); assert.equal(result.idToken, undefined);
  }
});
for (const [label, changes] of [
  ['wrong audience', { aud: 'other.apps.googleusercontent.com' }],
  ['audience array', { aud: [config().clientId] }],
  ['wrong issuer', { iss: 'https://attacker.test' }],
  ['expiry equality', { exp: START / 1000 }],
  ['expired within library clock-skew tolerance', { exp: START / 1000 - 1 }],
  ['expired beyond library skew', { exp: START / 1000 - 1000 }],
  ['missing expiry', { exp: undefined }], ['string expiry', { exp: String(START / 1000 + 300) }],
  ['missing subject', { sub: undefined }], ['empty subject', { sub: '' }],
  ['non-string subject', { sub: 123 }], ['whitespace subject', { sub: ' ' }], ['oversized subject', { sub: 'x'.repeat(256) }],
  ['wrong nonce', { nonce: 'f'.repeat(64) }], ['missing nonce', { nonce: undefined }],
  ['wrong authorized party', { azp: 'attacker' }], ['future issued-at', { iat: START / 1000 + 31 }],
  ['missing issued-at', { iat: undefined }], ['string issued-at', { iat: String(START / 1000 - 1) }],
]) test('denies ' + label + ' without producing reusable proof', async () => {
  const f = fixture(), a = await login(f);
  await denied(f.validator.verify({ ...request(a), idToken: token(a.nonce, changes) }));
  assert.equal(f.records.get(a.attemptId).phase, 'CONSUMED');
  await denied(f.validator.verify(request(a)));
  assert.equal(f.calls(), 1);
});
for (const [label, makeToken] of [
  ['forged signature', a => token(a.nonce, {}, undefined, wrongKey)],
  ['modified payload', a => { const p = a.idToken.split('.'); p[1] = Buffer.from(JSON.stringify({ sub: 'forged' })).toString('base64url'); return p.join('.'); }],
  ['unsigned token', a => token(a.nonce, {}, { alg: 'none', kid: 'fixture' })],
  ['unknown signing key', a => token(a.nonce, {}, { alg: 'RS256', kid: 'not-trusted' })],
  ['token-supplied JWK URL', a => token(a.nonce, {}, { alg: 'RS256', kid: 'fixture', jku: 'https://attacker.test/key' })],
  ['malformed JWT', () => 'not.a.token'],
]) test('denies ' + label, async () => {
  const f = fixture(), a = await login(f);
  await denied(f.validator.verify({ ...request(a), idToken: makeToken(a) }));
});
test('proof substitution denies before verification and leaves the legitimate attempt usable', async () => {
  const f = fixture(), a = await login(f);
  await denied(f.validator.verify({ ...request(a), browserProof: 'f'.repeat(64) }));
  assert.equal(f.calls(), 0); assert.equal(f.records.get(a.attemptId).phase, 'NEW');
  await f.validator.verify(request(a));
});
test('different attempt/nonce cannot reuse an already accepted Google proof', async () => {
  const f = fixture(), a = await login(f), b = await login(f);
  assert.notEqual(a.nonce, b.nonce); assert.notEqual(a.attemptId, b.attemptId);
  await f.validator.verify(request(a));
  await denied(f.validator.verify({ ...request(b), idToken: a.idToken }));
  await denied(f.validator.verify(request(a)));
});
test('concurrent replay across component instances has one winner at the shared atomic store', async () => {
  const f = fixture(), a = await login(f), other = createLoginProofValidator(f.options);
  const results = await Promise.allSettled([f.validator.verify(request(a)), other.verify(request(a)), f.validator.verify(request(a))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 2);
  assert.equal(f.calls(), 1);
});
for (const extra of [{ principal: { issuer: 'https://accounts.google.com', sub: 'forged' } },
  { verified: true }, { email: 'owner@example.test' }, { roles: ['ADMIN'] }, { context: config().context }]) {
  test('rejects caller-supplied identity/context fields: ' + Object.keys(extra)[0], async () => {
    const f = fixture(), a = await login(f);
    await denied(f.validator.verify({ ...request(a), ...extra }));
    assert.equal(f.calls(), 0); assert.equal(f.records.get(a.attemptId).phase, 'NEW');
  });
}
test('rejects accessors and malformed inputs before consuming any attempt', async () => {
  const f = fixture(), a = await login(f);
  for (const input of [null, [], {}, { ...request(a), idToken: '' }, { ...request(a), idToken: 'x'.repeat(32769) },
    { ...request(a), attemptId: 'missing' }, { ...request(a), browserProof: {} }]) await denied(f.validator.verify(input));
  let touched = false;
  const accessor = { ...request(a), get idToken() { touched = true; return a.idToken; } };
  await denied(f.validator.verify(accessor)); assert.equal(touched, false); assert.equal(f.calls(), 0);
  await denied(f.validator.begin({ browserProofHash: hash(a.browserProof), nonce: a.nonce }));
  await denied(f.validator.begin({ browserProofHash: 'invalid' }));
});
for (const [label, edit] of [
  ['environment', r => { r.context.environment = 'PRODUCTION'; }],
  ['application audience', r => { r.context.applicationAudience = 'other'; }],
  ['Script ID', r => { r.context.expectedScriptId = 'other'; }],
  ['Google client', r => { r.clientId = 'other.apps.googleusercontent.com'; }],
  ['profile', r => { r.profile = 'legacy'; }], ['attempt ID', r => { r.attemptId = 'f'.repeat(64); }],
  ['future creation', r => { r.createdAtMs++; r.expiresAtMs++; }],
  ['extended deadline', r => { r.expiresAtMs++; }],
  ['missing record field', r => { delete r.proofHash; }],
]) test('denies mismatched/corrupt authoritative ' + label, async () => {
  const f = fixture(), a = await login(f); edit(f.records.get(a.attemptId));
  await denied(f.validator.verify(request(a))); assert.equal(f.calls(), 0);
});
test('configuration and port method references are captured, never supplied by requests', async () => {
  const f = fixture(), a = await login(f);
  f.configuration.context.applicationAudience = 'changed'; f.configuration.clientId = 'changed';
  f.verifier.verify = async () => { throw Error('substituted'); };
  f.attempts.transition = async () => { throw Error('substituted'); };
  const result = await f.validator.verify(request(a));
  assert.equal(result.context.applicationAudience, 'kub-erp-bd2-local');
});
test('expiry equality before claim denies; delayed claim return also denies before Google verification', async () => {
  const f = fixture(), a = await login(f); f.advance(120_000);
  await denied(f.validator.verify(request(a))); assert.equal(f.calls(), 0);
  const g = fixture(), original = g.attempts.transition;
  g.attempts.transition = async (...args) => { const row = await original(...args); g.advance(120_000); return row; };
  const validator = createLoginProofValidator(g.options), b = await login(g);
  await denied(validator.verify(request(b))); assert.equal(g.calls(), 0);
});
test('rechecks attempt deadline after awaited Google verification', async () => {
  const f = fixture(), a = await login(f), original = f.verifier.verify;
  const verifier = { async verify(...args) { const result = await original(...args); f.advance(120_000); return result; } };
  await denied(createLoginProofValidator({ ...f.options, verifier }).verify(request(a)));
  assert.equal(f.records.get(a.attemptId).phase, 'CONSUMED');
});
test('rechecks verified token expiry after awaited verification', async () => {
  const f = fixture(), a = await login(f), original = f.verifier.verify;
  const verifier = { async verify(...args) { const result = await original(...args); f.advance(1000); return result; } };
  const validator = createLoginProofValidator({ ...f.options, verifier });
  await denied(validator.verify({ ...request(a), idToken: token(a.nonce, { exp: START / 1000 + 1 }) }));
});
test('clock rollback and invalid observations fail closed without permission or credential output', async () => {
  for (const value of [START - 1, NaN, Infinity, START + 0.5]) {
    const f = fixture(), a = await login(f); f.setTime(value);
    await denied(f.validator.verify(request(a))); assert.equal(f.calls(), 0);
  }
});
test('UNKNOWN creation does not return an attempt; UNKNOWN claim never calls verifier or retries it', async () => {
  const f = fixture(), create = f.attempts.createOnce;
  f.attempts.createOnce = async (...args) => { await create(...args); throw Error('UNKNOWN'); };
  const validator = createLoginProofValidator(f.options);
  await denied(validator.begin({ browserProofHash: hash('a'.repeat(64)) })); assert.equal(f.calls(), 0);
  const g = fixture(), a = await login(g), transition = g.attempts.transition;
  g.attempts.transition = async (...args) => { await transition(...args); throw Error('UNKNOWN'); };
  const claimant = createLoginProofValidator(g.options);
  await denied(claimant.verify(request(a))); assert.equal(g.calls(), 0);
  await denied(g.validator.verify(request(a))); assert.equal(g.calls(), 0);
});
test('dependency failures/unknown return shapes fail closed and do not leak exception messages', async () => {
  for (const outcome of [undefined, false, { status: 'UNKNOWN' }]) {
    const f = fixture(), a = await login(f);
    const attempts = { ...f.attempts, transition: async () => outcome };
    await denied(createLoginProofValidator({ ...f.options, attempts }).verify(request(a)));
    assert.equal(f.calls(), 0);
  }
  const f = fixture(), a = await login(f);
  const verifier = { async verify() { throw Error('sensitive-token-diagnostic'); } };
  await denied(createLoginProofValidator({ ...f.options, verifier }).verify(request(a)));
  await denied(f.validator.verify(request(a)));
});
test('factories have no fixture/client/key overrides, default store or permissive configuration', () => {
  const f = fixture();
  for (const extra of [{ verifier: f.verifier }, { client: f.client }, { certs }, { fixture: true }]) {
    assert.throws(() => createGoogleLoginProofValidator({ configuration: config(), attempts: f.attempts, ...extra }), /ACCESS_DENIED/);
  }
  for (const configuration of [undefined, { ...config(), profile: 'legacy' }, { ...config(), clientId: '' },
    ...[0, 120001, 1.5, NaN].map(attemptTtlMs => ({ ...config(), attemptTtlMs }))]) {
    assert.throws(() => createLoginProofValidator({ ...f.options, configuration }), /ACCESS_DENIED/);
  }
  assert.throws(() => createLoginProofValidator({ ...f.options, attempts: undefined }), /ACCESS_DENIED/);
  assert.throws(() => createLoginProofValidator({ ...f.options, verifier: undefined }), /ACCESS_DENIED/);
});
