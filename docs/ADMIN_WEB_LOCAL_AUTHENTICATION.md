# ADMIN Web Identity — Local Authentication Composition (Slice 2B.2)

Status: LOCAL APPLICATION SERVICES AND SYNTHETIC TESTS ONLY. Baseline feature/bom-logic,
HEAD 142addb, clean working tree before changes. No GAS entrypoint, RPC, deployment, Google login,
broker transport, Firestore, OAuth setup, persistent session adapter or real cryptographic verifier.
PRODUCTION, TEST_RESET execution and ADMIN deployment remain NO-GO.

## Components and responsibility boundaries

All new TypeScript modules are in `src/admin/web/authentication/`:

| Module | Responsibility |
| --- | --- |
| ports.ts | Server-only dependency contracts and minimal browser result shapes |
| trust-boundaries.ts | Pinned application context, explicit monotonic clock, current directory projection |
| trusted-verification.ts | Existing Compact JWS profile and trusted signature port; no crypto implementation |
| login-orchestrator.ts | Login sequencing and receipt recovery, no spent-token registry |
| session-resolver.ts | Digest lookup, authoritative capability read and live session/user/key validation |
| authorization-adapter.ts | Runtime-resolved session to existing PermissionService identity/permission boundary |
| composition.ts | Unregistered local composition; no default verifier or adapter fallback |
| authentication.test.ts | Synthetic verifier/clock/secrets and reference-model adapters, test-only |

Existing Slice 2A/2B.1 modules, PermissionService, security prototypes, production authorization,
ADMIN entrypoints/RPC allowlist, Rollup targets, repositories and TEST_RESET are unchanged.
No imports connect this module to running GAS entrypoints or bundles.

## Minimal compatibility ports

Slice 2B.1 AtomicLoginStorePort already defines acceptance, redemption and operation lookup, but
does not define transaction creation/read. SessionStorePort returns a TrustedStoredSession type,
but its runtime capability reader is model-specific. Two narrowly scoped local interfaces fill those gaps:

- LoginTransactionPort.create/read: unique pending transaction creation and authoritative revision snapshot.
- TrustedSessionReaderPort.read: verify store ownership/provenance and current record before returning
  StoredSession. JSON parsing or a TypeScript cast is explicitly NOT a valid implementation.

No existing interface or reference-model implementation was changed. Tests adapt create/read to
fixture transaction snapshots plus model.seedTransaction, and capability reads to model.readTrustedSession.
These test adapters are defined ONLY in the test file. They are not persistent stores. Fixture read
snapshots can be stale; the original atomic reference model still fences all actual one-time admission.

All context, current runtime context, verifier, source, stores, users, key policy, clock, digest and secret
generation ports come from trusted server composition. Browser payloads never select them. A future
currentContext adapter must validate the actual target/Script ID, not echo browser input or constants
without checking the running installation. No Script Properties or GAS APIs are accessed here.

## Login flow

1. startLogin accepts ONLY the existing browserLoginBegin shape: browserProofBinding.
2. Validate exact environment/audience/Script ID and trusted clock. Generate independent transaction ID
   and nonce via injected secret port; no entropy implementation or fallback exists.
3. Prepare the existing CREATED -> BOUND -> VERIFYING candidate transitions and uniquely store the
   pending VERIFYING transaction at revision 0. These preparation states merely record the offered
   proof commitment and wait for verification; they do NOT prove browser ownership or Google login.
4. completeLogin accepts ONLY transactionId/browserProof. Read the authoritative transaction, check
   context, expiry, waiting state, and the trusted digest of the browser proof against its binding.
5. Receive untrusted broker bytes through the source port. The browser does not supply decoded
   identity, assertions, policy, roles, permissions, timestamps, revisions or trusted state in its request.
6. TrustedVerificationPort uses the existing signed profile and signature adapter. Verify runtime
   evidence again at the application boundary: context, fresh key policy/time, transaction ID, nonce,
   proof binding and issuance time must match. A structurally valid JWS or copied evidence cannot pass.
7. Read current active directory user by canonical issuer + subject; validate roles and version.
8. Build a server command using fresh operation ID, canonical command digest, authoritative transaction
   revision and trusted decision time. Call acceptAssertionAndCreateGrant ONCE.
9. Read the current directory again. Generate the session bearer through the trusted secret port and
   pass ONLY its digest to consumeGrantAndCreateSession. The newly created grant starts at revision 0,
   matching the existing reference contract. No independent consumption logic is added.
10. Confirm the committed receipt, resolve the resulting credential through the authoritative session
    boundary, and ensure grant/issuer/subject match the accepted login before returning the credential.

Context and clock are checked around awaited boundaries. Credential equals a public transaction ID,
nonce, operation ID or its own purported digest is rejected. These format/equality checks do not prove
CSPRNG entropy or SHA-256; future real adapters must implement those properties.

