# ADMIN Web Channel & Wire Contracts — Slice 2C.2

## Status and scope

LOCAL CONTRACTS ONLY. The autonomous module is `src/admin/web/channel-contracts/`.
No ADMIN, production or readiness target imports this module. Slice 2C.2a shares its pure semantic/
receipt contracts with the local identity/reference-model/authentication layers; no transport is connected.
HMAC-SHA256 is a candidate, not an approved production channel. There is no real signer/verifier,
network adapter, broker, database, replay ledger, durable recovery adapter, or capability restoration.
No OAuth configuration, scopes, manifests, RPC allowlist, Script Properties or Google resources change.

Slice 2C.2a resolves the local command-digest/clock/receipt signature incompatibility using approved
in-place evolution. Runtime integration remains BLOCKED pending real authenticated channel/backend,
remote session reader, independent backend JWS verification and persistent recovery coordination.
PRODUCTION, TEST_RESET execution and ADMIN deployment remain NO-GO.

## 1. Protocol version

`protocolVersion: 1`, `algorithm: "HMAC-SHA256"`. Direction-specific domain strings below are part of
the versioned protocol, not broker JWS algorithms. Broker assertions remain subject to the existing RS256 profile.
All identifiers/digests/nonces/tags are exactly 64 lowercase hex characters. Keys use 1–80 ASCII
alphanumeric/underscore/hyphen characters. The protocol requires SHA-256 for body/command digests and
32-byte HMAC-SHA256 tags, but supplies only a digest port and MAC-verification port.

Runtime contracts use only ECMAScript data/functions; they do not require Node, GAS globals or Web Crypto.
`node:crypto` appears only in tests for SHA-256; synthetic test tags are explicitly NOT HMAC.

## 2. Trust boundaries

The browser cannot select authoritative context, keys, adapters, backend destination or timestamps.
Reviewed GAS server composition supplies an immutable expected environment/audience/Script ID/origin.
Backend installation registration must independently bind those values to the channel credential.
An expected value copied from a browser request is not an expectation source.

HMAC proves possession of a key. It does **not** attest a particular GAS deployment, code version or
Google identity. A compromised editor/runtime/key holder can generate equivalent HTTP requests.
Separate request and response key IDs are enforced; independently generated secret material must be
enforced by the future provisioning process (IDs alone cannot prove independent key material).
Never put a service-account private key, channel key, token or secret in browser code or this repository.

`inspectRequest`, `inspectResponse`, `inspectReceipt`, key validation and canonical encoding establish
only structure/binding. A schema-valid tag can still be forged. These functions never authorize an RPC,
claim a nonce, create a session, mint private evidence or call `PermissionService`.

Future processing order: bounded parsing/inspection -> real MAC verification -> positive durable nonce
admission -> authoritative business validation/atomic operation. Reject any failure or unknown dependency.
The digest/MAC/store port implementations themselves belong to the trusted, reviewed composition boundary.

## 3. Request schema

Envelope has exactly `{ header, body, tag }`. `body` is exact UTF-8 JSON text, not an object to reserialize.
Headers have exactly the following fields:

```typescript
{
  protocolVersion: 1; algorithm: "HMAC-SHA256"; keyId: string;
  requestId: string; requestKind: "MUTATION" | "RECEIPT_LOOKUP";
  operationId: string; operationKind: "ACCEPT_ASSERTION" | "ISSUE_SESSION";
  commandDigest: string; commandCreatedAt: number;
  method: "POST"; backendOrigin: string; backendPath: string;
  environment: "PRODUCTION" | "TEST";
  applicationAudience: string; expectedScriptId: string;
  timestamp: number; nonce: string; bodyDigest: string;
}
```

Routes are fixed: MUTATION -> `/v1/operations`, RECEIPT_LOOKUP -> `/v1/operations/lookup`.
Origin is canonical lowercase HTTPS hostname, optionally a nondefault port. No URL credentials,
IP literals (including alternate numeric IPv4 spellings), query, fragment, path or caller-directed redirect
is accepted. DNS labels are at most 63 characters and the final label begins with an ASCII letter.

Mutation body is a bounded JSON object; the future operation-specific adapter must validate its business
schema (including assertion/proof semantics). This slice does not make arbitrary bodies valid business commands.
Lookup body is exactly `{ operationId, commandDigest }`, both matching the header. Lookup preserves the
original operation kind, context, commandCreatedAt and commandDigest, but uses fresh transport ID/nonce/time.

## 4. Response schema

Envelope is also exactly `{ header, body, tag }`. Response header carries the request's binding and route
fields plus its own response `keyId`, `timestamp`, `bodyDigest`, and `status`.
It echoes `requestTimestamp`, `requestNonce`, `requestBodyDigest` instead of request `timestamp`, `nonce`.
Status is only `COMMITTED | REJECTED | OUTCOME_UNKNOWN`, MAC-covered together with all header fields.

