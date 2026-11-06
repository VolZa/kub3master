# D2-T Temporal Contract — Durable Session Creation

Date: 2026-11-06. Profile: `KUB_ERP_SESSION_BD2_V1`.

**ACCEPTED ARCHITECTURE:** T-01–T-07 below record the architect-approved
temporal decisions, including the final revised T-06. This is a normative design
contract, not a feasibility audit, implementation report, new ADR or runtime approval.

## 1. Purpose and Scope

Define immutable Session creation time, Google proof freshness, original Attempt
deadline, Google token expiry, clock assumptions and irreversible dispatch authority
for the future trusted D1 → D2-F2 → D3 creation flow. Requirements expressed as
“must”, “only” or “forbidden” are obligations of that future implementation unless
explicitly identified as existing behavior.

Scope is creation under the B/D2 profile. This contract does not implement D2-F2,
D3, Session issuance, credential delivery, activity continuation or protected ERP
access. It does not modify existing schemas, APIs, ADRs, legacy temporal contracts
or production guards. Intent persistence is distinct from Session creation.

The normative authority for T-01–T-07 is the architect-approved task of
2026-11-06. Repository sources and the two external references were available and
read at the baseline below. Historical PROPOSED/OPEN audit recommendations are not
implicitly accepted by inclusion as references. In particular, the revised T-06
replaces the earlier mandatory reference-time-adapter approach; that approach is
not an implementation prerequisite of this contract.

## 2. Architecture Status

Documentation baseline: branch `feature/bom-logic`, HEAD
`b210936edefe1ec2e772ca649c56272b1d993219`; clean working tree and empty staging
before creation of this file.

| Classification | State at this baseline |
| --- | --- |
| ACCEPTED ARCHITECTURE | ADR-050; S-01–S-06; C-01–C-05; D-01–D-05; D2-01–D2-06; T-01–T-07, with T-06 ACCEPTED — REVISED. |
| Existing implementation | Session data contracts, transaction-scoped User/Policy readers, isolated D1 handoff and Attempt/Dispatch Journal foundations exist. D2-F1 immutable Intent Foundation is ACCEPTED, as supplied by the architect's current task status. |
| Completed design work | D2-T Architecture Audit and Clock Adapter Feasibility Audit are completed. The latter had unresolved environment questions; revised T-06 removes the mandatory reference-time infrastructure requirement without asserting that those questions were technically resolved. |
| NOT YET IMPLEMENTED | D2-F2 trusted creation integration/permit, this complete temporal enforcement, D3 atomic Session creation and outcome lookup, Session Issuer/Checker and credential release. The existing file named `bd2-session-creation-coordinator.cjs` is D2-F1 data-only orchestration. |
| OPEN IMPLEMENTATION DETAILS | Clock anomaly thresholds/API, restart/suspend handling, practical guard checks and trusted Node composition; exact original-metadata integration and acceptance evidence. See section 10. |
| PRODUCTION BLOCKERS | D2-F2 remains BLOCKED pending implementation preparation; D3 and remaining security/integration evidence and approvals are absent. Production remains NO-GO. |
| Unchanged gates | ADR-049 is PROPOSED; Gate B is BLOCKED BY MISSING DECISION; Gates C–E are NOT OPENED; PO-01–PO-14 remain OPEN. Legacy ISSUE_SESSION and ACCEPT_ASSERTION retain STRICT_COMMIT_TIME. Remote admission/business mutations remain BLOCKED; ADMIN deployment and TEST_RESET execution remain NO-GO. |

Acceptance of temporal architecture does not approve implementation or establish
runtime evidence. This document does not open a gate or authorize deployment.

## 3. Terminology and Time Fields

All scalar timestamps below are Unix milliseconds from trusted backend evidence
or observations, with safe-integer validation. A field name shared by different
records does not make their timestamps interchangeable.

