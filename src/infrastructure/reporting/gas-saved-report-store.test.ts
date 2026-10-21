import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { GasSavedReportStore } from './gas-saved-report-store';
import { SaveMaterialConsumptionReportUseCase, REPORT_INDEX_HEADERS } from './saved-report';
import { REPORTING_ID, CURRENT_REPORT } from './current-report-writer';
import { SNAPSHOT_KEY } from './report-snapshot';
import { GasArchiveManagementStore } from './gas-archive-management-store';
import { SavedReportsManagement } from './archive-management';
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const properties = new Map<string, string>(); let locked = false, nextId = 100, copies = 0;
  const sheets: any[] = [];
  const make = (name: string, id: number) => {
    const sheet: any = { name, id, cells: [] as any[][], meta: [] as any[], formula: false, width: 140, format: '0.00000',
      getName: () => sheet.name, getSheetId: () => id, setName: (n: string) => { sheet.name = n; },
      getDeveloperMetadata: () => sheet.meta.map((m: any) => ({ getKey: () => m.key, getValue: () => m.value })),
      addDeveloperMetadata: (key: string, value: string) => { sheet.meta.push({ key, value }); },
      getLastRow: () => sheet.cells.length, getLastColumn: () => Math.max(1, ...sheet.cells.map((r: any[]) => r.length)),
      getFrozenRows: () => 1, getFrozenColumns: () => 0, setFrozenRows: () => {},
      deleteRow: (row: number) => sheet.cells.splice(row - 1, 1),
      getColumnWidth: () => sheet.width, getRowHeight: () => 21, getRowGroupDepth: () => 1,
      getConditionalFormatRules: () => [], getCharts: () => [],
      getPivotTables: () => [], getDataSourceTables: () => [],
    };
    sheet.getRange = (r: number, c: number, rows = 1, cols = 1) => {
      const range: any = {};
      range.getValues = () => Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => sheet.cells[r - 1 + i]?.[c - 1 + j] ?? ''));
      range.setValues = (data: any[][]) => { data.forEach((row, i) => { sheet.cells[r - 1 + i] ??= []; row.forEach((v, j) => sheet.cells[r - 1 + i][c - 1 + j] = v); }); return range; };
      range.setNumberFormats = () => range;
      range.setNumberFormat = () => range;
      range.getValue = () => range.getValues()[0][0];
      range.setValue = (value: any) => range.setValues([[value]]);
      range.getFormulas = () => range.getValues().map((row: any[]) => row.map(() => sheet.formula ? '=1' : ''));
      range.getDataValidations = () => range.getValues().map((row: any[]) => row.map(() => null));
      for (const method of ['getNumberFormats', 'getBackgrounds', 'getFontWeights', 'getFontSizes', 'getFontColors', 'getFontFamilies', 'getHorizontalAlignments', 'getVerticalAlignments', 'getWrapStrategies']) range[method] = () => range.getValues().map((row: any[]) => row.map(() => sheet.format));
      range.getMergedRanges = () => []; range.getNumRows = () => rows; range.getNumColumns = () => cols;
      return range;
    };
    sheet.getDataRange = () => sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
    sheet.copyTo = (target: any) => {
      expect(target).toBe(book); copies++;
      const copy = make('Copy', ++nextId);
      copy.cells = structuredClone(sheet.cells); copy.meta = structuredClone(sheet.meta); copy.width = sheet.width; copy.format = sheet.format;
      sheets.push(copy); return copy;
    };
    return sheet;
  };
  const book = { getSheetByName: (name: string) => sheets.find(s => s.name === name) ?? null, getSheets: () => sheets,
    insertSheet: (name: string) => { const sheet = make(name, ++nextId); sheets.push(sheet); return sheet; },
    deleteSheet: (sheet: any) => { const i = sheets.findIndex(s => s.id === sheet.getSheetId()); if (i < 0) throw new Error('missing'); sheets.splice(i, 1); } };
  const source = make(CURRENT_REPORT, 10);
  source.cells = [['generated', new Date('2026-06-30T00:00:00Z')], ['concrete', 1.34334]];
  source.meta = [{ key: SNAPSHOT_KEY, value: JSON.stringify({ schema: 1, reportType: 'material-consumption', method: 'normative', bomBasis: 'CURRENT_BOM',
    generatedDate: '2026-06-30', filters: { houseCode: 'H001', productCode: 'П-1', dateFrom: '2026-06-30', dateTo: '2026-07-01' },
    lossPercents: { rebar: 7, rolled: 5, concrete: 2 }, manufacturingIds: ['М00000075'] }) }];
  sheets.push(source, make('ВідомістьВитрат', 0), make('Аркуш2', 2));
  vi.stubGlobal('SpreadsheetApp', { openById: vi.fn((id: string) => { expect(id).toBe(REPORTING_ID); return book; }), flush: () => {} });
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ getProperties: () => Object.fromEntries(properties), getProperty: (key: string) => properties.get(key) ?? null, setProperty: (key: string, value: string) => properties.set(key, value) }) });
  vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => { if (locked) return false; locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) });
  vi.stubGlobal('Utilities', { newBlob: (s: string) => ({ getBytes: () => Buffer.from(s) }), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_a: any, s: string) => [...createHash('sha256').update(s).digest()] });
  return { source, sheets, book, copies: () => copies, store: new GasSavedReportStore(), properties };
}
it('GAS adapter copies values/types/formats/widths and creates idempotent ReportIndex with correct metadata', () => {
  const g = setup(); const save = new SaveMaterialConsumptionReportUseCase(g.store);
  const result = save.execute(10); expect(result).toMatchObject({ status: 'OK', reportId: 'MC_000001' });
  const archive = g.book.getSheetByName('MC_000001');
  expect(archive.cells).toEqual(g.source.cells); expect(typeof archive.cells[1][1]).toBe('number');
  expect(archive.cells[0][1]).toBeInstanceOf(Date); expect(archive.width).toBe(140); expect(archive.format).toBe('0.00000');
  const index = g.book.getSheetByName('ReportIndex'); expect(index.cells[0]).toEqual(REPORT_INDEX_HEADERS);
  expect(index.cells[1].slice(5)).toEqual(['H001', 'П-1', '2026-06-30', '2026-07-01', 'normative', 7, 5, 2, 'CURRENT_BOM']);
  expect(save.execute(10).status).toBe('ALREADY_SAVED'); expect(g.copies()).toBe(1); expect(index.cells).toHaveLength(2);
  g.source.cells[1][1] = 99; expect(archive.cells[1][1]).toBe(1.34334);
  expect(g.sheets.map(s => s.name)).toContain('ВідомістьВитрат');
});
it('blocks legacy metadata-less reports and formulas before copying or ReportIndex creation', () => {
  const g = setup(); g.source.meta = [];
  expect(() => new SaveMaterialConsumptionReportUseCase(g.store).execute(10)).toThrow('CURRENT_REPORT_METADATA_MISSING');
  expect(g.copies()).toBe(0); expect(g.book.getSheetByName('ReportIndex')).toBeNull();
});
it('blocks formula dependencies and mismatched readback without removing partial copies', () => {
  const g = setup(); g.source.formula = true;
  expect(() => new SaveMaterialConsumptionReportUseCase(g.store).execute(10)).toThrow('UNSAFE_ARCHIVE_DEPENDENCY');
  g.source.formula = false;
  const originalCopy = g.source.copyTo;
  g.source.copyTo = (book: any) => { const copy = originalCopy(book); copy.width = 999; return copy; };
  expect(() => new SaveMaterialConsumptionReportUseCase(g.store).execute(10)).toThrow('ARCHIVE_READBACK_MISMATCH');
  expect(g.copies()).toBe(1); expect(g.book.getSheetByName('MC_000001')).toBeTruthy();
  expect(() => new SaveMaterialConsumptionReportUseCase(g.store).execute(10)).toThrow('SAVE_RECOVERY_REQUIRED');
  expect(g.copies()).toBe(1);
});

