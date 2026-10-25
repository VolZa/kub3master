# ADMIN Web Identity — Contracts (Slice 2A)

Status: **LOCAL CONTRACTS & TESTS ONLY**. No real login, crypto adapter, broker endpoint,
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
