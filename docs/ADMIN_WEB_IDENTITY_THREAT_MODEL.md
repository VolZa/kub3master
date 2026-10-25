# ADMIN Web Identity — Threat Model (Slices 2A / 2B.1)

Scope: Execute as user deploying, visitor authenticated by a future Google OIDC assertion broker,
two independent ADMIN GAS projects. MASTER/OPERATIONAL remain behind server operations;
REPORTING direct Viewer/copy/export uses separate Drive permissions.

**IMPLEMENTED (CONTRACT)** below means a local validation/provenance rule only. It is not live
Web authentication, persistent atomicity or production authorization. Existing ADMIN shell is
IMPLEMENTED/default-deny with no auth/business RPCs. Existing identity/session/broker flows are
PROTOTYPE; real verifier, stores, network channel and Google login are MISSING / UNVERIFIED.

Assets: visitor identity, ERP permissions, session secrets, signing/channel keys, transactional state,
environment isolation and production books. Trusted server inputs: pinned config, crypto adapter,
authoritative stores, trusted clock/CSPRNG, current UserRepository and PermissionService. Browser
claims and broker bytes remain untrusted until verified. Script editors and the broker are trusted
security operators; compromising either is outside payload-validation guarantees.

The original Slice 2A tests below are in `src/admin/web/identity-contracts/contracts.test.ts`.
Slice 2B.1 adds `atomic-store-contracts.test.ts` and the local-model status table below.

| Threat / attack scenario | Trust boundary | Mitigation and status | Verification test / future evidence | Residual risk |
| --- | --- | --- | --- | --- |
| 1. User substitution: forged subject, deployer identity used as visitor | Browser / Google / broker / GAS | IMPLEMENTED (CONTRACT): exact issuer/subject and private-field evidence; MISSING real Google verifier adapter; never use Session execution identity for visitor | Forged cast/copy/constructor and issuer/subject tests; future two-account signature/nonce proof | Malicious trusted verifier or compromised broker can assert identities |
| 2. Environment substitution through request fields | Browser / server target | IMPLEMENTED: Slice 1 immutable build env; CONTRACT rejects context fields in browser schemas and exact-matches all stages | Cross-context field tests + existing admin-shell tests | Misconfigured trusted targets/keys remain operator risk |
| 3. TEST bearer used in PRODUCTION | Independent GAS projects / stores | CONTRACT requires env + audience + Script ID; MISSING stores with independent namespaces/keys | Grant/evidence/session mismatch tests; future cross-project replay probe | Shared backing store/key without context fencing would break isolation |
| 4. Replayed signed broker assertion | Broker channel / GAS grant ledger | CONTRACT bounds TTL and assertionId/transactionId; PLANNED atomic dual-ID fence before grant creation | Assertion expiry/mismatch tests; future durable replay/concurrent redemption tests | Signature verification can repeat; local evidence construction alone is NOT replay protection |
| 5. Reused login grant | Grant ledger / session creation | CONTRACT rejects CONSUMED state, deterministic per-transaction grantId; MISSING atomic consume + session commit | Sequential reuse test and explicit same-old-state race demonstration | Two stale AVAILABLE readers both get candidate plans; no current CAS |
| 6. Login CSRF: victim browser receives attacker's login | Browser / broker transaction | CONTRACT nonce/proof/context equality; PLANNED proof hashing, exact popup origin/source and cookie/state binding | Nonce/proof mismatch tests; future wrong-browser/wrong-cookie integration | Binding-shaped input is not proof of browser ownership; XSS on login host compromises it |
| 7. OAuth callback replay / duplicate code exchange | Google callback / broker store | PROTOTYPE broker phases and PKCE/state; MISSING durable callback CAS and unknown-outcome handling | Existing live-broker fixture tests; future simultaneous callback/crash tests | Local Map fixtures and requested PKCE parameters do not prove live Google behavior |
| 8. Stolen session credential used until expiry | Browser / authoritative session store | CONTRACT separates raw bearer from record/DTO, absolute expiry/revocation/version checks; PLANNED memory-only UI and secret-safe logs | Browser schema, expired/revoked/version tests; future theft/logout probe | Bearer possession is sufficient until revoked; copies cannot be remotely erased |
| 9. XSS steals bearer or initiates allowed RPCs | Untrusted content / browser JS | Existing shell uses textContent; no new UI; PLANNED strict escaping, minimal scripts/CSP and no unsafe HTML/session persistence | Existing client tests; future hostile data and browser security tests | One-time tickets do not neutralize an active XSS attacker |
| 10. Browser assigns email/role/permission/version | Request / directory / PermissionService | CONTRACT exact request keys and no role snapshot; IMPLEMENTED foundation uses current issuer+subject directory | Extra-field tests, incompatible PermissionService provenance test | A future generic handler or caller-supplied User snapshot would bypass intended boundary |
| 11. Access revoked while session/ticket exists | UserRepository / session store / in-flight request | CONTRACT checks active + current authorizationVersion and REVOKED; MISSING persistent revocation and Google event integration | Session active/version/revocation tests; future multi-worker logout/revoke tests | Checks cannot retroactively undo an operation already started; Drive REPORTING ACL is independent |
| 12. Broker unavailable or returns malformed data | GAS / external broker | CONTRACT absent/throwing verifier outcomes fail closed with fixed errors; MISSING bounded TLS channel, timeouts, authentication and response limits | Signature-port failure/envelope tests; future timeout/redirect/body/network tests | Login unavailable; no owner identity fallback permitted |
| 13. Session store unavailable, quota/eviction/corruption | Handler / authoritative persistent state | CONTRACT unknown/inconsistent records rejected; PLANNED fail-closed durable read/consume, bounded admission; no cache authority | Record/state tests; future store errors/quota/crash tests | Availability and storage capacity not solved by schemas |
| 14. Signing/channel key compromised or wrong key accepted | Secret custody / verifier | CONTRACT pins algorithm/keyId/issuer; MISSING real secret storage/rotation, key separation and revocation response | Algorithm/key/issuer mismatch tests; future rotation/compromise exercise | Validly signed attacker claims are trusted if the signing authority is compromised |
| 15. TEST factory accidentally opens production books | Context / repository composition / deployer authority | Existing shell excludes factories; CONTRACT binds context; MISSING isolated business factories; no resource access here | Existing import-allowlist tests; future instrumented TEST route tests | Deployer with broad production ACL retains underlying authority; contract fields do not constrain arbitrary code |
| 16. Parallel double-use / unknown commit outcome | All state readers / durable store | CONTRACT pure state machine and monotonic terminal transitions; PLANNED CAS/revision, unique keys and atomic grant consumption/session insertion | Illegal/terminal transitions and same-old-state two-plan test; future multi-worker CAS/fault injection | Retrying from stale state or treating a plan as a committed result is unsafe |

