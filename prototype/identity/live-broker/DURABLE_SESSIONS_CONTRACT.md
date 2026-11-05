# Durable Sessions — Slice 2C.5.4-B

Isolated Node **pure data contracts**, ready for independent contract review.
No Session Store, Issuer, Checker, Firestore client/mutation, HTTP/cookie integration,
SID issuance, activity continuation or administrative revoke is implemented.

## ACCEPTED architecture and unchanged gates

S-01–S-06 are the architecture authorized for this slice:

| Decision | Required architecture | Evidence in Slice B |
| --- | --- | --- |
| S-01 | Sessions share existing Users/Policy authorityKey | Reuses ROOT and authorityKey verbatim |
| S-02 | Durable identity contains only SID digest | Exact schemas accept sessionDigest, no bearer fields |
| S-03 | At most one Session per original attempt, regardless of operationId | Attempt-scoped intent/binding identity and conflict validation only |
| S-04 | Session, binding and immutable receipt commit atomically | Bound DTOs only; no transactional guarantee demonstrated |
| S-05 | User and validated SessionPolicy read in the creation transaction | Future adapter obligation; no standalone reader substituted |
| S-06 | UNKNOWN recovery is read-only original-operation lookup | Pure evidence classification and immutable locator only; no lookup adapter |

[ADR-050](../../../docs/adr/ADR-050%20%E2%80%94%20Backend%20Sessions%20and%20Check-Time%20Continuation.md)
remains ACCEPTED;
[ADR-049](../../../docs/adr/ADR-049%20%E2%80%94%20Temporal%20Admission%20for%20ISSUE_SESSION.md)
remains PROPOSED. Gate B remains **BLOCKED BY MISSING DECISION**; production is
**NO-GO**. Legacy STRICT_COMMIT_TIME, production authorization/holds and existing
security foundations are unchanged. Local DTO consistency cannot open a gate.

## IMPLEMENTED contracts

`bd2-session-contract.cjs` requires the existing curated
`build/permission-node/index.cjs` and Durable Users framing/key helpers.
It does not import a store, Google verifier, coordinator or SDK. A missing facade
fails; there is no TS loader, duplicate role validator or legacy fallback.

| Contract | Exact data and checks |
| --- | --- |
| Creation command | BD2 profile/schema/context/authority; commandId; CREATE_SESSION; attempt locator and bindingDigest; canonical principal; immutable createdAtMs (S); sessionDigest; recomputed requestDigest and operationId |
| Creation intent | Separate storage profile/schema; complete canonicalCommand and original locator; immutable original S/digest/operation binding; assertIntentMatchesCommand rejects changed payload/identity |
| Creation binding | Separate storage profile/schema; authorityKey, attemptKey, sessionDigest, operationId, requestDigest; assertBindingMatchesCommand checks original command; one create-only slot per original attempt |
| Session envelope | Separate storage profile/schema; authorityKey; unchanged Bd2Session; immutable creation locator; digest-to-path and operation-to-provenance binding |
| Creation receipt | Separate storage profile/schema; original canonicalCommand and locator; only CREATED outcome; initialSession with A=S, revision=0, ACTIVE, revokedAtMs=null |
| Recovery descriptor | Only authorityKey, attemptKey, sessionDigest, operationId, requestDigest; detached and frozen; validates operation/digest identity |

Storage profiles are `KUB_BD2_SESSION_RECORD_V1`,
`KUB_BD2_SESSION_CREATION_INTENT_V1`, `KUB_BD2_SESSION_CREATION_BINDING_V1`,
`KUB_BD2_SESSION_CREATION_OPERATION_V1`, each with storageSchemaVersion=1.
Canonical commands and Bd2Session keep `KUB_ERP_SESSION_BD2_V1`, schemaVersion=1.

All validators accept exact enumerable own data fields on plain/null-prototype
objects, rejecting missing/extra/symbol/hidden/accessor fields and custom
prototypes. Inputs are detached; all returned nested records are frozen.
Existing canonical context/principal and Bd2Session validation are reused without
changes. Safe-integer S must be positive and S+720 minutes must remain safe;
policy snapshot/version, activity time, revision and revocation checks retain
the existing facade rules. No clock is sampled, no freshness rule is inferred.