`inspectResponse` revalidates the original request and compares request ID, operation ID/kind/digest,
commandCreatedAt, context, version, algorithm, origin/path/method, kind, nonce, timestamp and body digest.
Different response keys are expected; a request-direction key cannot verify a response.

Bodies:

- COMMITTED: exactly `{ receipt }`, with a matching COMMITTED receipt.
- REJECTED: exactly `{ code, receipt }`, with a fixed rejection code and null or matching REJECTED receipt.
- OUTCOME_UNKNOWN: exactly `{ reason }`, reason = NO_RECEIPT / TIMEOUT / RESPONSE_LOST / UNAVAILABLE.

HTTP status is not an operation outcome. Timeout, connection failure or lost response may follow a commit.
There is no PASS/ALLOW status. A terminal code without a durable rejection receipt is not proof of a
persisted rejected operation. Never downgrade uncertain writes to REJECTED just because transport failed.

The future authenticated reader must verify the exact response MAC, tie it to a pending request and
prevent reuse as a fresh admission. Receipt lookup can return the same immutable receipt repeatedly.
Old responses do not match the fresh transport ID/nonce of a restarted client's recovery request.
No response is accepted as trusted solely by schema validation.

## 5. Canonical encoding and limits

No reliance on JSON object-key order. Every canonical message is a fixed ordered sequence of fields.
Each field is `uint32 big-endian byteLength || exact UTF-8 bytes`. Numeric values use unsigned decimal
ASCII, with no leading zeros (except zero itself); only safe integers are encodable. No BOM, Unicode
normalization, delimiters, trailing bytes or optional fields. Lengths count bytes, not UTF-16 units.

REQUEST order:

```text
domain KUB_ADMIN_CHANNEL_REQUEST_V1
protocolVersion, algorithm, keyId, requestId, requestKind, method, backendOrigin, backendPath,
environment, applicationAudience, expectedScriptId, operationId, operationKind, commandDigest,
commandCreatedAt, timestamp, nonce, bodyDigest
```

RESPONSE order:

```text
domain KUB_ADMIN_CHANNEL_RESPONSE_V1
protocolVersion, algorithm, keyId, requestId, requestKind, method, backendOrigin, backendPath,
environment, applicationAudience, expectedScriptId, operationId, operationKind, commandDigest,
commandCreatedAt, requestTimestamp, requestNonce, requestBodyDigest, timestamp, status, bodyDigest
```

COMMAND order (SHA-256, original mutation body digest):

```text
domain KUB_ADMIN_CHANNEL_COMMAND_V1
protocolVersion, backendOrigin, environment, applicationAudience, expectedScriptId,
operationKind, operationId, commandCreatedAt, originalBodyDigest
```

COMMAND excludes transport IDs/nonces/timestamps/keys and lookup route/body. Same logical operation
keeps its digest during recovery. Mutation inspection recomputes it; lookup compares the original digest
to its exact lookup body and the future authoritative receipt (it cannot reconstruct the mutation).
`bodyDigest` hashes exact body UTF-8 bytes, including whitespace and Unicode representation.

Limits: wire <=65,536 bytes; decoded exact body <=16,384 bytes; JSON nesting <=8; values <=1,024 nodes.
Envelope escaping counts against the wire limit independently. Strict parser rejects duplicate decoded
keys (including escaped spellings), invalid UTF-8, BOM, lone surrogates, nonfinite numbers and trailing
data. Header/envelope/receipt schemas reject extra fields. Bodies are parsed but never logged.
All contract validation errors use the fixed code `CHANNEL_CONTRACT_INVALID`.
These are local parsing limits, not a guarantee that a future HTTP adapter bounds data before reading it.
Field types come from the strict header schema: null, omitted, empty, numeric zero and string zero
cannot substitute for a positive timestamp. The primitive frame uses decimal text for numeric fields;
it is not a generic type-tagged serializer for arbitrarily typed values. Canonical byte arrays and
inspected header snapshots are immutable; changing a field requires different bytes and a new MAC.

## 6. Remote clock semantics

All times are positive safe integer Unix milliseconds, never browser-provided.

| Field | Authoritative source | Meaning |
| --- | --- | --- |
| commandCreatedAt | Trusted GAS orchestration clock | Original logical command creation |
| request timestamp | Trusted GAS clock | Fresh transport attempt, including lookup |
| backendDecisionAt | Trusted backend clock | Admission/business decision; not actual commit |
| databaseCommittedAt KNOWN | Exact database metadata | Actual database commit timestamp |
| databaseCommittedAt UNAVAILABLE | Explicit null | Store does not expose exact commit time |
| response timestamp | Trusted backend clock | Response generation, including historical lookup |

