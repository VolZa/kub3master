# Stage B4.2 — local archive management; publication NO-GO pending Access Control

## Audit

No live ReportIndex read performed: this task forbids live mutations and uses local contracts/mocks.
The B4.1 implementation validates the existing exact 14-column ReportIndex schema, with no new columns.
Save has a durable source-keyed PENDING/COMPLETE journal, monotonic ScriptProperty counter and copied
archive fingerprint. CurrentReportWriter deletes only a current-operation exact-ID predecessor ticket;
it cannot sweep MC archives. Generate/Save use getScriptLock.

Two compatibility changes are necessary: B4.1 confirm incorrectly coupled ReportID to SheetName;
and its COMPLETE Save journal would return the old name after Rename or a deleted archive after Delete.
ReportID now remains MC_<immutable sequence>, while SheetName is independent. Rename updates journal
and index name; Delete retains DELETED source tombstone. Repeat Save cannot silently recreate a deleted
archive. The sequence is never decremented/reset by management. Existing 14-column rows remain compatible.

## Contracts

listSavedMaterialReportsWeb() → OK with reports, or ERROR.
Each list row contains reportId, sheetId, sheetName, sourceSheetId, savedAt, houseCode/productCode,
dateFrom/dateTo, method, state and (only for ACTIVE verified archives) exact-sheet URL.
Missing physical sheets, identity/hash/journal/index mismatches or PENDING operations yield DIAGNOSTIC,
not omission. PENDING operations whose index row disappeared are also listed as recovery diagnostics.

renameSavedMaterialReportWeb({reportId, sheetId, newName}) → OK preserving reportId/sheetId and URL.
deleteSavedMaterialReportWeb({reportId, sheetId}) → OK only after sheet/index absence and journal tombstone
are confirmed. Extra request fields, including client roles, are rejected. No generic sheet mutation handler.

Service SavedReportsManagement depends on ArchiveManagementStore and ArchivePolicy. GAS adapter extends
the existing archive store to reuse exact REPORTING access, schema, snapshot/fingerprint and Save journal.
Only registered exact identities with COMPLETE Save provenance can be changed. Current/system sheets,
unknown archives, ID mismatches, duplicates and crash remnants fail closed. Blank/oversized/invalid titles,
protected names, staging prefixes and title collisions are rejected. Content is not changed on Rename.
Source sequence and generated metadata are untouched by management.

## Recovery

Technical state is in namespaced ScriptProperties, not additional index columns. Under the shared lock:
write operation PENDING → mark source Save journal PENDING → physical change → index change → readback
→ reconcile Save journal (new name or DELETED) → operation COMPLETE. Every durable write is read back.
No automatic replay or global cleanup is implemented. Each operation performs its physical change once.

Rename failure returns RENAME_RECOVERY_REQUIRED, preserving old/new names and immutable IDs in intent.
Delete failure returns DELETE_RECOVERY_REQUIRED; if the sheet is already absent do NOT blindly call Delete
again. After response loss or timeout a PENDING intent blocks another mutation; Save also blocks.
List provides diagnostics, including when physical and index deletion succeeded but finalization failed.
Inspect operation intent, source journal, exact sheet ID/hash and index row. Complete/reconcile or restore
only through a separately approved recovery procedure. No automatic rollback from a potentially uncertain
remote response is attempted. A physically deleted archive cannot be restored by a name/index rollback.

GAS Sheets operations are not atomic. ScriptLock excludes cooperating operations in this project but not
manual editors/other projects. External edits may cause readback failure; preserve diagnostics.

## Authorization — publication blocker

Existing server authorization covers BOM through active email plus MASTER editors, not archive roles.
No trusted ERP_OWNER/WORKSHOP_MANAGER identity provider exists. New list/rename/delete handlers
therefore use unconfiguredArchivePolicy and return ARCHIVE_ACCESS_CONTROL_NOT_CONFIGURED before any
store call. They are not enabled by buttons, query parameters, effective owner identity, or a local role flag.
ArchiveRolePolicy is an integration contract with an injected server-resolved identity; tests cover both
roles for list/open/save/rename/delete and deny unknown/missing identity. It is not wired to production.

Decision needed before enabling: implement approved server-side identity resolution and role assignment;
fail closed on blank active email; enforce archive policy also on existing Save/current-state handlers.
Existing B4.1 Save authorization behavior was not silently changed here. Multiuser readiness is NOT claimed.
Direct archive links still require Google Sheets permissions; this task changes no sharing configuration.

UI has compact list, exact-gid Open, prompted/confirmed Rename, and Delete confirmation with name/ReportID.
Mutation buttons lock per report; success refreshes list. Errors/timeouts do not replay mutations or clear
Generate fields. Until approved Access Control integration, the production adapter shows the explicit gate.

## Controlled future check

Do not push or deploy this local stage. After approval of Access Control and deployment, use a separate
approved disposable archive for Rename/Delete tests; MC_000001 / SheetID 1878603004 was not touched.
Record before/after physical ID/name, index row and source journal. Verify Rename leaves IDs/content fixed,
and Delete leaves tombstone/sequence unchanged. Inject partial failures offline, not on the only real archive.
No MASTER/OPERATIONAL/REPORTING calls were made during local implementation; tests use mocks.
