import { afterEach, expect, it, vi } from 'vitest';
import { GoogleSheetsGroupedReportRenderer } from './grouped-report-renderer';
import { GasCurrentReportStore, GoogleSheetsCurrentReportWriter, CURRENT_REPORT, REPORTING_ID } from './current-report-writer';
import type { CurrentReportStore } from './current-report-writer';
import { CurrentReportOutput } from './current-report-output';
import type { MaterialConsumptionReportDataset } from '../../modules/reports/material-consumption/material-consumption-report.dto';
import { GroupedByProductPresenter } from '../../modules/reports/material-consumption/grouped-by-product.presenter';

const request = { houseCode: 'H001', dateFrom: '2026-10-01', lossPercents: { rebar: 7, rolled: 2.5, concrete: 0 } };
afterEach(() => vi.unstubAllGlobals());
function dataset(): MaterialConsumptionReportDataset {
  return { timeZone: 'Europe/Kyiv', bomBasis: 'CURRENT_BOM', period: { dateFrom: request.dateFrom }, products: [1, 2].map(n => ({
    productId: `P${n}`, productCode: `П-${n}`, productName: 'Плита', productQty: n, manufacturingIds: [`M${n}`],
    materials: [
      { stage: 'LOSSES_APPLIED', materialId: 'R', code: 'R', name: 'Арматура', unit: 'кг', group: 'REBAR', baseQty: 1.123456789, lossPercent: 7, lossQty: 0.07864197523, totalQty: 1.20209876423 },
      { stage: 'LOSSES_APPLIED', materialId: 'S', code: 'S', name: 'Прокат', unit: 'кг', group: 'ROLLED', baseQty: 4, lossPercent: 2.5, lossQty: 0.1, totalQty: 4.1 },
      { stage: 'LOSSES_APPLIED', materialId: '3201', code: 'C20/25', name: 'Бетон C20/25', unit: 'м3', group: 'CONCRETE', baseQty: 2, lossPercent: 0, lossQty: 0, totalQty: 2 },
    ],
  })) };
}
const render = () => new GoogleSheetsGroupedReportRenderer().render(new GroupedByProductPresenter().present(dataset()), request, '2026-10-21');
class Store implements CurrentReportStore {
  sheets = new Map<number, string>([[1, CURRENT_REPORT], [2, 'ВідомістьВитрат'], [3, 'Аркуш2'], [4, 'ReportIndex']]);
  counter = 10; held = false; fail = ''; faultUsed = false; writes: number[] = [];
  lock() { if (this.held) return false; this.held = true; return true; }
  unlock() { this.held = false; }
  currentId() { return [...this.sheets].find(([, name]) => name === CURRENT_REPORT)?.[0]; }
  createStage() { if (this.fail === 'stage') throw new Error('stage failed'); const id = ++this.counter; this.sheets.set(id, `_KUB_STAGE_${id}`); return id; }
  populateAndVerify(id: number) { this.writes.push(id); if (this.fail === 'populate') throw new Error('write/readback failure'); }
  rename(id: number, name: string) {
    if (this.fail === 'restore' && id === 1 && name === CURRENT_REPORT) throw new Error('restore failed');
    if ((this.fail === 'rename' || this.fail === 'restore') && id > 10 && name === CURRENT_REPORT) throw new Error('rename failed');
    if (this.fail === 'old-response' && id === 1 && !this.faultUsed) { this.faultUsed = true; this.sheets.set(id, name); throw new Error('old rename response lost'); }
    this.sheets.set(id, name);
    if (this.fail === 'new-response' && id > 10 && name === CURRENT_REPORT && !this.faultUsed) { this.faultUsed = true; throw new Error('new rename response lost'); }
  }
  name(id: number) { return this.sheets.get(id)!; }
  backupName(id: number) { return `_KUB_PREVIOUS_${id}`; }
  deleted: number[] = [];
  deletePrevious(id: number, expectedName: string, publishedId: number) {
    if (this.currentId() !== publishedId || this.name(id) !== expectedName || id === publishedId) throw new Error('unsafe');
    if (this.fail === 'cleanup') throw new Error('delete failed');
    this.deleted.push(id); this.sheets.delete(id);
    if (this.fail === 'cleanup-response') throw new Error('delete response lost');
  }
}
it('renders vertical product groups, exact quantities, three norms and display-only unit formats', () => {
  const table = render();
  expect(table.productCount).toBe(2); expect(table.materialRowCount).toBe(6);
  expect(table.groupRows).toEqual([{ heading: 13, start: 14, count: 3 }, { heading: 17, start: 18, count: 3 }]);
  expect(table.values[13]).toEqual(['Арматура', 'кг', 1.123456789, 7, 0.07864197523, 1.20209876423]);
  expect(table.formats[13][2]).toBe('0.000');
  expect(table.values[15][1]).toBe('м³'); expect(table.formats[15][2]).toBe('0.00000');
  expect(table.values[7][1]).toBe(7); expect(table.values[8][1]).toBe(2.5); expect(table.values[9][1]).toBe(0);
  expect(new Date(((table.values[5][1] as number) - 25569) * 86400000).toISOString().slice(0, 10)).toBe('2026-10-21');
  expect(table.formats[5][1]).toBe('dd-mm-yyyy');
});
it('renders a single product without a mixed-unit grand total', () => {
  const d = dataset(); d.products.pop();
  const table = new GoogleSheetsGroupedReportRenderer().render(new GroupedByProductPresenter().present(d), request, '2026-10-21');
  expect(table.materialRowCount).toBe(3); expect(table.values).toHaveLength(16);
});
it('returns exact sheet URL and deletes only this operation previous result after publication', () => {
  const store = new Store(), writer = new GoogleSheetsCurrentReportWriter(store);
  const first = writer.write(render()); const second = writer.write(render());
  expect(first).toMatchObject({ status: 'OK', spreadsheetId: REPORTING_ID, sheetId: 11, productCount: 2, materialRowCount: 6,
    url: `https://docs.google.com/spreadsheets/d/${REPORTING_ID}/edit#gid=11` });
  expect(second).toMatchObject({ sheetId: 12, previousSheetId: 11 });
  expect(store.sheets.has(1)).toBe(false); expect(store.sheets.has(11)).toBe(false);
  expect(store.deleted).toEqual([1, 11]); expect(second).toMatchObject({ status: 'OK', cleanup: 'DELETED' });
  expect([store.sheets.get(2), store.sheets.get(3), store.sheets.get(4)]).toEqual(['ВідомістьВитрат', 'Аркуш2', 'ReportIndex']);
  expect(store.held).toBe(false);
});
it('creates the current sheet when none exists', () => {
  const store = new Store(); store.sheets.delete(1);
  expect(new GoogleSheetsCurrentReportWriter(store).write(render())).toMatchObject({ status: 'OK', sheetId: 11, previousSheetId: undefined, cleanup: 'NOT_NEEDED' });
  expect(store.deleted).toEqual([]);
});
it.each(['stage', 'populate', 'rename', 'old-response', 'new-response'])('preserves prior current report on %s failure and releases lock', fail => {
  const store = new Store(); store.fail = fail;
  expect(() => new GoogleSheetsCurrentReportWriter(store).write(render())).toThrow();
  expect(store.currentId()).toBe(1); expect(store.held).toBe(false);
  expect(store.sheets.get(2)).toBe('ВідомістьВитрат');
  expect(store.deleted).toEqual([]);
});
it('reports recovery IDs without deleting the previous result if recovery fails', () => {
  const store = new Store(); store.fail = 'restore';
  expect(() => new GoogleSheetsCurrentReportWriter(store).write(render())).toThrow('REPORT_RECOVERY_REQUIRED: previous=1, stage=11');
  expect(store.sheets.has(1)).toBe(true); expect(store.held).toBe(false);
});
it('rejects concurrent writer without touching sheets', () => {
  const store = new Store(); store.held = true;
  const before = [...store.sheets];
  expect(() => new GoogleSheetsCurrentReportWriter(store).write(render())).toThrow('REPORT_BUSY');
  expect([...store.sheets]).toEqual(before);
});
it('does not call writer for EMPTY or a failed dataset; does not recalculate losses', () => {
  const store = new Store(), output = new CurrentReportOutput({ execute: () => dataset() }, new GoogleSheetsCurrentReportWriter(store));
  expect(output.generate(request, new Date('2026-10-21T10:00:00Z'))).toMatchObject({ status: 'OK' });
  expect(store.writes).toHaveLength(1);
  const before = [...store.sheets];
  const empty = new CurrentReportOutput({ execute: () => ({ ...dataset(), products: [] }) }, new GoogleSheetsCurrentReportWriter(store));
  expect(empty.generate(request)).toEqual({ status: 'EMPTY' }); expect([...store.sheets]).toEqual(before);
  const broken = new CurrentReportOutput({ execute: () => { throw new Error('INCOMPLETE_BOM'); } }, new GoogleSheetsCurrentReportWriter(store));
  expect(() => broken.generate(request)).toThrow('INCOMPLETE_BOM'); expect([...store.sheets]).toEqual(before);
});

