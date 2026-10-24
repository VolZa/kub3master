> Historical stage snapshot: role names below predate the ADMIN / MANAGER migration. Current rules: [role matrix](AC_002B_ROLE_MATRIX.md). Original stage results are unchanged.

# AC-002B.1 — local server permission integration

## State

Production IdentityProvider.current() returns undefined, protected UserRepository returns no user.
No provider setter, Session fallback, effective/Drive-owner shortcut, browser email/role or test fixture
exists in production composition. All local production wrappers now default-deny, including doGet.
Therefore this bundle must NOT be pushed/deployed over working v32 before real identity integration.

## Exact wrapper matrix (20)

| Wrapper | Permission / hold |
| --- | --- |
| doGet | REPORT_VIEW (entire shell denied until identity exists) |
| onOpen | BOM_EDIT (menu currently provides specification import) |
| onEdit | HOLD — operational event identity/matrix not approved |
| openForm | BOM_EDIT |
| openFormTable | BOM_EDIT |
| includeBOMCommitClient_ | BOM_EDIT; still underscore-private to browser RPC |
| submitBOM | BOM_EDIT |
| resumeBOM | BOM_EDIT |
| runTableParser | BOM_EDIT via guarded submitBOM |
| buildBOMFromText | BOM_EDIT |
| createManufacturingFromWeb | HOLD — no new operational grant to any role |
| getManufacturingHouseOptions | REPORT_VIEW — shared read dependency of report UI |
| getManufacturingProductOptions | REPORT_VIEW — shared report dropdown, not production write |
| getManufacturingPlacementOptions | REPORT_VIEW — read-only placement choices, not write authority |
| generateMaterialConsumptionReportWeb | REPORT_GENERATE |
| getCurrentMaterialReportWeb | REPORT_VIEW |
| saveMaterialConsumptionReportWeb | REPORT_SAVE |
| listSavedMaterialReportsWeb | REPORT_LIST |
| renameSavedMaterialReportWeb | REPORT_RENAME |
| deleteSavedMaterialReportWeb | REPORT_DELETE |

ERP_OWNER gets all existing permissions, not unapproved HOLD operations. WORKSHOP_MANAGER gets all
REPORT permissions and no BOM_EDIT. TECHNOLOGIST is reserved and has no grants. Operational rights
remain a responsibility approved in principle, requiring the separate matrix below; no new Permission
strings were silently added. onOpen is not a way to grant ownership or authorize another user.

## Enforcement and paths

core/register stores authorizeHandlers wrappers, never raw functions. Both global Rollup wrapper and
__kubGasHandlers_ dispatch therefore check the same permission before arguments reach any handler.
Raw exports additionally guard at entry, so direct module calls and aliases cannot bypass authorization.
runTableParser delegates only to guarded submitBOM; buildBOMFromText and resume check independently.
The old MASTER editor/file-owner BOM policy was replaced by BOM_EDIT, not used to infer ERP_OWNER.
Inner archive management policy now delegates to the same REPORT permissions; the former independent
unconfigured role gate no longer conflicts with a verified user. Non-public services remain reusable
internally; their caller must be a checked server boundary, not a new generic dispatcher.

Authorization errors occur before validation, repository/factory creation or business data reads/writes.
They are thrown ACCESS_DENIED (google.script.run FailureHandler), not a fabricated OK/EMPTY result.
Current UI handles failures safely but displays generic transport/uncertain-result messages; AC identity/UI
integration must distinguish authorization failure from an uncertain mutation without introducing retries.
Repeated boundary checks are deliberate defense-in-depth and re-read user state; no ambient permission cache.

## Proposed operational matrix — NOT ENABLED

| Actual operation | Proposed scope for separate approval |
| --- | --- |
| Manufacturing fact creation | ERP_OWNER and WORKSHOP_MANAGER; specific production-create permission |
| Buffer intake | Same roles only if accepted; validation/idempotency and mutation scope reviewed |
| Automatic Placement synchronization after creation | Internal capability of approved creation, not a public admin bypass |
| Full rebuild/cancel/move/detach/batch synchronization | Separate operational/admin grants and confirmation; no automatic broad grant |
| onEdit row insertion in production/krabs | Trusted event provenance plus reviewed internal execution path, not a forged RPC event |
| Planning | Tab remains placeholder; no operations or permissions invented |

Admin/test/migration wrappers stay excluded. Adding new wrappers requires exact allowlist and permission
matrix updates, with default denial for missing mappings. Trigger execution requires a separately designed
trusted system/event identity; do not synthesize an ERP_OWNER to preserve old trigger behavior.

## Tests and real identity plan

Production module has no test imports. Tests inject IdentityProvider/UserRepository only through isolated
HandlerAuthorization/authorizeHandlers instances or Vitest module mocks; no global production override.
Actual Rollup bundle is executed in VM: every global and registry handler denies forged inputs before
Google side effects; test users, offline client IDs, verifier Node crypto and internal factories are absent
as public entrypoints. Existing business regressions run with explicit isolated authorization fixtures.

Next step: approve OAuth client/origin and verifier resources, prove two-account Google login in the actual
HtmlService frame, verify signature/issuer/audience/expiry/sub/nonce, implement atomic challenge consume,
revocable server session and protected UserRepository. IdentityProvider must resolve that server context,
not browser claims or Session.getEffectiveUser. Login bootstrap must be a separately reviewed minimal
public auth surface (current doGet is denied); no all-access exception may be added to load business data.
Then approve operational matrix, integrate proper ACCESS_DENIED UI, test revoked users/direct RPCs,
and separately authorize deployment and bounded smoke. Existing schema/archives/calculation untouched.

Verdict: GO for offline review and identity-integration preparation; NO-GO for deployment/B4.2 enablement.
No live Google calls, user modification, push, deployment or Git commit/push in this stage. v32 unchanged.
