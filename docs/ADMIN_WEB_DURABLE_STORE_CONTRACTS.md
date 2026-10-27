# ADMIN Web Durable Store Contracts - Slice 2C.3B.1

Status: LOCAL CONTRACTS / ASYNC SERVICES / UNIT TESTS ONLY. Baseline feature/bom-logic,
HEAD 9f41567, clean working tree and empty staging before implementation. Firestore is only a
candidate. No SDK, backend package, emulator harness, network/crypto adapter, broker, persistent
coordinator, Google resource, production configuration or ADMIN login RPC is created here.
PRODUCTION, TEST_RESET execution and ADMIN deployment remain NO-GO.

## Durable grant projection

`src/admin/web/identity-contracts/durable-store-contracts.ts` defines DurableGrantProjection.
It retains GrantRecord context/IDs/assertion reference, revision, lifecycle, consumedAt, issuedAt,
expiresAt and signing-key provenance. It adds only schemaVersion:1 and four historical identity
facts: identityIssuer, identitySubject, authenticatedAt and authenticationExpiresAt. Email, roles,
permissions, raw bearer/browser proof/OAuth code/private key are not accepted fields. Existing
assertionId duplication in GrantRecord/signingKey is checked for equality, not expanded further.

This persistence schema version is NOT a change to Wire v1. No new business body, digest framing,
request/response fields, protocol fallback or RPC is introduced.

The existing deterministic grantId == transactionId relationship is enforced even if both candidate
DTO and supplied binding agree on a different grant ID. Grant creation remains revision 0 /
AVAILABLE / consumedAt:null. Atomic one-time redemption produces
revision 1 / CONSUMED with a consumption time inside the grant lifetime. Strict schema validation
rejects missing/extra fields, unsupported schema, malformed identity, context/ID/revision mismatch,
invalid timestamps, excessive grant/upstream lifetime and inconsistent provenance. DTO validation
can inspect historical consumed records; restorableGrantProjection separately requires AVAILABLE,
fresh grant lifetime/upstream expiry and a currently eligible verification key. An already expired
original assertion does not by itself invalidate a live independently issued grant.

DurableGrantBinding is independent trusted expectation: context, grant/transaction/assertion IDs,
expected revision and canonical issuer + subject. A future reader must obtain that linkage from
its reviewed authoritative store/acceptance records, not echo browser fields or copy the candidate
DTO. The original transaction expiry and store ownership must also be checked by that reader;
the DTO does not duplicate transaction records or pretend to prove their state.

## Restoration boundaries

These are separate, required stages:

1. Bound, strict persistence DTO validation (data only).
2. Authenticate authoritative project/database/path/store ownership via the reviewed adapter.
3. Bind context, identity/linkage, record ID and expected revision to independent expectations.
4. Await fresh authoritative lifecycle/key policy and trusted time checks; reject stale/consumed state.
5. Only the reviewed closed implementation may mint private owner-bound runtime evidence.
6. Its paired reader rechecks current ownership/record/policy before controlled store consumption.

GrantRestorationPort.restore and RestoredGrantReaderPort.read are async requirements, not implementations.
TrustedRestoredGrant is an opaque interface with NO runtime production factory. durableGrantProjection
and restorableGrantProjection return frozen data, never TrustedLoginGrant/VerifiedIdentity/session evidence.
Existing legacy evidence readers reject such DTOs/casts/JSON. No public JSON rehydration factory or
alternate legacy-evidence issuer is provided. The login orchestrator still sends a grant ID to the
atomic store; it does not accept a browser-supplied restored grant or bypass atomic consumption.

Only durable-store-contracts.test.ts supplies a synthetic owner-bound restoration implementation.
It checks independent fixture linkage, current record identity/revision, policy and time. Copies,
JSON, inherited evidence, casts, foreign owners, changed context/revision, unavailable storage,
consumed grants and revoked/compromised keys fail. These tests demonstrate contract boundaries,
not Firestore durability, real cryptography or distributed ownership authentication.

## Async application boundaries

SessionStorePort now returns promises for readSession, revokeSession and cleanup. The separately named
ReferenceSessionStorePort retains the unchanged synchronous standalone reference-model surface;
AtomicStoreReferenceModel implements ONLY that reference surface. Runtime composition does not wrap
a synchronous cache as an authoritative remote read. Test-only adapters await the model to preserve
existing invariant tests while exercising the application's async control flow.

TrustedSessionReaderPort.read and OperationReceiptReaderPort.read return promises. Transaction/receipt
lookup remains async. Signing-policy retrieval and TrustedVerificationPort.verify are awaited.
SessionResolver.resolve/read, authorization require/authorize and composition authorize now propagate
promises. All callers must await decisions; no truthy Promise may be treated as authorization.
These modules are not wired into GAS entrypoints or ADMIN bundles.

