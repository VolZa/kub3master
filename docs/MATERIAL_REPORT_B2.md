# Stage B2 — local implementation only

Pipeline: MaterialConsumptionReportUseCase → GroupedByProductPresenter →
GoogleSheetsGroupedReportRenderer.render(view, request, generatedDate) → ReportTable →
GoogleSheetsCurrentReportWriter.write(table) → CurrentReportReceipt or EMPTY.
CurrentReportOutput composes the pipeline; no web handler or global GAS entrypoint is registered.
Renderer performs no BOM or loss calculations. Dates are Sheets serial dates with dd-mm-yyyy format.
Quantities retain their full numeric values; number formats control display only.

## Safe replacement

Script lock (5-second acquisition limit) covers staging write, readback, replacement and recovery.
Write and format a new uniquely named staging sheet in the exact REPORTING spreadsheet.
Verify all cell values, date display and absence of formulas before renaming the previous current sheet.
Keep the previous sheet intact under a unique _KUB_PREVIOUS_ name; publish the staging sheet as ПоточнийЗвіт.
Verify its ID. No sheet is cleared or deleted. Uncertain rename responses are reconciled by actual names.
On failure restore the prior name; if restoration also fails, report REPORT_RECOVERY_REQUIRED with both sheet IDs.
Staging and previous sheets are deliberately retained for diagnosis/recovery. They are not saved reports.

This is not an atomic Sheets transaction. A hard execution timeout between renames can leave the previous
result under its backup name. Data is retained, but automatic recovery cannot be guaranteed after termination.
ScriptLock coordinates this GAS project only; it does not block external editors or other scripts.
The current sheet ID/gid changes on successful replacement; callers must use the returned URL.

## First controlled live check — separate owner approval required

1. Review code/tests and authorize deployment and one bounded REPORTING write separately.
2. Record IDs/names/content of existing REPORTING sheets, especially ПоточнийЗвіт, ВідомістьВитрат,
   Аркуш2 and ReportIndex. Ensure no concurrent external edits.
3. In a reviewed manual harness construct CurrentReportOutput with the Stage B1 use-case factory and
   new GoogleSheetsCurrentReportWriter(new GasCurrentReportStore()). Do not register automatic execution.
4. Use one known House/Product and bounded dates, with explicit three loss percentages.
   First inspect the dataset offline/read-only and resolve all diagnostics. Never substitute matrix norms.
5. After explicit write authorization invoke generate once. Record status, sheet ID, URL, counts and backup ID.
6. Verify dates, material units/precision, numeric values, grouping and unchanged other sheets.
   Repeat only if separately authorized; test injected remote failures in a test spreadsheet, not production.
7. For REPORT_RECOVERY_REQUIRED or interrupted execution, stop. Inspect the reported IDs and staging/backup
   names; restore the previous name only under separate authorization. Do not delete diagnostic sheets blindly.

Future SavedReport/ReportIndex implementation should snapshot request filters, lossPercents, source
Manufacturing IDs and creation metadata from the dataset before publishing. None of save/list/delete is
implemented here. Future deletion must deny ПоточнийЗвіт, ВідомістьВитрат, Аркуш2 and ReportIndex.
No automatic cleanup, reference-norm fallback or UI write hook is included.
