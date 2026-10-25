import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CHANNEL, type ChannelExpectation, type ChannelKeyPolicy, type RequestHeader, type WireRequest,
  type ResponseHeader, type WireResponse, type OperationReceipt, type OperationRecoveryPort, type DurableReplayLedgerPort } from './contracts';
import { utf8, decodeUtf8, frame, parseWireJson } from './encoding';
import { channelKeyPolicy, nonceClaimPlan, verificationKey, replayDisposition, origin, checkFresh } from './channel-policy';
import { canonicalCommandBytes, canonicalRequestBytes, canonicalResponseBytes, inspectRequest, inspectResponse } from './validation';
import { inspectReceipt, recoveryAction, remoteTimes } from './recovery';

// SHA-256 is a TEST-ONLY body digest adapter. Tags below are SYNTHETIC, NOT HMAC.
// No test here demonstrates real HMAC security, durable replay protection or distributed atomicity.
const hash = (bytes: readonly number[]) => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const digest = { digest: hash }, id = (n: number) => n.toString(16).padStart(64, '0');
const now = 1_800_000_000_000;
const expected: ChannelExpectation = { environment: 'TEST', applicationAudience: 'kub-admin-test',
  expectedScriptId: 'synthetic_test_script_00000001', backendOrigin: 'https://auth-test.example.com' };
function policy(): ChannelKeyPolicy {
  return { ...expected, keys: ['REQUEST', 'RESPONSE'].map((direction, i) => ({ keyId: `key-${i}`, direction: direction as 'REQUEST' | 'RESPONSE',
    signingNotBefore: now - 1_000_000, signingNotAfter: now + 1_000_000, verificationNotAfter: now + 2_000_000,
    status: 'ACTIVE', revokedAt: null, compromised: false })) };
}
function syntheticTag(direction: string, key: string, bytes: readonly number[]): string {
  return hash(utf8(`SYNTHETIC-NOT-HMAC:${direction}:${key}:${bytes.join(',')}`));
}
function request(change: Partial<RequestHeader> = {}, body = '{"assertion":"synthetic"}'): WireRequest {
  const h: RequestHeader = { ...expected, protocolVersion: 1, algorithm: 'HMAC-SHA256', keyId: 'key-0', requestId: id(1),
    requestKind: 'MUTATION', method: 'POST', backendPath: '/v1/operations', operationId: id(2), operationKind: 'ACCEPT_ASSERTION',
    commandDigest: id(0), commandCreatedAt: now - 100, timestamp: now, nonce: id(3), bodyDigest: hash(utf8(body)), ...change };
  const header = h.requestKind === 'MUTATION' && !Object.prototype.hasOwnProperty.call(change, 'commandDigest') ?
    { ...h, commandDigest: hash(canonicalCommandBytes(h, h.bodyDigest)) } : h;
  return { header, body, tag: syntheticTag('REQUEST', header.keyId, canonicalRequestBytes(header)) };
}
function receipt(r: WireRequest, changes: Partial<OperationReceipt> = {}): OperationReceipt {
  const h = r.header;
  return { environment: h.environment, applicationAudience: h.applicationAudience, expectedScriptId: h.expectedScriptId,
    operationId: h.operationId, operationKind: h.operationKind, commandDigest: h.commandDigest, commandCreatedAt: h.commandCreatedAt,
    backendDecisionAt: now + 10, databaseCommittedAt: { status: 'KNOWN', value: now + 20 }, outcome: 'COMMITTED',
    receiptId: id(4), objectId: id(5), revision: 1, code: null, retainUntil: now + 1_000_000, ...changes };
}
function response(r = request(), change: Partial<ResponseHeader> = {}, body = JSON.stringify({ receipt: receipt(r) })): WireResponse {
  const q = r.header;
  const h: ResponseHeader = { environment: q.environment, applicationAudience: q.applicationAudience, expectedScriptId: q.expectedScriptId,
    protocolVersion: 1, algorithm: 'HMAC-SHA256', keyId: 'key-1', requestId: q.requestId, requestKind: q.requestKind, method: q.method,
    backendOrigin: q.backendOrigin, backendPath: q.backendPath, operationId: q.operationId, operationKind: q.operationKind,
    commandDigest: q.commandDigest, commandCreatedAt: q.commandCreatedAt, requestTimestamp: q.timestamp,
    requestNonce: q.nonce, requestBodyDigest: q.bodyDigest, timestamp: now + 30, status: 'COMMITTED', bodyDigest: hash(utf8(body)), ...change };
  return { header: h, body, tag: syntheticTag('RESPONSE', h.keyId, canonicalResponseBytes(h)) };
}
const bytes = (v: unknown) => utf8(JSON.stringify(v));
const checkRequest = (r = request(), p = policy(), at = now) => inspectRequest(bytes(r), expected, p, at, digest);
const checkResponse = (s = response(), r = request(), p = policy(), at = now + 40) => inspectResponse(bytes(s), r, expected, p, at, digest);
function testOnlyAuthenticatedResponse(s: WireResponse, r = request()): void {
  const inspected = checkResponse(s, r);
  if (s.tag !== syntheticTag('RESPONSE', s.header.keyId, inspected.canonicalBytes)) throw Error('SYNTHETIC_MAC_REJECTED');
}

