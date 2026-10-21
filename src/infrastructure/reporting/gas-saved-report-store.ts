import { CURRENT_REPORT, REPORTING_ID } from './current-report-writer';
import { REPORT_INDEX_HEADERS, type SavedReport, type SaveAttempt, type SavedReportStore } from './saved-report';
import { SNAPSHOT_KEY, type ReportSnapshot } from './report-snapshot';
import { ARCHIVE_OP_PREFIX, protectedArchiveNames } from './archive-management';

const PREFIX = `KUB_SAVED_${REPORTING_ID}_`;
const HASH_KEY = 'KUB_ARCHIVE_SHA256';
export class GasSavedReportStore implements SavedReportStore {
  protected held?: GoogleAppsScript.Lock.Lock;
  protected book() { return SpreadsheetApp.openById(REPORTING_ID); }
  protected properties() { return PropertiesService.getScriptProperties(); }
  protected sheet(id: number) {
    const sheet = this.book().getSheets().find(s => s.getSheetId() === id);
    if (!sheet) throw new Error(`SAVE_SHEET_NOT_FOUND: ${id}`);
    return sheet;
  }
  lock() { const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return false; this.held = lock; return true; }
  unlock() { this.held?.releaseLock(); this.held = undefined; }
  currentId() { return this.book().getSheetByName(CURRENT_REPORT)?.getSheetId(); }
  snapshot(id: number): ReportSnapshot {
    const sheet = this.sheet(id);
    const entries = sheet.getDeveloperMetadata().filter(m => m.getKey() === SNAPSHOT_KEY);
    if (entries.length !== 1) throw new Error('CURRENT_REPORT_METADATA_MISSING: сформуйте новий звіт після оновлення');
    const result = JSON.parse(entries[0].getValue()!);
    if (result.schema !== 1 || result.method !== 'normative' || result.bomBasis !== 'CURRENT_BOM' || result.reportType !== 'material-consumption' ||
      !Array.isArray(result.manufacturingIds) || !result.manufacturingIds.length || result.manufacturingIds.some((id: unknown) => typeof id !== 'string' || !id) ||
      !result.filters || !result.lossPercents ||
      !['rebar', 'rolled', 'concrete'].every(k => typeof result.lossPercents[k] === 'number' && Number.isFinite(result.lossPercents[k]) && result.lossPercents[k] >= 0 && result.lossPercents[k] <= 100)) throw new Error('INVALID_REPORT_METADATA');
    this.fingerprint(sheet); // Reject dependencies before any copy.
    return result;
  }
  attempt(source: number): SaveAttempt | undefined {
    const value = this.properties().getProperty(PREFIX + source);
    return value ? JSON.parse(value) : undefined;
  }
  persist(source: number, attempt: SaveAttempt) {
    const text = JSON.stringify(attempt);
    if (Utilities.newBlob(text).getBytes().length > 8000) throw new Error('SAVE_METADATA_TOO_LARGE');
    this.properties().setProperty(PREFIX + source, text);
    if (this.properties().getProperty(PREFIX + source) !== text) throw new Error('SAVE_INTENT_NOT_CONFIRMED');
  }
  protected index(create: boolean) {
    const book = this.book(); let index = book.getSheetByName('ReportIndex');
    if (!index && create) {
      index = book.insertSheet('ReportIndex');
      index.getRange(1, 1, 1, REPORT_INDEX_HEADERS.length).setValues([[...REPORT_INDEX_HEADERS]]);
      index.setFrozenRows(1); SpreadsheetApp.flush();
    }
    if (index && (JSON.stringify(index.getRange(1, 1, 1, index.getLastColumn()).getValues()[0]) !== JSON.stringify(REPORT_INDEX_HEADERS) ||
      index.getDataRange().getFormulas().some(row => row.some(Boolean)))) throw new Error('INVALID_REPORT_INDEX_SCHEMA');
    return index;
  }
  reserveId() {
    const key = PREFIX + 'SEQUENCE'; const raw = this.properties().getProperty(key);
    if (raw !== null && !/^\d+$/.test(raw)) throw new Error('INVALID_REPORT_SEQUENCE');
    let max = Number(raw ?? 0);
    const names = this.book().getSheets().map(s => s.getName());
    const index = this.index(false);
    if (index && index.getLastRow() > 1) names.push(...index.getRange(2, 1, index.getLastRow() - 1, 1).getValues().map(r => String(r[0])));
    for (const name of names) { const match = /^MC_(\d+)$/.exec(name); if (match) max = Math.max(max, Number(match[1])); }
    if (!Number.isSafeInteger(max) || max >= Number.MAX_SAFE_INTEGER) throw new Error('INVALID_REPORT_SEQUENCE');
    const next = String(max + 1); this.properties().setProperty(key, next);
    if (this.properties().getProperty(key) !== next) throw new Error('REPORT_SEQUENCE_NOT_CONFIRMED');
    return `MC_${next.padStart(6, '0')}`;
  }
  copyAndVerify(source: number, attempt: SaveAttempt) {
    if (this.currentId() !== source) throw new Error('STALE_CURRENT_REPORT');
    const original = this.sheet(source); const hash = this.fingerprint(original);
    const copy = original.copyTo(this.book());
    // Persist returned ID before any rename/readback; lost copy response remains PENDING.
    attempt.report.sheetId = copy.getSheetId(); this.persist(source, attempt);
    copy.setName(attempt.report.sheetName); SpreadsheetApp.flush();
    if (this.fingerprint(copy) !== hash || this.fingerprint(original) !== hash) throw new Error('ARCHIVE_READBACK_MISMATCH');
    const snapshots = copy.getDeveloperMetadata().filter(m => m.getKey() === SNAPSHOT_KEY);
    if (!snapshots.length) copy.addDeveloperMetadata(SNAPSHOT_KEY, JSON.stringify(attempt.report.snapshot));
    if (JSON.stringify(this.snapshot(copy.getSheetId())) !== JSON.stringify(attempt.report.snapshot)) throw new Error('ARCHIVE_METADATA_MISMATCH');
    copy.addDeveloperMetadata(HASH_KEY, hash); SpreadsheetApp.flush();
    return copy.getSheetId();
  }
  private row(report: SavedReport): (string | number)[] {
    const s = report.snapshot;
    return [report.reportId, report.sheetId, report.sheetName, report.sourceSheetId, report.savedAt,
      s.filters.houseCode ?? '', s.filters.productCode ?? '', s.filters.dateFrom ?? '', s.filters.dateTo ?? '', s.method,
      s.lossPercents.rebar, s.lossPercents.rolled, s.lossPercents.concrete, s.bomBasis];
  }
  register(report: SavedReport) {
    const index = this.index(true)!;
    if (index.getLastRow() > 1 && index.getRange(2, 1, index.getLastRow() - 1, 4).getValues().some(r => r[0] === report.reportId || r[3] === report.sourceSheetId)) throw new Error('DUPLICATE_REPORT_INDEX');
    const row = this.row(report).map(v => typeof v === 'string' && /^[=+\-@']/.test(v) ? `'${v}` : v);
    index.getRange(index.getLastRow() + 1, 1, 1, row.length).setNumberFormats([row.map((_, i) => [1, 3, 10, 11, 12].includes(i) ? '0.########' : '@')]).setValues([row]);
    SpreadsheetApp.flush();
  }
  confirm(report: SavedReport) {
    const operation = this.properties().getProperty(ARCHIVE_OP_PREFIX + report.reportId);
    if (operation && JSON.parse(operation).state === 'PENDING') throw new Error('ARCHIVE_RECOVERY_REQUIRED');
    this.confirmArchive(report);
  }
  protected confirmArchive(report: SavedReport) {
    const sheet = this.sheet(report.sheetId);
    if (!/^MC_\d{6,}$/.test(report.reportId) || sheet.getName() !== report.sheetName || protectedArchiveNames.includes(report.sheetName) || /^_KUB_/i.test(report.sheetName)) throw new Error('INVALID_ARCHIVE_IDENTITY');
    const hashes = sheet.getDeveloperMetadata().filter(m => m.getKey() === HASH_KEY);
    if (hashes.length !== 1 || hashes[0].getValue() !== this.fingerprint(sheet)) throw new Error('ARCHIVE_READBACK_MISMATCH');
    const index = this.index(false);
    const rows = index && index.getLastRow() > 1 ? index.getRange(2, 1, index.getLastRow() - 1, REPORT_INDEX_HEADERS.length).getValues() : [];
    const matches = rows.filter(r => r[0] === report.reportId || r[3] === report.sourceSheetId);
    if (matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(this.row(report))) throw new Error('REPORT_INDEX_READBACK_MISMATCH');
  }
  private fingerprint(sheet: GoogleAppsScript.Spreadsheet.Sheet): string {
    const range = sheet.getDataRange();
    if (range.getFormulas().some(row => row.some(Boolean)) || sheet.getConditionalFormatRules().length || sheet.getCharts().length ||
      sheet.getPivotTables().length || sheet.getDataSourceTables().length || range.getDataValidations().some(row => row.some(Boolean))) throw new Error('UNSAFE_ARCHIVE_DEPENDENCY');
    const content = JSON.stringify({ values: range.getValues(), formats: range.getNumberFormats(), backgrounds: range.getBackgrounds(),
      weights: range.getFontWeights(), sizes: range.getFontSizes(), colors: range.getFontColors(), families: range.getFontFamilies(),
      horizontal: range.getHorizontalAlignments(), vertical: range.getVerticalAlignments(), wraps: range.getWrapStrategies(),
      merges: range.getMergedRanges().map(r => r.getA1Notation()), frozenRows: sheet.getFrozenRows(), frozenColumns: sheet.getFrozenColumns(),
      widths: Array.from({ length: range.getNumColumns() }, (_, i) => sheet.getColumnWidth(i + 1)),
      heights: Array.from({ length: range.getNumRows() }, (_, i) => sheet.getRowHeight(i + 1)),
      groups: Array.from({ length: range.getNumRows() }, (_, i) => sheet.getRowGroupDepth(i + 1)) });
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, content, Utilities.Charset.UTF_8).map(b => (b & 255).toString(16).padStart(2, '0')).join('');
  }
}