| Symbol / term | Meaning and authority |
| --- | --- |
| `C` | Original durable Attempt's `attempt.createdAtMs`, obtained from exact original authoritative metadata. |
| `D` | That same Attempt's original `attempt.expiresAtMs`; immutable original deadline. |
| `V` | `verifiedAtMs` from the successful original Google verification carried by the genuine D1 snapshot. It is backend verification check time, not token issuance, password entry, MFA or database commit time. |
| `G` | `googleTokenExpiresAtMs` from that original verified Google token, carried by D1. Browser-decoded expiry is not authority. |
| `S` | `createdAtMs` in the immutable canonical Session creation command: one server-owned logical Session creation time. It is not the Intent record's commit time or actual Session commit timestamp. |
| `M` | Maximum Google creation-proof age, exactly `30000 ms`. |
| `t` | A fresh backend check-time observation at the applicable creation boundary, using revised T-06. Request-start time or an earlier observation cannot substitute for a later required check. |
| D1 capability | Private, owner-bound, ephemeral object identity proving successful execution through the original trusted verification composition; not a proof DTO or durable record. |
| Creation Intent | Immutable attempt-scoped record pinning the canonical creation command; not a Session, captured SessionPolicy, Google proof or dispatch authority. |
| D2 dispatch permit | Future private, owner-bound, one-use authority for at most one invocation of the fixed D3 target. Distinct from the existing Google verification Dispatch Journal permit. |
| Confirmed `NEW` | D2-F1 creation result returned only after its outer transaction Promise fulfills successfully for a new Intent. A callback-local result or staged write is insufficient. |

D1 currently carries context/authority, principal, physical Attempt locator,
client, bindingDigest, Journal locator/CLAIM operation/requestDigest, `V` and `G`.
It does **not** carry `C` or `D`. Future trusted composition must obtain exact
original authoritative Attempt metadata and validate the full original binding.
Journal/claim data alone never replaces D1 as Google verification evidence.

## 4. Accepted Decisions T-01–T-07

### T-01 — Immutable Session Creation Time

**Status: ACCEPTED.** Consume D1 synchronously before the first I/O of the D2
operation. After validating the original Attempt and passing freshness checks,
fix `S` once from the trusted backend clock, outside the transaction callback and
before the first Intent submission. The fixation observation must itself pass the
creation predicates. Include `S` in the immutable canonical command.

Never move or recompute `S` after fixation, including for delays, transaction
callback execution, failed submission, UNKNOWN, crash or clock correction. A new
freshness observation is required immediately before submission without changing
`S`. Loss of authority or clock failure cannot resume the old operation. A user
who needs to log in again starts a new independent Attempt with a new independent
verification flow. `S` is not an actual Firestore commit timestamp.

### T-02 — Maximum Google Proof Age

**Status: ACCEPTED.** `M = 30000 ms`, with `0 <= t - V < M` at every creation
freshness check. Negative age and age exactly `30000` both deny. `V` cannot be
refreshed without a new independent Google verification. Attempt TTL does not
replace `M`; proof age, original Attempt deadline and Google expiry all apply.

These 30 seconds constrain creation proof, not ERP Session lifetime or the
separately OPEN sensitive-administration proof-age policy in ADR-050 P-09.

### T-03 — Original Attempt Deadline

**Status: ACCEPTED.** Use `D` from the exact original durable Attempt and require
`t < D`; equality denies. Validate physical collection/Attempt ID, client, context,
bindingDigest and terminal claim against the original D1 provenance. A stored
CONSUMED claim proves claim persistence, not Google verification success.

Current TTL configuration cannot extend or replace `D`. An unavailable or
unverifiable original binding/deadline fails closed. Expiry never releases the
immutable Intent slot and never authorizes automatic delete/recreate.

### T-04 — Google Token Expiry

**Status: ACCEPTED.** Require `t < G` at creation freshness boundaries; equality
denies. If expiry is reached during Intent I/O, do not issue a permit after that
I/O. Future D3 checks again after authoritative transaction reads and before
staging atomic writes. No strict commit-time validity is claimed.

Google token expiry does not cap an already created ERP Session's lifetime.
Session release and use depend on current Session/User/policy authorization,
not continual revalidation of the initial Google token.

### T-05 — Pre/Post-I/O Freshness

**Status: ACCEPTED.** The ordered boundaries in section 6 are mandatory. All
creation checks apply T-02, T-03, T-04 and revised T-06 together; once fixed, `S`
also participates in the temporal ordering. A pre-I/O pass cannot substitute for
the post-I/O or final dispatch check.

If the Intent is confirmed `NEW` but post-I/O freshness fails, keep the immutable
Intent, issue no permit and allow no repeat submission. Clock correction does not
revive the operation. Keep the D2-F1 API unchanged. A check-time guarantee is not
an actual commit-time guarantee. Post-D3 credential release has a separate fresh
Session/User check, as distinguished in section 6.

### T-06 — Simplified Clock Security

**Status: ACCEPTED — REVISED.** This is the final accepted T-06 for the current
stage. Use Node.js backend system time, `Date.now()`, with server-platform time
synchronization as an explicit operational assumption. Validate timestamps,
detect substantial backward/forward clock anomalies and fail closed for the
affected operation on detection. A monotonic elapsed clock may supplement these
checks where useful; it does not supply Unix time authority.