function gasMock(corrupt = '', dateDisplay?: string) {
  let stored: (string | number)[][] = [];
  const range: any = {};
  for (const method of ['setNumberFormats', 'setVerticalAlignment', 'setWrap', 'merge', 'setFontWeight', 'setFontSize', 'setBackground', 'setHorizontalAlignment', 'shiftRowGroupDepth']) {
    range[method] = vi.fn(() => range);
  }
  range.setValues = vi.fn((values: (string | number)[][]) => { stored = values; return range; });
  range.getValues = () => stored.map((row, r) => row.map((v, c) => {
    if (corrupt === 'value' && r === 13 && c === 2) return 999;
    return typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
  }));
  range.getDisplayValues = () => stored.map(row => row.map(v => dateDisplay ?? (typeof v === 'number'
    ? new Date((v - 25569) * 86400000).toISOString().slice(0, 10).split('-').reverse().join('-') : String(v))));
  range.getFormulas = () => stored.map((row, r) => row.map((_, c) => corrupt === 'formula' && r === 13 && c === 0 ? '=1+1' : ''));
  const sheet = { getSheetId: () => 11, getName: () => '_KUB_STAGE_test', getMaxRows: () => 1000,
    getRange: vi.fn(() => range), setColumnWidth: vi.fn(), setColumnWidths: vi.fn(), setFrozenRows: vi.fn() };
  const book = { getSheets: () => [sheet] };
  const openById = vi.fn(() => book), flush = vi.fn();
  vi.stubGlobal('SpreadsheetApp', { openById, flush });
  return { store: new GasCurrentReportStore(), openById, range, sheet };
}
it('GAS adapter writes only staging in exact REPORTING, escapes formula input and applies groups/formats', () => {
  const mock = gasMock();
  const table = render(); table.values[13][0] = '=IMPORTXML("x")';
  mock.store.populateAndVerify(11, table);
  expect(mock.openById).toHaveBeenCalledWith(REPORTING_ID);
  expect(mock.range.setValues.mock.calls[0][0][13][0]).toBe("'=IMPORTXML(\"x\")");
  expect(table.values[13][0]).toBe('=IMPORTXML("x")');
  expect(mock.range.shiftRowGroupDepth).toHaveBeenCalledTimes(2);
  expect(mock.range.setNumberFormats).toHaveBeenCalledWith(table.formats);
  expect(mock.sheet.setFrozenRows).toHaveBeenCalledWith(12);
});
it.each(['value', 'formula'])('GAS adapter rejects %s readback before publishing', fault => {
  const mock = gasMock(fault);
  expect(() => mock.store.populateAndVerify(11, render())).toThrow(/REPORT_READBACK_MISMATCH|REPORT_FORMULA_DETECTED/);
});
it('GAS adapter rejects incorrect displayed dates', () => {
  const mock = gasMock('', '10-21-2026');
  expect(() => mock.store.populateAndVerify(11, render())).toThrow('REPORT_DATE_READBACK_MISMATCH');
});

