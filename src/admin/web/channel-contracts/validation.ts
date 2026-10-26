import { CHANNEL, type BodyDigestPort, type ChannelExpectation, type OperationBinding, type RequestHeader,
  type ResponseHeader, type WireRequest, type WireResponse } from './contracts';
import { object, hex, time, keyId, expectation, checkFresh, verificationKey } from './channel-policy';
import { frame, invalid, parseWireJson, utf8 } from './encoding';
import { inspectReceipt, REJECTIONS } from './recovery';
import type { RejectionCode } from './contracts';
import { canonicalSemanticBytes } from '../operation-contracts';

const bindingKeys = ['environment', 'applicationAudience', 'expectedScriptId', 'operationId', 'operationKind', 'commandDigest', 'commandCreatedAt'];
const transportKeys = ['protocolVersion', 'algorithm', 'keyId', 'requestId', 'requestKind', 'method', 'backendOrigin', 'backendPath'];
const requestKeys = [...bindingKeys, ...transportKeys, 'timestamp', 'nonce', 'bodyDigest'];
const responseKeys = [...bindingKeys, ...transportKeys, 'requestTimestamp', 'requestNonce', 'requestBodyDigest', 'timestamp', 'status', 'bodyDigest'];

function common(v: Record<string, unknown>, expectedValue: unknown): Readonly<ChannelExpectation> {
  const expected = expectation(expectedValue);
  if (v.protocolVersion !== CHANNEL.version || v.algorithm !== CHANNEL.algorithm || v.environment !== expected.environment ||
    v.applicationAudience !== expected.applicationAudience || v.expectedScriptId !== expected.expectedScriptId ||
    v.backendOrigin !== expected.backendOrigin || v.method !== 'POST' ||
    (v.requestKind !== 'MUTATION' && v.requestKind !== 'RECEIPT_LOOKUP') ||
    v.backendPath !== (v.requestKind === 'MUTATION' ? '/v1/operations' : '/v1/operations/lookup') ||
    (v.operationKind !== 'ACCEPT_ASSERTION' && v.operationKind !== 'ISSUE_SESSION')) return invalid();
  keyId(v.keyId); hex(v.requestId); hex(v.operationId); hex(v.commandDigest); hex(v.bodyDigest);
  time(v.commandCreatedAt); time(v.timestamp); return expected;
}
function ownExpectation(header: Record<string, unknown>): ChannelExpectation {
  return expectation({ environment: header.environment, applicationAudience: header.applicationAudience,
    expectedScriptId: header.expectedScriptId, backendOrigin: header.backendOrigin });
}
function requestHeader(value: unknown, expected: unknown): Readonly<RequestHeader> {
  const v = object(value, requestKeys); common(v, expected); hex(v.nonce);
  if ((v.commandCreatedAt as number) - (v.timestamp as number) > CHANNEL.futureSkewMs) return invalid();
  return Object.freeze({ ...v }) as unknown as Readonly<RequestHeader>; // Schema only, no trusted evidence.
}
function responseHeader(value: unknown, expected: unknown): Readonly<ResponseHeader> {
  const v = object(value, responseKeys); common(v, expected); hex(v.requestNonce); hex(v.requestBodyDigest); time(v.requestTimestamp);
  if (!['COMMITTED', 'REJECTED', 'OUTCOME_UNKNOWN'].includes(v.status as string)) return invalid();
  return Object.freeze({ ...v }) as unknown as Readonly<ResponseHeader>;
}
function bindingFields(h: OperationBinding): readonly (string | number)[] {
  return [h.environment, h.applicationAudience, h.expectedScriptId, h.operationId, h.operationKind, h.commandDigest, h.commandCreatedAt];
}
function transportFields(h: RequestHeader | ResponseHeader): readonly (string | number)[] {
  return [h.protocolVersion, h.algorithm, h.keyId, h.requestId, h.requestKind, h.method, h.backendOrigin, h.backendPath];
}
/** MAC candidate input ONLY. Including direction separates request/response even before key separation. */
export function canonicalRequestBytes(value: RequestHeader): readonly number[] {
  const v = object(value, requestKeys), h = requestHeader(v, ownExpectation(v));
  return frame('KUB_ADMIN_CHANNEL_REQUEST_V1', [...transportFields(h), ...bindingFields(h), h.timestamp, h.nonce, h.bodyDigest]);
}
export function canonicalResponseBytes(value: ResponseHeader): readonly number[] {
  const v = object(value, responseKeys), h = responseHeader(v, ownExpectation(v));
  return frame('KUB_ADMIN_CHANNEL_RESPONSE_V1', [...transportFields(h), ...bindingFields(h),
    h.requestTimestamp, h.requestNonce, h.requestBodyDigest, h.timestamp, h.status, h.bodyDigest]);
}
/** Semantic digest stable across transport keys, request IDs/nonces/timestamps and receipt lookups.
 * bodyDigest is the ORIGINAL mutation body's digest; lookup cannot reconstruct or replace it. */
