# TEST_RESET v1.3 — TEST Runtime Resolver

Local implementation only. Real TEST_RESET / TEST_ACTIVATE / TEST Web deployment: **NO-GO**.
No Google calls, copies, property mutations, push or deployment were performed during this slice.

## Isolation choice and actual configuration

Production SpreadsheetConfig and existing factory compositions remain unchanged. The shared cache implementation is extracted into ScopedSpreadsheetRegistry; SpreadsheetRegistry retains its production constructor/default provider and singleton. TEST imports only the scoped implementation, never the production provider or singleton. Business calculation algorithms are not duplicated.

The v1.2 JSON is `{version:1, environment:'TEST', scriptId, folderId, active:Generation|null, previous:Generation|null, pending?:PendingGeneration|null}`. A committed Generation contains `id, createdAt, files[MASTER|OPERATIONAL|REPORTING]:{id,sourceId,sheets}, evidence`. Resolver reuses readTestConfiguration; it does not assume an additional `active.files` wrapper or invent an activation-state field. `active` is the canonical committed/activated slot defined by the existing v1 contract. Pending review/ready states never substitute for active. A valid pending alongside active leaves access on active only.

Activation provenance is not cryptographically established by JSON alone. ScriptProperties and installation enrollment are trusted administrative storage. No one should manually fabricate active. TEST_RESET v1.4 now revalidates evidence, commits active atomically under ScriptLock and retains one previous generation for rollback; see TEST_RESET_V14_ACTIVATE_ROLLBACK.md. The legacy reset core remains excluded from the runtime build.

Resolver checks a freshly verified/branded identity against PermissionService in TEST mode and USER_MANAGE on every resolution, including cache hits. ADMIN only; MANAGER, legacy roles, missing/revoked users and forged identities fail closed. Production identity/authorization is not changed. It validates TEST marker version/environment/exact executing Script ID, rejects the production Script ID, validates the whole configuration and active generation, all three source provenance IDs, expected sheet lists, distinct copy IDs and collisions against **every** production source ID. Missing or malformed config never uses SpreadsheetConfig as a fallback. Production IDs are retained only as a denylist/provenance contract.

The token includes Script ID, folder and complete active generation (including IDs/evidence), so changing generation OR targets invalidates the cache. get and has validate before any cache lookup. Validation failures clear the cache. TEST runtime also clears on operation failures and revalidates after opening and reading. No mutable book/sheet/range handle escapes its facade, avoiding retained handles that could write after generation changes. This is not an atomic read across external edits or an activation lock protocol.

## Available integration boundary

`createTestRuntime(trustedServerPorts, spreadsheetAdapter)` exposes only `readValues(role,sheetName)` and a fail-closed `write()` blocker. It returns raw values, not formatted display values. No arbitrary file ID, URL, active spreadsheet, Drive capability or fallback is accepted. Runtime does not write ScriptProperties.

Dependencies must be installed by trusted server composition, never browser arguments. There is deliberately no production/user identity fallback and no ready-to-run Web entrypoint. A future TEST Web composition must obtain verified visitor identity from the approved authentication/session boundary and an explicit TEST UserRepository, not ScriptApp owner credentials. The test fixtures are not bundled.

Build: `npm run build:test-runtime` → `build/test-runtime/Runtime.gs`, an isolated library IIFE, no manifest or deploy target. No doGet, RPC, menu, trigger or administrative wrapper is added. The Rollup exact module allowlist fails the build on any unreviewed transitive import, including production factories, reporting stores, standard provider and admin copy workflows. This is the enforced TEST block, not an assertion that existing production modules have become safe to run in TEST. Do not paste production bundle into a TEST project. TEST-admin remains a separate editor-only build with intentionally different source-inspection/copy capabilities.

## Audited routes and unresolved isolation

Full file/line search evidence: TEST_RUNTIME_V13_ACCESS_INVENTORY.md. Search results include comments; inactive commented services are not runtime paths.

