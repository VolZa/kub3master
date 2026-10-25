# ADMIN Web Identity — Contracts (Slices 2A / 2B.1)

Status: **LOCAL CONTRACTS, REFERENCE MODEL & TESTS ONLY**. No real login, crypto adapter, broker endpoint,
session persistence, OAuth configuration or GAS RPC integration. PRODUCTION, TEST_RESET execution
and ADMIN deployment remain **NO-GO**. This document records slice decisions, not a new ADR.

## Architecture and trust boundaries

Target: two independent ADMIN GAS projects, shared code, Execute as user deploying.
The deployer's Google authority accesses MASTER/OPERATIONAL; it does not identify the visitor.
Visitor identity will come from a separate Google OIDC assertion broker. Broker hosting and live
Google flow require separate approval. REPORTING may independently grant Viewer/copy/export via
Drive ACL; an ERP role neither grants nor revokes those ACLs. No REPORT_EXPORT or new role is added.

Implemented here: portable immutable types, strict validators, runtime provenance and pure candidate
state transitions. Not implemented: cryptographic verification, browser proof hashing, OAuth
state/cookie/PKCE exchange, user directory reads, session issuance, persistence or authorization.
`verifyBrokerAssertion` delegates signature checking to a trusted injected port; there is no default
or permissive verifier. With a deterministic verifier and explicit clock its validation is deterministic.
All other validation/transition helpers have no I/O, implicit clock/RNG or replay registry.

Browser input is limited to these exact shapes:

| Request | Allowed fields | Meaning |
| --- | --- | --- |
| Begin | browserProofBinding | SHA-256-shaped proof binding; shape is not proof of hashing |
| Complete | transactionId, browserProof | Original proof; future adapter must verify its hash against the server transaction |
| Session request | sessionCredential | Raw opaque bearer, only in authenticated RPC body and browser memory |

Environment, audience, Script ID, issuer, subject, authentication times, policy, signature port,
transaction/grant states and directory snapshots are trusted server inputs. They must never be
assembled from request fields. Exact-key parsers reject browser email/roles/permissions/context.
No arbitrary Spreadsheet ID, URL, permission name or handler name is accepted.

Types are not an authentication boundary: a structural validator accepts a server record's schema,
not its origin. It is the future handler's responsibility to obtain records from authoritative stores.
No public validator or DTO is proof of login and none grants PermissionService permissions.

## Files and principal types

`src/admin/web/identity-contracts/`:

- `contracts.ts`: contexts, TTL, transaction/assertion/grant/session/browser/public contracts and signature port.
- `validation.ts`: exact schema, context, timestamps, lifetime, request and session validators.
- `verification.ts`: signature-result validation and request-local opaque evidence/grant construction.
- `lifecycle.ts`: pure transaction, grant-redemption-plan and revocation transitions.
- `contracts.test.ts`: synthetic contract tests; no Google/Node runtime dependency in production modules.

`IdentityApplicationContext` requires environment, applicationAudience and expectedScriptId. There is
no default environment or ID. All three must exactly match at transaction/assertion/grant/session use.
`VerifiedIdentityContext` adds identityIssuer, identitySubject, authenticatedAt, authenticationExpiresAt
and provenance OIDC_BROKER_ASSERTION_V1. Identity key is canonical issuer + stable subject, never email.

## Runtime provenance

Three distinct stages:

1. `UnverifiedBrokerAssertion`: bounded opaque signed bytes. Decoding or {verified:true} proves nothing.
2. `VerifiedBrokerAssertion`: only returned after the injected signature port and every claim/context check succeed.
3. `TrustedLoginGrant`: created only from live runtime-branded verification evidence and a matching VERIFIED transaction.

Unexported unique-symbol type brands prevent accidental structural construction. A module-private,
immutable evidence class with an ECMAScript private field and private constructor capability rejects
forged casts at runtime, spreads, JSON copies and prototype grafts. Its reachable constructor cannot
be used without the private construction capability. No module-level spent-token registry is used.

This protects provenance against plain payload forgery, not a compromised trusted server adapter,
malicious script editor, forged verifier implementation or XSS stealing an actual browser bearer.
Evidence is local to one module instance/request, not a serializable persistent credential. No JSON
rehydration factory is provided. A future durable-store restore boundary needs explicit review.
These brands are distinct from PermissionService's verifiedIdentity brand; a type cast does not bridge them.

## Transaction lifecycle

