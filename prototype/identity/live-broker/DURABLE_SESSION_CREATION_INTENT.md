# Durable Session Creation Intent — Slice 2C.5.4-D2-F1

Internal Node/Firestore foundation for an immutable original Session creation
intent. This is data persistence and inspection only. No Session, SID, credential,
binding, receipt, preparation, handoff or dispatch permit is created. Production
entrypoints and the curated Node facade do not import or export this foundation.

ADR-050 remains ACCEPTED; ADR-049 remains PROPOSED and is not D2 authority.
S-01–S-06, C-01–C-05, D-01–D-05 and D2-01–D2-06 remain unchanged. This slice
introduces no clock, freshness, deadline, TTL, temporal admission or retention rule.

## Internal ports and trust boundary

```js
const { createFirestoreSessionCreationIntentStore } = require('./firestore-session-creation-intent-store.cjs');
const store = createFirestoreSessionCreationIntentStore({ firestore, context });
const submission = await store.createOriginal(canonicalCommand);
const observation = await store.lookupIntent(originalDescriptor);
```

`createSessionCreationCoordinator({ firestore, context })` exposes exactly the
same two data-only methods. Factories accept exact own data options; there are no
path, collection, clock, authorization, verifier, issuer or dispatch callback options.
The SDK and expected context are trusted server composition inputs. No default
client, credentials, endpoint or production composition is supplied.

Commands are already canonical internal test inputs, not a public mint API. Valid
command DTOs do not authenticate a caller, prove ownership of an Attempt or prove
successful Google verification. Pinning original physical Attempt provenance and
consuming D1 before I/O remain D2-F2 work. The factory is a privileged storage port,
not an HTTP authorization boundary. No status or returned DTO can be consumed as
a capability by this foundation or the default-deny permission facade.

## Exact identity and V1 storage

All identity and record validation reuse **unchanged** exports from
`bd2-session-contract.cjs`: `ROOT`, `authorityKey`, `validateCommand`, `createIntent`,
`descriptor`, `validateDescriptor`, `validateIntent`, `assertIntentMatchesCommand`.
The existing facade supplies `validateBd2Context`; Durable Users supplies exact
own-data option framing. No canonical command/schema validator is duplicated.

Let `H(x)` be lowercase SHA-256 of UTF-8 `JSON.stringify(x)`:

```text
authorityKey = H(["KUB_BD2_USER_AUTHORITY_V1",
  environment, applicationAudience, expectedScriptId])
attemptKey = H(["KUB_BD2_SESSION_CREATION_ATTEMPT_V1",
  authorityKey, collectionId, attemptId])
requestDigest = H(["KUB_BD2_SESSION_CREATION_REQUEST_V1", profile, 1,
  authorityKey, commandId, "CREATE_SESSION",
  [collectionId, clientId, attemptId, bindingDigest],
  [principal.issuer, principal.sub], createdAtMs, sessionDigest])
operationId = H(["KUB_BD2_SESSION_CREATION_OPERATION_ID_V1",
  authorityKey, requestDigest])
```

The only document path is:

```text
bd2_user_authorities_v1/{authorityKey}/session_creation_intents/{attemptKey}
```

The physical slot excludes commandId, clientId, bindingDigest, principal, original
S, sessionDigest, requestDigest and operationId. Changing any of them with a valid
recomputed command conflicts in the SAME slot. Different physical collectionId or
attemptId identifies a different slot; context is bound to the factory authority.

Exact persisted enumerable own fields:

```text
storageProfile = "KUB_BD2_SESSION_CREATION_INTENT_V1"
storageSchemaVersion = 1
authorityKey
attemptKey
sessionDigest
operationId
requestDigest
canonicalCommand
```

`canonicalCommand` has exactly profile, schemaVersion, context, authorityKey,
commandId, kind=`CREATE_SESSION`, attempt={collectionId, clientId, attemptId,
bindingDigest}, principal={issuer, sub}, createdAtMs=S, sessionDigest, requestDigest,
operationId. No raw SID, verifiedAtMs, Attempt deadline, Journal snapshot, ownership
flag, mutable status, TTL, dispatch state, Session outcome or added timestamp is stored.

## Create-only transaction and immutable matching

