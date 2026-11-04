# Durable B/D2 login attempts — Slice 2C.4.2

Isolated local implementation, not production composition. ADR-050 remains unchanged.
`@google-cloud/firestore@9.4.0` requires Node >=22 and is confined to this backend package.
The core Google verifier and all legacy GAS/security contracts remain unchanged.

## Storage model and port

One document per attempt in `bd2_login_attempts_v1/{attemptId}` (tests use a unique collection).
The existing lifecycle stays NEW -> CONSUMED. No second login/session lifecycle is introduced.

```text
schemaVersion: 1
attempt: {
  profile, clientId, context: { environment, applicationAudience, expectedScriptId },
  attemptId, nonceHash, proofHash, createdAtMs, expiresAtMs, phase: NEW | CONSUMED
}
bindingDigest: SHA-256 of the canonical immutable attempt fields (excludes phase)
createOperationId: SHA-256([profile, CREATE, attemptId])
revision: 0 (NEW) | 1 (CONSUMED)
claim: null | { operationId: SHA-256([profile, CLAIM, attemptId]), checkedAtMs }
```

No raw Google token, browser secret, nonce or credential is stored. Public nonce is now
echoed in the verify request and matched against its stored hash before Google verification.
Shared `bd2-attempt-contract.cjs` supplies the same validation/digest rules to core and adapter.
This is the minimum local port compatibility change; no deployed protocol or UI changes.

`createOnce(id, attempt)` uses a real transaction read plus create-if-absent. Duplicate
IDs always reject, even for identical data. `transition(id, NEW, pureUpdate)` validates
context, immutable bindings, expiry and revision; only NEW -> CONSUMED is writable.
Attempt update, revision and claim outcome metadata commit atomically in one document.
The Google verifier runs only after confirmed transaction completion, outside its callback.
No raw proof is returned by outcome lookup and no deletion/TTL cleanup API is supplied.

## Outcomes, retries and recovery

Normal create/transition return means confirmed commit, not Google authentication.
`AttemptStoreError` has a generic ACCESS_DENIED message plus outcome and a credential-free
descriptor `{kind, attemptId, operationId, bindingDigest}`. Digest may be null if a claim
failed before the authoritative read. Descriptors are server-side recovery metadata.

- Confirmed COMMITTED: a normal SDK transaction result or matching read-only persisted
  outcome. This proves the storage transition, not Google authentication or ERP access.
- REJECTED: known local pre-write validation/state/binding rejection for this invocation.
  It neither erases a prior receipt nor proves the original operation never committed.
- Truly definitive abort: evidence must establish that the original operation had no
  commit, accounting for earlier RPCs. This adapter has no such abort-evidence issuer.
  A numeric gRPC code, including ABORTED (10), is not that evidence.
- UNKNOWN: unproven SDK/storage outcome, including a raw ABORTED response; never proof
  of abort or success. The original operation ID/lookup descriptor is preserved.
- `lookup(descriptor)` is read-only: COMMITTED / UNKNOWN / INVALID / UNAVAILABLE.

F-01 correction (Slice 2C.4.2B): one outer runTransaction call only, with maxAttempts=1.
There is no outer retry loop or maxConflictAttempts setting. All unproven SDK failures
become UNKNOWN, including CANCELLED, ABORTED, DEADLINE_EXCEEDED and UNAVAILABLE.
The adapter's own pre-write validation rejection stays REJECTED.

maxAttempts=1 disables the SDK transaction callback retry loop, not every internal RPC
retry. The pinned SDK's Commit RPC service configuration can retry RESOURCE_EXHAUSTED
and UNAVAILABLE. A commit may already have succeeded before an acknowledgement was
lost; repeating the same Commit RPC can yield ABORTED for the now-invalid transaction ID.
That later RPC status does not prove the original operation aborted. The adapter does
not start a new outer claim in response, regardless of internal RPC history.

Recovery protocol: after UNKNOWN, lookup the original descriptor only. Missing document
or NEW with no claim receipt remains UNKNOWN, including when no commit actually occurred.
Do not resubmit the original create/claim, auto-begin a replacement, reconstruct a nonce,
or rerun Google verification from a COMMITTED receipt. A new independent login needs a
fresh attempt. The methods do not orchestrate retries of UNKNOWN; callers must preserve
the descriptor/recovery mode across restart. No durable HTTP request coordinator is claimed.
After unknown creation, lost transient nonce cannot be recovered from the store.

### OPEN caller-side enforcement

