import { CURRENT_REPORT, REPORTING_ID } from './current-report-writer';
export type ArchiveAction = 'list' | 'open' | 'save' | 'rename' | 'delete';
export interface ArchivePolicy { authorize(action: ArchiveAction): void }
export interface ArchiveEntry {
  reportId: string; sheetId: number; sheetName: string; sourceSheetId: number; savedAt: string;
  houseCode: string; productCode: string; dateFrom: string; dateTo: string; method: string;
}
export interface ArchiveOperation {
  kind: 'RENAME' | 'DELETE'; state: 'PENDING' | 'COMPLETE'; entry: ArchiveEntry; newName?: string;
}
export const ARCHIVE_OP_PREFIX = `KUB_ARCHIVE_OP_${REPORTING_ID}_`;
export const protectedArchiveNames = [CURRENT_REPORT, 'ReportIndex', 'ВідомістьВитрат', 'Аркуш2'];
export function validateArchiveName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 100 ||
    /[\[\]:*?\/\\\x00-\x1f\x7f]/.test(value) || /^['=+\-@]/.test(value) || /'$/.test(value) ||
    protectedArchiveNames.some(n => n.toLowerCase() === value.toLowerCase()) || /^_KUB_/i.test(value)) throw new Error('INVALID_ARCHIVE_NAME');
  return value;
}
export interface ArchiveManagementStore {
  lock(): boolean; unlock(): void;
  entries(): ArchiveEntry[];
  verify(entry: ArchiveEntry): void;
  nameExists(name: string, exceptId: number): boolean;
  operation(reportId: string): ArchiveOperation | undefined;
  pendingOperations(): ArchiveOperation[];
  begin(operation: ArchiveOperation): void;
  renameSheet(entry: ArchiveEntry, name: string): void;
  renameIndex(entry: ArchiveEntry, name: string): void;
  deleteSheet(entry: ArchiveEntry): void;
  deleteIndex(entry: ArchiveEntry): void;
  finish(operation: ArchiveOperation): void;
}
export class SavedReportsManagement {
  constructor(private readonly store: ArchiveManagementStore, private readonly policy: ArchivePolicy) {}
  list() {
    return this.locked('list', () => {
      const entries = this.store.entries();
      const rows = entries.map(entry => {
      try { this.identity(entry); this.store.verify(entry); return { ...entry, url: this.url(entry.sheetId), state: 'ACTIVE' }; }
      catch (error) { return { ...entry, state: 'DIAGNOSTIC', diagnostic: String(error) }; }
      });
      for (const operation of this.store.pendingOperations()) {
        if (!entries.some(e => e.reportId === operation.entry.reportId)) rows.push({ ...operation.entry, state: 'DIAGNOSTIC', diagnostic: `${operation.kind}_RECOVERY_REQUIRED: запис ReportIndex відсутній` });
      }
      return rows;
    });
  }
  rename(reportId: string, sheetId: number, newName: string) {
    return this.locked('rename', () => {
      const entry = this.find(reportId, sheetId); const name = validateArchiveName(newName);
      if (this.store.nameExists(name, sheetId)) throw new Error('ARCHIVE_NAME_CONFLICT');
      if (entry.sheetName === name) return { status: 'OK', reportId, sheetId, sheetName: name, url: this.url(sheetId) };
      const operation: ArchiveOperation = { kind: 'RENAME', state: 'PENDING', entry, newName: name };
      try {
        this.store.begin(operation);
        this.store.renameSheet(entry, name);
        this.store.renameIndex(entry, name);
        this.store.finish(operation);
      } catch (error) { throw new Error(`RENAME_RECOVERY_REQUIRED: ${reportId}/${sheetId}; ${String(error)}`); }
      return { status: 'OK', reportId, sheetId, sheetName: name, url: this.url(sheetId) };
    });
  }
  delete(reportId: string, sheetId: number) {
    return this.locked('delete', () => {
      const entry = this.find(reportId, sheetId);
      const operation: ArchiveOperation = { kind: 'DELETE', state: 'PENDING', entry };
      try {
        this.store.begin(operation);
        this.store.deleteSheet(entry);
        this.store.deleteIndex(entry);
        this.store.finish(operation);
      } catch (error) { throw new Error(`DELETE_RECOVERY_REQUIRED: ${reportId}/${sheetId}; ${String(error)}`); }
      return { status: 'OK', reportId, sheetId };
    });
  }
  private identity(entry: ArchiveEntry) {
    if (!/^MC_\d{6,}$/.test(entry.reportId) || !Number.isSafeInteger(entry.sheetId) || entry.sheetId < 0 ||
      protectedArchiveNames.includes(entry.sheetName) || /^_KUB_/i.test(entry.sheetName)) throw new Error('INVALID_ARCHIVE_IDENTITY');
  }
  private find(reportId: string, sheetId: number) {
    if (!/^MC_\d{6,}$/.test(reportId) || !Number.isSafeInteger(sheetId) || sheetId < 0) throw new Error('INVALID_ARCHIVE_IDENTITY');
    const operation = this.store.operation(reportId);
    if (operation?.state === 'PENDING') throw new Error(`${operation.kind}_RECOVERY_REQUIRED`);
    const matches = this.store.entries().filter(e => e.reportId === reportId);
    if (matches.length !== 1 || matches[0].sheetId !== sheetId) throw new Error('ARCHIVE_ID_MISMATCH');
    this.identity(matches[0]); this.store.verify(matches[0]); return matches[0];
  }
  private locked<T>(action: ArchiveAction, fn: () => T): T {
    this.policy.authorize(action);
    if (!this.store.lock()) throw new Error('REPORT_BUSY');
    try { return fn(); } finally { this.store.unlock(); }
  }
  private url(id: number) { return `https://docs.google.com/spreadsheets/d/${REPORTING_ID}/edit#gid=${id}`; }
}
