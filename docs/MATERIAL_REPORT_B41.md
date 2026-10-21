# Stage B4.1 — Save material report (local only)

## Audit and minimal adaptation

Generate already publishes a readback-verified staging sheet under ScriptLock, verifies current SheetID,
then cleans only its operation's predecessor. Its OK receipt contains actual SheetID but no durable filters
or Manufacturing IDs. The DOM can change after generation. Therefore Save cannot safely use DOM filters.

Adaptation: ReportTable may carry ReportSnapshot. Output creates it from the actual request/dataset,
and writer persists it as KUB_MATERIAL_REPORT_V1 sheet developer metadata before publication.
It includes original generation date, filters, three norms, CURRENT_BOM basis and source Manufacturing IDs.
No material calculation changes. Existing v31 current sheets without this metadata are deliberately
not silently inferred/migrated: state reports CURRENT_REPORT_METADATA_MISSING; first generate a new report
after a future approved deployment. This local task does not modify the existing current sheet.

## Contracts and persistence

getCurrentMaterialReportWeb() → OK with current sheetId, EMPTY or ERROR.
saveMaterialConsumptionReportWeb({sourceSheetId}) → OK/ALREADY_SAVED with reportId/sheetId/sheetName/url,
or ERROR with code/message. No form filters or Date objects are accepted by Save.

SaveMaterialConsumptionReportUseCase uses SavedReportStore. GasSavedReportStore opens exact REPORTING
ID only and uses the same LockService.getScriptLock as Generate. Current-ID check happens under the lock.
No current report is renamed or deleted by Save. Sheet.copyTo copies the ready physical result, including
formats, widths and group structure. Formulas, conditional formatting, charts, pivots, data source tables
and data validation are conservatively blocked to avoid live dependencies. Readback fingerprints compare
values/types, number formats, fonts, alignments, wrapping, merges, row heights/depths, widths and frozen panes.
Source is fingerprinted again after copy to detect intervening edits. Original generation date is preserved.

Archive names/IDs: MC_000001, MC_000002, ... . A namespaced ScriptProperty sequence is advanced and
read back under lock before copy; existing sheet/index IDs are considered when initializing/advancing it.
Failed allocations leave gaps; future deletion MUST NOT reset sequence or reuse numbers.
ScriptProperties must not be manually cleared. Journal metadata is bounded to 8000 UTF-8 bytes per source;
larger reports fail explicitly rather than truncate the snapshot. GAS property quotas remain a capacity limit.

ReportIndex is created lazily, validates the exact 14-column schema, and never clears existing rows:
ReportID, SheetID, SheetName, SourceSheetID, SavedAt, HouseCode, ProductCode, DateFrom, DateTo,
Method, RebarLoss, RolledLoss, ConcreteLoss, BOMBasis.
SavedAt is a separate UTC ISO string. Source dates remain YYYY-MM-DD in index/metadata; the copied
report retains DD-MM-YYYY display and its original native values. Extra source IDs are in archive metadata.

## Partial failures / no duplicate policy

A durable PENDING intent keyed by SourceSheetID is written BEFORE copying. After copy returns, its SheetID
is persisted before rename/readback. Index registration is verified, then intent becomes COMPLETE.
Repeated COMPLETE saves validate archive fingerprint and exact index row, returning ALREADY_SAVED.
Any PENDING attempt blocks another copy, even if an index append actually succeeded but its response was lost.
No OK is returned until archive and index are both confirmed. No automatic write retry or deletion exists.

For SAVE_RECOVERY_REQUIRED: inspect script property intent, REPORTING sheet IDs, index and logs.
If copy response was lost before its ID was persisted, an unnamed 'Copy of ...' sheet may exist; do not guess
which sheet to remove. Reconcile exact source/report ID, snapshot and fingerprint manually under separate
approval. Completing/cancelling a pending journal is intentionally not automated in B4.1.
Do not clear the intent just to retry. A hard timeout may leave PENDING; client warns and never replays.
ScriptLock does not lock out manual editors/other projects; avoid concurrent external edits during Save.

UI loads current identity on reopen, stores returned generation SheetID, and submits only that ID.
STALE_CURRENT_REPORT disables Save until a fresh current state is loaded (reload or new generation).
Generate and Save buttons mutually disable while in flight. Timeout/failure restores UI with inspection
warning; no automatic repeat. Generation parameters are never overwritten with archive values.

Archives use MC_ names, not staging/previous names. CurrentReportWriter's per-operation exact-ID ticket
cannot authorize archive cleanup. No list/delete, ReportIndex deletion or general cleanup was added.

## One controlled save after separate publication approval

1. Authorize push/update of the existing Web App separately; none is performed in this stage.
2. Generate one reviewed report after upgrade so it has metadata. Review the actual report.
3. Optionally change form percentages without generating; click ЗБЕРЕГТИ ЗВІТ once.
4. Record ReportID, SheetID and archive URL. Verify ReportIndex headers/new row, source SheetID,
   dates/norms and original generation date against the generated report, not edited DOM fields.
5. Verify archive numbers, native date values, formatting, widths/groups, and no formulas/dependencies.
6. A later separately authorized save of the same current must return ALREADY_SAVED; a new generation
   must leave the MC_ archive unchanged. These are extra operations requiring explicit live-test scope.
7. On timeout/error stop, preserve partial sheets and intent, and perform read-only reconciliation first.

No MASTER/OPERATIONAL read or write is performed by the Save adapter. No live Sheets calls were made
during this local stage. All adapter verification uses mocks.
