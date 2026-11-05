# Durable B/D2 Users — Slice 2C.5.2-B

Isolated Node storage foundation, not real enrollment administration or production composition.
Only test fixtures provide positive administrative authorization. No HTTP/server/GAS registration,
Owner bootstrap, Security Manager, session issuance, Google-login auto-enrollment or production client.

## Dependencies and namespace

Build the existing curated facade from the repository root: `npm.cmd run build:permission-node`.
`bd2-user-contract.cjs` and the store require that single `build/permission-node/index.cjs` instance.
Missing artifact is an error; no TS loader, legacy DTO fallback or duplicate role mapping is used.
The existing isolated backend package supplies the pinned Firestore SDK; Node >=22 is its declared runtime.
No dependency, Dockerfile, portable facade, build configuration or production wiring is changed.
The current Docker image does not include the repository-root artifact: future packaging needs separate approval.

Paths are fixed:

```text
bd2_user_authorities_v1/{authorityKey}/users/{userKey}
bd2_user_authorities_v1/{authorityKey}/operations/{operationId}
```

SHA-256 hashes UTF-8 `JSON.stringify` arrays, with explicit domain strings:

- authority: `[KUB_BD2_USER_AUTHORITY_V1, environment, applicationAudience, expectedScriptId]`;
- User: `[KUB_BD2_USER_KEY_V1, canonicalIssuer, sub]`;
- request: `[KUB_BD2_USER_REQUEST_V1, BD2_PROFILE, 1, authorityKey, commandId, actorTuple,
  targetTuple, kind, expectedRevision, canonicalPayloadTuple]`;
- operation: `[KUB_BD2_USER_OPERATION_ID_V1, authorityKey, requestDigest]`.

Roles are validated by the unchanged B/D2 facade and sorted for command identity. Input object property
order is irrelevant. A changed payload with the original operation ID is rejected before I/O.
Command IDs are explicit 64-lowercase-hex logical IDs owned by the trusted caller, generated once outside
transactions. The store never generates replacement IDs. A different command/payload is a different
operation, not recovery. IDs/digests/receipts are data, never bearer capabilities or proof of authorization.
Changing context/root/key algorithm requires reviewed migration, not a second Users authority.

## Schema and validation

User envelope: `storageProfile=KUB_BD2_USER_RECORD_V1`, `storageSchemaVersion=1`, `user:Bd2User`,
`createdAtMs`, `createdBy`, `updatedAtMs`, `updatedBy`, `lastOperationId`.
Principal/context/schema/roles/versions are checked by the public CJS validators. The envelope validator
checks exact data fields, timestamps, audit principals and principal-to-document-key binding.
Email/displayName are intentionally absent; email is never a lookup/enrollment/linking key.
Validated results and nested projections detach from inputs and are frozen.

Receipts have a separate storage profile/schema and exact context, canonical command, authority/User keys,
operation ID/request digest, `CREATED|UPDATED|NOOP`, before/after User projections and `recordedAtMs`.
Every read recomputes the command binding and legal transition. Receipts are immutable create-only documents.
Their audit timestamp is backend application observation time, not database commit-time proof.
No raw token/SID/nonce/browser proof is accepted or persisted. There is no receipt deletion/TTL/cleanup API.

## Internal API and lifecycle

`createCommand(context, {commandId, actor, target, kind, expectedRevision, payload})` constructs DATA.
`createFirestoreUserStore({firestore, context, authorize?, now?})` captures trusted server configuration.
No default Firestore client or implicit environment/credential discovery exists.

| Method | Command kind / payload | Preconditions and result |
| --- | --- | --- |
| enrollUser | ENROLL_USER / `{}` / expectedRevision=null | Missing User only; inactive, empty roles, both versions 0 |
| setUserActive | SET_USER_ACTIVE / `{active:boolean}` | Existing User and matching expectedRevision |
| replaceUserRoles | REPLACE_USER_ROLES / `{roles:Role[]}` | Existing User and matching expectedRevision; full replacement |
| getUser | CanonicalPrincipal | Fresh point read: detached User or undefined; invalid/unavailable throws |
| lookupOperationOutcome | Original descriptor | Read-only COMMITTED / UNKNOWN / INVALID / UNAVAILABLE |