Public local results are STARTED (transactionId/expiry), AUTHENTICATED (credential/expiry), or BLOCKED
with a fixed code. No identity, roles, email, raw broker bytes, headers or exceptions are returned/logged.
No implicit REPORT_VIEW requirement is introduced for login: actual permissions are checked separately.

## Atomic outcomes and recovery

COMMITTED is checked against the exact operation context/ID/digest/kind/object/revision/decision time.
REPLAY, EXPIRED, CONFLICT, CONTEXT_MISMATCH, UNAVAILABLE, INVALID and CAPACITY_EXCEEDED block.
OUTCOME_UNKNOWN triggers exactly one getOperationOutcome lookup using the original operation ID/digest
and a fresh trusted query time. A thrown mutation response is also treated as potentially committed.
The orchestrator NEVER retries a mutation, resets a grant or assumes that missing/unavailable receipts
mean rollback. Unconfirmed outcomes remain BLOCKED/OUTCOME_UNKNOWN. A confirmed receipt allows
continuation of the SAME in-flight application call, not another successful consumer.

An assertion can expire after committed acceptance; the independent grant TTL then governs redemption.
ERP session expiry remains min(redemption time + 15 minutes, upstream authentication expiry), not
assertion TTL or planned signing-key verification expiry. Planned key retirement preserves issued
sessions; compromise/revocation/missing provenance still deny. The atomic model owns those rules.

A receipt alone cannot release a credential: final session lookup must return a capability accepted by
the trusted store reader. If issuance committed but recovery cannot confirm it, no bearer is returned;
an orphan session may remain until expiry. If the browser loses a successfully delivered response,
digest-only storage cannot reconstruct the bearer. New login and separately approved orphan cleanup
remain the policy; no raw credential cache or second session from a spent grant is introduced.

## Session resolution and authorization

Opaque bearer -> trusted digest port -> SessionStorePort.readSession -> trusted store capability
reader -> exact record/context/expiry/provenance validation -> current UserRepository -> PermissionService.

SessionResolver retains only a digest in its own private-field runtime capability. Copies, JSON,
prototype grafts and capabilities from another resolver fail. Every read re-fetches current authoritative
session state and checks active/version, own expiry, upstream expiry and signing-key provenance. It
does not reverify an old broker assertion or shorten the ERP session to assertion/key verification TTL.

SessionAuthorizationAdapter requires resolver-owned evidence, then explicitly matches its own context
to the resolved session. Only after that boundary does it call existing verifiedIdentity() to obtain
PermissionService's WeakSet-branded UserIdentity. This is an actual trusted adapter call, not a cast.
Its UserRepository wrapper re-reads current user/version and existing PermissionService checks current
roles/permission using the explicit environment and clock. A final resolver read checks revocation/key
policy after the permission lookup. authorize returns only AUTHORIZED or DENIED.

PRODUCTION and TEST contexts cannot be combined by mixing resolver and authorization adapter instances.
No browser-controlled permission dispatch or new role exists. Permission is a SERVER-selected method
argument in this unregistered application API, not a browser RPC field. Existing MANAGER/ADMIN rules
remain unchanged. Google Drive access to REPORTING is independent and untouched.

## Provenance and unconfigured behavior

VerifiedBrokerAssertion -> profile runtime evidence -> atomic grant acceptance stays within the
existing Slice 2B.1 boundaries. Grant identity comes from the store's accepted evidence. Sessions are
not reconstructed from assertion JSON. The reader must authenticate authoritative store capabilities;
the new resolver does not add a generic JSON rehydration factory or expose PermissionService branding
to browser requests. Readonly types and structural validators alone never establish trust.

composeLocalAuthentication() without ports/verifier returns NOT_CONFIGURED and DENIED. Login and
authorization both require assertConfigured(), which denies when the signature adapter is absent.
This checks trusted configuration, not live broker health: a configured verifier outage blocks new
login, while an independently valid existing session may continue. The verification service without
a signature adapter denies; there is no synthetic/default verifier in runtime modules
and no fallback to Session execution identity. Synthetic signatures, deterministic secrets and the
in-memory reference model exist only in authentication.test.ts. Real adapter authenticity is a trusted
composition responsibility; an interface or a caller-supplied "real verifier" flag cannot prove it.

### Acceptance finding: trusted adapter injection is an explicit assumption

Browser payloads, JSON copies and casts cannot mint the private-field evidence used by the configured
reference reader/resolver. That guarantee does NOT extend to an arbitrary replacement server adapter.
TrustedSessionReaderPort.read is an injected function: a lying reader paired with a lying session store
can return a schema-valid invented session, after which the resolver creates local evidence and the
authorization adapter calls verifiedIdentity(). The current contracts cannot distinguish that lie from
an authoritative read. Similarly, assertConfigured() proves adapter presence, not cryptography, and a
malicious signature adapter can claim a bogus signature is valid. PermissionService still checks the
current directory and requested permission, but the impersonated subject could be an active ADMIN.

