# Safe Grant Renewal - Slice 2C.3B.5

LOCAL CONTRACTS / PURE VALIDATION / REFERENCE MODEL / UNIT TESTS ONLY.
Baseline: feature/bom-logic, HEAD 420e4f4, clean working tree and empty staging.
No existing security module, LoginOrchestrator, ADMIN entrypoint, bundle target, manifest,
Wire v1 profile, PermissionService, production authorization or identity TTL is changed.
Remote durable admission remains unconditionally BLOCKED. PRODUCTION, TEST_RESET execution
and ADMIN deployment remain NO-GO.

## Approved limits

- One server-owned renewal family has at most three grants: initial + two renewals.
- At most two silent OIDC renewal attempts. Failure does not start an interactive/automatic loop.
- Generation is zero-based (0, 1, 2), stays in the original family, and cannot be reset by browser data.
- completedGrantAttempts counts closed grant issuance attempts, not successful session creation.
  An unsuccessful login before grant creation can terminate the family with fewer than three grants.
- All three grants retain the existing maximum 30000ms TTL and transaction/upstream caps.
  The third grant has no special lifetime or grace.
- minimumRemainingMs has NO production default. Tests explicitly inject 5000ms; that is not an
  approved runtime constant and is unrelated to the existing 5000ms authoritative-read timeout.

The policy validator accepts a positive safe integer below the existing grant TTL. A missing or
malformed policy fails closed. Rate-window values are not introduced or silently approved here.

## Files and trust boundaries

- renewal-contracts.ts: family, clock/policy, decision, dispatch, opaque evidence and fixture ports.
- grant-readiness.ts: pure conservative readiness decision and strict policy/interval validators.
- renewal-reference-model.ts: explicit local family/login/abandon/handoff/recovery state machine.
- Two test files: synthetic inputs, signature adapter and scheduling actors ONLY in tests.

GrantReadinessInput is a trusted-server input requirement, not a browser endpoint. Its binding must
come from an independent authoritative expectation. evaluateGrantReadiness validates data and
signing-key policy; it does not authenticate store ownership or cryptographic signatures. A caller
can fabricate data yielding READY_FOR_ATTEMPT, but that result cannot create identity, an unsent
capability, a session or a real admission permission. The model never accepts a readiness DTO as proof.

Family seed/context/issuer/subject/original authentication time/cap/rate reference are server-owned.
The constructor rejects extra counters, roles, permissions and serialized family snapshots. This
is not a real request factory: malicious server code could instantiate another reference model.
There is no durable cross-instance family registry, browser handler or production authority here.

## Readiness algorithm

The pure function checks:

1. Exact input shape; possible/unknown dispatch returns RECOVERY_REQUIRED, never renewal permission.
2. BEFORE_DISPATCH state, explicit minimum, well-formed trusted clock interval and previous observations.
3. Non-decreasing interval endpoints (local rollback guard), completed-attempt and rate budgets.
4. Strict durable grant projection against independent context/identity/ID/revision binding.
5. Upstream cap does not increase and is live across the complete clock interval.
6. A still-live upstream cap too short to fit the minimum returns UPSTREAM_INSUFFICIENT. A new grant
   cannot solve that condition without new verified authentication, so no renewal loop is attempted.
7. AVAILABLE lifecycle, null consumedAt, non-future grant issuance and current signing provenance.
   verificationKey is checked at both interval endpoints; compromise/revocation/retirement deny.
8. safeRemainingMs = grant.expiresAt - clock.latestMs. Uncertainty shrinks usable time, never adds grace.

If safeRemainingMs >= minimumRemainingMs: READY_FOR_ATTEMPT (data only).
If below minimum and another grant attempt is available: ABANDON_BEFORE_DISPATCH, distinguishing
expired and insufficient lifetime. If the third grant is insufficient: BLOCKED / RENEWAL_LIMIT_REACHED.
Malformed/unknown input and dependencies fail closed using fixed safe reason codes.

The function does not require the original accepted assertion to remain live for an independent
grant check. Existing grant and key rules still apply; assertion TTL is not reused as session TTL.

## Independent verified login

beginInitialLogin creates a local VERIFYING transaction and runtime-private login-attempt evidence.
beginRenewal requires private abandonment evidence from this exact owner/current generation; it
claims rate budget, checks silent availability/budget if requested, and creates a NEW transaction.
The family ID, identity, context, original cap and rate reference are retained.