describe('autonomous wire contracts: canonical bytes and strict parsing', () => {
  it('has a fixed byte-level framing vector with lengths measured in UTF-8 bytes', () => {
    expect(frame('V', ['a', '😀', 12])).toEqual([0, 0, 0, 1, 86, 0, 0, 0, 1, 97,
      0, 0, 0, 4, 240, 159, 152, 128, 0, 0, 0, 2, 49, 50]);
    expect(frame('V', ['a', 'bc'])).not.toEqual(frame('V', ['ab', 'c']));
  });
  it('validates a canonical request and response without creating trusted evidence', () => {
    const r = request(); expect(checkRequest(r).request).toEqual(r);
    expect(checkResponse(response(r), r).response.header.status).toBe('COMMITTED');
    expect(Object.keys(checkResponse(response(r), r)).sort()).toEqual(['body', 'canonicalBytes', 'response']);
  });
  it('does not depend on JSON object key order', () => {
    const r = request(), reversed = Object.fromEntries(Object.entries(r.header).reverse()) as unknown as RequestHeader;
    expect(canonicalRequestBytes(reversed)).toEqual(canonicalRequestBytes(r.header));
    expect(checkRequest({ ...r, header: reversed })).toEqual(checkRequest(r));
  });
  it('distinguishes empty fields from zero and rejects null/omitted or wrong-typed header values', () => {
    expect(frame('V', [''])).not.toEqual(frame('V', [0]));
    for (const value of [null, undefined]) expect(() => frame('V', [value as unknown as string])).toThrow('CHANNEL_CONTRACT_INVALID');
    const r = request();
    for (const timestamp of [null, undefined, '', 0, '0']) {
      expect(() => canonicalRequestBytes({ ...r.header, timestamp } as unknown as RequestHeader)).toThrow('CHANNEL_CONTRACT_INVALID');
    }
  });
  it('snapshots canonical bytes and binds later operation/context modifications', () => {
    const r = request(), snapshot = canonicalRequestBytes(r.header), saved = [...snapshot];
    const inspected = checkRequest(r);
    expect(Object.isFrozen(snapshot)).toBe(true); expect(Object.isFrozen(inspected.request.header)).toBe(true);
    for (const change of [{ operationId: id(99) }, { applicationAudience: 'kub-other' }, { environment: 'PRODUCTION' as const }]) {
      const changed = { ...r.header, ...change };
      expect(canonicalRequestBytes(changed)).not.toEqual(snapshot);
      expect(canonicalCommandBytes(changed, changed.bodyDigest)).not.toEqual(canonicalCommandBytes(r.header, r.header.bodyDigest));
    }
    expect(snapshot).toEqual(saved);
    expect(() => canonicalRequestBytes({ ...r.header, operationId: '' })).toThrow();
  });
  it('preserves semantic command digest across fresh transport retry fields', () => {
    const r = request(), next = request({ nonce: id(80), requestId: id(81), timestamp: now + 1 });
    expect(next.header.commandDigest).toBe(r.header.commandDigest);
    expect(canonicalRequestBytes(next.header)).not.toEqual(canonicalRequestBytes(r.header));
  });
  it('hashes exact body bytes including whitespace and Unicode without normalization', () => {
    const a = request({}, '{"text":"é"}'), b = request({}, '{ "text":"é"}'), c = request({}, '{"text":"é"}');
    expect(a.header.bodyDigest).not.toBe(b.header.bodyDigest); expect(a.header.bodyDigest).not.toBe(c.header.bodyDigest);
    expect(() => checkRequest({ ...a, body: b.body })).toThrow('CHANNEL_CONTRACT_INVALID');
  });
  it('rejects body changes even if the transport body digest is updated but command digest is stale', () => {
    const r = request(), body = '{"assertion":"changed"}';
    expect(() => checkRequest({ ...r, body, header: { ...r.header, bodyDigest: hash(utf8(body)) } })).toThrow();
  });
  it.each(['{', '{"a":1,}', '[1,]', 'true false', '01', '{"a":1e999}', '{"a":"\\uD800"}', '{"a":"\\uDC00"}'])('rejects malformed/scalar-invalid JSON %s', text => {
    expect(() => parseWireJson(utf8(text))).toThrow('CHANNEL_CONTRACT_INVALID');
  });
  it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"nested":{"x":1,"x":2}}'])('rejects duplicate decoded JSON keys %s', text => {
    expect(() => parseWireJson(utf8(text))).toThrow();
  });
  it('rejects duplicate keys in both envelope and exact body JSON', () => {
    const r = request(), raw = JSON.stringify(r).replace('"header":', '"tag":"' + id(9) + '","header":');
    expect(() => inspectRequest(utf8(raw), expected, policy(), now, digest)).toThrow();
    expect(() => checkRequest(request({}, '{"x":1,"x":2}'))).toThrow();
  });
  it('supports bounded arrays and null-prototype object keys without prototype pollution', () => {
    const parsed = parseWireJson(utf8('{"__proto__":{"x":1},"a":[true,false,null,1]}')) as Record<string, unknown>;
    expect(Object.getPrototypeOf(parsed)).toBeNull(); expect(parsed.a).toEqual([true, false, null, 1]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
  it.each([[0xc0, 0x80], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xc2], [256], [-1], [1.5], [0xef, 0xbb, 0xbf, 123, 125]])('rejects invalid UTF-8 %j', (...input) => {
    expect(() => decodeUtf8(input as number[])).toThrow();
  });
  it.each(['\ud800', '\udc00'])('rejects lone UTF-16 surrogate', text => expect(() => utf8(text)).toThrow());
  it('round-trips valid Unicode and rejects byte/depth/node limits', () => {
    const text = 'A\0Їé😀'; expect(decodeUtf8(utf8(text))).toBe(text);
    expect(() => parseWireJson(new Array(CHANNEL.maxWireBytes + 1).fill(32))).toThrow();
    expect(() => parseWireJson(utf8('['.repeat(10) + '0' + ']'.repeat(10)))).toThrow();
    expect(() => parseWireJson(utf8(JSON.stringify(new Array(1025).fill(0))))).toThrow();
  });
  it('rejects oversized bodies and accepts the exact body-size boundary', () => {
    const exact = '{"x":"' + 'a'.repeat(CHANNEL.maxBodyBytes - 8) + '"}';
    expect(utf8(exact)).toHaveLength(CHANNEL.maxBodyBytes); expect(() => checkRequest(request({}, exact))).not.toThrow();
    expect(() => checkRequest(request({}, exact.replace('"}', 'a"}')))).toThrow();
  });
  it('rejects unknown fields, accessors, roles and permissions in headers', () => {
    const r = request();
    for (const extra of [{ roles: ['ADMIN'] }, { permissions: ['USER_MANAGE'] }, { trusted: true }])
      expect(() => checkRequest({ ...r, header: { ...r.header, ...extra } })).toThrow();
    expect(() => canonicalRequestBytes({ ...r.header, get nonce(): string { throw Error('SENSITIVE'); } })).toThrow('CHANNEL_CONTRACT_INVALID');
  });
});

