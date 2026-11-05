# Durable SessionPolicy foundation — Slice №2C.5.3-B

Implementation date: 2026-11-05. Isolated Node backend foundation under ACCEPTED
ADR-050. No Sessions lifecycle, HTTP endpoints, production composition or deployment.

## API

Build the existing curated facade from the repository root with
`npm.cmd run build:permission-node`. Both modules require that same CJS facade;
there is no TypeScript loader, alternate permission core or legacy fallback.

`bd2-session-policy-contract.cjs` exports strict data constructors/validators,
`transition`, storage profiles, the reused Durable Users authority function and
`SessionPolicyStoreError`. These construct data; they confer no authorization.

```javascript
const { createCommand, descriptor } = require('./bd2-session-policy-contract.cjs');
const { createFirestoreSessionPolicyStore } = require('./firestore-session-policy-store.cjs');
// context, sdk and administrativeAuthorizer are trusted server dependencies.
const store = createFirestoreSessionPolicyStore({
  firestore: sdk, context, authorize: administrativeAuthorizer, now: Date.now,
});
const initialize = createCommand(context, {
  commandId, actor, kind: 'INITIALIZE_SESSION_POLICY',
  expectedPolicyVersion: null, payload: {},
});
await store.initializeSessionPolicy(initialize);
const update = createCommand(context, {
  commandId: nextCommandId, actor, kind: 'UPDATE_SESSION_POLICY',
  expectedPolicyVersion: 1, payload: { idleTimeoutMinutes: 30 },
});
await store.updateSessionPolicy(update);
const current = await store.getCurrentPolicy();
const historical = await store.lookupOperationOutcome(descriptor(context, update));
```

The two mutation methods accept sealed canonical commands only. `createCommand`
accepts exactly the five input fields in the examples and adds `profile`,
`schemaVersion`, detached `context`, `authorityKey` and `operationId`. Actor is a
canonical Google issuer/sub principal. Input role/isAdmin/timestamp fields are
rejected. `commandId` is a lowercase 64-character hex identifier supplied by the
trusted caller. UPDATE exposes only idle timeout, an integer in 30..360 inclusive.

Successful submissions return `{status:'COMMITTED', receipt}`. Local rejection
throws `SessionPolicyStoreError` with generic message `ACCESS_DENIED`, `outcome`
and original descriptor when available. Outcomes are `DENY` (invalid input,
authorization, clock or version overflow), `INVALID` (inconsistent durable data),
`NOT_FOUND`, `ALREADY_EXISTS`, `CONFLICT`, and `UNKNOWN` (generic mutation SDK
exception). Current reads return a detached immutable SessionPolicyConfig or
`undefined` for a genuinely empty authority, and throw `INVALID`/`UNAVAILABLE`.
They use a transaction with no writes to obtain a consistent current/dependencies
snapshot. These methods are internal trusted ports, not public authenticated APIs.

## Identity

The authority root and key are imported directly from `bd2-user-contract.cjs`:

```text
authorityKey = SHA256(JSON([
  'KUB_BD2_USER_AUTHORITY_V1', environment, applicationAudience, expectedScriptId
]))
```

Request hashing uses canonical ordered tuple JSON, independent of object field
order. No input object or array is retained. There is no roles array in a command.

```text
requestDigest = SHA256(JSON([
  'KUB_BD2_SESSION_POLICY_REQUEST_V1', BD2_PROFILE, 1, authorityKey,
  commandId, [actor.issuer, actor.sub], kind, expectedPolicyVersion,
  UPDATE ? [idleTimeoutMinutes] : []
]))
operationId = SHA256(JSON([
  'KUB_BD2_SESSION_POLICY_OPERATION_ID_V1', authorityKey, requestDigest
]))
descriptor = { authorityKey, operationId, requestDigest }
```

The descriptor's exact fields, context/authority, digest syntax and operationId
binding to the full digest are checked before Firestore I/O. A matching receipt
must reconstruct this identity from its canonical command. Domains are separate
from Durable Users request/operation hashing. Reusing a commandId with different
payload can produce a different operationId: **there is no global first-payload
binding registry** in this slice. The caller must preserve the original command
and descriptor across uncertainty. A descriptor is not a mutation capability.

## Storage schema