Every login uses new transaction ID, nonce, browser proof binding and assertion ID. The caller supplies
only a browser proof commitment; no raw browser proof or session bearer is retained. A supplied
secret-generation port has no default or real implementation. Tests alone use synthetic values.

completeVerifiedLogin requires the existing runtime-private VerifiedSignedAssertion evidence.
JSON/casts/copies cannot substitute for it. It rechecks fresh policy/time, transaction bindings and
identity, rejects reused identifiers, and calls the existing grant constructors/validators. No
synthetic signature verifier is shipped in the source modules. The method MODELS a confirmed
verified login plus acceptance, and writes no real atomic store. If real assertion acceptance is
uncertain, the existing operation must be recovered before supplying any confirmed grant here.

The model retains the original authenticatedAt and rejects any unsupported change. It has no
fresh-reauthentication evidence issuer. A renewal's signed authenticationExpiresAt must be <= the
current effective cap, which itself can only decrease from the original family cap. A shortened
signed cap cannot later be raised back to the original. Signed claims are never edited or cast to
create authority. A new Google ID token/iat is not silently treated as a new authentication event.
Supporting proved fresh reauthentication or another account needs a separately reviewed protocol.

loginFailed is a local terminal event for failed/interaction-required login, not a classifier for
uncertain acceptance mutations. Silent availability is a fixture port, not a guaranteed passwordless
Google flow. No Google login, callback, UI, broker endpoint or real OIDC session is implemented.

## Dispatch state machine

```text
LOGIN_REQUIRED -> BEFORE_DISPATCH      independent verified login + modeled acceptance
BEFORE_DISPATCH -> ABANDONED           insufficient lifetime, private current unsent evidence
ABANDONED -> LOGIN_REQUIRED            rate/budget checks; new transaction, same family
BEFORE_DISPATCH -> DISPATCH_POSSIBLE   final local check + immutable ISSUE_SESSION descriptor
DISPATCH_POSSIBLE -> RECOVERY_REQUIRED unknown intent, handoff exception or recovery start
DISPATCH_POSSIBLE -> CONFIRMED         successful authoritative fixture lookup via recovery
RECOVERY_REQUIRED -> CONFIRMED        matching COMMITTED or REJECTED historical receipt
pre-dispatch/login -> BLOCKED          terminal failure/third insufficient grant
```

CONFIRMED describes receipt outcome only, including a confirmed rejection; it is not authentication.
No automatic replacement is allowed from DISPATCH_POSSIBLE, RECOVERY_REQUIRED or either terminal state.

Model capabilities have private owner/purpose/generation fields, a private construction key and exact
current-instance identity. Browser JSON, snapshots, spreads, prototype copies, constructor abuse,
foreign owners, old generations and previously spent permits cannot create proof of unsent state.
Abandon closes only the issuance attempt. It neither consumes nor extends/revokes the old grant;
historical projections retain their original immutable fields.

dispatch captures and validates the sealed command/recovery descriptor BEFORE its final readiness
check. It has no await between that check and its synchronous local state swap. Two scheduled actors
cannot both abandon and select handoff for the same capability. Model handoffs counts selection of
possible handoff, not actual network sends. No business mutation/transport callback is invoked here.
An unknown persisted dispatch intent is conservatively modeled as DISPATCH_POSSIBLE even if the
network call might never have happened. An exception cannot reset it to BEFORE_DISPATCH.

This is single-process reference behavior, not distributed coordination. Real durable fencing,
atomic abandon/intent ownership, takeover/restart rules and transport integration are MISSING.
Do not restore unsent evidence from a serialized snapshot or infer it from a missing receipt.

## Recovery

Only the original frozen RecoveryDescriptor is passed to the read-only recoveryLookup fixture port.
operationId, commandDigest, origin, context, revision and expected object remain unchanged. There is
no mutation port, replacement grant/session or credential-generation path in recovery.

UNKNOWN/missing, UNAVAILABLE, rejected promise, malformed or misbound receipt stay RECOVERY_REQUIRED.
A pending read also keeps that obligation; no timer or timeout-based permission to replace exists.
A real bounded lookup adapter is missing. Matching COMMITTED/REJECTED metadata closes the family.
Concurrent older reads cannot regress a confirmed family or close the same attempt twice.