describe('request/response binding and candidate key policy (no real HMAC)', () => {
  it.each([
    ['environment', 'PRODUCTION'], ['expectedScriptId', 'synthetic_other_script_00000001'], ['applicationAudience', 'kub-other'],
    ['backendOrigin', 'https://other.example.com'],
  ])('rejects request %s mismatch', (field, value) => {
    const r = request(); expect(() => checkRequest({ ...r, header: { ...r.header, [field]: value } })).toThrow();
  });
  it.each([
    ['requestId', id(90)], ['operationId', id(91)], ['commandDigest', id(92)], ['requestNonce', id(93)],
    ['environment', 'PRODUCTION'], ['expectedScriptId', 'synthetic_other_script_00000001'], ['applicationAudience', 'kub-other'],
    ['requestBodyDigest', id(94)], ['requestTimestamp', now - 1], ['commandCreatedAt', now - 200],
    ['operationKind', 'ISSUE_SESSION'], ['protocolVersion', 2], ['status', 'PASS'], ['method', 'GET'],
  ])('rejects response %s substitution', (field, value) => {
    const s = response(); expect(() => checkResponse({ ...s, header: { ...s.header, [field]: value } })).toThrow();
  });
  it('rejects substitution from a different request with the same operation', () => {
    const original = request(), other = request({ requestId: id(20), nonce: id(21) });
    expect(() => checkResponse(response(other), original)).toThrow();
  });
  it('rejects unknown key and wrong-direction key', () => {
    expect(() => checkRequest(request({ keyId: 'unknown' }))).toThrow();
    expect(() => checkRequest(request({ keyId: 'key-1' }))).toThrow();
    expect(() => checkResponse(response(request(), { keyId: 'key-0' }))).toThrow();
  });
  it.each(['revoked', 'compromised', 'expired'])('rejects %s request/response keys', state => {
    for (const index of [0, 1]) {
      const p = policy(), keys = p.keys.map((k, i) => i !== index ? k : state === 'revoked' ? { ...k, status: 'REVOKED' as const, revokedAt: now } :
        state === 'compromised' ? { ...k, compromised: true } : { ...k, signingNotAfter: now, verificationNotAfter: now });
      expect(() => index === 0 ? checkRequest(request(), { ...p, keys }) : checkResponse(response(), request(), { ...p, keys })).toThrow();
    }
  });
  it('allows VERIFY_ONLY overlap for prior signatures but rejects new signatures after signing window', () => {
    const p = policy(), keys = p.keys.map(k => ({ ...k, status: 'VERIFY_ONLY' as const, signingNotAfter: now + 1 }));
    expect(() => verificationKey({ ...p, keys }, expected, 'key-0', 'REQUEST', now, now + 100)).not.toThrow();
    expect(() => verificationKey({ ...p, keys }, expected, 'key-0', 'REQUEST', now + 1, now + 100)).toThrow();
  });
  it('requires distinct directional key IDs and exact policy context', () => {
    const p = policy(); expect(() => channelKeyPolicy({ ...p, keys: [p.keys[0], { ...p.keys[1], keyId: 'key-0' }] }, expected)).toThrow();
    expect(() => channelKeyPolicy({ ...p, environment: 'PRODUCTION' }, expected)).toThrow();
  });
  it.each(['http://auth.example.com', 'https://AUTH.example.com', 'https://user@auth.example.com', 'https://auth.example.com/',
    'https://auth.example.com?q=x', 'https://auth.example.com#x', 'https://auth.example.com:443', 'https://127.0.0.1',
    'https://auth.example.com:65536', 'https://0x7f.0.0.1', 'https://0x7f.1',
    'https://' + 'a'.repeat(64) + '.example.com'])('rejects noncanonical or unsafe backend origin %s', value => {
    expect(() => origin(value)).toThrow('CHANNEL_CONTRACT_INVALID');
  });
  it('separates canonical direction, status and keys', () => {
    const r = request(), s = response(r); expect(canonicalRequestBytes(r.header)).not.toEqual(canonicalResponseBytes(s.header));
    expect(canonicalResponseBytes(s.header)).not.toEqual(canonicalResponseBytes({ ...s.header, status: 'OUTCOME_UNKNOWN' }));
  });
  it('schema-valid tag is not authentication; a synthetic verifier detects response alteration', () => {
    const r = request(), s = response(r); expect(() => testOnlyAuthenticatedResponse(s, r)).not.toThrow();
    const forged = { ...s, tag: id(99) }; expect(() => checkResponse(forged, r)).not.toThrow();
    expect(() => testOnlyAuthenticatedResponse(forged, r)).toThrow('SYNTHETIC_MAC_REJECTED');
    const body = JSON.stringify({ receipt: receipt(r, { objectId: id(77) }) });
    const substituted = { ...s, body, header: { ...s.header, bodyDigest: hash(utf8(body)) } };
    expect(() => checkResponse(substituted, r)).not.toThrow();
    expect(() => testOnlyAuthenticatedResponse(substituted, r)).toThrow('SYNTHETIC_MAC_REJECTED');
  });
  it('rejects expired/future requests at defined boundaries', () => {
    expect(() => checkRequest(request({ timestamp: now - CHANNEL.requestAgeMs + 1, commandCreatedAt: now - CHANNEL.requestAgeMs }))).not.toThrow();
    expect(() => checkRequest(request({ timestamp: now - CHANNEL.requestAgeMs, commandCreatedAt: now - CHANNEL.requestAgeMs }))).toThrow();
    expect(() => checkRequest(request({ timestamp: now + CHANNEL.futureSkewMs }))).not.toThrow();
    expect(() => checkRequest(request({ timestamp: now + CHANNEL.futureSkewMs + 1 }))).toThrow();
  });
  it('rejects expired/future responses and stale mutation command time', () => {
    expect(() => checkResponse(response(), request(), policy(), now + 30 + CHANNEL.responseAgeMs)).toThrow();
    expect(() => checkResponse(response(request(), { timestamp: now + CHANNEL.futureSkewMs + 41 }))).toThrow();
    expect(() => checkRequest(request({ commandCreatedAt: now - CHANNEL.commandAgeMs }))).toThrow();
  });
  it.each([NaN, Infinity, 0, -1, 1.5])('rejects invalid timestamp acceptance window %s', maxAge => {
    expect(() => checkFresh(now - 1_000_000, now, maxAge)).toThrow('CHANNEL_CONTRACT_INVALID');
  });
});

