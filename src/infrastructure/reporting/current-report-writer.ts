import type { ReportTable } from './grouped-report-renderer';
import { SNAPSHOT_KEY } from './report-snapshot';

export const REPORTING_ID = '1Vy--GaVoUdP17Yd2PztUtXAcaf1krskxm5qvidQsoPc';
export const CURRENT_REPORT = 'ПоточнийЗвіт';
export interface CurrentReportReceipt {
  status: 'OK'; spreadsheetId: string; sheetId: number; url: string;
  productCount: number; materialRowCount: number;
  previousSheetId?: number; previousSheetName?: string;
  cleanup: 'NOT_NEEDED' | 'DELETED' | 'WARNING';
  warnings?: { code: 'REPORT_CLEANUP_REQUIRED'; sheetId: number; message: string }[];
}
/** No generic delete: cleanup requires the current operation's previous-sheet identity. */
export interface CurrentReportStore {
  lock(): boolean;
  unlock(): void;
  currentId(): number | undefined;
  createStage(): number;
  populateAndVerify(id: number, table: ReportTable): void;
  rename(id: number, name: string): void;
  name(id: number): string;
  backupName(id: number): string;
  deletePrevious(id: number, expectedName: string, publishedId: number): void;
}
export class GoogleSheetsCurrentReportWriter {
  constructor(private readonly store: CurrentReportStore) {}
  write(table: ReportTable): CurrentReportReceipt | { status: 'EMPTY' } {
    if (table.productCount === 0) return { status: 'EMPTY' };
    if (!this.store.lock()) throw new Error('REPORT_BUSY');
    let previous: number | undefined, stage: number | undefined;
    let backup: string | undefined;
    try {
      previous = this.store.currentId();
      stage = this.store.createStage();
      this.store.populateAndVerify(stage, table);
      if (previous !== undefined) {
        backup = this.store.backupName(previous);
        this.store.rename(previous, backup);
      }
      this.store.rename(stage, CURRENT_REPORT);
      if (this.store.currentId() !== stage) throw new Error('REPORT_SWAP_NOT_VERIFIED');
      // Publication is committed. Cleanup failure must never enter rollback/recovery.
      let cleanup: CurrentReportReceipt['cleanup'] = 'NOT_NEEDED';
      let warnings: CurrentReportReceipt['warnings'];
      if (previous !== undefined && backup !== undefined) {
        try {
          this.store.deletePrevious(previous, backup, stage);
          cleanup = 'DELETED';
        } catch (error) {
          cleanup = 'WARNING';
          warnings = [{ code: 'REPORT_CLEANUP_REQUIRED', sheetId: previous,
            message: `Новий звіт опубліковано. Перевірте службовий аркуш ${previous}; повторне формування не потрібне. ${String(error)}` }];
        }
      }
      return { status: 'OK', spreadsheetId: REPORTING_ID, sheetId: stage,
        url: `https://docs.google.com/spreadsheets/d/${REPORTING_ID}/edit#gid=${stage}`,
        productCount: table.productCount, materialRowCount: table.materialRowCount,
        previousSheetId: previous, previousSheetName: backup, cleanup, ...(warnings ? { warnings } : {}) };
    } catch (error) {
      try {
        // Reconcile actual names, including a remote rename whose response was lost.
        if (stage !== undefined && this.store.name(stage) === CURRENT_REPORT) {
          this.store.rename(stage, `_KUB_FAILED_${stage}`);
        }
        if (previous !== undefined && this.store.name(previous) !== CURRENT_REPORT) {
          this.store.rename(previous, CURRENT_REPORT);
        }
      } catch (recoveryError) {
        throw new Error(`REPORT_RECOVERY_REQUIRED: previous=${previous}, stage=${stage}; ${String(error)}; ${String(recoveryError)}`);
      }
      throw error;
    } finally { this.store.unlock(); }
  }
}