inspectReceipt checks schema, binding, retention and timestamps; it does not authenticate an arbitrary
injected server reader. The fixture port is a documented trusted-DI assumption, not a real durable
receipt reader. Even a matching receipt produces ONLY metadata and never verified session identity.
A committed orphan session does not release a bearer. Historical resolution after grant expiry does
not revive the grant, extend TTL or start another login. Current session/PermissionService checks
remain mandatory in any future integration.

## Clock, rate and temporal limits

Clock intervals, key policy, rate claim/current status and secrets are synchronous local FIXTURE
ports. They are not real remote caches, clocks, rate limiters or storage adapters. Rate claim is
required for every login start; current status is rechecked for completion/readiness/handoff.
DENIED, UNAVAILABLE, thrown or unsupported rate results block. Family budgets cannot be reset by
another transaction; there are at most two renewals/silent attempts. A failed silent attempt is
terminal and does not automatically fall back to interactive login.

The local high-water guard observes denied reads too, but proves no cross-worker/restart time
authority. Numeric intervals alone do not prove bounded clock uncertainty/freshness. All production
time, rate and DI provenance guarantees require separate reviewed implementations.

Minimum lifetime reduces avoidable short-grant attempts. It bounds neither network delay nor database
contention/retries, proves neither cancellation nor rollback and DOES NOT enforce STRICT_COMMIT_TIME.
No capability proof is issued for real durable admission. The existing unconditional remote gate,
identity TTLs (120s / 20s / 30s / 15m / 1h), planned-key-rotation behavior and upstream session cap stay
unchanged. The model neither creates sessions nor updates existing sessions. The third grant uses
exactly the same grant constructor/caps as the first two.

## Integration and acceptance boundaries

No imports/entrypoints are added to LoginOrchestrator, ADMIN runtime or any bundle. Wire v1 command
encoding, receipts and RecoveryDescriptor fields remain unchanged. New family/dispatch metadata is
local application data, not a Wire v1 extension. No dependency, SDK, network adapter, broker, backend,
real coordinator, Firestore adapter, Google resource, commit or deployment is created by this slice.

Before runtime integration, separately approve authoritative grant reading/restoration, family and
rate ownership across workers, durable dispatch fencing/restart behavior, clock uncertainty,
directory consistency and strict commit-time enforcement. Synthetic tests prove none of those
production guarantees. READY_FOR_ATTEMPT cannot open composeRemoteDurableAuthentication.

## Original Slice 2C.3B.5 verification (historical)

- TypeScript --noEmit: PASS.
- Isolated ES2019 compilation with types:[] / lib.es2019 only: PASS (28 source roots).
- New unit suites: 110 PASS in 2 files. They cover all 26 requested regression categories,
  plus exact boundaries, prior-cap shrinkage, ownership/JSON/constructor abuse, command capture,
  pending/concurrent recovery, rate changes and final-check timing after command preparation.
- Full Vitest: 2061 PASS in 69 files (1951 previous tests + 110 new tests).
- Both ADMIN target checkers: PASS / NOT_CONFIGURED; only doGet/getAdminBootstrap;
  deploymentAllowed:false and resetAllowed:false.
- Production/readiness disk AND in-memory Rollup Code.gs SHA-256 match baseline:
  production 88eb2e583ca8dec204d7f525dccb515bb4a72df06a3de0cb51f7084d99e2e54d;
  readiness eb01e23a2d83da6839eea1b3aabcb5dd1bdec6cd9dedf8ac42764b1e3a922dc7.
- ADMIN PRODUCTION disk/in-memory byte-identical SHA-256:
  1208b5100b478c6ba7209374205c0235d127b8c1401802a3dd7fecc3b50a3e65.
- ADMIN TEST disk/in-memory byte-identical SHA-256:
  46e05f0edd89ae2d7cc1a6151ea0fa5b2e3177c5191052f5a5067d42cf538420.
- Import/global guards, diff check, all-six-file no-index whitespace, UTF-8 and scope checks: PASS.
- Exactly six new files, no tracked changes, empty staging, HEAD still 420e4f4.

Ready for a separate Acceptance Review of these local contracts/tests. No staging, commit, push,
deployment, dependency installation, Google operation or TEST_RESET was performed.

## Slice 2C.3B.5a correction: reentrancy and final clock sampling

Recovery inspection retained all six untracked files on feature/bom-logic / HEAD 420e4f4.
Only renewal-reference-model.ts, its test file and this document change in the correction.
renewal-contracts.ts and both grant-readiness files retain their original bytes.