| Route | Existing access | TEST v1.3 decision |
|---|---|---|
| Config/provider/registry/SheetProvider | Static production IDs, default constructors, global singleton | Only scoped cache reused. Production provider and SheetProvider excluded from TEST runtime graph |
| Manufacturing, buffer/sync, Placement, catalog, House/ProjectDocument factories | infrastructure.factory → SheetProvider → Registry; GoogleSheetsReader/Writer | Factories and writers excluded; no manufacturing/placement operation enabled |
| Shift Planning and plan-item factories/data sources | Same global composition | Excluded; cannot silently use production singleton |
| BOM/Elements repositories, utils/id, Safe Commit context/journal/writer | new SpreadsheetProvider(MASTER), flush | Excluded; BOM writes remain blocked |
| Material report use case/factories and matrix writer | Mixed provider paths and direct reporting adapters | Not wired into TEST; calculation reuse awaits explicit injected composition |
| CurrentReportWriter, gas-saved-report-store, archive-management-store | Direct REPORTING_ID, cached book, copy/rename/delete/index | Excluded; Generate/Save/Rename/Delete not enabled in TEST |
| main/openForm/manufacturing UI/productionJournal/utils/sheets | getActive/getUi, toast, direct active-sheet access | Excluded; createManufacturingFromWeb and onEdit holds unchanged |
| material-report-control entrypoints, migrations, legacy/manual tests | Direct config/source/table access | Excluded |
| TEST admin preflight/prepare/review and gasTestDrive | Intentional source inspection and copy ports | Separate admin-only graph; never imported by runtime |

Thus no existing business write route is claimed isolated or enabled. All above routes need per-operation server composition and tests before admission. ReadValues is a bounded API surface, not a bounded-memory large-sheet reader: getDataRange may still allocate a large values array. Future runtime needs range/resource limits. Formula/script/trigger/external-dependency review belongs to prepare/review/activation; this resolver does not infer safety from opening a file and does not continuously re-audit copies after activation.

## Offline checks and next gates

Unit tests cover active targets, absent/malformed config, pending-only and ready-only candidates, active plus ready candidate, ID collisions, marker/script mismatches, evidence absence, role revocation/legacy/forged identity, generation/cache invalidation, failed-validation recovery, wrong opened ID, mid-read state change, unknown routes and blocked writes. Mock adapters only.

Run `node node_modules/typescript/bin/tsc --noEmit --incremental false`, Vitest using Node 22, `npm run build`, `npm run build:test-admin`, `npm run build:test-runtime`.

Remaining gates: live trusted ADMIN enrollment/authentication; copy/dependency evidence including UNKNOWN scripts/triggers; separate TEST Web composition and manifest/target; factory/provider injection and safe generation-pinned mutation protocol; all business write route isolation tests. There is no permission to perform a real RESET or publish a TEST web form.

### Recorded local results — 2026-10-23

- Vitest on Node 22: **964/964 PASS**, 51 files; runtime-specific tests: 23.
- TypeScript noEmit, incremental false: PASS.
- Production Rollup/build: PASS; TEST-admin Rollup: PASS; TEST-runtime Rollup: PASS.
- Built runtime evaluated in empty Node VM: PASS, no load-time service access; exactly one library namespace with createTestRuntime export, unconfigured identity returns ACCESS_DENIED before opening Sheets. Static generated-code check found no ambient SpreadsheetApp/DriveApp, mutation APIs, doGet/doPost/onEdit or makeCopy.
- Protected production configuration/source hashes (.clasp.json, rollup.config.mjs, appsscript.json, src/index.ts, gas-production-entrypoints.json) match the pre-slice baseline.
- Changed by v1.3: package.json (build:test-runtime script only), SpreadsheetRegistry.ts (compatible wrapper), new ScopedSpreadsheetRegistry.ts, admin/test-runtime/{resolver,runtime,runtime.test}.ts, rollup.test-runtime.config.mjs, this document and TEST_RUNTIME_V13_ACCESS_INVENTORY.md. Generated local build outputs were refreshed; earlier uncommitted work was retained.