Before I/O, the original command is validated, detached and frozen, with canonical
digests recomputed by the existing contract. The store runs exactly one
`runTransaction(callback, { maxAttempts: 1 })`. The callback performs one `tx.get`
on the exact Intent reference, followed by at most one `tx.create` if missing.
There is no set, update, delete, repair, migration, Google call, external callback,
Session operation or application-level retry, including after ABORTED.

Existing records undergo strict `validateIntent` against the expected authority
and physical slot FIRST. Only then does `assertIntentMatchesCommand` compare the
complete canonical command and all immutable locator fields. Matching records
return EXISTING; other valid content returns CONFLICT; corruption returns INVALID.
All three branches perform zero writes. SDK success must resolve the OUTER
transaction Promise before NEW is returned. Callback completion or a local flag
is never proof of commit. Any rejected transaction returns UNKNOWN, including
rejection after callback success or actual durable commit.

## Result semantics and read-only recovery

| Result | Meaning |
| --- | --- |
| NEW | This submission received confirmed successful Intent creation. |
| EXISTING | An already persisted valid Intent exactly matches the command. |
| CONFLICT | A valid occupied slot has different immutable content/locator. |
| INVALID | Invalid input or corrupt persisted evidence; no repair permission. |
| UNKNOWN | Submission outcome is unconfirmed. No retry or rollback inference. |
| FOUND | Valid matching Intent evidence was read; no creation acknowledgement. |
| UNAVAILABLE | Read-only lookup could not obtain evidence. |

Creation returns frozen `{ status, descriptor }` after valid input, or
`{ status: 'INVALID' }` for invalid input. A descriptor has exactly authorityKey,
attemptKey, sessionDigest, operationId, requestDigest, as defined by the contract.
It is an unauthenticated locator, not provenance or a permission. An invalid
descriptor is rejected before reads. A syntactically valid substituted slot can
only yield evidence for that exact target, never authority or a fallback scan.

Lookup performs one exact `DocumentReference.get()`, no transaction, query, audit
write or mutation. Persisted evidence is strictly validated against the pinned
context/slot and then compared with ALL descriptor fields. A matching result is
`{ status: 'FOUND', intent }`, with a detached deeply frozen validated Intent.
Conflicts/corruption return only their status. Missing evidence returns
`{ status: 'UNKNOWN', evidence: 'MISSING' }`. Read failures return UNAVAILABLE.
Repeated lookups, new store instances and new processes have this same contract.

```text
NEW      != Session created
EXISTING != dispatch permitted
FOUND    != Google verification
UNKNOWN  != rollback
MISSING  != safe retry
INVALID  != repair permission
```

Recovery does not call creation, adopt a previous operation, restore a capability,
reserve an intent, regenerate SID, change original S or repair missing evidence.
Intent recovery is not Session recovery: Session outcome remains UNKNOWN even
when the Intent exists. A credential cannot be reconstructed from its digest.
Process-local trusted D1 provenance is not persisted in V1.

Exclusion depends on retaining the immutable slot. This privileged data port does
not authenticate original dispatch ownership and cannot fence arbitrary trusted
code with database access after deletion or lost evidence. UNKNOWN must be handled
by lookup only; it does not authorize explicit creation resubmission. Future D2-F2
must enforce its separately reviewed one-use authority boundary. This foundation
does not establish a distributed Session issuance guarantee. Retention/GC remains
an independent decision; no deletion or recycling API is exposed here.

## Verification evidence — 2026-11-06

Runtime for every command below: **Node v24.19.0**, using the already installed
runtime and dependencies. System PATH Node v20.17.0 was observed in preflight but
was not used for test execution. Firestore SDK: installed `@google-cloud/firestore`
9.4.0. Real Emulator: existing `firestore-1.22.0.jar` under existing Java 21 JRE,
bound only to `127.0.0.1:8180`. New integration runs use a randomized
`demo-kub-intent-*` project. No production service or credentials are used.

From the repository root in PowerShell:

