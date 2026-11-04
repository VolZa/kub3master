# Durable dispatch journal — Slice 2C.4.3

Isolated, backend-only local implementation for B/D2 login proof completion. No public
HTTP registration, browser transport, ERP session, GAS channel or production authorization
is added. Existing Google verification and login attempt NEW -> CONSUMED remain unchanged.

## Data and authority

One `bd2_dispatch_intents_v1/{intentId}` document per original attempt/CLAIM operation:

```text
schemaVersion: 1
binding: {
  profile, clientId, context: {environment, applicationAudience, expectedScriptId},
  intentId: SHA-256([KUB_BD2_DISPATCH_INTENT_V1, attemptId, originalClaimOperationId]),
  attemptId, operationId: original CLAIM operation ID,
  bindingDigest: existing immutable attempt digest,
  requestDigest: SHA-256 of domain, configuration/context, attempt ID and proof hashes,
  attemptCreatedAtMs, attemptExpiresAtMs
}
createdAtMs: backend application check time
state: INTENT | RESERVED
revision: 0 | 1
reservedAtMs: null | backend application check time
outcomeRef: {kind: CLAIM, attemptId, operationId, bindingDigest}
```

Request digest binds hashes of nonce, browser proof and the exact signed ID token. Neither
raw token, nonce, browser proof, cookies nor credentials are persisted. Intent ID excludes
request digest and context: substituting either cannot obtain a second slot for the same
attempt. Full bindings are immutable and validated on every journal read/transition.
Existing attempt lookup adds only immutable creation/expiry metadata for reconstructing
and checking the original digest before reservation; it exposes no raw proof or identity.

Journal state describes dispatch bookkeeping, not a second login-attempt lifecycle.
RESERVED remains reserved whether the attempt is NEW, CONSUMED, failed or UNKNOWN.
There is no release, takeover, lease expiry, reset, delete, TTL or receipt-to-permit API.

## Isolated API and dispatch proof

`createIsolatedJournaledLoginProof({firestore, configuration, ...localOptions})` composes
the existing maintained-library Google verifier, existing attempt adapter, journal and
coordinator. It exposes only `begin`, `prepareOriginal`, `verify` and `recover`; no raw
claim/verify port, fixture verifier, test keys or certificate override is exposed.
Explicit generic adapter ports are trusted server composition inputs, never browser DTOs.

1. `begin({browserProofHash})` delegates unchanged to the original login-proof core.
2. `prepareOriginal(request)` validates browser/nonce bindings against authoritative
   attempt metadata, then creates the durable intent using create-if-absent. Only a
   confirmed new creator gets an opaque, local, one-use handle. Existing INTENT is never
   adopted, including when it has not been reserved. Losing this handle abandons progress.
3. `verify(handle, request)` validates the same request digest and consumes the local
   handle before I/O. It conditionally commits INTENT/revision 0 -> RESERVED/revision 1.
   Only confirmed reservation yields a local, one-use dispatch permit, consumed before
   calling the existing login-proof verifier/outer claim. Claim is invoked outside all
   journal callbacks. A copied, deserialized, reused or lost handle is lookup-only.
4. `recover(descriptor)` reads journal and original attempt outcome only. It never
   writes, prepares, reserves, calls claim, returns a verified principal, or resumes
   Google verification, even when the original claim receipt is COMMITTED.

Shared exclusion comes from Firestore create-if-absent and conditional reservation.
WeakMaps supply local unforgeability/one-use provenance after confirmed acknowledgements;
they are not a distributed mutex. No other process can adopt an existing document or
mint a permit from its contents. Both halves are required: durable exclusion prevents
another instance winning, and consuming local provenance before I/O prevents a caller
from using a winning acknowledgement twice.

The handle is server-internal and intentionally cannot survive serialization/restart.
A future HTTP coordinator must route fresh original setup and recovery explicitly;
it must not call `prepareOriginal` as a generic retry mechanism, auto-create a replacement
attempt, or expose the raw core around this wrapper. After an UNKNOWN intent write with
no document visible, recovery still invokes only `recover`/handle-less `verify`. A fresh
explicit original preparation for an absent document is not a recovery operation; this
local slice does not durably classify every HTTP request before its first persistence.
No previous claim could have been dispatched without its confirmed, persistent reservation.

## Transaction boundaries and outcomes