All paths are relative to `bd2_user_authorities_v1/{authorityKey}`.

| Path | Exact fields |
| --- | --- |
| `session_policy/current` | storageProfile, storageSchemaVersion, authorityKey, policy, lastOperationId |
| `session_policy_history/{versionKey}` | storageProfile, storageSchemaVersion, authorityKey, policy, previousPolicyVersion, operationId |
| `session_policy_operations/{operationId}` | storageProfile, storageSchemaVersion, context, authorityKey, canonicalCommand, requestDigest, operationId, outcome, beforePolicy, afterPolicy, historyReference, recordedAtMs |

Storage profiles are respectively `KUB_BD2_SESSION_POLICY_RECORD_V1`,
`KUB_BD2_SESSION_POLICY_HISTORY_V1`, `KUB_BD2_SESSION_POLICY_OPERATION_V1`;
all storageSchemaVersion values are exactly 1. Nested policy/command profile is
the existing `KUB_ERP_SESSION_BD2_V1`, schemaVersion 1.

`policy` has exactly the existing SessionPolicyConfig fields: profile,
schemaVersion, context, policyVersion, idleTimeoutMinutes, absoluteTimeoutMinutes,
appliesTo, updatedAtMs, updatedBy. The facade validator is reused unchanged.
Absolute timeout is always 720; appliesTo is always NEW_SESSIONS_ONLY. Versions
are positive safe integers. `versionKey` is `String(policyVersion)`, without
padding, exponent notation, sign or leading zero. All valid safe integers are
below the threshold at which JavaScript String uses exponential notation.

History version 1 has `previousPolicyVersion: null` and idle 180. Subsequent
versions have previousPolicyVersion exactly version minus one. Receipt outcomes:

| Outcome | Before | After | historyReference |
| --- | --- | --- | --- |
| INITIALIZED | null | Initial v1 / idle 180 / absolute 720 | `"1"` |
| UPDATED | Expected version | Version + 1, changed idle | New decimal versionKey |
| NOOP | Expected version | Entire before policy unchanged | null |

`historyReference` is a relative version key in the same authority's history
collection. Receipt recordedAtMs is a positive safe integer, no earlier than
before.updatedAtMs. Real changes bind updatedAtMs to recordedAtMs and updatedBy
to command.actor. NOOP preserves all policy metadata and records its own actor
and time in the command/receipt.

All persisted documents read are strictly validated: exact own enumerable data
fields, no accessors/symbols/custom prototypes, context/profile/schema, path and
authority binding, canonical actor, identity, version and legal transition.
The current version must match its immutable history and creating receipt.
Receipts must match their before/after history snapshots; real changes also
bind the after-history operation ID. NOOP validates the version's creating
receipt and its adjacent before-history dependency. Every path that validates
current also checks history v1 and its INITIALIZED receipt, with full policy,
command/digest/operation, authority/context/profile/schema binding. The original
idle 180, absolute 720, version 1 and NEW_SESSIONS_ONLY values are mandatory.
Validation uses bounded point reads, not a full scan of all earlier versions.
No silent repair or fallback is performed. Privileged out-of-band coordinated
tampering is outside structural-validation guarantees.

## Transactions and authorization

Initialization requires an explicit authorized INITIALIZE_SESSION_POLICY command.
In one transaction it uses create-if-absent for current, history v1 and receipt.
Another initialization returns ALREADY_EXISTS; matching original replay returns
the historical result after fresh authorization. A missing current combined with
any prior history or operation document is INVALID, including initialization
remnants; two bounded collection probes detect this without bootstrapping.

Each submission makes exactly one outer `runTransaction(...,{maxAttempts:1})`.
It validates a detached command before I/O; reads and validates current, receipt,
required histories and next version slot; performs fresh authorization; handles
matching replay; checks expected version; samples the server-owned clock; then
stages all writes. Required reads and authorizer reads precede all writes.
Stale expected version conflicts even if desired idle equals the current value.
Real changes increment policyVersion exactly one. A NOOP writes only its new
receipt, preserving current, history, version and metadata. Overflow denies.
Rejected/conflicting operations do not create success receipts.

History and receipts are always written with transaction.create, never update,
set or delete. Current alone is mutable through these methods. Immutability is
an adapter invariant; this slice adds no Firestore IAM/rules and does not prevent
a privileged SDK caller from writing directly. Tests deliberately corrupt only
local emulator records to verify fail-closed handling.

