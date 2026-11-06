# Trusted Session Handoff Foundation — Slice 2C.5.4-D1

Isolated Node implementation, ready for independent review. No Durable Sessions
are created or released. ADR-050 remains ACCEPTED; ADR-049 remains PROPOSED.
Gate B is BLOCKED BY MISSING DECISION; production is NO-GO.

## Accepted scope

| Decision | D1 boundary |
| --- | --- |
| D-01 | Ephemeral trusted handoff after successful original journaled verification |
| D-02 | Private, owner-bound identity capability consumed synchronously before I/O |
| D-03 | Crash/UNKNOWN never permits adoption, DTO restoration or another creation dispatch |
| D-04 | One original Attempt has at most one creation slot within its authority; durable enforcement belongs to later slices |
| D-05 | Trusted Handoff Foundation only |

Existing S-01–S-06 and C-01–C-05 remain obligations, without changes to their
contracts or implementations. D1 does not prove distributed at-most-one Session.

## Trusted origin and actual call graph

`createTrustedSessionHandoff` owns a private instance of the existing
`createIsolatedJournaledLoginProof`. It exposes begin/prepareOriginal/verify/recover
plus consume. Configuration, Firestore SDK, collection names and clock are trusted
server composition inputs. They must identify the single authoritative namespace
and must never be selected from HTTP/browser input. No loginProof/verifier override,
certificate/key option, generic DTO factory or public mint function exists.

```text
owner.begin -> original loginProof.begin -> Attempt createOnce
owner.prepareOriginal -> CREATE lookup + binding checks -> Journal createIntent
owner.verify -> private coordinator.verify
  -> consume original preparation handle
  -> Journal reserve -> consume dispatch permit
  -> original loginProof.verify -> confirmed Attempt NEW -> CONSUMED claim
  -> security.createGoogleVerifier / Google library verification (outside transactions)
  -> post-I/O Attempt deadline, canonical identity and Google token expiry checks
  -> original VERIFIED outcome -> private capability registration
owner.consume -> delete private registry entry -> match binding -> trusted consumer
owner.recover -> original read-only Journal/Attempt lookup (no mint/dispatch)
```

The underlying coordinator and login-proof API/results are unchanged. Only the new
owner's successful verify result adds an internal `handoff: {capability, binding}`.
This result must remain within the trusted backend boundary; it is not an HTTP
transport contract. The underlying coordinator/core is never exposed by this owner.
Calling the raw core or obtaining its genuine proof cannot register a handoff.

## Binding and one-use consumption

The capability is a frozen empty object. A closure-private WeakMap, unique per owner,
associates its exact object identity with a deeply frozen snapshot containing:

- Profile, application context, and the existing Users/Policy authorityKey helper.
- Canonical Google issuer/sub from the verified outcome.
- Physical Attempt collection/ID, pinned clientId and authoritative bindingDigest.
- Original Journal collection/intentId, CLAIM operationId and dispatch requestDigest.
- Existing verifiedAtMs and googleTokenExpiresAtMs; no invented claims/timestamps.

Journal requestDigest remains in the dispatch hash domain. It is never a Session
creation requestDigest. No raw Google token, browser proof or nonce enters the
capability registry/snapshot. Serialization of the capability produces `{}`.

The future trusted consumer calls:

```js
const result = await owner.verify(prepared.handle, originalRequest);
if (result.status === 'VERIFIED') {
  const { capability, binding } = result.handoff;
  await owner.consume(capability, binding, snapshot => testOnlyConsumer(snapshot));
}
```

`consume` is synchronous through deletion and invocation of the trusted callback;
its successful dispatch result is returned as a Promise. Binding data is compared
using exact own data descriptors, recursively, without invoking getters/toJSON.
The callback receives the immutable original snapshot, never caller-supplied data.
The binding may be copied as data; the capability must retain its original identity.
Wrong-owner, JSON/spread/structuredClone copies, forged proofs and public VERIFIED
DTOs cannot consume. Concurrent/reentrant consumers have at most one winner.