Intent creation, journal reservation and attempt claim are **three separate transactions**.
No atomicity across them is claimed. Journal callbacks perform only reads, validation,
application time checks and journal writes. Google verification and the outer claim are
never called in a retried callback. There is no post-claim journal write needed for safety;
the original operation receipt is the outcome reference.

Both journal writes call `runTransaction` once with `maxAttempts: 1`. This does not disable
all lower-level SDK RPC retries. Any unproven SDK failure (including ABORTED/10) becomes
`DispatchJournalError(UNKNOWN, originalDescriptor)` without outer retry or a new permit.
Known pre-write state/binding/expiry rejection stays REJECTED. That is rejection of this
invocation, not proof that a previous operation aborted. Normal SDK completion confirms
that write; read-only lookup reports FOUND / UNKNOWN / INVALID / UNAVAILABLE. Attempt
lookup independently reports COMMITTED / UNKNOWN / INVALID / UNAVAILABLE. Missing receipt
or NEW is never authorization to dispatch again. COMMITTED proves claim storage only,
not verified Google identity, delivery or ERP authorization.

## Crash and uncertainty evidence

Integration tests use actual SDK clients and a loopback Firestore Emulator. The journal
suite counts entry into the original attempt `transition` port (actual outer claim
invocations), separately from successful commits and Google verifier calls.

| Boundary/fault | Durable journal | Outer claims | Recovery |
| --- | --- | --- | --- |
| Child exits before intent | Missing | 0 | Read-only UNKNOWN; no reconstructed handle |
| Child exits after intent | INTENT / 0 | 0 | No adoption or reservation |
| Child exits after reservation, before claim | RESERVED / 1 | 0 | No dispatch despite attempt NEW |
| Child exits after claim, before verifier | RESERVED / 1 | 1 | COMMITTED metadata; Google count 0 |
| Child exits after verification, before reply | RESERVED / 1 | 1 | COMMITTED metadata; Google count stays 1 |
| UNKNOWN before claim commit | RESERVED / 1 | 1 | No receipt/NEW; count stays 1 |
| UNKNOWN after claim commit | RESERVED / 1 | 1 | COMMITTED/CONSUMED; no verification replay |
| UNKNOWN intent/reservation write | Missing, INTENT or RESERVED | 0 | No permit from ambiguous completion |
| Reservation commit ack lost, identical Commit RPC ABORTED | RESERVED / 1 | 0 | One outer journal transaction; lookup only |
| Two independent coordinator/SDK instances | One RESERVED / 1 | 1 total | Other instance cannot dispatch |

Child-process tests exit deliberately without cleanup, then another instance reads shared
state. They prove backend process loss behavior, not emulator restart/power-loss recovery.
Controlled SDK fault injection surrounds real emulator commits. The identical Commit RPC
test obtains ABORTED from the emulator, rather than manufacturing that numeric status.
No guaranteed progress after all crashes or ambiguous writes is claimed.

Run with Node >=22 and the existing local Emulator instructions in
[DURABLE_LOGIN_ATTEMPTS.md](DURABLE_LOGIN_ATTEMPTS.md): `npm test` and
`npm run test:integration`. No dependency or package-script changes are required.
Test certificate substitution and crash instrumentation reside only under test/integration.

## Remaining boundaries

The known raw-core resubmission path remains intentionally available as an internal port
and a negative integration test. Only the isolated journaled composition fences it; all
future integrations must use that composition and preserve recovery-only routing. Public
HTTP/browser ownership and descriptor exposure, request routing across lost responses,
IAM/single authoritative namespace, no deletion/TTL/rollback of reservation records,
retention/capacity, production durability and disaster recovery require acceptance.
Deleting/restoring records or changing authority/collection during a live attempt would
invalidate the dispatch proof and is not supported. Reservation is not a reusable credential.

Application `Date.now` checks do not prove distributed clock bounds or strict commit-time
expiry. A late commit can persist INTENT, RESERVED or CONSUMED; fresh checks fail closed
and never release identity after expiry. This slice does not satisfy legacy temporal
admission obligations, prove eventual completion, or establish production readiness.

ADR-050 remains ACCEPTED; ADR-049 remains PROPOSED. Legacy operations stay
STRICT_COMMIT_TIME; Gate B is BLOCKED BY MISSING DECISION; PO-01–PO-14 stay OPEN.
Remote admission/business mutations remain BLOCKED. PRODUCTION, ADMIN deployment and
TEST_RESET remain NO-GO. No ERP Users/Sessions, cookies, UI, GAS channel or business access.
