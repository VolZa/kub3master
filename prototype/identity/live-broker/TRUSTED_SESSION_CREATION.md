# Trusted Session Creation Composition — D2-F2-B1

Isolated Node implementation for review. This is trusted D1-to-Intent composition
and one-use dispatch to an explicitly supplied test target. D3 is absent. There
is no Session/binding/receipt creation, SID generation, credential retention or
release, HTTP/GAS registration, application authorization or production wiring.
Production remains **NO-GO**. No commit, push or deployment is part of this slice.

## Construction and exported interfaces

`bd2-original-attempt-reader.cjs` exports exactly two factories:

```js
createOriginalAttemptMetadataReader(options)
createTrustedSessionCreationComposition(trustedOptions)
```

The existing A2 factory keeps its options, five-method frozen facade and exact
metadata result. Its `readOriginal(capability, expectedBinding)` consumes D1 and
terminates at DATA. That result cannot continue Session creation.

The additive B factory requires exact own data options:

```js
const composition = createTrustedSessionCreationComposition({
  firestore,
  configuration,
  target,                    // required trusted callable; no successful default
  // optional trusted infrastructure/test inputs:
  now,                       // defaults to Date.now; shared with the original D1 flow
  monotonicNow,              // defaults to process.hrtime.bigint
  attemptCollectionId,
  journalCollectionId,
});
```

SDK, original configuration, clocks, physical namespaces and target are trusted
backend construction inputs, never browser/request configuration. Original
configuration/context are validated, detached and frozen before D1 construction.
The target function itself is captured once; no later method or options lookup
selects a target. No owner, verifier, reader, generic continuation, raw validator,
permit function or clock-guard override is accepted or exported.

The B facade is frozen and has exactly:

```text
begin(request)
prepareOriginal(request)
verify(handle, request)
recover(originalJournalDescriptor)
completeOriginal(capability, expectedBinding, {commandId, sessionDigest})
lookupIntent(originalIntentDescriptor)
```

The first four retain their original D1 flow semantics. In particular, `verify`
can return the existing genuine D1 handoff; it is backend-internal authority and
not an HTTP response contract. No additional B capability is returned.

`completeOriginal` requires exactly three arguments. The seed accepts only
`commandId` and `sessionDigest`, each 64 lowercase hexadecimal characters. They
are detached and validated after D1 deletion and before asynchronous work.
Principal, context, authority, physical Attempt locator and immutable S come
from private original evidence and the trusted clock, never that seed.

B1 treats the seed as trusted backend input. Syntax checks do not prove SID
entropy, digest derivation or retained credential ownership.

## One original trusted operation

Both factories share unexported construction and A2 validation code. Each factory
instance constructs its own genuine private D1 owner. B does not consume a raw
external D1 owner's capabilities and does not call public `readOriginal()`.

```text
original journaled Google verification
  -> genuine D1 capability in its original owner's private registry
  -> completeOriginal -> existing D1.consume
       synchronous registry deletion before expected-binding validation/callback
  -> same private asynchronous callback retains original D1 snapshot
  -> A2 exact original Attempt/Journal validation
  -> A1 temporal checks and one-time S fixation
  -> existing D2-F1 createOriginal(command), exactly once
  -> confirmed outer NEW + fresh post-I/O checks
  -> private opaque permit registration
  -> synchronous permit deletion
  -> final binding/time checks
  -> one call to the construction-time target(command, descriptor)
```

The original snapshot stays private across awaits. A2 still validates the exact
SDK/document identities, original configuration/TTL, terminal Attempt CLAIM and
Journal reservation, immutable digests, original request binding and exact C/D.
Historical metadata alone is not freshness. Current configuration never extends D.

Canonical command/descriptor creation reuses `bd2-session-contract.cjs` unchanged.
The private operation binds the original snapshot, validated metadata, timing,
guard, canonical command, descriptor and fixed target. No provenance fields or
mutable dispatch state are added to Intent V1.

## Temporal checkpoints

One A1 guard is created inside the consumed callback. Its six observations are:

| Observation | Boundary |
| --- | --- |
| 1 | Immediately anchor the guard before A2 metadata I/O; this is not S. |
| 2 | After both A2 reads/validation, check pre-fixation predicates. |
| 3 | Take a distinct observation, validate with t=S and fix S exactly once. |
| 4 | After canonical command/descriptor construction, check immediately before submission. |
| 5 | After D2-F1 returns a recognized, correctly bound result, check freshness again. |
| 6 | After permit deletion, check immediately before fixed-target entry. |

Unavailable/malformed results fail closed without requiring further observations.
Before fixation, the unchanged A1 predicate requires positive safe-integer fields,
safe subtraction, C<D, C<=V<=t, t<D, t<G and `0 <= t-V < 30000`.
At/after fixation it additionally requires V<=S<=t and safe positive arithmetic for
`H = S + 720 * 60000`. Age exactly 30000, t=D and t=G deny. No rounding, offset,
grace period or resampling of immutable fields is performed.

The guard uses the accepted A1 implementation unchanged: first-observation anchor,
previous/anchor progression comparisons, permanently faulted anomaly/source state
and reentrancy rejection. Its provisional strict +/-1000 ms discrepancy policy
is not a deadline tolerance. Platform wall-clock synchronization is an operational
assumption, not a proven UTC accuracy or distributed-skew bound. A valid pre-anchor
clock offset need not be detected; scalar ordering/freshness still apply.

S is fixed outside the Intent transaction and never updated after I/O, failure or
UNKNOWN. A confirmed Intent whose post-I/O or final check fails stays immutable;
there is no replacement submission, expiry-based recycling or clock-correction retry.

## Confirmed NEW and permit lifecycle

B constructs the real data-only D2-F1 coordinator internally and calls
`createOriginal(command)` once. It validates the result framing, recognized status
and exact descriptor. Only NEW after the existing outer transaction has fulfilled
can progress. Callback-local NEW, staged writes and document presence do not qualify.
The unchanged store retains one outer transaction with `maxAttempts: 1`; this does
not disable every lower-level SDK RPC retry.

EXISTING, CONFLICT, INVALID and UNKNOWN never mint. Invalid/unavailable/malformed
completion is fail-closed. An exception after possible submission is conservatively
UNKNOWN unless a recognized completed result was already obtained. Lookup FOUND,
missing evidence and UNAVAILABLE cannot reach the permit registry.

The permit is a frozen empty object in a per-owner private WeakMap. It is registered
only after NEW and passing observation 5. It is immediately consumed by unexported
code: lookup and deletion precede operation/target binding validation, observation 6
and target entry. A finally block also deletes the entry if mint-to-consume throws.
There is no await or caller-selected callback between mint and consumption.

No permit crosses the target boundary or appears in a result. Copies have no
registered identity; another owner/process has no entry. Concurrent/reentrant
completion loses D1 synchronously and cannot submit or dispatch again. Exceptions,
rejection, UNKNOWN, lost response, process restart and corrected clock restore
neither D1 nor a permit. There is no permit adoption, reset, recovery or retry API.

## Results and read-only lookup

Invalid D1, invalid expected binding and failures before a canonical descriptor
exists reject/throw generic `ACCESS_DENIED` under the existing D1 sanitizer.
They never return private snapshots or diagnostics containing SDK details.

Once the canonical descriptor exists, completion returns a frozen data record:

```text
{ status, intentStatus, dispatchStatus, descriptor }
```

| Field | Values / meaning |
| --- | --- |
| status | DENIED, UNKNOWN or TARGET_RETURNED |
| intentStatus | NOT_SUBMITTED, NEW, EXISTING, CONFLICT, INVALID or UNKNOWN |
| dispatchStatus | NOT_INVOKED, RETURNED or UNKNOWN |
| descriptor | Existing frozen Intent locator; not authenticated recovery permission |

TARGET_RETURNED/RETURNED means only that the supplied target callable fulfilled.
Its return value is discarded, including any claimed success/UNKNOWN, secret or
capability. B1 does not interpret Session outcomes. Once target entry is attempted,
a synchronous throw, rejection or failed thenable assimilation yields
`UNKNOWN / NEW / UNKNOWN`; it never establishes absence of an effect. A pending
target stays pending, with authority already spent; B supplies no timeout/cancellation
or redispatch mechanism.