Application context and local monotonic time are checked after awaited I/O. Session DTOs and nested
signing metadata are detached/frozen before the next await. Authorization rechecks authoritative
session/revocation/policy state after its first PermissionService decision, checks stable identity/
revision/provenance, then calls PermissionService AGAIN using current directory permissions. Roles
are never copied from the browser or stored grant. PermissionService itself is unchanged.

## Read failure and timeout

authoritative-reads.ts provides Promise-based deadline racing using an injected ReadDeadlinePort.
No Node/GAS/browser timer implementation ships in runtime code. A real scheduler/deadline adapter
is still missing and must be reviewed. Missing deadline configuration denies local composition.
Test-only timer adapters demonstrate cancellation, unavailable readers and non-settling reads.

The 5000ms AUTHORITATIVE_READ_TIMEOUT_MS is an I/O wait budget, NOT an authentication TTL, grace
period, database commit deadline or proof of expiry-valid admission. Cancellation ends the wait;
it does not claim to cancel network work or roll back a database operation. Read-only dependencies
can finish late, but their result cannot release a session after the caller already denied.

Timeout/unavailable session reader or policy denies access. Timeout during unknown-outcome receipt
lookup remains OUTCOME_UNKNOWN, with no replacement mutation or credential generation. A real
COMMITTED receipt with databaseCommittedAt:UNAVAILABLE is still a committed operation; inability
to complete a current reader/session check blocks authorization, not proof of rollback.

## Expiry capability gate

DurableAdmissionRequirements explicitly demands strict expiry-at-commit, a verified authoritative
clock across workers/restart, reviewed restoration and an explicitly approved directory consistency
model. VerifiedDurableGuarantees is opaque, but the type itself is not evidence.

requireDurableAdmissionGuarantees rejects EVERY input in this slice. There is no positive evidence
issuer or approved temporal implementation. durableAdmissionGate always reports BLOCKED, with expiry
and clock UNVERIFIED, restoration NOT_IMPLEMENTED and directory consistency NOT_APPROVED.
composeRemoteDurableAuthentication ignores injected positive claims, invokes no supplied I/O, and
returns blocked login/recovery and denied authorization. Casting supported:true/verified:true or
copying JSON cannot open it. No default Firestore/remote admission route exists.

composeLocalAuthentication remains explicitly unregistered local/reference-model application code.
It preserves the previously documented trusted-server-DI assumption: interfaces do not authenticate
a malicious replacement server adapter. Its synthetic tests are not a way to certify remote expiry
guarantees, and it must not be used as a future remote-composition fallback. A real remote path must
pass the separately reviewed durable gate; no such positive path exists here. Existing ADMIN shell
remains BLOCKED / NOT_CONFIGURED / NOT_CONNECTED / resetAllowed:false.

## Temporal blocker and clock scope

Expiry-at-commit remains unresolved: a Firestore callback may finish before actual commit, so a
callback time check is not a proved commit-time expiry predicate. No admission-time semantics,
hidden grace, TTL extension or fabricated databaseCommittedAt is introduced. Transaction/assertion/
grant/session/upstream policies remain 120s/20s/30s/15m/1h with the existing caps.

The reference model's high-water checks, including observations after denied decisions/reads, are
unchanged. They are process-local and do not prove cross-worker monotonicity or restart safety.
An unverified real authoritative clock cannot satisfy the durable admission gate. Planned signing-key
verification-window expiry/retirement still does not end existing sessions; compromise/revocation,
missing provenance, actual session/upstream expiry and current directory changes still deny.

## Directory consistency

PropertyUserRepository remains the current Script Property-backed UserRepository. No directory is
migrated to Firestore and no Firestore user authority is configured. Historical grant issuer/subject/
authentication facts do not establish current active status, authorizationVersion, roles or permissions.
Current authorizationVersion/permissions still come from current server UserRepository/PermissionService.
Independent property/durable stores do not form one transaction. Async rereads narrow races but do
not prove a shared serializable snapshot or retract business work already in flight. Future directory
consistency/authority and revocation freshness need their own approved design.

There is an explicit TOCTOU boundary between the final authoritative read/PermissionService check
and the actual protected operation. Revocation or a directory/policy update can happen after that
read, including while another store is being awaited, before authorize() resolves or before a
future caller dispatches work. AUTHORIZED is a checked decision, not a lock, lease, durable grant,
serializable snapshot or permission to reuse the decision later. Current contracts cannot make
that interval atomic across independent stores. No protected business operation is connected here.
Before integrating one, approve its consistency/revocation boundary and enforce authorization at
its execution boundary; where strict atomicity is required, a shared transactional authority or
reviewed fencing protocol is necessary. Another reread alone cannot prove that guarantee.

## Remaining implementation dependencies

- A separately approved temporal policy and implementation proving the requested expiry boundary.
- Reviewed clock source and rollback behavior across workers/restart, without process-local extrapolation.
- Reviewed authenticated store/project/database ownership and private restoration implementation.
- Explicit directory consistency model; no automatic migration/lease semantics is approved here.
- Reviewed bounded I/O, timer, crypto, credential generation, channel and current-policy adapters.
- A separately approved emulator-only package/dependency/configuration/test plan. None is installed here.