The injected `authorize(command, reads)` must resolve to boolean `true`.
Missing callback, false/nonboolean, throw or rejected promise denies with zero
writes. Each submission, including matching replay, reauthorizes. The frozen
read port exposes only `getCurrentPolicy()` and `getUser(principal)`, using this
transaction and the existing User validator. It closes after the callback. The
callback must await its reads and perform no HTTP/Google calls or other external
effects. Generic ADMIN is not a SessionPolicy entitlement. No production
authorizer is supplied; positive callbacks exist only in tests. Owner bootstrap,
Security Manager entitlement, fresh sensitive proof and trusted actor provenance
remain OPEN. Trusted injections cannot be authenticated by DTO validation.

Timestamps use injected `now` (default Date.now), with safe-integer validation and
a per-instance high-water mark. A mutation cannot precede current.updatedAtMs.
This rejects observed rollback but does not prove multi-worker clock health,
bounded skew or commit-time freshness. No timestamp is used as a session grant.
No policy/authorization cache survives a request.

## UNKNOWN and read-only recovery

Any generic SDK mutation exception, including numeric ABORTED, becomes UNKNOWN
with the original descriptor. No automatic outer retry or replacement command
is issued. maxAttempts=1 does not disable every lower-level RPC retry or guarantee
progress under contention; even both concurrent submissions may return UNKNOWN
without writes. An exception code does not establish rollback.

`lookupOperationOutcome(descriptor)` performs no transaction, write or authorizer
call. It reads the immutable receipt and necessary immutable historical
dependencies, validates the full binding, and returns COMMITTED with the original
historical receipt. It does not require current, which may have advanced or been
deleted. Malformed/inconsistent evidence yields INVALID; a read failure yields
UNAVAILABLE; missing receipt yields UNKNOWN, never proof of rollback. An invalid
descriptor throws DENY before I/O. Recovery never submits a command or changes
policy. These internal reads still need a separately approved authenticated
boundary before any future exposure.

## Session snapshots and scope

Future Session creation **must read current policy in the same authoritative
transaction that commits Session creation**. Capture its policyVersion, idle and
absolute timeout. Existing sessions retain their captured policy, S and A:

```text
effectiveExpiry = min(S + 720 minutes, A + captured idle timeout)
now >= effectiveExpiry => DENY
```

Policy changes in either direction do not replace a captured snapshot, change
creation/activity time or revoke sessions. The unchanged portable adapter tests
verify expiry equality and captured lifetime across current-policy updates. This
slice creates no real sessions and provides no combined User/Session/Policy
production reader. Receipt audit evidence covers policy mutation only; it is not
the general AuditLog or ADR-050 P-14 implementation.

## Verification

Run from the repository root (PowerShell):

```powershell
npm.cmd run build:permission-node
node --test prototype/identity/live-broker/test/bd2-session-policy-contract.test.cjs
node --test prototype/identity/live-broker/test/firestore-session-policy-store.test.cjs
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8685'
node --test prototype/identity/live-broker/integration/firestore-session-policy-store.test.cjs
npm.cmd run build
npm.cmd test -- --reporter=dot
```

Integration fails closed without FIRESTORE_EMULATOR_HOST. The existing local SDK
factory permits only an explicit IPv4 loopback host/port, demo project, pinned
insecure emulator transport/universe and no credential overrides or ADC fallback.
Tests use `demo-kub-bd2-policy-local`, random authority audiences and independent
SDK instances. No production credentials or production Firestore calls are used.

Observed on 2026-11-05: pure contract 6/6, store 16/16, Emulator integration 9/9.
The Emulator run used existing local Firestore Emulator 1.22.0 and Java 21.
Concurrent initialization produced UNKNOWN/UNKNOWN with zero triplets; a separate
explicit original-command submission then created one. Concurrent UPDATE produced
UNKNOWN/UPDATED with version 2; next authorized update produced version 3. Each
concurrent submission used one outer attempt. Atomic rollback after staged writes,
lost-ack recovery for initialize/update/NOOP, create-only slot collisions, durable
NOOP, matching replay, corrupt dependencies and authority isolation passed.
Full backend unit regression: 140/140 passed (including the 22 new unit tests).
Node facade and GAS builds passed. GAS bundle contains no new policy store,
policy storage profile, Firestore dependency or node:crypto. Additional existing
facade/graph/production-hold tests passed in the repository Vitest suite:
73 files, 2516 tests passed. This includes checks of actual Rollup graphs, curated
Node exports and unchanged denied production entrypoints.