`lookupIntent` delegates to the unchanged read-only D2-F1 API. `recover` remains the
original read-only Journal/Attempt recovery. Neither method writes, submits Intent,
calls Google verification or mints authority. Missing evidence is not rollback.
New instances can inspect evidence but cannot adopt the old operation. A new login
requires an independent Attempt and verification, not reuse of old proof.

## Verification evidence and limits

Runtime: cached Node **v24.19.0**, existing dependencies only. From repository root,
the executed commands used this binary as `$b1Node`:

```powershell
$b1Node = 'C:\Users\vvolz\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $b1Node --test --test-reporter=spec prototype/identity/live-broker/test/bd2-trusted-session-creation.test.cjs
$env:FIRESTORE_EMULATOR_HOST = $null
& $b1Node --test --test-reporter=spec prototype/identity/live-broker/test/bd2-original-attempt-reader.test.cjs prototype/identity/live-broker/test/bd2-creation-clock.test.cjs prototype/identity/live-broker/test/bd2-trusted-session-handoff.test.cjs prototype/identity/live-broker/test/bd2-session-creation-coordinator.test.cjs prototype/identity/live-broker/test/firestore-session-creation-intent-store.test.cjs prototype/identity/live-broker/test/bd2-session-contract.test.cjs
```

- B1: **90 PASS, 0 FAIL, 0 SKIP**.
- Selected regressions: **282 PASS, 0 FAIL, 1 SKIP** (283 total). The existing real
  D1 Emulator test is explicitly skipped because no Emulator is supplied.
- The existing D2-F1 test includes in-memory Rollup graph generation and denied
  GAS-entrypoint checks; no generated bundle is written by that test.
- `node --check` passed for the modified implementation, existing A2 test and new
  B1 test. `git diff --check` passed; both untracked files were separately inspected
  for trailing whitespace/conflict markers. Staging remains empty.

New tests exercise genuine original D1 capability creation through actual RSA
signature/Google-library verification. Certificate transport, clocks and Firestore
I/O are controlled test fixtures; no mocked proof DTO grants authority. Coverage
includes all six checkpoints, exact deadlines/proof-age boundaries, hard-expiry
overflow, immutable S, original TTL, substitution, concurrency/reentry, delayed
outer acknowledgement, UNKNOWN before/after simulated commit, lookup and target
exceptions. Test-only same-realm wrappers instrument only B's private WeakMap to
observe deletion order and inject mint-to-consume failure; D1 and all dependencies
remain real implementations and no production instrumentation API is added.

These are unit/control-flow proofs. No Emulator or production database, live Google
login, real process-crash test, distributed race or durable Session effect is tested
in B1. New-owner tests establish local non-adoption, not operational restart proof.

## D3 and production blockers

The target accepts canonical command and descriptor DATA only. It is a test seam,
not a finalized D3 authority or transaction API. Full original provenance and guard
remain private; a future reviewed D3 composition must define its private transfer
and post-authoritative-read temporal check without reconstructing authority from
these DTOs. Do not register a production target that treats their shape as authority.

D3 must separately implement transaction-bound original Intent/Attempt/Journal,
current User/version and full Policy validation, target-slot checks, unchanged S,
post-read freshness, atomic Session/binding/receipt, uniqueness and coherent outcome
lookup. Credential release requires confirmed creation plus separate fresh
Session/User authorization. None is implemented here.

Other residual assumptions/blockers include trusted SDK/clock/target code, one
authoritative namespace and retained immutable evidence, IAM, platform clock and
suspend/restart evidence, production SID generation/digest binding, credential
retention, authenticated transport/recovery, cookie/CSRF and release security.
WeakMap identity is not a distributed mutex or durable issuance guarantee.

D1 format, A1 policy, D2-F1 API, Attempt/Journal/Intent V1 schemas, accepted ADRs,
D2-T and production guards remain unchanged. Implementation is **READY FOR REVIEW**,
not independent acceptance or production readiness. B2/D3 work is outside this slice.