/** Constructed only on explicit future invocation; no calls at module load. */
export class GasCurrentReportStore implements CurrentReportStore {
  private spreadsheet?: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private heldLock?: GoogleAppsScript.Lock.Lock;
  private readonly cleanupTickets = new Map<number, string>();
  private readonly verifiedStages = new Set<number>();
  private book() { return this.spreadsheet ?? (this.spreadsheet = SpreadsheetApp.openById(REPORTING_ID)); }
  private sheet(id: number) {
    const sheet = this.book().getSheets().find(s => s.getSheetId() === id);
    if (!sheet) throw new Error(`REPORT_SHEET_NOT_FOUND: ${id}`);
    return sheet;
  }
  lock() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return false;
    this.heldLock = lock; return true;
  }
  unlock() {
    try { this.heldLock?.releaseLock(); }
    finally { this.heldLock = undefined; this.cleanupTickets.clear(); this.verifiedStages.clear(); }
  }
  currentId() { return this.book().getSheetByName(CURRENT_REPORT)?.getSheetId(); }
  createStage() { return this.book().insertSheet(`_KUB_STAGE_${Utilities.getUuid()}`).getSheetId(); }
  name(id: number) { return this.sheet(id).getName(); }
  backupName(id: number) {
    if (!this.heldLock?.hasLock() || this.currentId() !== id) throw new Error('UNSAFE_REPORT_BACKUP');
    const name = `_KUB_PREVIOUS_${id}_${Utilities.getUuid()}`;
    this.cleanupTickets.set(id, name);
    return name;
  }
  deletePrevious(id: number, expectedName: string, publishedId: number) {
    const protectedNames = [CURRENT_REPORT, 'ВідомістьВитрат', 'Аркуш2', 'ReportIndex'];
    const previous = this.sheet(id);
    if (!this.heldLock?.hasLock() || this.cleanupTickets.get(id) !== expectedName ||
        !this.verifiedStages.has(publishedId) || id === publishedId || this.currentId() !== publishedId ||
        this.name(publishedId) !== CURRENT_REPORT || previous.getName() !== expectedName ||
        protectedNames.includes(previous.getName()) || !expectedName.startsWith(`_KUB_PREVIOUS_${id}_`)) {
      throw new Error('UNSAFE_REPORT_CLEANUP');
    }
    // Consume before remote mutation: an uncertain response must not trigger an automatic delete retry.
    this.cleanupTickets.delete(id);
    this.book().deleteSheet(previous);
    SpreadsheetApp.flush();
    if (this.book().getSheets().some(s => s.getSheetId() === id)) throw new Error('REPORT_CLEANUP_NOT_VERIFIED');
  }
  rename(id: number, name: string) { this.sheet(id).setName(name); SpreadsheetApp.flush(); }
  populateAndVerify(id: number, table: ReportTable) {
    const sheet = this.sheet(id);
    if (!sheet.getName().startsWith('_KUB_STAGE_')) throw new Error('NOT_A_REPORT_STAGE');
    if (sheet.getMaxRows() < table.values.length) sheet.insertRowsAfter(sheet.getMaxRows(), table.values.length - sheet.getMaxRows());
    const range = sheet.getRange(1, 1, table.values.length, 6);
    // Escape formula-like strings. Text formatting alone is not a formula guard.
    const values = table.values.map(row => row.map(v => typeof v === 'string' && /^[=+\-@']/.test(v) ? `'${v}` : v));
    range.setNumberFormats(table.formats).setValues(values).setVerticalAlignment('middle');
    sheet.setColumnWidth(1, 350); sheet.setColumnWidth(2, 65);
    sheet.setColumnWidths(3, 4, 140);
    range.setWrap(true);
    sheet.getRange(1, 1, 1, 6).merge().setFontWeight('bold').setFontSize(15);
    sheet.getRange(12, 1, 1, 6).setFontWeight('bold').setBackground('#dbeafe');
    sheet.getRange(1, 3, table.values.length, 4).setHorizontalAlignment('right');
    for (const group of table.groupRows) {
      sheet.getRange(group.heading, 1, 1, 6).merge().setFontWeight('bold').setBackground('#e5e7eb');
      sheet.getRange(group.start, 1, group.count, 6).shiftRowGroupDepth(1);
    }
    sheet.setFrozenRows(12);
    if (table.snapshot) {
      const snapshot = JSON.stringify(table.snapshot);
      sheet.addDeveloperMetadata(SNAPSHOT_KEY, snapshot);
      if (sheet.getDeveloperMetadata().filter(m => m.getKey() === SNAPSHOT_KEY && m.getValue() === snapshot).length !== 1) throw new Error('REPORT_METADATA_READBACK_MISMATCH');
    }
    SpreadsheetApp.flush();
    const actual = range.getValues();
    // Date-formatted serials may be returned as Date; compare their displayed values separately.
    const displayed = range.getDisplayValues();
    const formulas = range.getFormulas();
    for (let r = 0; r < table.values.length; r++) for (let c = 0; c < 6; c++) {
      if (formulas[r][c]) throw new Error('REPORT_FORMULA_DETECTED');
      const expected = table.values[r][c];
      if (table.formats[r][c] === 'dd-mm-yyyy' && typeof expected === 'number') {
        const iso = new Date((expected - 25569) * 86400000).toISOString().slice(0, 10);
        if (displayed[r][c] !== iso.split('-').reverse().join('-')) throw new Error('REPORT_DATE_READBACK_MISMATCH');
      } else if (actual[r][c] !== expected) throw new Error(`REPORT_READBACK_MISMATCH: ${r + 1},${c + 1}`);
    }
    this.verifiedStages.add(id);
  }
}