it('persists generation snapshot on staging before publication and verifies metadata readback', () => {
  const mock = gasMock(); const metadata: { key: string; value: string }[] = [];
  Object.assign(mock.sheet, {
    addDeveloperMetadata: (key: string, value: string) => metadata.push({ key, value }),
    getDeveloperMetadata: () => metadata.map(m => ({ getKey: () => m.key, getValue: () => m.value })),
  });
  const table = render();
  table.snapshot = { schema: 1, reportType: 'material-consumption', method: 'normative', bomBasis: 'CURRENT_BOM',
    generatedDate: '2026-10-21', filters: { houseCode: 'H001' }, lossPercents: { ...request.lossPercents }, manufacturingIds: ['M1'] };
  mock.store.populateAndVerify(11, table);
  expect(metadata).toHaveLength(1); expect(JSON.parse(metadata[0].value)).toEqual(table.snapshot);
});

it.each(['cleanup', 'cleanup-response'])('returns OK with warning after %s failure without rolling back or retrying', fail => {
  const store = new Store(); store.fail = fail;
  const receipt = new GoogleSheetsCurrentReportWriter(store).write(render());
  expect(receipt).toMatchObject({ status: 'OK', sheetId: 11, cleanup: 'WARNING',
    warnings: [{ code: 'REPORT_CLEANUP_REQUIRED', sheetId: 1 }] });
  expect(store.currentId()).toBe(11); expect(store.writes).toEqual([11]);
  expect(store.held).toBe(false);
});
it('does not clean old crash remnants or archives on a later manual run', () => {
  const store = new Store(); store.fail = 'cleanup';
  store.sheets.set(1922174082, '_KUB_PREVIOUS_1922174082_old');
  store.sheets.set(20, 'Saved report');
  const writer = new GoogleSheetsCurrentReportWriter(store);
  writer.write(render()); store.fail = ''; writer.write(render());
  expect(store.sheets.get(1)).toBe('_KUB_PREVIOUS_1');
  expect(store.sheets.get(1922174082)).toBe('_KUB_PREVIOUS_1922174082_old');
  expect(store.sheets.get(20)).toBe('Saved report'); expect(store.deleted).toEqual([11]);
});

