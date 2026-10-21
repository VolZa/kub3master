# Stage B4.2 — agreed future scope, not implemented

Owner requirement recorded 2026-10-21 during B4.1 publication.

- Add archive list and synchronized Delete: remove selected archive sheet and its ReportIndex record,
  with exact ReportID/SheetID checks and controlled recovery for partial failure.
- Add synchronized Rename: rename the Google Sheets archive tab and update ReportIndex SheetName and
  displayed report name. ReportID and numeric SheetID remain immutable. Do not overload ReportID as
  a mutable display name. Current B4.1 initially uses MC_<sequence> for both ID and initial sheet name;
  B4.2 must adapt confirm/identity contracts and durable journal consistency accordingly.
- Validate collisions, invalid Google Sheets title characters, length, blank names and protected/system
  names. Block operations on ПоточнийЗвіт, ВідомістьВитрат, Аркуш2, ReportIndex and unknown sheets.
- Use the same ScriptLock as Generate/Save. Detect partial sheet/index updates, preserve diagnostics
  and enter explicit recovery instead of returning false success or silently leaving inconsistent names.
- After Access Control is implemented, both ERP_OWNER and WORKSHOP_MANAGER have Save, Rename and
  Delete permissions. This document grants no current runtime access-control behavior.
- Preserve monotonic ID sequence; deleted ReportIDs must never be reused. Reconcile SourceSheetID save
  journals when renaming/deleting so repeat Save cannot return stale identity or create hidden duplicates.

No B4.2 runtime code, index migration, Rename/Delete operation or role policy is introduced by B4.1 deployment.