```text
CREATED -> BOUND -> VERIFYING -> VERIFIED -> CONSUMED
CREATED / BOUND / VERIFYING / VERIFIED -> FAILED
CREATED / BOUND / VERIFYING / VERIFIED -> EXPIRED
CONSUMED / FAILED / EXPIRED are terminal
```

Transaction fields bind context, transactionId, browserProofBinding, nonce, createdAt, expiresAt,
updatedAt, status and consumedAt. IDs/bindings/nonces use a 256-bit lowercase hex representation;
format checks do not prove entropy. A future trusted CSPRNG must generate them.
Transitions may not move backwards in time, skip stages, repeat terminal states or perform live actions
at expiresAt. EXPIRED requires now >= expiresAt. CONSUMED requires consumedAt == updatedAt.

`transitionLoginTransaction` only produces a candidate state; moving to BOUND/VERIFYING/VERIFIED
does not perform proof/OAuth/signature checks. Future orchestration must enforce their evidence and
store a CAS/transaction result. The helper must never be a browser-selectable state-change RPC.

## Assertion verification contract

`BrokerSignatureVerificationPort.verify` must verify the exact input bytes, signature, pinned
algorithm/key and protected header before returning decoded claims and signature metadata.
Contract algorithms are HS256 or RS256, with one explicit algorithm + keyId pinned by server policy.
No algorithm/key discovery from browser or token URLs. This is an interface, not an implemented adapter.

`verifyBrokerAssertion` validates before/after that port:

- known server context, bounded live VERIFYING transaction, exact request envelope (<=8192 characters);
- exact broker issuer, application audience, Script ID and environment;
- purpose ADMIN_WEB_LOGIN_V1 and canonical Google identityIssuer;
- subject, assertionId, transactionId, nonce, proof binding;
- pinned signature metadata, all signature-covered timestamps and short assertion lifetime;
- verified authentication proof validity, not a caller-selected session lifetime.

Errors expose only IDENTITY_CONTRACT_INVALID. No raw verifier exception is retained or logged.
The cryptographic port is trusted server injection; a browser object cannot be selected as that port.
Local fake ports are test fixtures, not proof of Google signatures or key rotation.

Compared with existing prototypes this is a new versioned draft claim schema: it adds context,
purpose, keyId and signed upstream authentication timestamps. Existing prototypes/Node broker remain
unchanged and must not be connected by simply relabelling their old response.

## TTL policies

All timestamps are positive safe-integer Unix **milliseconds**, not JWT seconds. A future crypto
adapter must normalize verified Google iat/exp exactly once. No Date.now, time skew allowance or TTL
override comes from browser. At now == expiresAt the object is expired.

| Object | Contract maximum | Additional bound |
| --- | --- | --- |
| Login transaction | 120 seconds | Server createdAt/expiresAt |
| Broker assertion | 20 seconds | Signed upstream authentication expiry |
| Trusted login grant | 30 seconds | Transaction expiry and signed upstream authentication expiry |
| ERP session | 15 minutes | Signed upstream authentication expiry |
| Upstream authentication proof | 1 hour maximum | Broker-signed verified Google iat/exp |

These are local contract maxima, not deployed production configuration. `authenticatedAt` means
verified upstream token issuance time, not a claim that the visitor just entered a password or MFA.
If actual Google auth_time / step-up semantics are needed, they require a separate agreed contract.
`authenticationExpiresAt` is signature-covered, derived from verified upstream exp and capped by
policy. It cannot be an unsigned browser hint. Longer upstream proofs are conservatively blocked.

An assertion is verified while fresh. Its grant is created while verification evidence remains fresh.
Once accepted, grant redemption uses the grant's own expiry, not an already expired assertion.
SessionIssuePlan.expiresAt = min(redemptionNow + sessionMs, authenticationExpiresAt).
Therefore a 20-second assertion does not become a 20-second ERP session. We neither extend assertion
TTL nor ignore upstream authentication limits. Overflow, future timestamps and noninteger times fail closed.

## Grant and session lifecycle

Grant has context, trusted identity, transactionId, assertionId, deterministic grantId (transactionId),
issuedAt and expiresAt. Before recording it, a future persistent boundary MUST atomically fence
both transactionId and assertionId. Revalidating a signature is not proof of first use.