The former mandatory reviewed reference-time adapter with formal uncertainty
intervals and verified error bounds is withdrawn by the architect. No separate
time authority, NTP-monitoring API or formal uncertainty intervals are required.
There is no claim of mathematically proven UTC accuracy, a distributed skew bound
or strict commit-time correctness. Clock recovery restores neither consumed D1
capabilities nor permits. Numeric thresholds, API and integration remain OPEN
as listed in sections 8 and 10.

This consciously reduces time-accuracy guarantees; freshness checks and one-use
security remain mandatory.

### T-07 — UNKNOWN, Replay and Dispatch

**Status: ACCEPTED.** Consume D1 before the first D2 I/O. Only confirmed `NEW`
plus successful post-I/O freshness in the original trusted composition can lead
to a private, owner-bound, one-use permit. Consume that permit irreversibly
before D3 invocation. D2-F2 must provide at-most-one D3 invocation; it is not
implemented at this baseline.

UNKNOWN, crash, clock failure or failed freshness ends progression of the
affected operation. Read-only recovery cannot restore a capability or permit.
EXISTING, CONFLICT, INVALID, UNKNOWN and lookup evidence cannot mint a permit.
Expiry does not free the Intent slot. Future D3 separately provides atomic
Session/binding/receipt creation, Session uniqueness and original-outcome lookup;
these guarantees are not supplied by D2-F1 or by local object identity alone.

## 5. Temporal Predicates

Under the explicit platform-system-clock trust assumption, this is a **scalar
check-time model**. At creation boundaries after `S` is fixed, all of these must
hold together:

```text
M = 30000 ms
C <= V <= S <= t
t < D
t < G
0 <= t - V < M
```

Before fixation, check the available order `C <= V <= t`, original deadline,
Google expiry and proof age. At fixation, the single accepted backend sample
becomes `S`, and the full order holds with `t = S`. Later observations re-evaluate
the full predicates using the same `S`, `V`, `C`, `D` and `G`.

Equality is allowed in `C <= V <= S <= t`. Equality at `D`, `G` or maximum proof
age is denied. No formal uncertainty intervals, epsilon comparisons, permissive
skew, arbitrary grace or TTL extension are added.

Validate every timestamp as a positive safe-integer number before comparisons or
arithmetic; reject NaN, infinity, fractional, string/coerced, missing or otherwise
invalid values. Original Attempt metadata must satisfy its existing structural
and immutable-binding validation, including `C < D`. Validate subtraction
`t - V` and all derived additions as safe integers. Preserve existing Session
validation, including safe `S + 720 * 60000` arithmetic. Do not repair an invalid
timestamp by rounding, clamping, coercing or resampling the immutable fields.
Clock validation or anomaly failure denies even if scalar inequalities would pass.

At a later boundary a negative age or `S > t` fails closed. An undetected platform
clock error may still affect a seemingly valid scalar result; no UTC-error bound
is inferred from a passing check.

## 6. Creation Flow and Freshness Boundaries

**ACCEPTED ARCHITECTURE / NOT YET IMPLEMENTED as a complete flow.** “First I/O”
below means first I/O in the D2 operation after the earlier D1 verification flow.
This ordering adds no Google calls or external effects to transaction callbacks.