Deletion precedes binding validation, callbacks, thenable assimilation, await and
I/O. A binding mismatch, invalid consumer, synchronous throw or Promise rejection
burns the capability permanently. Consumer errors are sanitized to ACCESS_DENIED.
No error, returned UNKNOWN or missing response re-arms the registry or retries
dispatch. The callback is an explicit trusted code boundary, not a browser action
or authorization port; D1 uses only test consumers and creates no Session effects.

## Failure, crash and remaining proof

Failed reservation/claim, ambiguous acknowledgement, failed Google verification and
failed post-verification checks produce no handoff. Recovery never mints, even for
COMMITTED/CONSUMED records. CONSUMED proves claim storage only, including failed
Google verification. VERIFIED is copyable verification data, not issuance authority.
Only successful execution through this private original composition registers a
capability. Crash or lost transient state sacrifices progress; a new owner/process
cannot adopt it or restore it from stored records or serialized outcomes.

OPEN: actual issuance freshness/max proof age, the definition and immutable fixation
of S, reviewed clock/error bounds across workers/restart, and final release/use
checks. verifiedAtMs is a local check time, not a durable commit timestamp. D1
preserves original post-I/O checks but does not guarantee indefinite proof usability
or decide issuance freshness at consume time. It adds no arbitrary age/default S.

The future Session Issuer still needs durable one-slot enforcement for the original
physical Attempt; immutable creation bindings; atomic Session/binding/receipt;
transaction-scoped current User/Policy reads; approved temporal rules; read-only
UNKNOWN recovery; and fresh authorization before credential release. Namespace/IAM,
retention, transport/CSRF, P-14 audit and production durability remain separate proofs.
There is no SID/sessionDigest, creation intent, Session Store/Issuer/Checker, cookie,
activity/revoke lifecycle, new permission or production/GAS wiring in D1.

## Verification — 2026-11-06

Used existing portable Node 22.16.0, official Firestore Emulator 1.22.0 and portable
Temurin JRE 21.0.13. No dependency installation or production credentials. Emulator
bound to 127.0.0.1:8687; test clients pin demo projects and insecure local transport.
New emulator evidence lives in the new handoff test file to keep the agreed scope.
The Emulator was stopped after testing; its API port refused connections afterward.

| Check | Result |
| --- | --- |
| New handoff file | 22 unit tests + 1 actual SDK/Emulator test PASS |
| All backend tests | 218/218 PASS, no skips |
| Existing backend Emulator integration | 84/84 PASS |
| Repository Vitest | 73 files / 2516 tests PASS |
| Node/GAS isolation and production default-deny | Actual Rollup graph/bundle/export and denied-entrypoint tests PASS within Vitest |

Tests distinguish genuine original execution from equal-shape data, check every
binding leaf, getters/schema/secret leakage, concurrent original verify and consume,
consume-before-I/O, failure burning, and UNKNOWN before/after durable writes. The new
Emulator test confirms only Attempt/Journal collections, one-use consumption and
lookup-only recovery; a child process exits with an unconsumed capability, whose
serialized copy cannot be adopted by the parent. Existing integration covers real
process crashes around dispatch stages and lost-ack/ABORTED faults.
These are local emulator/process-loss proofs, not live Google login, emulator
restart/power-loss, production clocks/IAM or distributed Session atomicity evidence.

Reproduce from repository root with an existing Node >=22 binary in `$handoffNode`:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8687' # Start isolated Emulator first.
$handoffUnits = @(rg --files prototype/identity/live-broker/test -g '*.test.cjs')
& $handoffNode --test --test-reporter=spec @handoffUnits
$handoffIntegration = @(rg --files prototype/identity/live-broker/integration -g '*.test.cjs')
& $handoffNode --test --test-reporter=spec @handoffIntegration
& $handoffNode node_modules/vitest/vitest.mjs run --reporter=dot
```

Without an explicit emulator host, the new emulator test reports an explicit skip,
not PASS; existing integration refuses to substitute a mock. Stop the Emulator after
testing. Historical documents that still list trusted handoff as wholly unimplemented
need later documentation alignment; they are unchanged in this slice.

Git baseline before/after: feature/bom-logic, HEAD
`d1340666fdc6293dd47419db32de2cc3655824d3`. Before: clean tree, empty index.
After: exactly this document, the new handoff module and its test are untracked;
tracked diff and index are empty. No commit, push, deployment or D2 work.