```powershell
$intentNode = 'C:\Users\vvolz\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180'
& $intentNode --test prototype/identity/live-broker/test/firestore-session-creation-intent-store.test.cjs prototype/identity/live-broker/test/bd2-session-creation-coordinator.test.cjs
& $intentNode --test prototype/identity/live-broker/integration/session-creation-intent.test.cjs
$intentUnitFiles = @(rg --files prototype/identity/live-broker/test -g '*.test.cjs')
& $intentNode --test @intentUnitFiles
$intentIntegrationFiles = @(rg --files prototype/identity/live-broker/integration -g '*.test.cjs')
& $intentNode --test --test-concurrency=1 @intentIntegrationFiles
& $intentNode node_modules/vitest/vitest.mjs run src/security/production-authorization.test.ts src/security/bd2/portable-permission-adapter.test.ts --reporter=dot --cache=false
```

| Suite | Result | Evidence type |
| --- | --- | --- |
| New Store/coordinator units | 21 PASS, 0 FAIL/SKIP | SDK mocks; real in-memory Rollup Node/GAS graphs and executed GAS entrypoints |
| New Intent integration | 11 PASS, 0 FAIL/SKIP | Real SDK/Emulator with fault injection at SDK transaction/read boundaries |
| All backend units | 239 PASS, 0 FAIL/SKIP | Existing mocks/RSA fixtures plus real D1 Emulator/process test and new graph checks |
| All backend integrations | 95 PASS, 0 FAIL/SKIP | Real SDK/Emulator, including the 11 new Intent scenarios |
| Existing production authorization + portable adapter | 198 PASS, 0 FAIL/SKIP | Existing Vitest security fixtures |

E-01 checks the complete persisted V1 record. E-02/E-03 compare immutable content
and actual Firestore create/update times across identical/conflicting replay.
E-04 uses two independent SDK clients, each with one transaction/callback, for
identical and conflicting races. Both races in the first run produced
UNKNOWN/UNKNOWN and zero persisted records/confirmed NEW. This is permitted
zero progress, not a guaranteed winner; no test resubmits creation to force one.
Safety assertions allow at most one immutable record and one confirmed NEW.
The complete integration regression run additionally observed UNKNOWN/NEW in
the conflicting race, with exactly one immutable Intent and one confirmed NEW;
the identical race again made zero progress. Neither run resubmitted creation.

E-05 rejects after the REAL transaction commits, obtains UNKNOWN, then reads the
same durable Intent through an independent client without resubmission. E-06
throws after staging the create but before the real transaction commits; missing
evidence remains UNKNOWN. E-07 creates corruption through test setup and confirms
INVALID without repair. E-08 uses an independent Node child that exits abruptly
with code 77 after real commit and before returning the store acknowledgement;
a second process and new Store recover data using zero creation transactions.
E-09 injects an SDK point-read error and checks UNAVAILABLE/zero mutations. E-10
inspects scenario namespaces and write traces for absence of Sessions, bindings,
receipts or alternative collections.

The new graph test uses Rollup `generate()` rather than the existing
`node-export.test.ts` write hook, so the actual Node/GAS graphs are verified
without creating generated files outside this task's allowlist. It checks the
five curated Node modules, equality with the existing portable artifact, exclusion
of backend modules/SDKs, the exact production entrypoint manifest, and execution
of every generated GAS entrypoint with forged credentials: all deny. Production
source imports and exact Node facade exports are also checked. Full repository
Vitest and the writing build command are not run in this slice.

## Review boundary and Git state

Baseline before implementation: branch `feature/bom-logic`, HEAD
`40eeaa3f57c961644841b0fdd9b7433cdae95257`, clean tree, empty staging. Only the
six task-allowlisted files are created. Existing Session validators, D1/dispatch,
Attempt/Journal/User/Policy stores, Node facade, GAS, ADRs, package/build config
and production registration are unchanged. All new files remain untracked;
tracked `git diff --stat` and staged diff are empty. No git add/commit/push,
deployment, production mutation or dependency installation is performed.

No security finding is established by these tests. Independent security review
is still required. Production execution, distributed issuance and browser delivery
are untested and outside this isolated slice. D2-T temporal decisions, D2-F2
trusted D1 consumption/composition, and D3 Session implementation remain blocked
future work; retention/GC remains OPEN. Stop after implementation and test report.

Final implementation status: **IMPLEMENTED — READY FOR INDEPENDENT REVIEW**.
This is not acceptance; independent security review and a separate acceptance
decision are still required. Branch/HEAD remain equal to the preflight baseline.