Candidate policy: request age <60s, response age <30s, future clock skew <=5s. Mutations additionally
require command age <120s. At exact expiry reject. These transport values do not alter identity TTL policies.
Acceptance-window inputs must themselves be positive safe integers; NaN/infinite/invalid windows reject.
Response must not precede request time by >5s. A direct response cannot be processed after its original
request's 60s freshness window; recover using a new lookup instead.

For historical receipts, backendDecisionAt may precede commandCreatedAt by at most 5s due to clock skew,
and may follow it by at most 125s. Known DB commit may precede backendDecisionAt by at most 5s across
clock domains; decision/known commit cannot be >5s ahead of trusted observation time. The backend must
also enforce the real business expiry at authoritative admission/commit; metadata checks cannot prove it.
Clocks outside the supported skew fail closed. Equality of the three timestamps is never required.

`databaseCommittedAt` is `{ status: "KNOWN", value: number }` or
`{ status: "UNAVAILABLE", value: null }`. UNAVAILABLE exact time is not OUTCOME_UNKNOWN: a durable
COMMITTED receipt may exist without the store exposing its exact timestamp. Do not substitute decision
time, response time, local time or receipt lookup time as database commit time.
Historical receipt recovery is evaluated against its original command and retention, not current command
freshness. Its lookup envelope still must be fresh. No browser clock is an authority.

## 7. Replay protection

`DurableReplayLedgerPort` requires create-if-absent across independent workers and process restarts.
Uniqueness namespace: environment + audience + Script ID + REQUEST direction + nonce. It deliberately
excludes keyId, so overlap/rotation does not admit a nonce twice. Request ID is audit/binding data,
not the sole replay key. `nonceClaimPlan` is only a plan; it does not claim anything.

Retain marker until `max(receivedAt, requestTimestamp) + 120s`, beyond the 60s acceptance window with
5s future skew. Ledger expiry is not permission to accept an expired request. Cleanup never deletes
live markers or operation receipts. Capacity exhaustion blocks admission rather than evicting live state.
Any DUPLICATE / UNAVAILABLE / OUTCOME_UNKNOWN / CAPACITY_EXCEEDED result blocks. Only authenticated
requests with a positive durable CLAIMED result can progress. Pure `replayDisposition` is not evidence
that a real ledger was consulted. There is no production Map/Set replay store in this module.

For mutations, nonce admission and business operation outcome must have a safe transactional protocol.
A crash after a nonce claim cannot justify retrying a mutation. Existing operation state/receipt is the
authority; lookup uses fresh transport nonce while preserving original operation identity.
Lookup reads business/receipt state without creating grant/session/receipt. Its channel replay admission
may write a separate transport marker; this is distinct from a business-state mutation.

Key policy allows ACTIVE/VERIFY_ONLY overlap, checks the message's signing window and current verification
window, and rejects unknown, revoked or compromised keys. Key IDs are unique across directions.
Compromise/revocation blocks immediately when observed, including pending responses; no permissive stale
policy fallback is allowed. Rotation cannot reopen old nonces. Retain necessary policy history/markers
through the full acceptance/recovery window. Provisioning, policy distribution and revocation freshness
are future work; no secret material lives in ChannelKeyPolicy.

## 8. Unknown-outcome recovery

```text
Operation -> COMMITTED / REJECTED / OUTCOME_UNKNOWN
OUTCOME_UNKNOWN -> authenticated fresh Receipt Lookup -> authoritative receipt or OUTCOME_UNKNOWN
COMMITTED -> resolve authoritative current state (never authorize from receipt alone)
REJECTED -> stop; no automatic replacement mutation
```

Lookup uses original context, operation ID/kind, command digest and command creation time. Digest conflict
is not success. Missing receipt does not mean rollback or permit a second mutation. Read timeout remains
unknown. Response loss/repeated lookup does not issue another grant or session.

Transport retry changes only the transport attempt: fresh request ID, nonce, timestamp and possibly a
rotated channel key; the operation ID and semantic command digest stay unchanged. Replaying the exact
same transport nonce is blocked. A fresh nonce alone never grants permission to repeat a business mutation.
After OUTCOME_UNKNOWN, the recovery action is lookup only, not resubmission of MUTATION.
Business-operation retry means a new admission/operation ID and requires authoritative resolution of
the previous operation plus a separately permitted workflow. An unknown result cannot automatically
trigger it. The autonomous module performs neither kind of retry and has no mutation executor.

Receipt fields: operation binding, remote times, outcome, receiptId, objectId, revision, code, retainUntil.
COMMITTED requires digest-only objectId, positive revision, null code. REJECTED requires null objectId/
revision and a fixed code. Retention must extend past observation and recorded decision/known commit.
Unknown operation state has no fabricated terminal receipt. Raw session credentials, proofs, assertion
text and Google API messages are forbidden in receipts; exact-field validation rejects additional fields.