Local tests cannot certify these missing guarantees. Firestore emulator implementation and real
admission remain blocked pending separate decisions and Acceptance Review.

## Implementation verification (before acceptance review)

- TypeScript --noEmit: PASS.
- Isolated ES2019 runtime compilation with types:[] and only lib.es2019: PASS (25 roots).
- Identity/atomic/durable/authentication/channel/operation suite: 519 PASS in 6 files.
  All 445 previous tests preserved with async callers awaited; 74 new regressions (55 durable, 19 async).
- Full Vitest: 1941 PASS in 67 files.
- Both ADMIN target checkers: PASS / NOT_CONFIGURED; only doGet/getAdminBootstrap;
  deploymentAllowed:false and resetAllowed:false.
- Production/readiness disk AND in-memory Rollup Code.gs SHA-256 equal their original baselines:
  production 88eb2e583ca8dec204d7f525dccb515bb4a72df06a3de0cb51f7084d99e2e54d;
  readiness eb01e23a2d83da6839eea1b3aabcb5dd1bdec6cd9dedf8ac42764b1e3a922dc7.
- Both in-memory ADMIN Code.gs bundles are byte-identical; existing import/global guards pass.
- Diff/UTF-8/trailing-whitespace/new-file whitespace checks: PASS.
- Scope: 12 tracked files modified and 4 new files. HEAD remains 9f41567; staging empty.

PermissionService, production authorization, prototypes, ADMIN entrypoints/RPC/targets/manifests,
Rollup configs, Wire v1, lifecycle TTLs and signing-key policy are unchanged. The reference model
changes only its synchronous interface name/import; its executable atomic/high-water logic is unchanged.
No installation, commit, push, deployment, Google operation, emulator or TEST_RESET was performed.

## Acceptance review and local checkpoint

Reviewed baseline: feature/bom-logic, HEAD 9f41567, 12 modified + 4 new files, empty staging.
The approved scope remains exactly those 16 files. No critical runtime defect was confirmed;
acceptance adds 10 regression cases and explicitly documents the final-read/operation TOCTOU
boundary above. Previous security assertions are retained, with async decisions awaited.

- Late session lookup, private reader and policy responses cannot reopen a completed denial.
  Pending reads remain pending at 4999ms and deny at 5000ms; late resolution triggers no further
  authorization reads or directory decisions. Concurrent credential checks remain isolated when
  one session is revoked during an awaited read.
- A committed receipt arriving after timeout cannot resume session issuance. A late COMMITTED
  outcome after OUTCOME_UNKNOWN cannot resume login, issue a replacement mutation or roll back
  the original grant. Explicit recovery only reports the original committed outcome, read-only.
- Timeout maps to DENIED for authorization, ACCESS_DENIED for an unreadable committed receipt,
  and OUTCOME_UNKNOWN when outcome lookup times out. None proves operation cancellation/rollback.
- Remote admission remains BLOCKED for every configuration, including forged JSON/casts,
  complete-looking guarantee strings, booleans, missing reader/clock and synthetic server ports.
  No positive durable-guarantee or runtime restoration factory exists.
- Restoration ownership, independent context/identity/revision binding, current policy and
  revocation checks are contract/test boundaries only. Private branding does not authenticate
  a real Firestore record. PropertyUserRepository and PermissionService remain unchanged.
- Standalone reference-model runtime/atomic/high-water logic, one-time semantics, receipt TTL,
  signing-key rotation/upstream caps, production code, Wire v1 and ADMIN RPC boundaries are unchanged.

Repeated acceptance verification:

- TypeScript --noEmit: PASS.
- Isolated ES2019 compilation without Node/GAS ambient types: PASS (25 roots).
- Targeted identity/atomic/durable/authentication/channel/operation tests: 529 PASS in 6 files
  (112 identity, 127 atomic, 55 durable, 111 authentication, 100 channel, 24 operation).
- Full Vitest: 1951 PASS in 67 files. This slice adds 84 cases over the pre-slice baseline:
  55 durable + 19 implementation async cases + 10 acceptance cases.
- Both ADMIN target checkers: PASS / NOT_CONFIGURED; only doGet/getAdminBootstrap,
  deploymentAllowed:false and resetAllowed:false.
- Production/readiness disk and in-memory SHA-256 match the hashes recorded above. Both ADMIN
  in-memory Code.gs bundles are byte-identical to their existing disk bundles; guards pass.
- Diff checks, new-file whitespace, UTF-8 and exact scope checks: PASS.

The local checkpoint is authorized only after checking the explicit staged 16-file set, with
message `feat(auth): add durable store contracts and async trust boundaries`.
This review does not approve remote expiry-at-commit, distributed atomicity, store/clock/directory
consistency, real crypto, trusted deployment wiring or protected business-operation integration.
Those assumptions remain blocked dependencies for a separately scoped next slice.