The initial verification above did not catch loss of initialization evidence
after current advanced to v3. Independent Review №2C.5.3-C found this blocking
gap (F-01) and insufficient nested-accessor test evidence (F-02). The earlier
claim that all acceptance criteria were confirmed was too broad. The targeted
correction and its additional verification are recorded below.

Emulator persistence across client instances is not evidence of emulator restart,
power-loss recovery, production replication or disaster recovery. Lost-ack and
rollback tests inject faults around real SDK transactions, not natural network
failures. Retention/capacity, privileged out-of-band access, IAM, production clock
health, production authorization and general audit remain OPEN.

Only the six agreed files are added. ADR-050, PermissionService, portable adapter,
GAS build configuration, HTTP routes, Dockerfile, IAM/rules and security gates are
unchanged. No checkout/reset/clean/commit/push/deployment is performed. Readiness
is limited to this isolated implementation's independent review; production
readiness and acceptance of later slices are not asserted.

## Slice №2C.5.3-D — targeted correction F-01 / F-02

F-01: the shared current validation path now always reads history `1`, validates
its initial policy, reads the operation at that history's operationId and requires
a matching INITIALIZED receipt. Existing contract validators enforce exact
fields, profile/schema/context/authority, canonical command, requestDigest,
operationId, initial values and history/policy binding. A missing or inconsistent
anchor makes current reads and submissions (including NOOP and historical replay)
INVALID before writes. There is no repair or retry. A clean empty authority keeps
the existing explicit initialization behavior.

Only two anchor point reads are added at most, reusing the per-invocation cache.
Unit and real SDK tests observe six point reads for a current-policy read at both
v3 and v4. All transaction reads, including authorization reads, precede writes;
the integration harness asserts that ordering. Historical recovery remains an
independent read-only lookup with its existing dependency validation semantics.

Regression setup is INITIALIZE v1, UPDATE v2, UPDATE v3. Sixteen independent
negative cases cover missing v1 history/initial receipt, corrupt requestDigest,
receipt operationId mismatch, history pointing to an UPDATE receipt, authority
mismatches, context mismatch, storage profile/schema mismatch, initial idle,
absolute timeout, appliesTo/version corruption, canonical actor substitution and
history/receipt policy disagreement. Each case asserts INVALID for current read,
real UPDATE, NOOP and replay, zero new writes, absent v4, one attempt per call and
an unchanged complete durable-state snapshot. The same cases run on the Emulator.
Positive regressions cover v3 read, v4 update, NOOP, matching historical replay and
recovery without writes/authorization/transactions.

F-02: the nested actor accessor returns a value and increments a counter instead
of throwing. The test requires ACCESS_DENIED and zero getter calls. No production
contract validator change was needed; bd2-session-policy-contract.cjs is unchanged.

Correction verification on 2026-11-05: contract 6/6; store 34/34 (18 top-level
tests plus 16 negative subtests); all backend units 158/158; Durable Users units
40/40; SessionPolicy Emulator 27/27 (11 top-level plus 16 negative subtests) and
Durable Users Emulator 15/15. Tests used the loopback Emulator/demo projects only.
The F-01 regressions failed against the preceding implementation before the fix.
Repository Vitest: 73 files / 2516 tests passed, including actual Node facade
build/export checks, in-memory GAS build/graph isolation and closed production
entrypoints. All ten targeted-correction acceptance criteria have supporting
checks; no criterion remains unverified within this isolated scope. The existing
production authorization, clock, durability and full-history validation limits
described above remain unchanged.

Changes are limited to the store, its unit/integration tests, the contract test
and this document. No new files or contract/build/production integration changes.
The original six files remain untracked and staging remains empty. This correction
is intended for repeat independent review; that review is not run automatically.

## Slice 2C.5.4-C — transaction-scoped Policy read