F1: synchronous execution alone did not serialize dependency callbacks. A key-policy callback
could reenter dispatch, or abandon/renew/dispatch before the outer abandon resumed, allowing a
second handoff or overwriting RECOVERY_REQUIRED with stale ABANDONED state.

The model now acquires a runtime-private guard before the first dependency callback on every
public state-changing path, including assess (which updates clock high-water), login failures
and recovery transitions. Nested calls reject before entering catch/stop paths. The guard is
released in finally without restoring any prior state. Model state, owner, capabilities and
helpers use JavaScript private fields/methods; casts or public shadow properties cannot replace
them. stop additionally refuses post-dispatch and terminal transitions.

Recovery guards lookup invocation and completion separately, releasing the guard while awaiting
the read-only lookup. Each completion checks its captured epoch before any terminal update.
Unknown/unavailable results retain the original recovery obligation and do not permit replacement.
Concurrent reads remain supported; an older completion cannot regress a confirmed family.

F2: an observation taken before rate/policy reads became stale when those dependencies delayed.
The model now completes rate/policy reads and command/digest preparation first, snapshots policy,
then obtains the final clock interval. Login start likewise samples after rate/silent/secret reads.
Existing context, interval validity, endpoint high-water, assertion/transaction/grant/key/upstream
checks apply to that final observation. No fixture callback runs between that final check and the
synchronous local transition. Remaining lifetime uses expiresAt - latestMs, with no expiry grace.

This is a fresh call to a TRUSTED FIXTURE PORT, not proof that a real clock is authoritative,
fresh or bounded in uncertainty. Numeric intervals cannot authenticate their source. A lying or
stale production adapter, cross-worker rollback, restart coordination and distributed fencing
remain outside this model and require separately reviewed implementations. No local guard or
minimum reserve proves actualCommitTime < expiresAt; STRICT_COMMIT_TIME and the unconditional
remote BLOCKED gate remain unchanged.

The original correction report stated that the four R1-R4 regression tests were added first
and failed before the fix. The independent acceptance review confirmed their sensitivity by
reconstructing the defects in memory. The exact immutable pre-correction snapshot and original
failing log are unavailable, so the historical run cannot be independently verified. The table
below summarizes the reconstructed defects and the verified behavior after correction:

| Counterexample | Before correction | After correction |
| --- | --- | --- |
| R1: nested dispatch in keyPolicy | Two handoffs possible | Nested call rejects; at most one handoff |
| R2: nested abandon/renew/dispatch | Outer abandon could erase recovery | Nested transition rejects; later recovery remains authoritative |
| R3: grant expires during policy read | Expired grant selected for handoff | Final clock denies handoff |
| R4: assertion expires during policy read | Grant created from expired assertion | No grant; family blocks |

The correction adds 27 tests, including R1-R4, callback reentry through login/rate/secret/context/
clock/silent/recovery ports, nested stop attempts, guard release after exceptions, runtime-private
state, latency across reserve/expiry boundaries, uncertainty and rollback. Original ownership,
stale-generation, three-grant/two-renewal, upstream-cap and positive-path assertions are retained.

All original TTLs, budgets, Wire v1, LoginOrchestrator, PermissionService, production authorization,
ADMIN entrypoints/RPCs, manifests and targets remain unchanged. No runtime integration is added.

### Correction verification (repeated after recovery)

- TypeScript --noEmit: PASS.
- Isolated ES2019, lib.es2019 only, types:[], 28 source roots: PASS.
- Identity/authentication/channel/operation tests: 666 PASS in 8 files. The two renewal suites
  account for 137 tests (110 original + 27 correction tests); all R1-R4 regressions pass.
- Full Vitest: 2088 PASS in 69 files, including all previous tests.
- Both ADMIN target checkers: PASS / NOT_CONFIGURED; only doGet/getAdminBootstrap;
  deploymentAllowed:false and resetAllowed:false.
- Production/readiness disk and in-memory Rollup SHA-256 match the historical baseline above.
- Both ADMIN bundles are byte-identical on disk and in-memory to their baseline above.
- Git diff check, separate no-index checks for all six untracked files, UTF-8 without BOM,
  LF/trailing-whitespace and exact scope checks: PASS.
- HEAD 420e4f4 and branch unchanged; six expected untracked files, no tracked changes, empty staging.

Ready for a separate independent Acceptance Review of the correction. No Git staging/commit/push,
deployment, Google operation, TEST_RESET, dependency installation or runtime integration performed.