| Boundary | Required action and evidence | Failure behavior |
| --- | --- | --- |
| 1. D1 consume and original Attempt validation | Synchronously consume the genuine capability through its original owner before I/O. Use its immutable snapshot to read/validate exact original Attempt and relevant Journal/terminal claim bindings. Obtain `C` and `D`; then sample fresh `t` and check original order, proof age, deadline, Google expiry and clock health. | End progression; no Intent submission or capability restoration. |
| 2. One-time fixation of `S` | After boundary 1 passes, accept one backend clock sample as `S` outside the transaction callback, checking freshness at that observation. Construct/freeze the canonical command and preserve its original descriptor and provenance before possible submission. | End progression; no alternative `S` for the old operation. |
| 3. Before Intent submission | Take a new check-time observation and evaluate all predicates with unchanged `S`. Submit the fixed command at most once through the unchanged D2-F1 data API. | Do not submit after a failed check; no retry of the old operation. |
| 4. After fulfilled outer transaction with confirmed `NEW` | Await the outer transaction result, then sample fresh `t` and re-evaluate all creation predicates. Only the original trusted D2-F2 owner may issue a private permit after this passes. | Leave any committed Intent immutable. No permit for stale proof, clock failure or any result other than confirmed `NEW`. |
| 5. Final one-use permit consume before D3 | Irreversibly remove the private permit before validation/callbacks/await/I/O can reenter dispatch. Check its exact original ownership/binding and fresh temporal predicates. Invoke only the fixed trusted D3 target, at most once. | Failed binding, clock, freshness, throw, rejection or lost authority burns the permit; no second invocation. |
| 6. Within future D3, after authoritative transaction reads and before staging writes | Read/validate original Intent, pinned Attempt/Journal, current User/version, current Policy dependency graph and target slots using the required transaction-bound reads. After reads, check fresh time and all creation predicates before staging atomic Session/binding/receipt writes. Preserve original `S` and command identity. | Deny staging when checks fail; no D2 redispatch. Any unconfirmed write outcome stays UNKNOWN pending read-only lookup. |
| 7. After confirmed D3 commit, before credential release | Perform a separate fresh current Session/User authorization check under ADR-050: current active User, matching authorizationVersion, valid ACTIVE Session and captured policy, current required policy/permission checks and Session idle/hard expiry. | Release no credential if validation fails or outcome is unconfirmed; do not replace the Session or its credential. |

Boundaries 1–6 are creation-proof checks. Boundary 7 validates the created Session
and current authorization; it does not impose `M`, `D` or `G` as Session lifetime
caps. For example, expiry of the Google token after the final creation check does
not by itself invalidate an otherwise valid created Session. Every protected use
still needs its own current checks; credential-release approval is not a future lease.

D2-F1 keeps one outer `runTransaction` with `maxAttempts: 1`, one exact Intent
read and at most one `tx.create`. No permit is minted inside its callback or from
a callback-local flag. `maxAttempts: 1` does not mean all SDK RPC retries are
disabled. Rejection, including ABORTED after a lost acknowledgement, remains
UNKNOWN without another outer submission. Pre/post checks surround the existing
API; no clock/deadline fields or callbacks are added to D2-F1.

Future D3 transaction retry/error policy needs its own reviewed implementation.
Any allowed callback re-execution must repeat authoritative reads and boundary 6
checks without changing the original command or `S`, issuing new authority or
calling D3 again from D2. A check before staging writes does not prove that commit
occurred before `D`, `G` or the proof-age boundary. Post-commit checks cannot
retroactively turn a check-time predicate into a strict commit-time predicate.

## 7. Failure / UNKNOWN / Recovery Matrix

All recovery is read-only lookup of the original identity through the appropriate
trusted boundary. A new independent login is a separate user flow, not an
automatic replacement or a retry using the old proof.

| Case | What can be concluded | Permitted continuation / forbidden action |
| --- | --- | --- |
| Forged/copied/wrong-owner D1 capability; binding mismatch | Data equality does not establish private identity/provenance. | Deny. Consumed capability stays consumed; no DTO-to-authority mint. |
| Original metadata missing, corrupt, unavailable or incompatible | Original `C`/`D`/binding has not been established. | End creation; read-only diagnosis/lookup only. No deadline from current TTL. |
| Freshness/clock failure before submission | This operation cannot progress. | No submission; no reuse after clock correction, new `S` or proof-time refresh. |
| Transaction rejects, including ABORTED/timeout or lost acknowledgement | Intent may or may not have committed. UNKNOWN is not rollback. | Read-only Intent lookup; no repeated submission or permit. |
| Confirmed `NEW`, post-I/O freshness fails | Intent exists; Session creation is not established. | Keep immutable Intent; zero permits; no delete/recreate or later revival. |
| EXISTING matching Intent or lookup FOUND | Valid Intent data exists, without new original dispatch authority. | Lookup-only; no adoption, permit or Session-success inference. |
| CONFLICT / INVALID Intent | Occupied slot differs or evidence is invalid. | Deny; no overwrite, repair, rebinding, namespace switch or alternative slot for the same Attempt. |
| Missing Intent on recovery / lookup UNAVAILABLE | Absence or failed read does not prove original abort. | UNKNOWN / UNAVAILABLE respectively; no resubmission, even if the real write never occurred. |
| Crash after D1 consume, before Intent write | Volatile authority is lost; missing records cannot restore it. | Read-only lookup; new process cannot resume creation. |
| Crash after Intent commit or permit issuance, before D3 | Intent does not prove D3 invocation or Session creation. | No permit restoration/adoption; Session outcome remains unconfirmed. |
| Permit consumed, final check fails or crash occurs before D3 | Dispatch authority is spent; D3 may have had zero invocations. | No second consume/invocation; no guaranteed progress. |
| D3 throws, crashes or loses its commit acknowledgement | Session creation outcome may be UNKNOWN. | Future D3 original-operation lookup only; no D2 redispatch or replacement. |
| Matching Intent but no creation triplet | Intent alone does not establish Session creation. | Session outcome UNKNOWN; no credential release. |
| Incomplete/incompatible triplet, or triplet without required Intent | Existing classifier treats supplied evidence as INVALID. | No repair, adoption or credential release. |
| Complete coherent creation evidence | Pure `CONSISTENT_CREATION_DATA` establishes structural consistency only. Confirmed durable outcome requires future authoritative D3 lookup/transaction evidence. | Historical outcome is not bearer authority or current UseOK; boundary 7 remains required. |
| Confirmed creation, raw SID lost | A digest/receipt cannot reconstruct the bearer. | No credential replacement from old proof; new independent login if needed. |
| Concurrent processes/replay, or expiry of an occupied slot | Retained create-only slot excludes another confirmed new creator; progress is not guaranteed. | At most one trusted permit/D3 invocation is the future combined design obligation; zero is allowed. Expiry never recycles the slot. |
| Clock subsequently recovers / process restarts | Clock health does not restore lost object identity or authority. | No restored capability, permit, old-operation submission or new timestamp. |