function cleanupGas() {
  const mock = gasMock();
  let locked = false;
  vi.stubGlobal('LockService', { getScriptLock: () => ({ tryLock: () => { locked = true; return true; }, hasLock: () => locked, releaseLock: () => { locked = false; } }) });
  vi.stubGlobal('Utilities', { getUuid: () => 'operation-token' });
  const names = new Map<number, string>([[1, CURRENT_REPORT], [2, 'ВідомістьВитрат'], [3, 'Аркуш2'], [4, 'ReportIndex'],
    [5, 'Archive'], [6, '_KUB_PREVIOUS_6_old'], [11, '_KUB_STAGE_test']]);
  const sheets = () => [...names].map(([id]) => ({ ...mock.sheet, getSheetId: () => id, getName: () => names.get(id), setName: (name: string) => names.set(id, name) }));
  const deleteSheet = vi.fn(sheet => { names.delete(sheet.getSheetId()); });
  mock.openById.mockReturnValue({ getSheets: sheets, getSheetByName: (name: string) => sheets().find(s => s.getName() === name), deleteSheet } as any);
  return { store: mock.store, names, deleteSheet };
}
it('GAS cleanup deletes the exact captured ID only after verified publication, and consumes authorization', () => {
  const g = cleanupGas(); g.store.lock();
  const name = g.store.backupName(1);
  g.store.populateAndVerify(11, render());
  g.store.rename(1, name); g.store.rename(11, CURRENT_REPORT);
  g.store.deletePrevious(1, name, 11);
  expect(g.deleteSheet).toHaveBeenCalledTimes(1);
  expect(g.deleteSheet.mock.calls[0][0].getSheetId()).toBe(1);
  expect(g.names.has(1)).toBe(false); expect(g.names.get(11)).toBe(CURRENT_REPORT);
  expect(() => g.store.deletePrevious(1, name, 11)).toThrow();
  g.store.unlock();
});
it.each([2, 3, 4, 5, 6, 11])('GAS cleanup rejects protected/archive/unknown identity %s even under lock', id => {
  const g = cleanupGas(); g.store.lock();
  const name = g.store.backupName(1);
  g.store.populateAndVerify(11, render()); g.store.rename(1, name); g.store.rename(11, CURRENT_REPORT);
  expect(() => g.store.deletePrevious(id, g.names.get(id)!, 11)).toThrow('UNSAFE_REPORT_CLEANUP');
  expect(g.deleteSheet).not.toHaveBeenCalled(); g.store.unlock();
});
it('GAS cleanup refuses renamed backup, unverified stage and released lock', () => {
  const g = cleanupGas(); g.store.lock(); const name = g.store.backupName(1);
  g.store.rename(1, name); g.store.rename(11, CURRENT_REPORT);
  expect(() => g.store.deletePrevious(1, name, 11)).toThrow('UNSAFE_REPORT_CLEANUP');
  g.store.rename(11, '_KUB_STAGE_test'); g.store.populateAndVerify(11, render()); g.store.rename(11, CURRENT_REPORT);
  g.store.rename(1, 'Archive');
  expect(() => g.store.deletePrevious(1, name, 11)).toThrow('UNSAFE_REPORT_CLEANUP');
  g.store.rename(1, name); g.store.unlock();
  expect(() => g.store.deletePrevious(1, name, 11)).toThrow('UNSAFE_REPORT_CLEANUP');
  expect(g.deleteSheet).not.toHaveBeenCalled();
});
