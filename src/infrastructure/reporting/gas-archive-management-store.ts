import { GasSavedReportStore } from './gas-saved-report-store';
import { ARCHIVE_OP_PREFIX, validateArchiveName, type ArchiveEntry, type ArchiveManagementStore, type ArchiveOperation } from './archive-management';
import type { SavedReport } from './saved-report';
export class GasArchiveManagementStore extends GasSavedReportStore implements ArchiveManagementStore {
  entries(): ArchiveEntry[] {
    const index = this.index(false); if (!index || index.getLastRow() <= 1) return [];
    return index.getRange(2, 1, index.getLastRow() - 1, 14).getValues().filter(r => r.some(v => v !== '')).map(r => ({
      reportId: String(r[0]), sheetId: r[1], sheetName: String(r[2]), sourceSheetId: r[3], savedAt: String(r[4]),
      houseCode: String(r[5]), productCode: String(r[6]), dateFrom: String(r[7]), dateTo: String(r[8]), method: String(r[9]),
    }));
  }
  operation(id: string): ArchiveOperation | undefined {
    const text = this.properties().getProperty(ARCHIVE_OP_PREFIX + id); return text ? JSON.parse(text) : undefined;
  }
  pendingOperations(): ArchiveOperation[] {
    return Object.entries(this.properties().getProperties()).filter(([key]) => key.startsWith(ARCHIVE_OP_PREFIX))
      .map(([, value]) => JSON.parse(value) as ArchiveOperation).filter(o => o.state === 'PENDING');
  }
  verify(entry: ArchiveEntry) {
    if (this.operation(entry.reportId)?.state === 'PENDING') throw new Error('ARCHIVE_RECOVERY_REQUIRED');
    const report = this.saved(entry);
    this.confirmArchive(report);
  }
  private saved(entry: ArchiveEntry): SavedReport {
    const attempt = this.attempt(entry.sourceSheetId);
    if (!attempt || attempt.state !== 'COMPLETE' || attempt.report.reportId !== entry.reportId || attempt.report.sheetId !== entry.sheetId ||
      attempt.report.sheetName !== entry.sheetName) throw new Error('ARCHIVE_JOURNAL_MISMATCH');
    return attempt.report as SavedReport;
  }
  nameExists(name: string, except: number) { return this.book().getSheets().some(s => s.getSheetId() !== except && s.getName().toLowerCase() === name.toLowerCase()); }
  begin(operation: ArchiveOperation) {
    if (!this.held?.hasLock()) throw new Error('ARCHIVE_LOCK_REQUIRED');
    this.verify(operation.entry);
    const key = ARCHIVE_OP_PREFIX + operation.entry.reportId; const text = JSON.stringify(operation);
    this.properties().setProperty(key, text);
    if (this.properties().getProperty(key) !== text) throw new Error('ARCHIVE_INTENT_NOT_CONFIRMED');
    const attempt = this.attempt(operation.entry.sourceSheetId)!;
    attempt.state = 'PENDING'; this.persist(operation.entry.sourceSheetId, attempt);
  }
  renameSheet(entry: ArchiveEntry, name: string) {
    this.assertIntent(entry, 'RENAME');
    if (validateArchiveName(name) !== this.operation(entry.reportId)?.newName || this.nameExists(name, entry.sheetId)) throw new Error('UNSAFE_ARCHIVE_RENAME');
    if (this.sheet(entry.sheetId).getName() !== entry.sheetName) throw new Error('ARCHIVE_NAME_MISMATCH');
    this.sheet(entry.sheetId).setName(name); SpreadsheetApp.flush();
    if (this.sheet(entry.sheetId).getName() !== name) throw new Error('RENAME_READBACK_MISMATCH');
  }
  private indexRow(entry: ArchiveEntry) {
    const index = this.index(false); if (!index) throw new Error('REPORT_INDEX_MISSING');
    const rows = this.entries();
    const matches = rows.filter(r => r.reportId === entry.reportId || r.sheetId === entry.sheetId);
    if (matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(entry)) throw new Error('REPORT_INDEX_MISMATCH');
    // Physical row lookup preserves blank row positions.
    const physical = index.getRange(2, 1, index.getLastRow() - 1, 4).getValues();
    const positions = physical.map((r, i) => r[0] === entry.reportId && r[1] === entry.sheetId ? i + 2 : -1).filter(i => i > 0);
    if (positions.length !== 1) throw new Error('REPORT_INDEX_MISMATCH');
    return { index, row: positions[0] };
  }
  renameIndex(entry: ArchiveEntry, name: string) {
    const { index, row } = this.indexRow(entry);
    index.getRange(row, 3).setNumberFormat('@').setValue(name); SpreadsheetApp.flush();
    if (index.getRange(row, 3).getValue() !== name) throw new Error('INDEX_RENAME_READBACK_MISMATCH');
  }
  deleteSheet(entry: ArchiveEntry) {
    this.assertIntent(entry, 'DELETE');
    if (this.sheet(entry.sheetId).getName() !== entry.sheetName) throw new Error('ARCHIVE_NAME_MISMATCH');
    this.book().deleteSheet(this.sheet(entry.sheetId)); SpreadsheetApp.flush();
    if (this.book().getSheets().some(s => s.getSheetId() === entry.sheetId)) throw new Error('DELETE_READBACK_MISMATCH');
  }
  deleteIndex(entry: ArchiveEntry) {
    const { index, row } = this.indexRow(entry); index.deleteRow(row); SpreadsheetApp.flush();
    if (this.entries().some(r => r.reportId === entry.reportId || r.sheetId === entry.sheetId)) throw new Error('INDEX_DELETE_READBACK_MISMATCH');
  }
  finish(operation: ArchiveOperation) {
    if (!this.held?.hasLock() || JSON.stringify(this.operation(operation.entry.reportId)) !== JSON.stringify(operation)) throw new Error('ARCHIVE_INTENT_MISMATCH');
    const entry = operation.entry; const attempt = this.attempt(entry.sourceSheetId);
    if (!attempt || attempt.state !== 'PENDING' || attempt.report.reportId !== entry.reportId || attempt.report.sheetId !== entry.sheetId) throw new Error('ARCHIVE_JOURNAL_MISMATCH');
    if (operation.kind === 'RENAME') {
      attempt.report.sheetName = operation.newName!;
      this.confirmArchive(attempt.report as SavedReport);
      attempt.state = 'COMPLETE';
    } else {
      if (this.book().getSheets().some(s => s.getSheetId() === entry.sheetId) || this.entries().some(r => r.reportId === entry.reportId)) throw new Error('DELETE_NOT_CONFIRMED');
      attempt.state = 'DELETED';
    }
    this.persist(entry.sourceSheetId, attempt);
    const key = ARCHIVE_OP_PREFIX + entry.reportId; const text = JSON.stringify({ ...operation, state: 'COMPLETE' });
    this.properties().setProperty(key, text);
    if (this.properties().getProperty(key) !== text) throw new Error('ARCHIVE_COMPLETION_NOT_CONFIRMED');
  }
  private assertIntent(entry: ArchiveEntry, kind: ArchiveOperation['kind']) {
    const operation = this.operation(entry.reportId);
    if (!this.held?.hasLock() || !operation || operation.state !== 'PENDING' || operation.kind !== kind || JSON.stringify(operation.entry) !== JSON.stringify(entry) ||
      this.sheet(entry.sheetId).getName() !== entry.sheetName || ['ПоточнийЗвіт', 'ReportIndex', 'ВідомістьВитрат', 'Аркуш2'].includes(entry.sheetName) || /^_KUB_/i.test(entry.sheetName)) throw new Error('UNSAFE_ARCHIVE_MUTATION');
  }
}