The existing store module additionally exports
`readCurrentPolicyInTransaction({ firestore, context, get })`. The trusted owner
opens the outer transaction and supplies `get: ref => tx.get(ref)` from that
attempt. `get` must support both DocumentReference and Query; a missing current
requires two `limit(1)` probes of history and operations through the same port.
Only a genuinely empty authority returns undefined. Orphan history or operations
without current are INVALID. No implicit initialization or idle-180 fallback exists.

The exact existing bounded validation graph was extracted into module-private
`policyReader(context, root, get, descriptor?)` and is shared by the new reader,
public getter, mutations and historical recovery. Current-policy reads still
validate current, its matching version history and creating receipt, the receipt's
required previous history, initialization history H(1) and its matching INITIALIZED
receipt. At v3 and v4 that is six distinct point reads, without recursive history
audit. The shared NOOP/recovery path retains its creating-receipt and adjacent
history dependencies; recovery remains independent of current. Full F-01
initialization binding and F-02 nested accessor safety remain in force.

The reader opens no transaction, performs no independent `.get()` fallback,
stages no write and invokes no authorizer. Deduplication is confined to one
invocation; later calls reread every dependency. Only the validated detached,
deeply frozen Policy projection is returned, never snapshots or lazy references.
Corrupt persisted evidence throws SessionPolicyStoreError(INVALID) with
ACCESS_DENIED and no operation descriptor. Invalid port/context rejects before
I/O. SDK failures propagate unchanged to the outer owner. The public standalone
getter still maps SDK failure to UNAVAILABLE; mutation uncertainty remains UNKNOWN;
recovery with missing original receipt remains UNKNOWN, missing required history
for a present receipt remains INVALID, and recovery transport failure remains
UNAVAILABLE. Existing fresh mutation authorization behavior is unchanged.

Both independent readers must receive the same transaction-bound get and matching
Firestore client/context. The trusted owner awaits all required reads, rejects
missing required state and completes validation before staging any writes. Read
ports and authoritative DTO use must stay within the originating attempt; retry
or a new transaction requires fresh reads. DTO validation cannot prove that a
caller supplied the correct port or closed it. No runtime combined module,
issuance capability, production authorizer or Session implementation is added.
Owner bootstrap, Security Manager entitlement, actor provenance, sensitive proof,
IAM, clock and durability/retention obligations remain OPEN. Gate B remains
BLOCKED BY MISSING DECISION; production remains NO-GO. ADR-050 stays ACCEPTED and
ADR-049 stays PROPOSED. Slice D is outside this implementation.

Verification on 2026-11-05: Policy store units 39 PASS / 0 FAIL (including all
16 F-01 corruption scenarios through the external reader and existing public
boundaries); Policy Emulator 28 PASS / 0 FAIL (the same 16 persisted corruption
scenarios plus bounded dependency, adjacent-evidence and empty-authority checks).
Combined User/Policy store units: 69 PASS / 0 FAIL. Full backend unit regression:
195 PASS / 0 FAIL, including unchanged Session Contracts and mutation/recovery
tests. Combined User/Policy Emulator: 48 PASS / 0 FAIL, including two independent
clients, one outer transaction, zero nested transactions, missing/corrupt-state
refusal without writes, concurrent User/Policy changes and a valid test-only
atomic coupled update. No writer is awaited while the reader holds locks and no
particular race winner is required. Node 24.19.0, local Emulator 1.22.0 and Java 21
were already available; no dependencies or system settings were installed/changed.

Repository regression: 73 Vitest files / 2516 tests PASS, 0 FAIL. This includes
the actual curated Node facade build/export checks, in-memory GAS Rollup graph
and exported-entrypoint checks, portable permission/session regressions and
production default-deny execution. The Node export test invokes bundle.write
for the ignored Node facade artifact; GAS uses bundle.generate without writing
production output. Separate before/after SHA-256 comparison of all 21 files in
dist/ and build/ found no content changes, including the rebuilt Node artifact.
No production build command was run. All six changed JavaScript files pass
node --check; git diff --check passes. Changes are confined to the eight allowed
Slice C files; no contract, ADR, build configuration or production entrypoint
changed. Staging remains empty; branch and HEAD remain feature/bom-logic at
394b088a989e670b539af048861904340ca8f69a. Implementation is ready for independent
review within this isolated scope, without commit/push/deployment or Slice D.