Real active/role changes increment both revision and authorizationVersion after checking overflow.
No-op checks expectedRevision first, leaves the entire User envelope unchanged and creates a NOOP receipt.
Role order alone is a no-op. Deactivate and reactivate each increment versions; old sessions are never upgraded.
Different-operation duplicate enrollment is ALREADY_EXISTS, never overwrite. No delete/recreate or metadata update.

## Authorization and transactions

Absent authorizer denies before transaction. Each valid submission invokes the captured trusted
`authorize(command, reads)` again, including matching replay and UNKNOWN resubmission. Only strict `true`
allows; false/nonboolean/error denies. No positive implementation is shipped outside tests. Actor DTOs,
isAdmin flags, Google identity and ADMIN role are not accepted as administrative permission evidence.
The callback receives a frozen command and restricted `reads.getUser(principal)` transaction read port,
not a raw write-capable transaction. It must perform no external effects. Future authoritative actor,
entitlement and fresh-proof checking require separate approval; a lying trusted injection is outside
structural-validation guarantees. getUser/lookup are internal trusted read ports, not public endpoints.

One outer `runTransaction(..., {maxAttempts:1})` reads receipt and User, validates records, authorizes,
checks absence/revision, then atomically writes the User change and create-only receipt. All reads precede
writes. No Google/HTTP/business effects occur inside callbacks. Generic SDK exceptions, including ABORTED,
are UNKNOWN: maxAttempts=1 does not disable every lower-level RPC retry and numeric codes do not prove abort.
Known local pre-write rejections retain REJECTED / INVALID / ALREADY_EXISTS / NOT_FOUND / CONFLICT / OVERFLOW.
Exceptions expose generic ACCESS_DENIED plus outcome and original credential-free lookup descriptor.

Matching receipt returns the historical result without touching User or creating another receipt. It is not
the current User or an access grant. Current User is validated separately on replay; deletion/regression is
not silently repaired. Use getUser for current state. There is no permanent positive User/authorization cache.

After UNKNOWN, lookup the original descriptor. Missing receipt remains UNKNOWN, not proof of abort.
Lookup performs no transaction, write, authorizer call or replacement submission. Explicitly resubmitting
the original command is distinct: it reauthorizes, may perform the first uncommitted change, or returns
the historical receipt. No automatic outer retries or auto-replacement commands are implemented.

## Tests and limits

From the repository root build the facade, then in this backend package run:

```text
node --test test/*.test.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8685
node --test integration/*.test.cjs
```

Set the environment variable with the shell's syntax. Integration requires the actual loopback Emulator,
uses demo-kub-bd2-users-local and a random TEST audience/authority per fixture, and refuses production/ADC
fallback through the existing local client factory. Two independent SDK clients test enrollment and
active/roles contention. Faults surround real emulator transactions for atomic rollback and UNKNOWN
before/after actual commit. Mock unit ports are not concurrency/durability proof. Store recreation tests
are not database restart/disaster-recovery evidence. Retention, IAM, production durability and clock bounds
remain OPEN. The generic injected SDK port trusts its server composition; it does not authenticate clients.
With maxAttempts=1, contention can abort both transactions (the Emulator reports lock timeout): zero
progress is allowed. Tests inspect persisted User/receipt counts before any explicit original-command
resubmission, assert at most one effect and one outer call per submission, then separately test progress
under fresh authorization. They do not claim a guaranteed winner or automatic conflict recovery.
An additional regression commits User plus receipt, discards the acknowledgement, then repeats the exact
Commit RPC: the Emulator itself returns ABORTED/10. The store retains UNKNOWN and the original descriptor,
with one outer transaction and one persisted pair; lookup confirms COMMITTED without reauthorization.
Separate real-transaction faults after staged create and update prove rollback of both documents.