## TTL and upstream validity risk

Assertion max 20s, transaction 120s, grant 30s and session 15m are independent maxima.
Session expiry is capped by signature-covered verified upstream authentication expiry (max 1h proof).
The test that redeems a live grant after assertion expiry demonstrates separation, not permission
to accept an expired assertion. See [contract policy](ADMIN_WEB_IDENTITY_CONTRACTS.md#ttl-policies).

## Threats not solved by this slice

- No live OAuth credentials, callback, cookie or browser origin proof. POPUP/iframe policy remains UNVERIFIED.
- No protection against a malicious script editor, compromised trusted adapter or broker host.
- No durable atomicity, persistent logout, audit-log infrastructure, rate limiting or key rotation.
- No automatic Google sign-out/security-event propagation into ERP sessions.
- No business write idempotency or production cross-project writer coordination.
- No ability for ERP permissions to override Google's direct REPORTING ACL or retract exported copies.

## Gate for Slice 2B

Review contracts/TTL, signature protocol and authoritative store semantics first. Implement only
separately approved auth adapters/fixtures; preserve current shell/business/reset holds. Live proof
requires separate permission, isolated accounts/resources and explicit success/failure evidence.
**PRODUCTION — NO-GO. TEST_RESET execution — NO-GO. ADMIN deployment — NO-GO.**

## Slice 2B.1 local evidence update

IMPLEMENTED LOCAL MODEL is deliberately different from implemented production protection. No real
cryptographic verifier, durable DB, broker, session secret issuer, store restore boundary or RPC exists.
Original risk statements requiring real stores/adapters remain applicable despite passing local tests.

| Threat / boundary | IMPLEMENTED LOCAL CONTRACT / MODEL | Verification in atomic-store-contracts.test.ts | Remaining MISSING / UNVERIFIED |
| --- | --- | --- | --- |
| Algorithm/key confusion, substituted broker bytes | Exact RS256 protected header, strict V1 payload, original signing bytes, context-scoped key rules | Algorithms, extensions, exact schema, unknown keys, duplicate escaped JSON keys, invalid UTF-8/base64url | Actual JOSE/RSA/key-strength checks; port authenticity and key custody |
| Forged cryptographic evidence | Structural JWS cannot mint runtime proof; injected trusted verifier and private construction capability required | False/throwing port, casts/JSON/spreads/prototype grafts, constructor forgery | Compromised trusted verifier can still lie; fake signatures in tests prove no cryptography |
| Environment / Script ID / audience substitution | Exact context match in profile, key lookup and every atomic command | Profile/key/store mismatch tests; unknown context fails closed | Authenticated external service identity, isolated DB/IAM namespaces, live cross-project replay |
| Assertion / transaction replay | Atomic model commit reserves both IDs and creates one grant/receipt | Same assertion, same transaction with new assertion, same assertion ID across transactions | Real durable uniqueness/CAS and tombstone retention under process failure |
| Grant replay / concurrent consumers | Authoritative grant state plus one state swap for consume+session+receipt | Simultaneous acceptance/issuance, duplicate same-command delivery | Multi-worker/process tests, durable DB transaction and unknown-commit recovery |
| Partial write / lost response | Snapshot rollback; AFTER_COMMIT returns OUTCOME_UNKNOWN while preserving receipt | Fault after each staged write; receipt recovery; wrong command digest | Real backend crash, network timeout, ambiguous commit and retry semantics |
| Stale time or policy after I/O | Clock read after verifier and before commit; expiry/key/directory rechecks | Verifier delay, commit delay, grant/transaction expiry, key compromise and issuer changes | Real clocks, network latency, policy distribution and operational skew handling |
| Signing-key rotation / compromise | Versioned signing/verification intervals; compromise/revokedAt override status; issued-session provenance checks are separate from new assertion verification | Verify-only overlap, planned window expiry/retirement without session loss, new-key rotation, grant/session compromise tests | Managed secrets, emergency rollout, live rotation; retain historical context-bound policy records through session lifetimes |
| Role change / access revocation | Active issuer+subject/current version at issuance/lookup; CAS session revocation | Version changes before/at commit, inactive user, stale capabilities and revoked session | Real directory/DB are separate services; no cross-store atomic snapshot or cancellation of in-flight business work |
| Forged persisted session | Model-owned private-field capability rechecks current authoritative record | Copies, JSON, cross-model capability, stale/revoked record | Durable restore adapter has no implementation; plain DB JSON must not become proof by cast |
| Bearer theft / response loss | Store receives digest only, never returns raw bearer; receipts do not authenticate | Digest-only record, absence of roles/permissions and raw credential | CSPRNG, digest adapter, browser delivery, XSS protection and orphan-session recovery |
| Resource exhaustion / unsafe cleanup | Explicit capacities, bounded eligible cleanup, no live eviction | Receipt/grant/session/per-user capacity; retention and batch limits | Real quotas, storage costs, indexing, cleanup workers and admission/rate limits |

Browser DTOs remain unchanged and reject trusted fields. Model commands are server-only contracts,
not a new login API. They do not connect to PermissionService or production authorization. Key policy
checks do not perform Google account authentication or propagate Google sign-out events.

Session TTL remains independent of assertion TTL and planned key verification expiry, capped by upstream
authentication proof. Planned retirement blocks new assertions, while existing sessions retain their own
expiry. Compromise/revocation, unknown key/context or changed broker issuer still deny session use.
Key provenance identifies affected grants/sessions; real bulk persistent revocation is not implemented.
Capacity limits are fixture
policy, not approved production settings. Real process loss invalidates all in-memory guarantees.

Next gate: review the profile, key-policy/receipt semantics and local model; then separately authorize
real adapter work and distributed fault tests. Production/readiness targets and ADMIN RPC/build import
allowlists remain unchanged. No OAuth/broker/Firestore setup or deployment is performed.
