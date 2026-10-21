import type { ReportSnapshot } from './report-snapshot';
import { REPORTING_ID } from './current-report-writer';
export const REPORT_INDEX_HEADERS = ['ReportID', 'SheetID', 'SheetName', 'SourceSheetID', 'SavedAt', 'HouseCode', 'ProductCode', 'DateFrom', 'DateTo', 'Method', 'RebarLoss', 'RolledLoss', 'ConcreteLoss', 'BOMBasis'] as const;
export interface SavedReport {
  reportId: string; sheetId: number; sheetName: string; sourceSheetId: number; savedAt: string;
  snapshot: ReportSnapshot;
}
export interface SaveAttempt {
  state: 'PENDING' | 'COMPLETE' | 'DELETED'; report: Omit<SavedReport, 'sheetId'> & { sheetId?: number };
}
export interface SavedReportStore {
  lock(): boolean; unlock(): void;
  currentId(): number | undefined;
  snapshot(id: number): ReportSnapshot;
  attempt(source: number): SaveAttempt | undefined;
  persist(source: number, attempt: SaveAttempt): void;
  reserveId(): string;
  copyAndVerify(source: number, attempt: SaveAttempt): number;
  register(report: SavedReport): void;
  confirm(report: SavedReport): void;
}
export class SaveMaterialConsumptionReportUseCase {
  constructor(private readonly store: SavedReportStore) {}
  execute(sourceSheetId: number) {
    if (!Number.isSafeInteger(sourceSheetId) || sourceSheetId < 0) throw new Error('INVALID_SOURCE_SHEET_ID');
    if (!this.store.lock()) throw new Error('REPORT_BUSY');
    try {
      if (this.store.currentId() !== sourceSheetId) throw new Error('STALE_CURRENT_REPORT');
      const prior = this.store.attempt(sourceSheetId);
      if (prior) {
        if (prior.state === 'DELETED') throw new Error(`SAVED_REPORT_DELETED: ${prior.report.reportId}`);
        if (prior.state !== 'COMPLETE' || prior.report.sheetId === undefined) throw new Error(`SAVE_RECOVERY_REQUIRED: ${JSON.stringify(prior)}`);
        this.store.confirm(prior.report as SavedReport);
        return this.receipt('ALREADY_SAVED', prior.report as SavedReport);
      }
      const snapshot = this.store.snapshot(sourceSheetId);
      const reportId = this.store.reserveId();
      const attempt: SaveAttempt = { state: 'PENDING', report: { reportId, sheetName: reportId, sourceSheetId,
        savedAt: new Date().toISOString(), snapshot } };
      // Durable intent BEFORE copy: uncertain copy/registration responses cannot create a duplicate.
      this.store.persist(sourceSheetId, attempt);
      try {
      const sheetId = this.store.copyAndVerify(sourceSheetId, attempt);
      attempt.report.sheetId = sheetId;
      this.store.persist(sourceSheetId, attempt);
      const report = attempt.report as SavedReport;
      this.store.register(report);
      this.store.confirm(report);
      attempt.state = 'COMPLETE'; this.store.persist(sourceSheetId, attempt);
      return this.receipt('OK', report);
      } catch (error) {
        throw new Error(`SAVE_RECOVERY_REQUIRED: ${JSON.stringify(attempt)}; ${String(error)}`);
      }
    } finally { this.store.unlock(); }
  }
  private receipt(status: 'OK' | 'ALREADY_SAVED', report: SavedReport) {
    return { status, reportId: report.reportId, sheetId: report.sheetId, sheetName: report.sheetName,
      url: `https://docs.google.com/spreadsheets/d/${REPORTING_ID}/edit#gid=${report.sheetId}` };
  }
}