Retain the immutable Intent and required evidence; expiry, UNKNOWN, a missing
receipt or an old lookup is not a safe-GC condition. Finite retention/fencing and
capacity handling require separate decisions. D2-F1 exposes no delete/reset API.

## 8. Simplified Clock Security — Revised Decision

**ACCEPTED ARCHITECTURE:** Node backend `Date.now()` supplies wall-clock samples.
Ordinary synchronization of the server platform is trusted operationally. Samples
must pass timestamp/arithmetic validation, and substantial backward/forward
anomalies must be detected and deny the affected operation. Optional monotonic
elapsed observations can help detect anomalies; they cannot replace `C`, `D`,
`V`, `G` or `S` with process-relative times.

**OPEN IMPLEMENTATION DETAILS:** No numeric anomaly threshold, clock guard API,
restart/suspend algorithm, elapsed-clock choice or exact trusted composition is
approved here. Practical checks must be selected and reviewed without unnecessary
complexity. Existing per-instance safe-integer/high-water checks in Attempt,
Journal and login-proof code are useful existing behavior, not evidence of a
completed D2-F2 forward-anomaly or restart/suspend guard. Do not silently treat
those checks as fulfillment of all revised T-06 requirements.

Clock recovery may allow a subsequent independent operation under the eventual
reviewed guard; it cannot revive the failed operation. Restart cannot reconstruct
capabilities or permits. Detailed health initialization and prolonged-suspend
behavior remain to be decided, without weakening those one-use rules.

No external time authority, NTP-monitoring API, formal uncertainty interval,
verified UTC error bound or epsilon-based comparison is required. This is an
explicit reduction in clock-accuracy assurance relative to the superseded T-06,
not removal of freshness or one-use security. Undetected drift and platform
synchronization faults are residual risks; there is no mathematically proven UTC
accuracy or bounded cross-worker skew. Node-specific APIs stay in the backend;
this contract does not import them into GAS or the portable permission facade.

## 9. Security Guarantees and Explicit Non-Guarantees

The accepted design requires immutable original creation identity/time, strict
check-time proof age/deadline/token-expiry predicates, irreversible one-use
authority, no authority from replay/lookup, and fail-closed recovery. These are
requirements to demonstrate in future implementation, not a claim that D2-F1
already enforces the complete flow.

D2-F1 currently provides immutable Intent persistence and inspection with
conservative UNKNOWN semantics. D1 provides its local owner-bound handoff.
Their existence alone does not prove distributed at-most-one Session issuance.
D2-F2 must combine original provenance, durable exclusion and one-use dispatch;
D3 must separately prove atomic Session/binding/receipt, uniqueness and coherent
authoritative outcome lookup. Trusted configuration, namespace retention and
TCB/IAM integrity remain assumptions of those proofs.

There is no guarantee of eventual completion, a race winner, recoverable local
authority after crash, strict validity at actual commit, bounded commit latency,
mathematically proven UTC accuracy, distributed skew bound or cancellation of
already started work. There is no Google password/MFA recency claim or automatic
Google-account-event revocation guarantee. A valid Google proof, Intent, claim,
receipt or Session DTO alone grants no ERP permission or credential release.

