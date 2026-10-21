import { getMaterialConsumptionReportUseCase } from '../factories/material-consumption-report.factory';
import { getManufacturingRepository } from '../factories/manufacturing.factory';
import { SpreadsheetConfig } from '../../infrastructure/spreadsheets/SpreadsheetConfig';
import { kyivDate } from '../../modules/reports/material-consumption/material-consumption-report.use-case';
import { B2_CONTROL_REQUEST, prepareB2FirstWrite } from './material-report-first-write';
import { GasCurrentReportStore, GoogleSheetsCurrentReportWriter, REPORTING_ID } from '../../infrastructure/reporting/current-report-writer';

const FIRST_WRITE_MARKER = 'KUB_B2_FIRST_CONTROL_WRITE_M00000075_20261021';

/** Manual one-shot entrypoint. Persistent attempt marker is never automatically cleared. */
export function KUB_B2_firstControlledReportWrite() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(FIRST_WRITE_MARKER)) throw new Error('CONTROL_WRITE_ALREADY_ATTEMPTED: no retry');
  const before = controlSheetState();
  const dataset = getMaterialConsumptionReportUseCase().execute(B2_CONTROL_REQUEST);
  const table = prepareB2FirstWrite(dataset, kyivDate(new Date()));
  const attemptLock = LockService.getScriptLock();
  if (!attemptLock.tryLock(5000)) throw new Error('CONTROL_BUSY');
  try {
    if (properties.getProperty(FIRST_WRITE_MARKER)) throw new Error('CONTROL_WRITE_ALREADY_ATTEMPTED: no retry');
    properties.setProperty(FIRST_WRITE_MARKER, JSON.stringify({ attemptedAt: new Date().toISOString(), request: B2_CONTROL_REQUEST }));
  } finally { attemptLock.releaseLock(); }
  try {
    const receipt = new GoogleSheetsCurrentReportWriter(new GasCurrentReportStore()).write(table);
    if (receipt.status !== 'OK') throw new Error('UNEXPECTED_EMPTY');
    const after = controlSheetState();
    if (JSON.stringify(before.protected) !== JSON.stringify(after.protected)) throw new Error('PROTECTED_SHEETS_CHANGED');
    const sheet = SpreadsheetApp.openById(REPORTING_ID).getSheets().find(s => s.getSheetId() === receipt.sheetId)!;
    const range = sheet.getRange(1, 1, table.values.length, 6);
    const result = { status: 'PASS', label: 'КОНТРОЛЬНИЙ ТЕСТ', receipt, request: B2_CONTROL_REQUEST,
      products: dataset.products, readback: { displayValues: range.getDisplayValues(), numberFormats: range.getNumberFormats(),
        frozenRows: sheet.getFrozenRows(), materialGroupDepth: sheet.getRowGroupDepth(14) },
      protectedSheetsUnchanged: true, createdSheets: after.reporting.filter(s => !before.reporting.some(b => b.id === s.id)) };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    const result = { status: 'FAILED_NO_RETRY', error: String(error), before, after: controlSheetState() };
    console.log(JSON.stringify(result));
    return result;
  }
}

function controlSheetState() {
  const protectedSheets: { book: string; id: number; name: string; hash: string }[] = [];
  let reporting: { id: number; name: string }[] = [];
  for (const config of Object.values(SpreadsheetConfig)) {
    const book = SpreadsheetApp.openById(config.id);
    const sheets = book.getSheets();
    if (config.id === REPORTING_ID) reporting = sheets.map(s => ({ id: s.getSheetId(), name: s.getName() }));
    for (const sheet of sheets) {
      if (config.id === REPORTING_ID && !['ВідомістьВитрат', 'Аркуш2', 'ReportIndex'].includes(sheet.getName())) continue;
      const range = sheet.getDataRange();
      const content = JSON.stringify({ values: range.getValues(), formulas: range.getFormulas(),
        formats: range.getNumberFormats(), backgrounds: range.getBackgrounds() });
      const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, content, Utilities.Charset.UTF_8)
        .map(b => (b & 255).toString(16).padStart(2, '0')).join('');
      protectedSheets.push({ book: config.id, id: sheet.getSheetId(), name: sheet.getName(), hash });
    }
  }
  return { protected: protectedSheets, reporting };
}

/** Temporary manual read-only probe. No Spreadsheet writes or property writes. */
export function KUB_B2_readOnlyPreflight() {
  const access = Object.values(SpreadsheetConfig).map(config => {
    const book = SpreadsheetApp.openById(config.id);
    return { key: config.key, id: book.getId(), sheets: book.getSheets().map(s => ({ id: s.getSheetId(), name: s.getName() })) };
  });
  const useCase = getMaterialConsumptionReportUseCase();
  const facts = getManufacturingRepository().getAll();
  const active = facts.filter(f => f.status === 'ACTIVE');
  const seen = new Set<string>();
  const diagnostics: { manufacturingId: string; message: string }[] = [];
  for (const fact of active) {
    try {
      const date = kyivDate(fact.date);
      const key = JSON.stringify([fact.houseCode, fact.productCode, date]);
      if (seen.has(key)) continue;
      seen.add(key);
      const request = { houseCode: fact.houseCode, productCode: fact.productCode,
        dateFrom: date, dateTo: date, lossPercents: { rebar: 7, rolled: 5, concrete: 0 } };
      const dataset = useCase.execute(request);
      if (!dataset.products.length) throw new Error('EMPTY');
      if (dataset.products.some(p => p.materials.length > 50)) throw new Error('CONTROL_FIXTURE_TOO_LARGE');
      const result = { status: 'PASS', label: 'КОНТРОЛЬНИЙ ТЕСТ', access, activeCount: active.length, request, dataset, diagnostics };
      console.log(JSON.stringify(result));
      return result;
    } catch (error) {
      diagnostics.push({ manufacturingId: fact.id, message: String(error) });
    }
  }
  const result = { status: 'NO_ELIGIBLE_FACT', access, activeCount: active.length, diagnostics };
  console.log(JSON.stringify(result));
  return result;
}