`availableGrantState` defines the initial server ledger record. `planGrantRedemption` accepts the
current AVAILABLE state, checks trusted grant, context and current server user active/version/identity,
and returns CONSUMED state plus a **SessionIssuePlan**, never a credential or stored session.
Reusing its returned CONSUMED state fails. Two callers using the same old AVAILABLE state can both
obtain a plan. Tests deliberately demonstrate this limitation: no atomic one-time guarantee is claimed.
Creation uniqueness and consume + session-record creation require a durable atomic store in Slice 2B+.

Server AdminSessionRecord adds opaque sessionId (lookup ID/digest), ACTIVE/REVOKED and revokedAt.
BrowserSessionCredential is a separate raw bearer shape. No RNG, hashing, session issuance or store
is implemented. PublicSessionStatus includes only environment/status/authenticated/expiresAt;
it omits session/grant IDs, tokens, issuer, subject, roles, permissions and configuration details.
Its validator checks only DTO consistency; it does not authenticate the caller.

`validateSessionUse` checks authoritative server record, context, expiry, active user and current
authorizationVersion. Actual PermissionService must independently authorize EVERY protected RPC.
There is no roles/permissions snapshot in session records and no implicit REPORT_VIEW admission rule.
`revokeSessionRecord` is a pure candidate state; it does not persist logout or interrupt in-flight work.

## Isolation, existing compatibility and integration

Only AdminEnvironment is reused as a type. Session/user structural fields align with existing
UserRepository issuer/subject/active/authorizationVersion, but no identity is injected into existing
PermissionService or security prototypes. Missing/unknown context fails closed.

PRODUCTION and TEST require separate Script IDs, audiences, directories, session namespaces and
broker signing/channel contexts. A future store key must include context, not just a raw grant/session ID.
TEST generation binding belongs additionally in future operation/ticket context; sessions cannot
select spreadsheet IDs or import production factories. Drive access to REPORTING is independent.

No imports into environment-context.ts, composition.ts, authorization.ts, entrypoints.ts, Rollup,
manifest or RPC allowlist. ADMIN shell remains BLOCKED / NOT_CONFIGURED / NOT_CONNECTED,
resetAllowed false. The new module cannot start login or access private resource state.

## Open questions and Slice 2B gates

1. Pin broker origin, audiences, allowed algorithm/key policy and rotation protocol; no real keys here.
2. Approve the versioned signed upstream timestamps and any auth_time/step-up requirements.
3. Select durable transactional store, context-scoped uniqueness, crash/unknown-commit recovery,
   safe trusted rehydration, admission limits and CSPRNG/clock/crypto adapters.
4. Decide login/logout and Google-account-event revocation semantics, idle timeout and session limits.
5. Integrate fixed auth-only RPCs after review; preserve business/reset holds and existing guards.

No ADR is created. An ADR for execution model + broker trust + storage/TTL policy can be proposed
for separate approval. See [threat model](ADMIN_WEB_IDENTITY_THREAT_MODEL.md).

## Local validation results

Baseline: feature/bom-logic, HEAD d4c3066, pre-existing uncommitted Slice 1 preserved.
Verified with Node 22.16.0:

- TypeScript `--noEmit`: PASS.
- Contract unit tests: 112 PASS.
- Full Vitest: 62 files / 1534 tests PASS.
- Existing ADMIN target checker: both targets PASS / NOT_CONFIGURED, two globals only.
- All 817 baseline files byte-identical; only the seven new Slice 2A files added.
- Production/readiness Code.gs generated in memory: SHA-256 identical before/after.

