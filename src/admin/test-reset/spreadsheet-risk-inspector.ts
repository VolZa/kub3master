import type { SpreadsheetPort } from './test-reset';

type SpreadsheetInspectionReason = 'SPREADSHEET_ACCESS_FAILED' | 'SHEET_READ_FAILED' | 'RISK_SCAN_LIMIT';
export type InspectionAccessFailure = 'HTTP_401' | 'HTTP_403' | 'HTTP_404' | 'HTTP_OTHER' | 'REQUEST_FAILED';
export type InspectionApiReason = 'SERVICE_DISABLED' | 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' | 'PERMISSION_DENIED' | 'UNKNOWN';
export interface InspectionHeaderFlags { hasContentLength: boolean; isJsonContentType: boolean; hasContentEncoding: boolean }
export const INSPECTION_DETAILS = ['CONTENT_TYPE_INVALID', 'BODY_TOO_LARGE', 'JSON_INVALID', 'ROOT_INVALID',
  'SHEET_PROPERTIES_INVALID', 'GRID_DATA_MISSING', 'GRID_DATA_INVALID', 'DATE_TIME_UNSUPPORTED',
  'EFFECTIVE_ERROR_UNSUPPORTED', 'CELL_FEATURE_UNSUPPORTED', 'CELL_SCHEMA_INVALID', 'UNKNOWN'] as const;
export type InspectionDetail = typeof INSPECTION_DETAILS[number];
/** Readiness diagnostics carry only the locally determined scan stage, never an API exception. */
export class SpreadsheetInspectionError extends Error {
  constructor(readonly reason: SpreadsheetInspectionReason, readonly accessFailure?: InspectionAccessFailure,
    readonly apiReason?: InspectionApiReason, readonly headerFlags?: InspectionHeaderFlags,
    readonly detail?: InspectionDetail) { super('SOURCE_INSPECTION_FAILED'); }
}
/** Only the read surface consumed by this scanner, also implemented by the REST adapter. */
export interface RiskReadApi {
  openById(id: string): { getId(): string; getSheets(): {
    getName(): string; getLastRow(): number; getLastColumn(): number; getMaxRows(): number; getMaxColumns(): number;
    getRange(row: number, column: number, height: number, width: number): {
      getFormulas(): string[][]; getValues(): unknown[][]; getNotes(): string[][]; getNumberFormats(): string[][];
      getRichTextValues(): ({ getLinkUrl(): string | null; getRuns(): { getText(): string; getLinkUrl(): string | null }[] } | null)[][];
    };
  }[] };
}
export function gasSpreadsheetInspector(api: RiskReadApi, maxCells = 250000,
  hash?: (text: string) => string, readinessDiagnostics = false): SpreadsheetPort {
  return { inspect(fileId, productionIds) {
    let reason: SpreadsheetInspectionReason = 'SPREADSHEET_ACCESS_FAILED';
    try {
      const book = api.openById(fileId);
      reason = 'SHEET_READ_FAILED';
      const sheets = book.getSheets(), hazards: string[] = [];
      let cells = 0; const commitments: string[] = [];
      for (const sheet of sheets) {
        const rows = sheet.getLastRow(), columns = sheet.getLastColumn();
        cells += rows * columns;
        if (hash) commitments.push(hash(JSON.stringify(['SHEET_V1', sheet.getName(), rows, columns, sheet.getMaxRows(), sheet.getMaxColumns()])));
        if (!Number.isSafeInteger(cells) || cells > maxCells) { reason = 'RISK_SCAN_LIMIT'; throw Error('RISK_SCAN_LIMIT'); }
        if (!rows || !columns) continue;
        const height = Math.max(1, Math.floor(4096 / columns));
        for (let start = 1; start <= rows; start += height) {
          const range = sheet.getRange(start, 1, Math.min(height, rows - start + 1), columns);
          const formulas = range.getFormulas(), values = range.getValues(), rich = range.getRichTextValues();
          if (hash) {
            const typed = values.map(row => row.map(v => v instanceof Date ? ['date', v.toISOString()] : [typeof v, v]));
            const links = rich.map(row => row.map(v => v ? [v.getLinkUrl(), v.getRuns().map(run => [run.getText(), run.getLinkUrl()])] : null));
            commitments.push(hash(JSON.stringify(['CELLS_V1', start, formulas, typed, links, range.getNotes(), range.getNumberFormats()])));
          }
          for (let r = 0; r < values.length; r++) for (let c = 0; c < columns; c++) {
            const text = `${formulas[r]?.[c] ?? ''}\n${String(values[r][c] ?? '')}`;
            const link = rich[r]?.[c];
            if (/\b(?:IMPORTRANGE|IMPORTDATA|IMPORTXML|IMPORTHTML|IMAGE|GOOGLEFINANCE|HYPERLINK)\s*\(/i.test(text) ||
              /https?:\/\//i.test(text) || productionIds.some(id => text.includes(id)) ||
              (link && (link.getLinkUrl() || link.getRuns().some(run => run.getLinkUrl())))) {
              // Store location only, never copy source cell contents into diagnostics.
              if (hazards.length < 20) hazards.push(`${sheet.getName()}!R${start + r}C${c + 1}`);
            }
          }
        }
      }
      return { id: book.getId(), sheets: sheets.map(s => s.getName()), hazards,
        ...(hash ? { fingerprint: hash(JSON.stringify(['WORKBOOK_CONTENT_V1', commitments])) } : {}) };
    } catch (error) {
      if (readinessDiagnostics) throw error instanceof SpreadsheetInspectionError ? error : new SpreadsheetInspectionError(reason);
      throw error;
    }
  } };
}