export function canonicalCommandBytes(h: RequestHeader, originalBodyDigest: string): readonly number[] {
  const raw = object(h, requestKeys), v = requestHeader(raw, ownExpectation(raw));
  return canonicalSemanticBytes({ protocolVersion: v.protocolVersion, backendOrigin: v.backendOrigin, environment: v.environment,
    applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId, operationKind: v.operationKind,
    operationId: v.operationId, commandCreatedAt: v.commandCreatedAt }, originalBodyDigest);
}
function envelope(value: unknown): Record<string, unknown> { return object(value, ['header', 'body', 'tag']); }
function body(value: unknown, claimedDigest: string, digest: BodyDigestPort): { text: string; json: unknown } {
  if (typeof value !== 'string') return invalid(); const bytes = utf8(value);
  if (bytes.length > CHANNEL.maxBodyBytes || hex(digest.digest(bytes)) !== claimedDigest) return invalid();
  const json = parseWireJson(bytes, CHANNEL.maxBodyBytes);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return invalid();
  return { text: value, json };
}
/** STRUCTURE/BINDING ONLY. Successful return does not authenticate a request, claim a nonce or mutate a store. */
export function inspectRequest(bytes: readonly number[], expected: unknown, policy: unknown, trustedNow: number, digest: BodyDigestPort) {
  const v = envelope(parseWireJson(bytes)), h = requestHeader(v.header, expected); hex(v.tag);
  checkFresh(h.timestamp, trustedNow, CHANNEL.requestAgeMs);
  verificationKey(policy, expected, h.keyId, 'REQUEST', h.timestamp, trustedNow);
  if (h.requestKind === 'MUTATION') checkFresh(h.commandCreatedAt, trustedNow, CHANNEL.commandAgeMs);
  const b = body(v.body, h.bodyDigest, digest);
  if (h.requestKind === 'MUTATION') {
    if (hex(digest.digest(canonicalCommandBytes(h, h.bodyDigest))) !== h.commandDigest) return invalid();
  } else {
    const q = object(b.json, ['operationId', 'commandDigest']);
    if (q.operationId !== h.operationId || q.commandDigest !== h.commandDigest) return invalid();
  }
  const request: Readonly<WireRequest> = Object.freeze({ header: h, body: b.text, tag: v.tag as string });
  return Object.freeze({ request, body: b.json, canonicalBytes: canonicalRequestBytes(h) });
}
/** STRUCTURE/BINDING ONLY. A future authenticated reader must verify the response MAC independently.
 * Never returns VerifiedIdentity, TrustedStoredSession, RestoredSessionCapability or permissions. */
export function inspectResponse(bytes: readonly number[], original: WireRequest, expected: unknown, policy: unknown,
  trustedNow: number, digest: BodyDigestPort) {
  const originalEnvelope = envelope(original), originalHeader = requestHeader(originalEnvelope.header, expected);
  if (typeof originalEnvelope.body !== 'string') return invalid(); hex(originalEnvelope.tag);
  const request = inspectRequest(utf8(JSON.stringify({ header: originalHeader, body: originalEnvelope.body, tag: originalEnvelope.tag })),
    expected, policy, trustedNow, digest).request;
  const v = envelope(parseWireJson(bytes)), h = responseHeader(v.header, expected); hex(v.tag);
  const r = request.header;
  for (const key of [...bindingKeys, 'protocolVersion', 'algorithm', 'requestId', 'requestKind', 'method', 'backendOrigin', 'backendPath'] as const) {
    if ((h as unknown as Record<string, unknown>)[key] !== (r as unknown as Record<string, unknown>)[key]) return invalid();
  }
  if (h.requestNonce !== r.nonce || h.requestTimestamp !== r.timestamp || h.requestBodyDigest !== r.bodyDigest ||
    r.timestamp - h.timestamp > CHANNEL.futureSkewMs) return invalid();
  checkFresh(h.timestamp, trustedNow, CHANNEL.responseAgeMs);
  verificationKey(policy, expected, h.keyId, 'RESPONSE', h.timestamp, trustedNow);
  const b = body(v.body, h.bodyDigest, digest);
  if (h.status === 'COMMITTED') {
    const payload = object(b.json, ['receipt']), receipt = inspectReceipt(payload.receipt, r, trustedNow);
    if (receipt.outcome !== 'COMMITTED' || receipt.backendDecisionAt - h.timestamp > CHANNEL.futureSkewMs ||
      receipt.databaseCommittedAt.status === 'KNOWN' && receipt.databaseCommittedAt.value - h.timestamp > CHANNEL.futureSkewMs) return invalid();
  } else if (h.status === 'REJECTED') {
    const payload = object(b.json, ['code', 'receipt']);
    if (!REJECTIONS.includes(payload.code as RejectionCode)) return invalid();
    if (payload.receipt !== null) {
      const receipt = inspectReceipt(payload.receipt, r, trustedNow);
      if (receipt.outcome !== 'REJECTED' || receipt.code !== payload.code || receipt.backendDecisionAt - h.timestamp > CHANNEL.futureSkewMs ||
        receipt.databaseCommittedAt.status === 'KNOWN' && receipt.databaseCommittedAt.value - h.timestamp > CHANNEL.futureSkewMs) return invalid();
    }
  } else {
    const payload = object(b.json, ['reason']);
    if (!['NO_RECEIPT', 'TIMEOUT', 'RESPONSE_LOST', 'UNAVAILABLE'].includes(payload.reason as string)) return invalid();
  }
  const response: Readonly<WireResponse> = Object.freeze({ header: h, body: b.text, tag: v.tag as string });
  return Object.freeze({ response, body: b.json, canonicalBytes: canonicalResponseBytes(h) });
}