The current API is not an end-to-end lookup-only gate. After UNKNOWN before commit,
the stored attempt may still be NEW. An explicit second verify call with the same request
can then claim it and invoke Google verification. The integration suite records this as
an OPEN risk; passing that test is not proof that caller recovery is enforced.

Minimal proposed mechanism, not implemented in this corrective slice: a shared durable
caller dispatch journal keyed by original operation ID, attempt ID and pinned context,
with immutable request/binding digests and no raw credentials. Persist dispatch intent
before invoking verify/claim, using conditional single-dispatch ownership. A pending
intent after crash or any UNKNOWN must route duplicate requests to read-only lookup,
never back to verify/claim, even if lookup has no receipt. Uncertain journal persistence
must prevent dispatch. COMMITTED lookup still does not resume Google verification.
This is proposed caller bookkeeping, not a change to NEW -> CONSUMED or a new grant/
session/admission lifecycle. Cross-worker/restart enforcement requires separate acceptance.

## Clock, ordering and delayed commit

The explicit backend clock port defaults to Date.now for this local slice; safe integer
and per-instance high-water checks reject invalid/rollback observations. Browser time is
never used. Production clock source/error bounds and cross-worker/restart health are OPEN.

Expiry is checked after awaited transaction reads and again after pure preparation, before
the write. Firestore transaction ordering provides the atomic state/revision boundary.
`checkedAtMs` is application check time, not an authoritative commit timestamp. A delayed
commit may persist CONSUMED after expiry; this is not STRICT_COMMIT_TIME enforcement.
The login-proof core checks freshness again after storage and verifier I/O; an expired
attempt then denies without returning identity. A consumed attempt never becomes NEW.
No server timestamp, CAS or emulator success is presented as a commit-time clock proof.

## Reproducible local integration

Use an official Firestore Emulator on loopback, a demo project and Node >=22:

```text
FIRESTORE_EMULATOR_HOST=127.0.0.1:8685
npm test
npm run test:integration
```

Set that environment variable using the local shell's syntax. The integration runner
fails with INTEGRATION_BLOCKED when absent; it never substitutes a Map or real project.
`createLocalFirestoreClient` rejects non-loopback endpoints, non-demo projects, ambient
endpoint substitution and credential overrides. Pinned universe plus insecure emulator
transport avoids ADC/metadata discovery. No Firebase CLI/global installation is required.
The generic SDK-injection adapter remains disconnected from server.cjs and GAS.

This slice used official Emulator 1.22.0 and portable Temurin JRE 21 in TEMP, with official
SHA-256 checksums verified. No system Java installation or Cloud resources were created.

Real SDK/emulator evidence covers atomic create/claim, replay/concurrent independent
clients, digest-only persistence, child-process writer exit/new reader recovery, corrupted
records, expiry/binding rejection and fresh post-storage denial after late commit.
ABORTED, ambiguous acknowledgement and storage-unavailable cases use controlled SDK
fault injection around real emulator state. They do not prove every natural network failure.
An injected pre-commit ABORTED rolls back the real transaction, but still yields UNKNOWN
without retry because the numeric code alone is insufficient evidence; verification stays zero.
The F-01 regression commits through the real SDK, drops the success acknowledgement,
then repeats the identical Commit RPC. ABORTED comes from the emulator, not a fabricated
code. It asserts one outer transaction, UNKNOWN, unchanged original lookup descriptor,
COMMITTED/CONSUMED/revision 1 on lookup, and zero Google verification calls. It failed
against the original outer-retry implementation before the correction. Separate tests cover
confirmed rejection without writes, replay, concurrent claims and UNKNOWN before/after commit.
Lookups neither repeat writes nor resume verification.

OPEN: production durability/replication, emulator restart/power loss, real IAM/credentials,
network partitions and SDK transport behavior beyond tested faults, production clock,
caller recovery coordination, retention/capacity and complete browser transport. A backend
process restart test is not an emulator persistence or production disaster-recovery proof.

ADR-049 is PROPOSED; legacy operations stay STRICT_COMMIT_TIME. Gate B is BLOCKED BY
MISSING DECISION; PO-01–PO-14 remain OPEN. Remote admission/business mutations are BLOCKED.
PRODUCTION, ADMIN deployment and TEST_RESET remain NO-GO. No Users/Sessions/cookies/GAS
channel/business operation is added or enabled.

## Official references

- [Firestore Node SDK](https://docs.cloud.google.com/nodejs/docs/reference/firestore/latest/firestore/firestore)
- [Transaction retry and atomicity](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Emulator setup and limitations](https://firebase.google.com/docs/emulator-suite/install_and_configure)