describe('replay/recovery contracts (test-only in-memory fixtures, not distributed evidence)', () => {
  it('plans sufficient retention and rejects duplicate nonce across key rotation and concurrent fixture calls', async () => {
    const plan = nonceClaimPlan(request().header, expected, now), seen = new Set<string>();
    const fixtureLedger: DurableReplayLedgerPort = { async claim(q) {
      const key = JSON.stringify([q.environment, q.applicationAudience, q.expectedScriptId, q.direction, q.nonce]);
      if (seen.has(key)) return 'DUPLICATE'; seen.add(key); return 'CLAIMED';
    } };
    expect(plan.retainUntil).toBe(now + CHANNEL.nonceRetentionMs);
    expect(await Promise.all([fixtureLedger.claim(plan), fixtureLedger.claim({ ...plan, requestId: id(99) })])).toEqual(['CLAIMED', 'DUPLICATE']);
    expect(Object.keys(plan)).not.toContain('keyId');
  });
  it('fails closed by requiring a positive durable claim; unavailable/unknown/capacity are not claims', async () => {
    for (const status of ['UNAVAILABLE', 'OUTCOME_UNKNOWN', 'CAPACITY_EXCEEDED'] as const) {
      const ledger: DurableReplayLedgerPort = { claim: async () => status };
      expect(replayDisposition(await ledger.claim(nonceClaimPlan(request().header, expected, now)))).toBe('BLOCKED');
    }
  });
  it('admits only a positive replay claim after authentication and blocks duplicate/unknown outcomes', () => {
    expect(replayDisposition('CLAIMED')).toBe('CONTINUE_AFTER_AUTHENTICATION');
    expect(replayDisposition('DUPLICATE')).toBe('BLOCKED'); expect(() => replayDisposition('ALLOW')).toThrow();
  });
  it('rejects cross-environment replay before any ledger use', () => {
    const claim = vi.fn(); expect(() => { const r = checkRequest({ ...request(), header: { ...request().header, environment: 'PRODUCTION' } });
      claim(nonceClaimPlan(r.request.header, expected, now)); }).toThrow(); expect(claim).not.toHaveBeenCalled();
  });
  it('rejects a repeated nonce on a newly rotated request key', async () => {
    const p = policy(), rotated = { ...p, keys: [...p.keys, { ...p.keys[0], keyId: 'request-next' }] };
    const original = checkRequest(), next = checkRequest(request({ keyId: 'request-next', requestId: id(81) }), rotated);
    const seen = new Set<string>();
    const ledger: DurableReplayLedgerPort = { async claim(q) {
      if (seen.has(q.nonce)) return 'DUPLICATE'; seen.add(q.nonce); return 'CLAIMED';
    } };
    expect(await ledger.claim(nonceClaimPlan(original.request.header, expected, now))).toBe('CLAIMED');
    expect(await ledger.claim(nonceClaimPlan(next.request.header, expected, now))).toBe('DUPLICATE');
  });
  it('accepts distinct operation timestamps and explicitly unavailable exact DB commit time', () => {
    const r = request(), record = receipt(r); expect(inspectReceipt(record, r.header, now + 40)).toEqual(record);
    expect(record.commandCreatedAt).not.toBe(record.backendDecisionAt); expect(record.backendDecisionAt).not.toBe(record.databaseCommittedAt.value);
    const missing = receipt(r, { databaseCommittedAt: { status: 'UNAVAILABLE', value: null } });
    expect(inspectReceipt(missing, r.header, now + 40).outcome).toBe('COMMITTED');
    expect(() => checkResponse(response(r, {}, JSON.stringify({ receipt: missing })), r)).not.toThrow();
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid timestamp %s', value => {
    expect(() => remoteTimes({ commandCreatedAt: value, backendDecisionAt: now, databaseCommittedAt: { status: 'UNAVAILABLE', value: null } }, now, now)).toThrow();
  });
  it('enforces bounded clock skew, decision delay and known commit ordering', () => {
    const valid = { commandCreatedAt: now, backendDecisionAt: now + 10, databaseCommittedAt: { status: 'KNOWN', value: now + 20 } };
    expect(() => remoteTimes(valid, now, now + 30)).not.toThrow();
    expect(() => remoteTimes({ ...valid, backendDecisionAt: now - CHANNEL.futureSkewMs - 1 }, now, now + 30)).toThrow();
    expect(() => remoteTimes({ ...valid, databaseCommittedAt: { status: 'KNOWN', value: now - CHANNEL.futureSkewMs } }, now, now + 30)).toThrow();
    expect(() => remoteTimes({ ...valid, backendDecisionAt: now + CHANNEL.commandAgeMs + CHANNEL.futureSkewMs + 1 }, now, now + 200_000)).toThrow();
    expect(() => remoteTimes({ ...valid, databaseCommittedAt: { status: 'UNAVAILABLE', value: now } }, now, now + 30)).toThrow();
  });
  it('maps transport uncertainty only to lookup, never to mutation retry or rollback', () => {
    expect(recoveryAction('OUTCOME_UNKNOWN')).toBe('LOOKUP_ONLY'); expect(recoveryAction('COMMITTED')).toBe('RESOLVE_AUTHORITATIVE_STATE');
    expect(recoveryAction('REJECTED')).toBe('STOP_REJECTED'); expect(() => recoveryAction('ROLLED_BACK')).toThrow();
    for (const reason of ['NO_RECEIPT', 'TIMEOUT', 'RESPONSE_LOST', 'UNAVAILABLE']) {
      expect(checkResponse(response(request(), { status: 'OUTCOME_UNKNOWN' }, JSON.stringify({ reason }))).response.header.status).toBe('OUTCOME_UNKNOWN');
    }
  });
  it('recovers the same receipt after response loss/restarted client without mutation', async () => {
    const r = request(), stored = receipt(r), mutation = vi.fn();
    const recovery: OperationRecoveryPort = { lookup: vi.fn(async query => query.operationId === stored.operationId &&
      query.commandDigest === stored.commandDigest ? stored : { outcome: 'OUTCOME_UNKNOWN' as const }) };
    const read = async () => recovery.lookup({ ...r.header });
    expect(await read()).toBe(stored); const restartedClient = { read }; expect(await restartedClient.read()).toBe(stored);
    expect(mutation).not.toHaveBeenCalled(); expect(recovery.lookup).toHaveBeenCalledTimes(2);
    expect(await recovery.lookup({ ...r.header, commandDigest: id(98) })).toEqual({ outcome: 'OUTCOME_UNKNOWN' });
  });
  it('recovers historical receipts with fresh request ID/nonce and unchanged semantic command digest', () => {
    const original = request(), at = now + 300_000;
    const lookup = request({ requestKind: 'RECEIPT_LOOKUP', backendPath: '/v1/operations/lookup', requestId: id(70), nonce: id(71),
      timestamp: at, commandDigest: original.header.commandDigest }, JSON.stringify({ operationId: original.header.operationId, commandDigest: original.header.commandDigest }));
    expect(() => checkRequest(lookup, policy(), at)).not.toThrow();
    const s = response(lookup, { timestamp: at + 1 }, JSON.stringify({ receipt: receipt(original) }));
    expect(() => checkResponse(s, lookup, policy(), at + 2)).not.toThrow();
    expect(() => checkResponse(s, original, policy(), at + 2)).toThrow();
  });
  it('rejects lookup body substitution and raw credentials in durable receipts', () => {
    const r = request(); expect(() => checkRequest(request({ requestKind: 'RECEIPT_LOOKUP', backendPath: '/v1/operations/lookup' },
      JSON.stringify({ operationId: r.header.operationId, commandDigest: id(99) })))).toThrow();
    expect(() => inspectReceipt({ ...receipt(r), sessionCredential: 'do-not-return' }, r.header, now + 40)).toThrow('CHANNEL_CONTRACT_INVALID');
    expect(() => inspectReceipt(receipt(r, { retainUntil: now + 40 }), r.header, now + 40)).toThrow();
  });
  it('rejects an unknown context even when a receipt and its expected binding both use it', () => {
    const r = request(), malformed = { ...r.header, environment: 'UNKNOWN' };
    expect(() => inspectReceipt({ ...receipt(r), environment: 'UNKNOWN' }, malformed as unknown as RequestHeader, now + 40)).toThrow();
  });
  it('supports fixed rejection codes with an optional authoritative rejected receipt', () => {
    const r = request(), rejected = receipt(r, { outcome: 'REJECTED', code: 'ACCESS_DENIED', objectId: null, revision: null });
    expect(() => checkResponse(response(r, { status: 'REJECTED' }, JSON.stringify({ code: 'ACCESS_DENIED', receipt: rejected })), r)).not.toThrow();
    expect(() => checkResponse(response(r, { status: 'REJECTED' }, '{"code":"ACCESS_DENIED","receipt":null}'), r)).not.toThrow();
    expect(() => checkResponse(response(r, { status: 'REJECTED' }, '{"code":"raw Google message","receipt":null}'), r)).toThrow('CHANNEL_CONTRACT_INVALID');
    expect(() => checkResponse(response(r, { status: 'OUTCOME_UNKNOWN' }, JSON.stringify({ receipt: rejected })), r)).toThrow();
  });
});