Reproduce locally with installed dependencies (no Google resources required):

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run src/admin/web/identity-contracts --silent
node node_modules/vitest/vitest.mjs run --silent
node scripts/check-admin-target.cjs
```

No commit, push/deploy, OAuth credentials, Google login, Script Properties/Sheets mutation or TEST_RESET.

## Slice 2B.1 — signed assertion application profile

The preceding sections document the preserved Slice 2A primitives. The new profile is stricter:
legacy HS256/RS256 types are NOT a wire-level acceptance policy for the new protocol. No old prototype,
security guard, PermissionService, GAS entrypoint, RPC allowlist, manifest or Rollup target is changed.

IMPLEMENTED LOCALLY:

- `signed-assertion-profile.ts`: standard Compact JWS structural validation and an explicit trusted
  signature-verification port. Structural success alone NEVER creates verified identity.
- `strict-json.ts`: bounded UTF-8/base64url decoding and JSON parsing with decoded duplicate-key
  detection (including escaped aliases). Arrays, excessive nesting, invalid UTF-8, malformed JSON,
  noncanonical base64url trailing bits and trailing input fail closed. No cryptographic algorithm.
- `signing-key-policy.ts`: versioned, context-scoped rotation/verification policy, without key material.
- `atomic-store-contracts.ts`: server commands, persistent record/receipt shapes and atomic outcomes.
- `session-store-contracts.ts`: digest-only session records, key provenance, revisions and capacity policy.
- `atomic-store-reference-model.ts`: in-memory optimistic serializable model; NEVER a production store.
- `atomic-store-contracts.test.ts`: local structural/provenance/race/fault-injection tests.

Protected header has EXACTLY `typ: "kub-admin-login+jws"`, `alg: "RS256"`, and a known `kid`.
All header fields are protected. `none`, HS256, `crit`, `b64`, `jku`, `jwk`, `x5u`, extra fields,
detached/multiple signatures and other extensions are rejected. Profile permits 256–512 byte RSA
signature encodings; actual key type/strength/signature validation belongs to the absent JOSE adapter.
Whole Compact JWS is at most 8192 ASCII characters. No compression or key fetching is implemented.

Payload has EXACTLY:

```text
protocolVersion = 1, purpose = ADMIN_WEB_LOGIN_V1,
issuer, applicationAudience, environment, expectedScriptId,
assertionId, transactionId, identityIssuer = https://accounts.google.com, subject,
nonce, browserProofBinding,
authenticatedAt, authenticationExpiresAt, issuedAt, expiresAt
```

All times remain Unix milliseconds, not JWT NumericDate seconds. This is JWS with an application JSON
payload, not a claim to implement registered JWT iat/exp semantics. The adapter verifies the ORIGINAL
`encodedHeader + "." + encodedPayload` bytes; no JSON canonicalization or decode/re-encode signature
check is allowed. Reordering JSON members does not alter structural meaning but does alter signed bytes.
There are no email, roles, permissions, resource IDs or browser-selected policy fields.

`verifySignedAssertion` calls an explicitly injected `ProfileSignatureVerificationPort`, accepts only
literal `true`, then reads the trusted clock AGAIN and repeats structural/time checks. It creates
private-field runtime evidence and uses the unchanged Slice 2A verifier boundary to create legacy
evidence. The normalization removes protocolVersion only AFTER the stricter V1 profile validates it.
Fake ports accepting synthetic signatures in tests are not evidence of cryptographic verification.
The port is trusted server injection, never an RPC argument. Browser proof hash ownership remains
the future broker/channel adapter's responsibility; equality of a 64-hex binding is not proof of possession.

## Key lifecycle

Policy version is 1, with one pinned brokerIssuer and 1–8 key rules. Each rule contains exact context,
keyId, RS256, signing/verification half-open intervals, ACTIVE/VERIFY_ONLY/RETIRED/REVOKED status,
revokedAt and compromised. Duplicate context+key IDs and inconsistent intervals are rejected.
Signing interval must lie inside verification interval. No private/public key material is stored here.

ACTIVE and VERIFY_ONLY keys can verify assertions issued within their signing interval. VERIFY_ONLY
does not authorize new signing; no signer is implemented. RETIRED denies new assertion verification;
REVOKED, non-null revokedAt, or compromised deny both new admission and existing session use.
Compromise overrides every previous status. All lookup is context-scoped;
token metadata cannot choose a different algorithm, environment, audience, Script ID or key origin.

Rotation: provision a new verification key, switch signing, retain the old rule VERIFY_ONLY, then retire.
Grant redemption still checks the verification window. Already-issued sessions use a separate
sessionProvenanceKey check: planned verification expiry and RETIRED do not shorten their lifetime.
Retain the old context-bound policy/provenance record until its sessions expire; a missing key record
fails closed. Broker issuer, key context, historical signing interval, compromise and revocation remain
checked. Compromise/revocation blocks related grants/sessions, identifiable by their signing-key
provenance. This is NOT automatic Google logout, bulk persistent revocation or security-event handling.
Real key custody, policy distribution, RSA verification, library selection and live rotation are MISSING.

## Atomic store boundary and durable receipts

All commands are SERVER-ONLY, never browser DTOs. Required fields: application context, operationId,
commandDigest, expectedRevision, decisionTime. Acceptance carries runtime verified assertion evidence.
Issuance carries grantId, credentialDigest and expectedAuthorizationVersion; identity comes from the
stored grant and the user comes from a trusted directory port. Extra roles/permissions/identity fields fail.
Actual directory adapters must project their current user into issuer/subject/active/authorizationVersion;
do not pass browser fields or infer permissions from this projection.

Expected revision means transaction revision for acceptance and grant revision for issuance. Outcome
lookup uses null revision and the ORIGINAL command digest. Its decision time is a fresh trusted time.
Digest material uses a fixed ordered JSON array of operation kind, context, operation ID, revision,
decision time and all semantic command fields. A trusted SHA-256 port must hash those exact bytes;
no digest implementation is supplied in runtime modules. The model recomputes and compares it.

Outcomes: COMMITTED, REPLAY, EXPIRED, CONFLICT, CONTEXT_MISMATCH, UNAVAILABLE, OUTCOME_UNKNOWN,
plus fail-closed INVALID and CAPACITY_EXCEEDED. No raw exceptions or private API bodies are returned.

`acceptAssertionAndCreateGrant`: in ONE transaction, consume authoritative transaction, reserve unique
assertion replay marker, insert at most one grant and one receipt. Nonce/proof/context/expiry must match.
`consumeGrantAndCreateSession`: in ONE transaction, consume authoritative AVAILABLE grant, insert
at most one digest-only session and one receipt. The legacy available-state helper is used only AFTER
the authoritative model grant has been checked AVAILABLE; it never restores a consumed grant.

Exactly one successful new consumer means one committed state transition. A duplicate request may
return the same COMMITTED receipt with recovered=true; it is not another consumer or business execution.
Different digest for the same live operation ID fails CONFLICT. IDs and store namespaces must be unique
within context; an external adapter must authenticate the calling application AND enforce the full
environment/audience/Script ID binding. Model instances each own a fixed context and separate maps.

Receipts store context, operation ID, command digest, operation kind, resulting lookup ID, accepted
decision time (committedAt), revision and retainUntil. No raw credential or assertion body is retained
in receipts. In the model committedAt is the trusted decision time of the winning operation, not a
database timestamp proving the exact wall-clock instant of the synchronous state swap.

After response loss, OUTCOME_UNKNOWN MUST NOT be interpreted as rollback. `getOperationOutcome`
returns the committed receipt only for matching context/ID/digest; absence remains OUTCOME_UNKNOWN
because an operation may be in flight or its receipt retention may have elapsed. It never creates state.
Retry exactly the same command only while its trusted decision time is valid; otherwise query outcome
with fresh time and original digest. A committed grant is never reset to AVAILABLE after a timeout.

No receipt/session credential replay via URL. If the browser loses the newly issued bearer, digest-only
persistence cannot recover it: use a new login, revoke an identifiable orphan or let it expire. Do not
create a second session for the spent grant. Receipts are server recovery metadata, not authentication
capabilities; copying a receipt cannot authorize a session or protected RPC.

## Reference model guarantees and limits

The model snapshots all maps, stages writes, yields at a controlled beforeCommit scheduling point,
checks a model-wide epoch, rechecks current clock/key policy/directory, then swaps the entire state
synchronously. Conflicts abort. Disjoint concurrent writes may conservatively conflict too; retry
requires fresh orchestration, not assumptions based on stale snapshots. Same-command duplicate
delivery can recover an existing receipt without another write. Rollback discards every staged map.

Faults can be injected after transaction/assertion/grant/session/receipt writes, before commit, or after
commit. Before-commit failures expose no partial state. After-commit response loss retains all state.
Live objects are checked again after a scheduling delay; expiration, key compromise, authorization
version changes and unavailable storage block issuance. Time is explicit, monotonic, server-controlled;
the model requires command decisionTime to equal its trusted clock when execution begins.

Session expiration = min(redemption decision time + 15m, signed upstream authentication expiry),
independent of the 20s assertion TTL and planned key verification expiry. No roles are copied into sessions.
Session credentials are supplied only as digests at the store boundary; schema cannot prove a caller
hashed a secret. The future crypto/orchestration adapter must ensure 256-bit CSPRNG secrets and real
digests. No entropy source, raw credential creation or browser delivery is implemented here.

Session records include revision, grant ID, signing issuer/key/algorithm/assertion provenance and
ACTIVE/REVOKED status. Model capabilities have private-field ownership and recheck authoritative
record identity, expiry, directory version and key policy. Casts, JSON copies, capabilities from another
model, revoked/stale records fail. Grant evidence is retained privately in memory, not serialized or
rehydrated from JSON. A REAL durable restore adapter is still MISSING and requires separate review.

Capacity is explicit: transaction/grant/session/receipt totals, live sessions per issuer+subject,
receipt retention and cleanup batch size. No production limits are selected by this slice; test values
are fixtures. Capacity pressure denies new admissions, never evicts live state to permit a replay.
Cleanup removes only expired eligible records in bounded batches. It does not extend validity.
Grant/transaction/marker retention includes their live expiry plus receiptRetentionMs; receipts are
retained through linked-object expiry plus that interval. Admission remains bounded if cleanup stalls.

THIS IS NOT DURABLE OR DISTRIBUTED ATOMICITY. Process loss destroys the model. It has no persistent
CAS, transactions across services, authenticated network channel, production capacity proof or live
revocation delivery. Its fixture seeding/fault/scheduling methods MUST NEVER become GAS RPCs.
PropertiesService directory and a future external session DB do not share a transaction: the model
rechecks current directory at commit and on every lookup, but cannot prove real cross-store snapshot
isolation. PermissionService still must authorize every protected business RPC after session resolution.

## Slice 2B.2 gates

Separately approve the real verifier/backend, maintained JOSE library, key custody/rotation, trusted
clock/CSPRNG/digest adapters, transactional DB, store capability restoration and authenticated channel.
Then run independent-worker CAS/replay tests, crash/timeout/unknown-commit fault injection, cleanup
capacity tests and PRODUCTION/TEST cross-project probes against isolated resources. No library install,
OAuth setup, Firestore setup, scope/whitelist change, broker deployment or target integration is part
of Slice 2B.1. ADMIN shell stays BLOCKED / NOT_CONFIGURED / NOT_CONNECTED / resetAllowed:false.

## Slice 2B.1 local validation results

Baseline: feature/bom-logic, HEAD b8ac7ab, clean tree before implementation.
Original implementation checks: TypeScript --noEmit PASS; identity suite 211 PASS
(112 preserved + 99 new); full Vitest 63 files / 1633 PASS using local Node 22.16.0. ADMIN target checker:
both targets PASS / NOT_CONFIGURED, only doGet/getAdminBootstrap, deploymentAllowed:false,
resetAllowed:false. No production/readiness build output is written by this validation.

In-memory Rollup Code.gs SHA-256 matches the baseline:

```text
production 88eb2e583ca8dec204d7f525dccb515bb4a72df06a3de0cb51f7084d99e2e54d
readiness  eb01e23a2d83da6839eea1b3aabcb5dd1bdec6cd9dedf8ac42764b1e3a922dc7
```

All 824 baseline files were checked: only these two identity documents changed; seven new files
were added under identity-contracts. Existing Slice 2A modules/tests, security prototypes, permission
service, authorization, GAS entrypoints, build targets and source configuration remain byte-identical.
The original local implementation used no Git commit/push, GAS deployment, Google resources,
OAuth setup or persistent store setup.

## Acceptance correction — session lifetime and planned key rotation

Acceptance review found two local coupling errors: session construction capped expiresAt with
verificationNotAfter, and session lookup reused the assertion verification-window check. Both were
corrected within Slice 2B.1. Session creation now keeps the unchanged Slice 2A session plan. Lookup
checks authoritative session provenance separately from eligibility to verify a NEW assertion/grant.
This does not add login, durable restore, crypto, storage, RPCs or new authority sources.

Regression tests cover the exact verification-window boundary, ACTIVE/VERIFY_ONLY/RETIRED policy,
rotation to a new key, session continuity via existing store capabilities, original session/upstream
expiration, and fail-closed compromise, revocation, unknown key, context and broker issuer. Assertion
verification remains blocked after the old verification window or retirement. Real persistent indexing
and bulk revocation of related grants/sessions remain a separately approved adapter concern.

Acceptance verification repeated from HEAD b8ac7ab: TypeScript --noEmit PASS; identity suite 221 PASS
(112 Slice 2A + 109 Slice 2B.1, including 10 acceptance regressions); full Vitest 63 files / 1643 PASS;
ADMIN checker both targets PASS; git diff --check PASS. In-memory production/readiness Code.gs
SHA-256 still equals the baseline hashes above. Only the nine approved Slice 2B.1 files are included
in the local checkpoint. Production/readiness sources, security prototypes, ADMIN entrypoints and
RPC/build allowlists are unchanged. No Slice 2B.2 implementation or external setup is included.