The receipt's initialSession fixes immutable profile/context, digest,
createOperationId, principal, S, captured policy and authorizationVersionAtIssue.
Full evidence validation compares these fields with the envelope. Only
lastEligibleActivityAtMs, revision, status and revokedAtMs are lifecycle data;
revision zero must still equal the initial snapshot. Later valid lifecycle DTOs
remain inspectable (including EXPIRED/REVOKED), without implementing transitions,
authorizing activity/revoke or proving that those updates occurred lawfully.
Standalone envelope validation needs the original receipt to establish immutable
field agreement; it cannot authenticate creation by itself.

## Canonical identity and proposed path layout

Hashing follows existing Users/Policy conventions: SHA-256 over UTF-8
`JSON.stringify` arrays, lowercase 64-hex digests. Property order is irrelevant
because validation reconstructs canonical tuples. Let `H(tuple)` denote this hash:

```text
authorityKey = existing Durable Users authorityKey(context)
attemptKey = H(["KUB_BD2_SESSION_CREATION_ATTEMPT_V1", authorityKey,
                attempt.collectionId, attempt.attemptId])
requestDigest = H(["KUB_BD2_SESSION_CREATION_REQUEST_V1", BD2_PROFILE, 1,
  authorityKey, commandId, "CREATE_SESSION",
  [collectionId, clientId, attemptId, bindingDigest],
  [principal.issuer, principal.sub], createdAtMs, sessionDigest])
operationId = H(["KUB_BD2_SESSION_CREATION_OPERATION_ID_V1", authorityKey,
                 requestDigest])
```

`attempt.collectionId/attemptId` identifies the existing physical Attempt document
within the expected authority/context. `clientId` and `bindingDigest` describe
its immutable payload; changing either must conflict in the SAME binding slot.
Neither they nor principal, S, commandId, operationId or sessionDigest enter
attemptKey. Different physical attempt collections are different namespaces.
Collection/client grammar matches existing Attempt configuration/store framing.
Trusted server configuration must pin these values and validate them against the
original Attempt; browser-selected namespace/context is never authoritative.
No new default collection, attempt TTL or Google-proof freshness value is chosen.

commandId is supplied once by the trusted caller as 64 lowercase hex, as in the
existing contracts. Changing payload recomputes operation identity; a stale
requestDigest or operationId is rejected. There is no global first-payload registry.
Attempt-scoped create-only intent/binding, rather than commandId reuse rules, must
provide exclusion in the future store. Pure constructors cannot enforce it.

`paths(context, descriptor)` returns this **PROPOSED future adapter layout**:

```text
bd2_user_authorities_v1/{authorityKey}/session_creation_intents/{attemptKey}
bd2_user_authorities_v1/{authorityKey}/session_creation_bindings/{attemptKey}
bd2_user_authorities_v1/{authorityKey}/sessions/{sessionDigest}
bd2_user_authorities_v1/{authorityKey}/session_creation_operations/{operationId}
```

This reuses the existing authority root; it does not approve a production
project/database, namespace migration or IAM. Paths are derived, never accepted
as arbitrary destinations. Binding/intent validators check expected attempt keys;
envelope/receipt validators check expected digest/operation keys. The evidence
classifier requires every supplied `{path, record}` to match its derived path.

## UNKNOWN versus INVALID: pure evidence classification

`classifyCreationEvidence(context, descriptor, evidence)` performs no I/O.
Evidence has exactly four slots: intent, binding, session, receipt. Each is
explicit `null` (absent supplied record) or `{path, record}`. A future adapter must
collect coherent authoritative evidence; partial/unavailable reads cannot be
invented as absence. Read failures and authenticated lookup remain adapter work.

| Supplied evidence | Classification |
| --- | --- |
| All absent, or only a matching valid intent | UNKNOWN: no rollback/abort inference |
| Session or binding without required receipt | INVALID |
| Any incomplete creation triplet, or triplet missing original intent | INVALID |
| Malformed schema/profile, incorrect path/context/digest or incompatible records | INVALID |
| Matching intent + binding + Session + original receipt | CONSISTENT_CREATION_DATA |

A malformed caller descriptor throws generic ACCESS_DENIED before classification;
malformed supplied stored evidence becomes INVALID. Valid evidence is historical
structural consistency only. `CONSISTENT_CREATION_DATA` deliberately does not claim
confirmed database commit, Firestore atomicity, successful Google verification,
current authorization, a valid bearer, recovery entitlement or credential release.
Even the receipt constructor only constructs DATA; it cannot commit anything.
No status repairs records, repeats submission or creates a replacement Session.

