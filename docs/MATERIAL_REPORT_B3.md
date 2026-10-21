# Stage B3 — local UI integration

No live write, push or deployment was performed during implementation.

Pipeline: Manufacturing.html → generateMaterialConsumptionReportWeb (registered via index.ts)
→ validated MaterialConsumptionReportWebRequest → existing CurrentReportOutput factory
→ existing use case/presenter/renderer/writer → JSON receipt (OK/EMPTY) or ERROR with code/message.
The fixed KUB_B2_firstControlledReportWrite entrypoint is not used by the form.

UI captures DOM values at submission. Initial house loading and dependent product loading block submission.
Product responses are accepted only if both request sequence and selected house still match.
Changing house resets the product choice intentionally to All Products; selecting All Products omits productCode.
Out-of-order responses previously could overwrite a newer house's product list. This is a reproducible risk
and now covered by tests; the exact historical visible-selection/JSON discrepancy was not reproduced in a live browser.
The blank-to-undefined conversion explains why genuinely empty DOM values were omitted from the old JSON.

Only material-consumption/normative/google-sheet is supported. Three percentages are explicit finite numbers
0..100; no empty-to-zero conversion on the server. Optional dates are strings YYYY-MM-DD and fully validated.
No Date object is passed through google.script.run. Nonexistent specified house fails before output construction.

Button has an in-flight guard; writer retains its existing ScriptLock. Failure or six-minute client timeout
warns that outcome may be unknown and requests REPORTING inspection; no automatic retry occurs.
Late responses after timeout are ignored. Fields are not cleared. Success links accept only exact REPORTING
spreadsheet URLs with a numeric gid; errors use textContent, not HTML injection.

## Controlled verification after separate deployment approval

1. Review local diff and test results. Separately authorize HEAD push and update of the existing deployment;
   no new Web App URL is needed. This stage does neither.
2. Open the existing Web App after the approved update; verify only Manufacturing is visible initially.
3. Select Report. Wait for house loading, choose H001, wait for product loading, select П-1.
4. Set 2026-06-30 through 2026-06-30 and test norms 7/5/0. Confirm one real REPORTING write is authorized.
5. Click once. Verify loading state, disabled button, then OK and link to the returned ПоточнийЗвіт gid.
6. Inspect rows, dates DD-MM-YYYY, formatting, and unchanged ВідомістьВитрат/Аркуш2; no MASTER/OPERATIONAL
   writer is present in this pipeline. Keep a before/after read-only baseline for a live verification.
7. If timeout, connection failure or REPORT_RECOVERY_REQUIRED occurs, inspect REPORTING and execution logs
   before deciding on another invocation. Do not blindly click again or delete staging/backup sheets.

Offline tests cover request validation, endpoint delegation, empty/error/recovery outcomes, stale dropdown
responses, loading guards, double clicks, preserved form fields, exact-sheet URL and tab switching.
The use-case regression confirms excluded PRODUCT_NOT_FOUND facts do not reach product resolution;
included unresolved facts fail explicitly. Source immutability and writer sheet isolation remain covered
by the existing Stage B1/B2 tests. Live authenticated rendering remains a separate post-deployment check.