After process restart, recover the nonsecret operation identity from separately approved persistent client
coordination, then create a fresh authenticated lookup. Persistence for this coordination is not implemented.
Never persist/recover a bearer from a receipt. If the original transient bearer is lost, a future policy
must handle the orphan session and require fresh login; do not redeem the same grant again.

## 9. Trusted provenance restoration

`ReviewedBackendResponseReaderPort` is a future contract only. There is no callable factory, default
reader or runtime capability mint in this slice. Unique-symbol interfaces are documentation/type barriers,
not proof of runtime authenticity; a TypeScript cast cannot establish any trust.

The future reader must authenticate the response, verify pending request/context ownership, reject stale
or substituted responses and restore evidence within a module-private runtime boundary tied to the
reviewed backend/store instance. A JSON object, boolean "verified" flag or receipt cannot be that evidence.
Session restoration requires a separate authoritative current session response and checks of credential
digest/context, expiry/upstream expiry, signing-key provenance/compromise, revocation, current user and
authorizationVersion. A session-read wire schema/adapter is deferred; operation receipts cannot replace it.
Permissions remain with current server UserRepository and PermissionService, never browser roles/email.
Planned signing-key rotation must preserve valid existing session lifetime; compromise must remain revocable.

## 10. Integration blockers and future approvals

The former one-decisionTime/exact-clock-equality contracts are superseded by Slice 2C.2a.
`operation-contracts.ts` owns canonical semantic bytes; `canonicalCommandBytes` delegates to it after
strict header validation. Existing COMMAND_V1 domain/length framing/ordered fields and request/response
MAC candidates are byte-identical. Existing golden vectors are unchanged; no silent wire reinterpretation
or new protocol version is introduced. Local legacy JSON-array digests are rejected without fallback.

Deterministic mutation bodies use these exact property orders:

- ACCEPT_ASSERTION: `{ expectedRevision, assertion }` (exact original Compact JWS).
- ISSUE_SESSION: `{ expectedRevision, grantId, credentialDigest, expectedAuthorizationVersion }`.

Body JSON uses validated primitives and fixed ordering, UTF-8 without normalization; all existing revision
and authorization preconditions are hashed. OperationDescriptor includes transient body, originalBodyDigest
and commandDigest; RecoveryDescriptor omits body/JWS/bearer, adding expected revision/object for checking.
The credential/proof text digest port stays separate from the shared byte-oriented command SHA-256 port.

commandCreatedAt is application-owned and immutable. The reference model samples backendDecisionAt
from its independent backend clock; final expiry/key/directory checks use a fresh actual backend time.
No caller/backend equality is needed for reads/revocation/cleanup. It always uses explicit DB timestamp
UNAVAILABLE, never a fake KNOWN time. Historic lookup validates original binding/retention without
reapplying original command freshness. Fresh transport lookup still hashes its OWN lookup body and uses
fresh nonce/ID/key/time; these never replace originalBodyDigest or alter the original business digest.

Business receipt DTO, transport response and verified runtime receipt capability are separate. Private
local ReceiptEvidence belongs to one model owner and a current retained record; only its paired reader
can inspect it authoritatively. JSON/TypeScript casts do not mint evidence. This does not implement a
cryptographic remote reader or durable restoration. COMMITTED with UNAVAILABLE DB time is confirmed,
but never releases a bearer without fresh authoritative session/user/version/key/expiry checks.

The optional metadata-only RecoveryCoordinatorPort saves before dispatch and loads the original immutable
context-bound descriptor after restart. Internal recoverOperation is lookup-only, returns no credential,
and never issues a replacement command/grant/session. There is no persistent coordinator implementation;
test-only surviving Map fixtures are not a distributed atomicity or crash-durability proof. A missing
receipt/metadata or unavailable lookup stays UNKNOWN. Lost bearer cannot be reconstructed from a receipt.

Strict existing proof/session chronology is preserved even within transport skew: a locally verified
proof ahead of backend time or a session issued ahead of application time blocks until applicable clocks
permit the check. Independent backend verification of exact JWS and a reviewed remote session-read
protocol remain necessary; no timestamp is rewritten to conceal this boundary.

Further gates: real channel mechanism approval, reviewed HMAC/digest/entropy adapters, backend installation
registry, bounded HTTP transport, durable nonce/operation transaction design, private capability restoration,
session-read schema, persistent restart coordination, live distributed/fault tests and independent security review.
None of the local synthetic tests prove cryptography, durable storage, deployment attestation or distributed atomicity.

Future browser/OIDC handshake must establish a cookie-bound challenge before OAuth, state, nonce, CSRF
protection, browser proof binding and exact callback/origin constraints. Never put browser proof, assertion,
session credential or tokens in URLs. Proof digest matching alone is not a complete login-CSRF solution.
No OAuth flow, login UI, browser handshake or GAS entrypoint is implemented here.