ERP Session lifetime remains ADR-050's captured policy: initially `A = S`,
`H = S + 720 minutes`, `effectiveExpiry = min(H, A + T)`, with the captured
validated idle timeout. Creation I/O consumes lifetime; completion/recovery does
not reset `S`, `H`, policy snapshot or authorizationVersion. The creation-proof
age of 30 seconds, Attempt expiry and Google token expiry are not Session caps.
This contract implements neither that lifecycle nor authorization checks.

## 10. Implementation Dependencies and Open Decisions

### NOT YET IMPLEMENTED

Future separately authorized work must integrate the original D1 owner, preserve
its complete private provenance bound to the immutable command/descriptor,
validate exact original metadata, implement the boundaries above and provide
private one-use dispatch to a fixed D3 target. No public mint from a proof/result
DTO, arbitrary dispatch callback or lookup evidence is allowed. D2-F1's exact
`createOriginal(command)` / `lookupIntent(descriptor)` API and V1 schema remain
unchanged; this contract prescribes no new public coordinator signatures.

The original Attempt reader must validate the physical locator, expected client
and context, digest and terminal CLAIM relation, including original `C` and `D`.
The current Attempt `record()` and Journal `readBinding()` validate expiry using
their captured `configuration.attemptTtlMs`. Therefore using a newly changed TTL
configuration to validate an old Attempt may fail; it must never rebase or extend
the original deadline. The exact trusted mechanism to preserve/validate original
configuration/metadata remains implementation preparation. If original evidence
cannot be validated, deny. This document does not change those existing validators
or approve a looser metadata schema/reader.

Future D3 needs transaction-bound original Intent/Attempt/Journal reads, existing
C readers for current User/Policy under one outer owner/read port, target-slot
validation, boundary 6 checks, immutable captured policy/version, atomic
Session/binding/receipt and original-outcome lookup. A standalone earlier User or
Policy read cannot replace transaction-scoped reads. Session release requires
confirmed durable outcome plus fresh validation and retained raw credential in
the trusted process; no SID generator/delivery implementation is supplied here.

### OPEN IMPLEMENTATION DETAILS

| Open item | Required next result; no choice made here |
| --- | --- |
| Numeric backward/forward anomaly thresholds | Reviewed practical detection criteria and acceptance boundaries; no invented millisecond defaults. |
| Clock guard API and practical checks | Exact validity/anomaly/failure behavior, with optional monotonic elapsed checks if useful. |
| Restart and prolonged suspend | Reviewed health initialization/suspend behavior and evidence, preserving permanent loss of old authority. |
| Trusted Node composition | Exact clock/provenance/metadata integration, pinned owners/namespaces and fixed D3 destination; no browser-selected authority. |
| Original metadata/configuration access | Compatible validation of exact original Attempt/Journal and original deadline without changing accepted contracts or extending TTL. |
| D3 and release integration | Reviewed transaction/retry/outcome mechanism, atomicity/uniqueness and current Session/User release checks. |
| Retention/capacity and broader security | Separate safe-GC/fencing decisions, production namespace/IAM, authenticated recovery, SID/cookie/CSRF, audit and other remaining ADR-050 evidence. |

### PRODUCTION BLOCKERS

D2-F2 remains blocked until implementation preparation and separate authorization
are complete. D3, end-to-end issuance/release and required evidence/independent
acceptance remain absent. Gate B and production holds remain unchanged. Approval
of this document alone resolves neither operational proof nor production
authorization. The superseded reference-time-adapter infrastructure requirement
must not be reintroduced as a mandatory blocker of revised T-06.

If later review discovers a conflict with an ACCEPTED ADR, report it to the
architect as a blocker; do not silently rewrite that ADR or this accepted contract.

## 11. Test Acceptance Requirements

These are requirements for future separately authorized implementation and
acceptance, **not tests added or executed in this documentation task**. Existing
historical PASS results in source documents do not prove this temporal contract.

