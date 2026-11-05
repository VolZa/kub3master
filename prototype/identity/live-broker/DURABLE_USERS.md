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