it('GAS Rename reconciles physical/index/save journal while preserving ID and archive content', () => {
  const g = setup(); const save = new SaveMaterialConsumptionReportUseCase(g.store); const saved = save.execute(10);
  const original = structuredClone(g.book.getSheetByName('MC_000001').cells);
  const manage = new SavedReportsManagement(new GasArchiveManagementStore(), { authorize() {} });
  expect(manage.list()[0].state).toBe('ACTIVE');
  expect(manage.rename(saved.reportId, saved.sheetId, 'Reviewed June')).toMatchObject({ status: 'OK', sheetId: saved.sheetId, reportId: 'MC_000001' });
  expect(g.book.getSheetByName('Reviewed June').cells).toEqual(original);
  expect(g.book.getSheetByName('ReportIndex').cells[1][2]).toBe('Reviewed June');
  expect(save.execute(10)).toMatchObject({ status: 'ALREADY_SAVED', sheetName: 'Reviewed June' });
});
it('GAS Delete removes exact archive/index row, leaves tombstone and never reuses ReportID', () => {
  const g = setup(); const save = new SaveMaterialConsumptionReportUseCase(g.store); const saved = save.execute(10);
  const manage = new SavedReportsManagement(new GasArchiveManagementStore(), { authorize() {} });
  manage.delete(saved.reportId, saved.sheetId);
  expect(g.book.getSheetByName('MC_000001')).toBeNull(); expect(g.book.getSheetByName('ReportIndex').cells).toHaveLength(1);
  expect(() => save.execute(10)).toThrow('SAVED_REPORT_DELETED');
  expect(g.store.attempt(10)?.state).toBe('DELETED'); expect(g.book.getSheetByName('ВідомістьВитрат')).toBeTruthy();
  g.store.lock(); expect(g.store.reserveId()).toBe('MC_000002'); g.store.unlock();
});
it('GAS partial Delete retains recovery intent and does not repeat physical deletion', () => {
  const g = setup(); const saved = new SaveMaterialConsumptionReportUseCase(g.store).execute(10);
  const index = g.book.getSheetByName('ReportIndex'); index.deleteRow = () => { throw new Error('index unavailable'); };
  const manage = new SavedReportsManagement(new GasArchiveManagementStore(), { authorize() {} });
  expect(() => manage.delete(saved.reportId, saved.sheetId)).toThrow('DELETE_RECOVERY_REQUIRED');
  expect(manage.list()[0].state).toBe('DIAGNOSTIC');
  expect(() => manage.delete(saved.reportId, saved.sheetId)).toThrow('DELETE_RECOVERY_REQUIRED');
  expect(g.store.attempt(10)?.state).toBe('PENDING');
});

it('GAS shared lock excludes concurrent Save, Rename and Delete', () => {
  const g = setup(); const saved = new SaveMaterialConsumptionReportUseCase(g.store).execute(10);
  const manage = new SavedReportsManagement(new GasArchiveManagementStore(), { authorize() {} });
  g.store.lock();
  expect(() => manage.rename(saved.reportId, saved.sheetId, 'New')).toThrow('REPORT_BUSY');
  expect(() => manage.delete(saved.reportId, saved.sheetId)).toThrow('REPORT_BUSY');
  expect(() => new SaveMaterialConsumptionReportUseCase(new GasSavedReportStore()).execute(10)).toThrow('REPORT_BUSY');
  g.store.unlock();
});