| Group | Required acceptance evidence |
| --- | --- |
| Scalar boundaries | With all other predicates valid: age `0` and `29999` pass; negative age and `30000` deny. `t = D - 1` / `G - 1` pass, `t = D` / `G` deny. Ordering equality passes, `V < C`, `S < V` or `t < S` denies. |
| Invalid arithmetic | NaN/infinity/fraction/string/missing/unsafe timestamps deny; invalid original `C`/`D`, subtraction and Session hard-expiry overflow deny without coercion/fallback. |
| Immutable fixation | Consume D1 before first metadata I/O; fix `S` once after original validation and freshness, outside callback. Later boundaries and any permitted callback execution preserve exact command/S/digest/operation identity; no resampling after failure/UNKNOWN. |
| Every freshness boundary | Independently delay original metadata reads, fixation/submission, Intent I/O, permit use and D3 authoritative reads across each deadline/proof-age boundary. A prior pass cannot mask a later failure. |
| Confirmed NEW and post-I/O failure | Outer transaction must fulfill before permit eligibility. Expiry/anomaly after commit but before acknowledgement processing leaves the Intent unchanged and produces zero permits/D3 invocations, even after clock correction. |
| Provenance and original metadata | Substitute each physical locator/client/context/digest/claim/principal/Journal binding and deny. Persisted claim/Journal/VERIFIED DTO without genuine D1 cannot mint. Changed current TTL never extends original `D`; unverifiable original metadata denies. |
| One-use authority | Forgery, wrong owner, JSON/clone/wrapper copies, concurrent/reentrant consumption, invalid binding, throw/rejection and clock callbacks cannot create another permit/invocation. Permit is spent before final checks and D3 invocation. |
| Replay and uncertain outcomes | EXISTING/CONFLICT/INVALID/UNKNOWN/FOUND/UNAVAILABLE and missing evidence produce zero new dispatch authority. Lost acknowledgement before/after real commit and actual ABORTED history remain lookup-only, with no second outer submission. |
| Clock anomalies | Invalid samples and substantial backward/forward anomalies fail closed using the later reviewed thresholds; optional monotonic checks are tested if adopted. Corrected time cannot revive the old operation. No UTC/skew-bound conclusion from local tests. |
| Crash/restart/suspend | Real process loss before/after Intent commit, permit mint/consume and D3 invocation cannot restore authority in another process. Test the later selected restart/suspend guard behavior; no assumed numeric policy here. |
| Concurrent durable exclusion | Independent SDK clients/processes with identical/conflicting commands retain one immutable attempt slot and at most one confirmed NEW/eligible permit/D3 invocation; zero progress is allowed. Expiry does not recycle the slot. |
| Future D3 | Real SDK/Emulator evidence for transaction-bound reads, post-read freshness, current User/Policy capture, atomic Session/binding/receipt, uniqueness and coherent original-outcome lookup. Repeat reads/checks for any permitted callback re-execution with unchanged `S`. |
| Release and Session lifetime | After confirmed creation, fresh Session/User checks deny expired/revoked/disabled/version-mismatched/unavailable state. A valid created Session may outlive the initial Google token and 30-second creation window; no blanket creation-proof recheck as lifetime cap. Lost SID never yields replacement. |
| Check versus commit time | Delayed commit traces distinguish passing staging checks from actual later commit. No strict commit-time claim; failed final release never emits credential or resets original time. |
| Compatibility and isolation | D2-F1 API/schema and D1/Session validators unchanged; actual Node/GAS import/export/entrypoint checks preserve default-deny. Supported Node runtime, emulator evidence and independent review are required for implementation acceptance; mocks alone do not prove distributed issuance. |

## 12. Relation to ADR-050, D1, D2-01–D2-06 and D2-F1

### Compatibility assessment

No conflict with ACCEPTED ADR-050 was identified in the reviewed sources. Its
P-05 fixes logical `S` once and forbids recovery replacement; P-02 permits ERP
Sessions to outlive the initial Google token; P-05/P-11 require confirmed outcome
and fresh validation before release. T-01–T-07 refine creation freshness within
those boundaries. P-06's reviewed-backend-time-adapter wording leaves clock
source/error model OPEN; revised T-06 selects the creation wall-clock source and
weaker assurance model while leaving concrete guard/composition review OPEN.
It does not claim that all Session/activity clock obligations are implemented or
that ADR-050's remaining cross-worker/restart evidence is satisfied.

ADR-049's legacy Model B, interval bounds, `t0`, grant ceilings and proposed
admission semantics are a separate profile/direction. They are not imported into
B/D2, and revised T-06 does not alter their text, status or legacy runtime guards.

