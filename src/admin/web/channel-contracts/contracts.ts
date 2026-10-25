/** Autonomous candidate protocol. No imports into ADMIN targets or legacy authentication. */
export interface ChannelContext {
  readonly environment: 'PRODUCTION' | 'TEST';
  readonly applicationAudience: string;
  readonly expectedScriptId: string;
}
export const CHANNEL = Object.freeze({ version: 1 as const, algorithm: 'HMAC-SHA256' as const,
  maxWireBytes: 65_536, maxBodyBytes: 16_384, maxDepth: 8, maxNodes: 1024,
  requestAgeMs: 60_000, responseAgeMs: 30_000, futureSkewMs: 5_000,
  commandAgeMs: 120_000, nonceRetentionMs: 120_000 });
export type OperationKind = 'ACCEPT_ASSERTION' | 'ISSUE_SESSION';
export type RequestKind = 'MUTATION' | 'RECEIPT_LOOKUP';
export interface OperationBinding extends ChannelContext {
  readonly operationId: string;
  readonly operationKind: OperationKind;
  readonly commandDigest: string;
  /** Trusted GAS orchestration clock, never browser time. Stable across recovery requests. */
  readonly commandCreatedAt: number;
}
export interface RequestHeader extends OperationBinding {
  readonly protocolVersion: 1;
  readonly algorithm: 'HMAC-SHA256';
  readonly keyId: string;
  readonly requestId: string;
  readonly requestKind: RequestKind;
  readonly method: 'POST';
  readonly backendOrigin: string;
  readonly backendPath: '/v1/operations' | '/v1/operations/lookup';
  readonly timestamp: number;
  readonly nonce: string;
  readonly bodyDigest: string;
}
export type ResponseStatus = 'COMMITTED' | 'REJECTED' | 'OUTCOME_UNKNOWN';
export interface ResponseHeader extends OperationBinding {
  readonly protocolVersion: 1;
  readonly algorithm: 'HMAC-SHA256';
  readonly keyId: string;
  readonly requestId: string;
  readonly requestKind: RequestKind;
  readonly method: 'POST';
  readonly backendOrigin: string;
  readonly backendPath: RequestHeader['backendPath'];
  readonly requestTimestamp: number;
  readonly requestNonce: string;
  readonly requestBodyDigest: string;
  readonly timestamp: number;
  readonly status: ResponseStatus;
  readonly bodyDigest: string;
}
/** body is the exact UTF-8 JSON text hashed on the wire; it is not reserialized for hashing. */
export interface WireRequest { readonly header: Readonly<RequestHeader>; readonly body: string; readonly tag: string }
export interface WireResponse { readonly header: Readonly<ResponseHeader>; readonly body: string; readonly tag: string }
/** Must hash exactly these bytes with SHA-256. No implementation/default is supplied. */
export interface BodyDigestPort { digest(bytes: readonly number[]): string }
export type Direction = 'REQUEST' | 'RESPONSE';
export interface ChannelKeyRule {
  readonly keyId: string;
  readonly direction: Direction;
  readonly signingNotBefore: number;
  readonly signingNotAfter: number;
  readonly verificationNotAfter: number;
  readonly status: 'ACTIVE' | 'VERIFY_ONLY' | 'REVOKED';
  readonly revokedAt: number | null;
  readonly compromised: boolean;
}
export interface ChannelKeyPolicy extends ChannelContext {
  readonly backendOrigin: string;
  readonly keys: readonly Readonly<ChannelKeyRule>[];
}
export interface ChannelExpectation extends ChannelContext { readonly backendOrigin: string }
/** Port only. Authenticity of this injected server implementation is a reviewed-composition assumption. */
export interface ChannelMacVerificationPort {
  verify(direction: Direction, canonicalBytes: readonly number[], tag: string, key: Readonly<ChannelKeyRule>): boolean;
}
export interface NonceClaim extends ChannelContext {
  readonly direction: 'REQUEST';
  readonly nonce: string;
  readonly requestId: string;
  readonly timestamp: number;
  readonly receivedAt: number;
  readonly retainUntil: number;
}
export type ReplayClaimOutcome = 'CLAIMED' | 'DUPLICATE' | 'UNAVAILABLE' | 'OUTCOME_UNKNOWN' | 'CAPACITY_EXCEEDED';
/** Durable create-if-absent across workers. Namespace is context + direction + nonce, NOT keyId.
 * For mutations, admission and operation receipt must use a transactionally safe protocol.
 * No in-memory implementation or production atomicity claim is supplied. */
export interface DurableReplayLedgerPort { claim(claim: Readonly<NonceClaim>): Promise<ReplayClaimOutcome> }
export type DatabaseCommitTime = { readonly status: 'KNOWN'; readonly value: number } |
  { readonly status: 'UNAVAILABLE'; readonly value: null };
export interface RemoteOperationTimes {
  readonly commandCreatedAt: number;
  readonly backendDecisionAt: number;
  readonly databaseCommittedAt: Readonly<DatabaseCommitTime>;
}
export type RejectionCode = 'ACCESS_DENIED' | 'INVALID' | 'REPLAY' | 'EXPIRED' | 'CONFLICT' |
  'UNAVAILABLE' | 'CAPACITY_EXCEEDED' | 'CONTEXT_MISMATCH';
/** Digest-only identifiers; no raw session credential, assertion, proof or Google response. */
export interface OperationReceipt extends OperationBinding, RemoteOperationTimes {
  readonly outcome: 'COMMITTED' | 'REJECTED';
  readonly receiptId: string;
  readonly objectId: string | null;
  readonly revision: number | null;
  readonly code: RejectionCode | null;
  readonly retainUntil: number;
}
export interface ReceiptLookup extends OperationBinding {}
/** Lookup is read-only for transaction/grant/session/receipt state. Missing receipt is UNKNOWN. */
export interface OperationRecoveryPort {
  lookup(query: Readonly<ReceiptLookup>): Promise<Readonly<OperationReceipt> | { readonly outcome: 'OUTCOME_UNKNOWN' }>;
}
declare const authenticatedResponse: unique symbol;
declare const restoredSession: unique symbol;
/** Opaque requirements for FUTURE readers, not runtime evidence produced by these types. */
export interface AuthenticatedBackendResponse { readonly [authenticatedResponse]: true }
export interface RestoredSessionCapability { readonly [restoredSession]: true }
export interface SessionRestorationRequirements extends ChannelContext {
  readonly credentialDigest: string;
  readonly requiredChecks: readonly ['AUTHENTICATED_RESPONSE', 'REQUEST_BINDING', 'AUTHORITATIVE_OWNERSHIP',
    'AUTHORITATIVE_CURRENT_RECORD', 'SIGNING_KEY_PROVENANCE', 'REVOCATION',
    'SESSION_EXPIRY', 'UPSTREAM_EXPIRY', 'CURRENT_USER', 'AUTHORIZATION_VERSION'];
}
/** No implementation or capability factory. Future adapters must authenticate exact response bytes,
 * enforce request binding, and mint private runtime evidence only inside a closed reviewed module.
 * Session reads need their own future wire schema; operation receipts cannot establish a session. */
export interface ReviewedBackendResponseReaderPort {
  authenticate(request: Readonly<WireRequest>, responseBytes: readonly number[], trustedNow: number): AuthenticatedBackendResponse;
  readReceipt(evidence: AuthenticatedBackendResponse): Readonly<OperationReceipt> | undefined;
  restoreSession(authoritativeSessionResponse: AuthenticatedBackendResponse,
    requirements: Readonly<SessionRestorationRequirements>): RestoredSessionCapability;
}