## PROPOSED future store obligations

Create the original attempt-scoped intent without adoption/rebinding; retain the
original descriptor before possible dispatch. Intent pins pre-dispatch command
parameters; it is not Google verification or a captured policy snapshot. In the
future reviewed creation transaction, read/validate the original Attempt and
intent, current User/version and current validated SessionPolicy, then use
create-only writes for Session, binding and receipt in one atomic boundary.
Capture policy/version exactly once with that committed creation. A changed
operation for an occupied original attempt must fail closed. Retain original
S/digest/snapshot across UNKNOWN; do not infer abort from missing evidence.
There is no implementation or concurrency/durability evidence for this protocol
in Slice B. Transaction-scoped readers and proof provenance require review first.

## SID boundary, OPEN decisions and production limitations

SID must be an opaque bearer credential with at least 256 bits of CSPRNG entropy.
Raw SID, Google ID tokens and other bearer secrets are forbidden in persisted
records, operation descriptors, logs and URLs. These exact schemas contain digest
fields only; they cannot prove entropy or that a caller really hashed a SID.
No SID generation, digest-from-credential encoding, cookie contract or production
delivery protocol is selected. Recovery from a digest cannot reconstruct raw SID;
credential loss never authorizes replacement from the old proof.

A valid command/intent/receipt DTO does not prove successful Google verification
or trusted proof-to-issuer provenance. No DTO flag can provide it. A recovery
descriptor is only an immutable locator: it grants neither mutation nor recovery
permission. Authenticated HTTP recovery and fresh release/use checks remain OPEN.

OPEN: trusted proof-to-issuer provenance; freshness/creation-time rules; reviewed
clock guarantees; transaction-scoped User/Policy readers; browser delivery/CSRF;
authenticated HTTP recovery; Owner/Security Manager security operations;
production namespace/IAM; P-14 AuditLog; activity continuation/revoke authorization.
No OPEN decision blocks the isolated data minimum implemented here. Actual
issuance/recovery/authorization and store integration remain BLOCKED until these
decisions and their evidence are accepted. No arbitrary production defaults are
substituted for them. Slice C is not started.

## Verification (2026-11-05)

From repository root, with existing installed dependencies only:

```powershell
npm.cmd run build:permission-node
node --test prototype/identity/live-broker/test/bd2-session-contract.test.cjs
$sessionContractTestFiles = @(rg --files prototype/identity/live-broker/test -g '*.test.cjs')
node --test --test-reporter=spec @sessionContractTestFiles
npm.cmd test -- --reporter=dot
```

The explicit PowerShell file list works where this installed Node does not expand
`*.test.cjs` itself. New contracts: 16/16 PASS, covering all thirteen requested
groups, every nested field's getter/missing/extra checks and all sixteen evidence
presence combinations. All backend units: 174/174 PASS, including Durable Users,
SessionPolicy (and its initialization-anchor regressions), Attempt and Dispatch.
Emulator integration is not run in this pure-contract slice; no Firestore client
is instantiated by the new module. Concurrency/atomicity are not claimed.

Repository Vitest: 73 files / 2516 tests PASS. This includes actual Rollup Node
facade build/curated-export checks and in-memory GAS graph/bundle tests, with
unchanged denied production entrypoints. The new module/profiles are absent from
the portable artifact and production source/build imports. No GAS deployment ran.

Environment limitation: verification used installed Node 20.17.0, while the existing
backend package declares Node >=22. A repeat on that supported runtime remains
unverified; no runtime/dependency was installed or package engine requirement changed.
These results support independent review of the isolated contracts, not production
readiness, supported-runtime acceptance or store security/atomicity guarantees.

Git baseline before/after: branch `feature/bom-logic`, HEAD
`58f27435a87e0b5d25567ae42270dd6f20b1abb9`. Before: clean tree and empty staging.
After: exactly this document, the new contract and its test are untracked; staging
and tracked diff are empty. Existing contracts/stores/ADRs, package/build configuration
and production entrypoints are unchanged; no dependency installation, commit, push
or deployment. Stop after this slice's report; no automatic Slice C work.