| Existing decision / component | Preserved relation |
| --- | --- |
| S-01–S-06 | Same authority, digest-only storage, one Session per original Attempt, atomic triplet, current User/Policy in transaction and read-only UNKNOWN recovery remain obligations; Intent is not that triplet. |
| C-01–C-05 | Existing transaction-scoped readers and integrity/missing/error semantics remain unchanged; future D3 must compose them correctly. |
| D-01–D-05 / D1 | Genuine original private handoff, synchronous consume and no crash/UNKNOWN adoption remain intact. New creation checks belong to future trusted consumers, not a rewritten D1 API. |
| D2-01 | Separate immutable `session_creation_intents/{attemptKey}` under the existing authority. |
| D2-02 | Attempt key depends only on authority and physical Attempt locator; changing command/principal/S/sessionDigest does not create another slot. |
| D2-03 | Existing create-only Intent transaction, `maxAttempts: 1`, no overwrite/update/application retry. |
| D2-04 | UNKNOWN recovery is read-only; existing/conflicting/invalid/unknown Intent never produces another permit. |
| D2-05 | D1 consume precedes I/O; permit only after confirmed NEW in trusted composition, additionally gated by T-05 post-I/O freshness. |
| D2-06 | Isolated Intent Foundation first. Temporal decisions are now recorded; D2-F2 preparation/authorization and working dispatch remain blocked as stated in section 2. |
| D2-F1 | Existing data-only `createOriginal`/`lookupIntent` results stay data. NEW confirms Intent creation only; no proof, permit, Session or credential is created. |

The V1 Intent's exact fields remain `storageProfile`, `storageSchemaVersion`,
`authorityKey`, `attemptKey`, `sessionDigest`, `operationId`, `requestDigest`,
`canonicalCommand`. No `V`, `G`, deadline, Journal snapshot, ownership flag or
mutable dispatch state is added. Full original D1 provenance must remain private
and bound to the command during the operation; loss of it denies continuation.
Durable provenance would need a separate versioned contract/review, not hidden
fields in V1. Journal requestDigest and Session requestDigest remain distinct hash
domains. The retained Intent path is:

```text
bd2_user_authorities_v1/{authorityKey}/session_creation_intents/{attemptKey}
```

### Reviewed repository sources

Paths are relative to this document; code evidence is existing baseline behavior,
not evidence that future D2-F2/D3 requirements are implemented.

- [ADR-050 — Backend Sessions and Check-Time Continuation](<adr/ADR-050 — Backend Sessions and Check-Time Continuation.md>).
- [ADR-049 — Temporal Admission for ISSUE_SESSION](<adr/ADR-049 — Temporal Admission for ISSUE_SESSION.md>).
- [Durable Session Contracts](../prototype/identity/live-broker/DURABLE_SESSIONS_CONTRACT.md) and [Session data validators](../prototype/identity/live-broker/bd2-session-contract.cjs).
- [Durable Session Creation Intent Foundation](../prototype/identity/live-broker/DURABLE_SESSION_CREATION_INTENT.md), [Intent Store](../prototype/identity/live-broker/firestore-session-creation-intent-store.cjs) and [data-only coordinator](../prototype/identity/live-broker/bd2-session-creation-coordinator.cjs).
- [Trusted Session Handoff D1](../prototype/identity/live-broker/TRUSTED_SESSION_HANDOFF.md) and [D1 owner/consume implementation](../prototype/identity/live-broker/bd2-trusted-session-handoff.cjs).
- [Durable Attempt Store](../prototype/identity/live-broker/DURABLE_LOGIN_ATTEMPTS.md), [Attempt adapter](../prototype/identity/live-broker/firestore-attempt-store.cjs) and [Attempt framing/metadata validation](../prototype/identity/live-broker/bd2-attempt-contract.cjs).
- [Durable Dispatch Journal](../prototype/identity/live-broker/DISPATCH_JOURNAL.md), [Journal implementation](../prototype/identity/live-broker/firestore-dispatch-journal.cjs) and [original login-proof verification](../prototype/identity/live-broker/bd2-login-proof.cjs).

### External references and authority limits

Both files were accessible and read on 2026-11-06:

```text
C:\ERP_KUB_AUDIT\2026-11-06\D2-01_to_D2-06-accepted-decisions.md
C:\ERP_KUB_AUDIT\2026-11-06\D2-A-accepted-audit-reference.md
```

The first records accepted D2-01–D2-06 and the isolated D2-F1 boundary. The second
is review evidence/design rationale; its PROPOSED/OPEN recommendations are not
blanket accepted decisions. Historical baselines, test results and then-OPEN
temporal questions remain historical. The architect-approved T-01–T-07 in this
contract supply the current temporal decisions; revised T-06 is the controlling
clock decision for this stage. Earlier source documents are preserved unchanged.