The test named "documents the trusted-DI limit" deliberately demonstrates AUTHORIZED with malicious
SERVER port injection and zero real model sessions. It is a limitation specification, not a rejection
test or a browser exploit. No such adapter exists in runtime code. Do not interpret the positive local
provenance tests as protection against a compromised adapter, script editor or composition root.

Before runtime integration, require a closed reviewed composition root with fixed adapter registration,
store/reader pairing and exact context binding; never let browser/config payloads select implementations.
The real reader must authenticate the backing service and enforce authoritative ownership/revocation
before a module-private capability mint/restore boundary. Real verifiers need pinned keys/algorithms,
authenticated transport where applicable, and independent adversarial/integration tests. A claimed
"trusted" flag or another TypeScript cast is insufficient. Such adapter/factory hardening is future work;
this acceptance review changes no Slice 2A/2B.1 interface, prototype or production component. Even that
hardening cannot protect against an actor who can replace the trusted server code itself.

## Limitations and next approval gates

- No real Google authentication, persistent atomicity, distributed stores, broker channel or login UI.
- No live durable capability restoration; the new port identifies the required boundary, not its implementation.
- No broker cookie/state/PKCE/browser origin handshake; matching proof digests alone is not a complete login-CSRF defense.
- Reference-model decision times are deterministic. Real clock/latency and authoritative decision-time semantics
  must be reviewed with the actual store adapter; no browser time/skew is accepted.
- User directory, key policy and session DB have no cross-service transaction. Rechecks narrow races but
  do not atomically cancel business operations already in flight or prove distributed snapshot isolation.
- No persisted operation recovery across process/browser loss, rate limiting, production capacity limits,
  bearer rotation, bulk key-provenance revocation or orphan cleanup implementation.
- No production composition config is created. All deployment/security gates and resetAllowed:false in
  existing ADMIN shell/readiness remain unchanged.

Next slice needs separate approval for real verifier/store/channel/capability adapters, CSPRNG/digest
and clock sources, transaction preparation persistence and recovery UX. Live integration requires
isolated resources and independent-worker fault tests. Deployment and Google resources are outside
this implementation; the separately authorized acceptance checkpoint is local Git only.

## Original implementation verification results

- TypeScript --noEmit: PASS.
- Identity/application suite: 3 files / 273 tests PASS (221 existing + 52 new).
- Full Vitest: 64 files / 1695 tests PASS using local Node 22.16.0.
- ADMIN target checker: both targets PASS / NOT_CONFIGURED; globals doGet/getAdminBootstrap only;
  deploymentAllowed:false, resetAllowed:false.
- git diff --check and new-file trailing-whitespace scan: PASS.
- All 831 baseline files byte-identical; only the nine new files listed in this document added.
- Production/readiness Code.gs generated in memory matches baseline SHA-256:

```text
production 88eb2e583ca8dec204d7f525dccb515bb4a72df06a3de0cb51f7084d99e2e54d
readiness  eb01e23a2d83da6839eea1b3aabcb5dd1bdec6cd9dedf8ac42764b1e3a922dc7
```

The original implementation used no staging, commit, push/deployment, Google resources, OAuth
configuration or TEST_RESET. Acceptance verification and the authorized local checkpoint are separate.

## Acceptance review and local checkpoint

Reviewed from feature/bom-logic / HEAD 142addb with exactly nine untracked Slice 2B.2 files and empty
staging. Login sequencing, context/binding checks, atomic replay/unknown-outcome handling, current
PermissionService authorization and independent session lifetime passed the local acceptance criteria.
No runtime logic correction was required. The explicit malicious-adapter trust assumption above is
an acceptance finding, not a guarantee solved by the current contracts. Its test intentionally records
the limit. An additional test confirms read-only receipt lookup with no repeated mutation.

Repeated validation after those additions: TypeScript --noEmit PASS; identity/application suite
3 files / 275 tests PASS (221 pre-existing + 54 Slice 2B.2); full Vitest 64 files / 1697 tests PASS;
ADMIN checker both targets PASS / NOT_CONFIGURED with only doGet/getAdminBootstrap and
resetAllowed:false. Production/readiness in-memory Code.gs SHA-256 matches the baseline above.
All baseline production/services/prototypes/targets remain unchanged. The local checkpoint includes
only the nine approved files; staged diff check must pass before commit. No remote push/deployment,
Google resources, OAuth/broker/Firestore setup, TEST_RESET or next-slice implementation is authorized.
