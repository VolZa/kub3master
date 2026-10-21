# AC-002A — local security foundation and isolated identity POC

Role refinement: full-privilege ERP_OWNER replaces the initial TECHNOLOGIST concept. TECHNOLOGIST is
reserved with no current grants; see AC_002B_ROLE_MATRIX.md. No real user assignment was migrated.

## Outcome

GO for local foundation review / AC-002B planning. NO-GO for production security enablement,
B4.2 publication or a multiuser readiness claim. v32, Google accounts, OAuth, Cloud and all Sheets unchanged.
Existing Generate/Save/Manufacturing handlers are NOT yet fully wrapped by PermissionService.
This stage supplies/test-drives the boundary and narrows the LOCAL built surface, not the live v32 surface.

## Foundation

src/security/permission-service.ts defines UserIdentity, User, Role, Permission, UserRepository,
IdentityVerifier, PermissionService, SecurityBoundary and securedHandler. Missing/forged/expired identity,
unknown/inactive user or missing permission fails ACCESS_DENIED before business callback. Identity objects
have server-runtime provenance (WeakSet) and cannot be obtained by JSON-deserializing browser fields.
Only a trusted verifier adapter may call verifiedIdentity; this function is never registered publicly.
Repository is re-read on every authorization so disabling a user/removing a role takes effect without
waiting for token expiry. authorizationVersion is reserved for session/cache invalidation in AC-002B.

Both ERP_OWNER and WORKSHOP_MANAGER get REPORT_GENERATE/VIEW/SAVE/LIST/RENAME/DELETE.
Only ERP_OWNER gets BOM_EDIT/TECHNOLOGY_EDIT/USER_MANAGE. No permissions are invented for
Manufacturing/Planning: current calls createManufacturingFromWeb, house/product/placement lookups,
buffer ingestion, placement/sync state rebuild and edit-event row insertion require a separate matrix.
The Plan tab remains a placeholder. Direct File/Sheet access is separate from application roles.

## Identity POC architecture

prototype/identity/IdentityProbe.html is an isolated HtmlService-oriented harness, outside html and dist.
It loads official GIS, requires explicit client/origin configuration and a manual start, generates a random
browser binding, obtains a server nonce and sends ID token to isolated probe adapters. It never prints or
stores tokens. No probe endpoint is registered in production and no login executes at file/module load.

src/security/identity-prototype.ts implements the challenge/nonce/binding/expiry checks and atomic
single-use challenge-consume contract. Real GAS store must consume under lock; a future external store
must use a transaction. The prototype returns an opaque verified identity, not a production bearer session.

prototype/identity/google-token-verifier.cjs is EXTERNAL Node-only code, not GAS code. It performs actual
RS256 verification against independently supplied trusted public keys, exact issuer/audience, exp, sub,
iat and nonce presence. Rejects alg confusion/none, unknown kid, attacker keys and token-provided key URLs.
Offline tests generate RSA fixtures; passing them proves cryptographic/claim logic with those fixtures,
NOT successful login of actual Google accounts. Node crypto is never included in the GAS module graph.

## Explicit feasibility blockers / evidence limits

| Check | Result |
| --- | --- |
| Two different identities and RSA signature/claims | PASS offline fixtures, distinct simulated subjects |
| Real login with two Google accounts / real Google ID token | NOT RUN: no approved OAuth client |
| Google signing-key discovery, rotation/cache/outage behavior | Port only; production adapter not configured |
| Nonce substitution, binding, expiry and replay | PASS offline with atomic test store |
| HtmlService sandbox, actual googleusercontent origin and current /exec | NOT VERIFIED live |
| Revoked user/roles, unknown identity, direct handler bypass | PASS offline |
| Production session creation/revocation/CSRF transport | AC-002B scope; not claimed implemented |

No fallback to effective user, temporary user key, browser email/role, base64-decoded JWT claims or a
tokeninfo-only production design exists. Session.getActiveUser email is not assumed available in owner mode.
No attempt was made to bypass browser automation restrictions or create OAuth/Cloud resources.

## Minimal external verifier proposal — separate approval required

Use an approved HTTPS verification service (for example Node on Cloud Run) with a maintained Google
authentication library, pinned OAuth audience and trusted Google JWKS/certificate discovery/rotation.
The local CJS verifier is an offline POC, not a finished production Google-key adapter. Authenticate GAS
to verifier, reject caller-selected verifier URLs/audiences, protect keys/secrets, never log credentials.
For GIS configure OAuth consent/client and exact authorized JS origin/redirect based on an observed live
HtmlService probe. Parent /exec origin must not simply be assumed equal to the sandbox iframe origin.
If the actual iframe cannot satisfy GIS origin requirements, stop and seek approval for a stable-origin
login/callback design; do not wildcard googleusercontent origins or skip origin/nonce checks.

Costs: request-based Cloud Run may fit a free allowance at small volume, but no zero-cost guarantee.
Billing/account/region, compute, egress, image registry, logs and secret storage must be estimated after
traffic and deployment choices are approved. No resources were created and no dependencies installed.

References checked 2026-10-21:
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/reference/js-reference
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/apps-script/reference/base/session
- https://cloud.google.com/run/pricing

## Production surface

docs/AC_002A_V32_WRAPPER_INVENTORY.json records ALL 74 immutable-v32 wrappers from saved API evidence:
12 production public, 5 production internal, 4 administrative, 52 test, 1 migration.
Local registry now has 20 explicit names: v32's retained 17 plus 3 B4.2 handlers (still default-denied).
gas-production-entrypoints.json is an exact build allowlist; Rollup fails registration drift. Dangerous
test/migration/admin imports and register entries are removed from index.ts, not deleted from source.
Audit/rebuild menu actions are removed from local production menu instead of leaving dangling names.

Key isolated risks: manufacturingInitialMigration(false), testManufacturingRepositorySave,
testGenerateProjectMaterialMatrixReport (matrix clear/write), synchronization Execute/Cancel/Move/Detach
tests, buffer-creation tests, KUB_B2_firstControlledReportWrite, rebuildManufacturingState and diagnostics.
Tests parse actual Rollup output, compare exact wrappers, inspect VM globals AND __kubGasHandlers_,
and ensure excluded functions are unavailable through another registered property. onEdit/onOpen remain
production internal triggers, not authorizations; trusted event validation/transport guards are AC-002B.
No generic dispatch/test launcher or client-selected function-name endpoint is added.

## AC-002B integration gates

1. Approve and prove actual two-account GIS flow/origins and Google signature verification.
2. Implement protected UserRepository/bootstrap role assignment, secure short-lived session transport,
   challenge store, session expiry/logout, revocation/version handling, login CSRF/replay protections.
3. Wrap every business RPC handler before reads/writes; use REPORT_* plus approved BOM/technology rules.
   Do not enable B4.2's unconfigured policy until it delegates to this verified identity/PermissionService.
4. Approve Manufacturing/Planning and admin operation matrix separately. Distinguish genuine triggers
   from browser RPC entrypoints; neither a name nor a client-supplied event object grants privilege.
5. Review actual file sharing: workshop user must not gain MASTER/REPORTING edit access to compensate
   for authentication gaps. Direct report links need a separately reviewed view permission strategy.
6. Test wrong audience/issuer/signature, expired/replayed tokens, unavailable verifier, unknown/disabled
   user, both roles, revoked role, direct RPC bypass and all data-side-effect assertions.
7. Re-run B1-B4.2 regression suite, then separately authorize deployment and bounded live smoke.

Do not publish this local bundle merely because tests pass: reduced surface != completed authentication.