The store does not provide a combined User/Session/Policy snapshot, production administrative authorization,
or a permission lease for later business execution. These belong to future trusted readers and P/R boundaries.
Owner/bootstrap, Security Manager entitlements, real target-principal provenance, sensitive-operation
fresh-proof policy, production namespace/IAM/migration and retention/erasure decisions remain OPEN.

ADR-050 remains ACCEPTED; ADR-049 remains PROPOSED. Legacy operations stay STRICT_COMMIT_TIME.
Gate B remains BLOCKED BY MISSING DECISION; PO-01–PO-14 OPEN. Remote admission and business mutations
remain BLOCKED; PRODUCTION deployment, ADMIN deployment and TEST_RESET remain NO-GO.

## Slice 2C.5.4-C — transaction-scoped User read

The existing store module additionally exports the internal API
`readUserInTransaction({ firestore, context, get }, principal)`. It reads exactly
`users/{userKey}` in the existing context-bound authority through injected `get`.
It reuses `userKey`, `validateBd2Context` and the unchanged `validateEnvelope` /
curated User validator: canonical principal/path binding, storage and User
profile/schema, context, active/roles, authorizationVersion/revision, timestamps,
audit principals and accessor safety all remain mandatory. It does not add a
creating-receipt read through `lastOperationId` or change User integrity semantics.

The trusted owner supplies `get: ref => tx.get(ref)` from its own Firestore
transaction. Both independent User and Policy readers must receive that same
transaction-bound function and matching client/context. The reader opens no
transaction, performs no standalone `.get()` fallback, writes nothing, calls no
authorizer and retains no cache. It returns only a detached, deeply frozen User
projection, never an SDK snapshot or reference. A missing User returns undefined;
inactive Users and empty roles remain valid data, never positive authorization.
Malformed principal throws UserStoreError(REJECTED); corrupt persisted data
throws UserStoreError(INVALID), with ACCESS_DENIED and no operation descriptor.
Malformed port/context configuration rejects before reads. An injected SDK error
propagates unchanged to the transaction owner; it is not absence or rollback proof.
Existing public getUser UNAVAILABLE, mutation UNKNOWN and read-only recovery
UNKNOWN/INVALID/UNAVAILABLE classifications are unchanged.

The owner must await every required User/Policy read and complete validation
before staging any write. A DTO's authoritative lifetime is limited to that
transaction attempt: do not carry it into another transaction as current state,
or retain the read port after its owner closes. The reader cannot authenticate
the injected port, enforce its lifetime, grant issuance authority or verify a
future caller's authorization. Those are trusted composition obligations.
No runtime combined reader, Session Store/Issuer/Checker or production boundary
is introduced. Existing OPEN provenance, entitlement, clock, IAM, retention and
Gate B obligations above remain unchanged; ADR statuses are unchanged.

Verification on 2026-11-05 used existing Node 24.19.0 (no installation) and local
Firestore Emulator 1.22.0 / Java 21 at 127.0.0.1:8685. User store units: 30 PASS /
0 FAIL; combined User/Policy store units: 69 PASS / 0 FAIL; backend unit regression,
including the unchanged Session Contract suite: 195 PASS / 0 FAIL. User Emulator:
20 PASS / 0 FAIL; combined User/Policy Emulator: 48 PASS / 0 FAIL. Counts include
negative subtests. Metadata-only unit ports reject independent gets and nested
transactions; synthetic owner writes verify reads-before-writes. The read-only
SDK coordinator uses one outer transaction, checks both required results, refuses
missing/corrupt state without writes and runs through two independent clients.
Concurrent User, Policy and test-only atomic coupled updates preserve consistent
snapshots. Competing writers start under the read but are awaited only after it
settles; no winner is assumed. Coupled writes exist only in the test file and use
valid User/Policy envelopes, receipts and history. Emulator evidence does not
establish production durability or protection against privileged coordinated
tampering. See DURABLE_SESSION_POLICY.md for Policy dependencies and isolation checks.
