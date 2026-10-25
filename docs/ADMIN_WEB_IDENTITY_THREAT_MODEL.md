# ADMIN Web Identity — Threat Model (Slice 2A)

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

All referenced tests are in `src/admin/web/identity-contracts/contracts.test.ts`, unless stated otherwise.

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
