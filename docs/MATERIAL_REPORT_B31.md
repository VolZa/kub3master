# Stage B3.1 — CurrentReportWriter cleanup and recovery

Local implementation only; no Sheets mutations, push or deployment. This lifecycle supersedes the
Stage B2 policy of deliberately retaining every successful previous sheet.

## Audit

CurrentReportOutput uses the existing use case, presenter and renderer before invoking the writer.
Renderer supplies values/formats/group boundaries and does no persistence. Factory supplies one fresh
GasCurrentReportStore per output instance. No domain material calculation changes are required.

Writer takes ScriptLock, creates a unique staging sheet, populates/formats it and reads back values,
date display and formulas. The prior current sheet is renamed to a unique _KUB_PREVIOUS_<id>_<uuid>.
Staging becomes ПоточнийЗвіт; currentId must match the staging ID. Previously writer returned immediately
and provided no delete operation, so retention was intentional, not evidence of a failed publication.

## Minimal change and authorization

CurrentReportStore adds deletePrevious(id, expectedName, publishedId), not a generic delete operation.
Gas adapter issues an in-memory ticket only for the exact current ID under the held lock. Cleanup checks:
same ticket/name and ID, a readback-verified published stage, current ID/name matching that stage,
distinct old/new IDs, exact old backup name and operation-specific prefix. Protected names
ПоточнийЗвіт/ВідомістьВитрат/Аркуш2/ReportIndex are denied. Unknown backups and archives have no ticket.
Ticket is consumed before deleteSheet receives the exact Sheet object located by ID. No automatic retry.
Deletion absence is checked after flush. Unlock invalidates all remaining tickets and verification state.

After publication verification, cleanup runs in its own catch boundary. Receipt remains OK:
- cleanup NOT_NEEDED: first report, no predecessor;
- cleanup DELETED: only this operation's predecessor removed;
- cleanup WARNING: REPORT_CLEANUP_REQUIRED with exact predecessor ID and diagnostic.
UI keeps the working link and shows a cleanup warning without suggesting another generation.

## Failure/recovery matrix

| Failure | Result |
| --- | --- |
| Lock busy | REPORT_BUSY, no changes |
| Staging creation/write/readback | Previous current preserved; technical remnants retained |
| Old/new rename or publication-ID check | Reconcile actual names and restore prior current; no deletion |
| Recovery failure | REPORT_RECOVERY_REQUIRED with old/stage IDs; stop, inspect manually |
| Cleanup failure or lost delete response | New current retained; OK + WARNING; no rollback or repeat delete |
| Hard GAS timeout | No guaranteed catch/response; stop, inspect IDs/names and execution log |
| Later manual run | Processes its own predecessor only; never sweeps earlier crash/cleanup leftovers |

This is not an atomic spreadsheet transaction. ScriptLock coordinates this GAS project only, not external
editors or other GAS projects. No global janitor, recovery replay, trigger or automatic second writer run
is introduced. A client timeout can occur after successful publication/cleanup; inspect REPORTING before
authorizing another manual operation. The data of the last verified result remains either current or a
retained backup before publication confirmation; after confirmation the new verified current is preserved.

## Existing leftover — separate action required

Do not delete SheetID 1922174082 (_KUB_PREVIOUS_1922174082_bc40c955-80c7-4fe5-b540-5c545c1ba9ad)
in this task or by prefix cleanup. It cannot acquire a ticket merely because it already exists.
Recommended separate read-only review: confirm REPORTING ID, verify current SheetID 1390759514 and its
contents, compare the old result, confirm neither recovery nor any future archive/reference needs it.
Only after explicit owner approval, use a separate controlled operation targeting exact old SheetID.
No such operation or approval is implied by this local implementation.

Offline tests cover normal first/repeated publication, staging/readback/rename faults, uncertain remote
responses, cleanup failure, exact-ID authorization, protected/archive/old-remnant denial, locks and UI warning.
