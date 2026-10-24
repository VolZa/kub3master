import type { UserInfoRuntime } from './admin-identity';
import { gasSpreadsheetInspector, SpreadsheetInspectionError, type RiskReadApi, type InspectionApiReason, type InspectionHeaderFlags, type InspectionDetail } from './spreadsheet-risk-inspector';
import type { SpreadsheetPort } from './test-reset';

export const SHEETS_READ_URL = 'https://sheets.googleapis.com/v4/spreadsheets/';
// No ranges: retrieve all sheets, including hidden sheets, and all non-default CellData.
// Whole CellData is intentional: a values-only response cannot prove rich-link coverage.
const FIELDS = 'spreadsheetId,sheets(properties,data(startRow,startColumn,rowData(values)))';
const MAX_RESPONSE_CHARS = 8000000;
const MAX_ERROR_BYTES = 16384;
function diagnose<T>(reason: 'SPREADSHEET_ACCESS_FAILED' | 'SHEET_READ_FAILED', detail: InspectionDetail, read: () => T): T {
  try { return read(); }
  catch (error) {
    if (error instanceof SpreadsheetInspectionError) throw error;
    throw new SpreadsheetInspectionError(reason, undefined, undefined, undefined, detail);
  }
}
function failCell(detail: InspectionDetail): never {
  throw new SpreadsheetInspectionError('SHEET_READ_FAILED', undefined, undefined, undefined, detail);
}
/** Only structured Google error fields are inspected. Messages/metadata never leave here. */
function forbiddenReason(response: ReturnType<UserInfoRuntime['fetch']>, flags: InspectionHeaderFlags): InspectionApiReason {
  try {
    const headers = response.getHeaders();
    const entries = Object.entries(object(headers));
    const header = (name: string) => entries.find(([key]) => key.toLowerCase() === name)?.[1];
    const mime = header('content-type'), length = header('content-length'), encoding = header('content-encoding');
    flags.hasContentLength = entries.some(([key]) => key.toLowerCase() === 'content-length');
    flags.isJsonContentType = typeof mime === 'string' && /^application\/json(?:\s*;|$)/i.test(mime);
    flags.hasContentEncoding = entries.some(([key]) => key.toLowerCase() === 'content-encoding');
    // HTTPResponse has no bounded/streaming body reader. Skip unknown-size or compressed
    // responses rather than read an unbounded body merely for optional diagnostics.
    // getContent()/getBlob() followed by slicing is already a full read; ungzip() has
    // no output-size bound. A compressed Content-Length cannot bound decoded JSON.
    if (typeof mime !== 'string' || !/^application\/json(?:\s*;|$)/i.test(mime) ||
      (encoding !== undefined && encoding !== 'identity') ||
      !['string', 'number'].includes(typeof length) || !/^\d{1,5}$/.test(String(length))) return 'UNKNOWN';
    const size = Number(length);
    if (!Number.isInteger(size) || size < 1 || size > MAX_ERROR_BYTES) return 'UNKNOWN';
    const body = response.getContentText();
    if (typeof body !== 'string' || body.length > MAX_ERROR_BYTES) return 'UNKNOWN';
    let bytes = 0;
    for (const char of body) { const code = char.codePointAt(0)!; bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4; }
    if (bytes !== size || bytes > MAX_ERROR_BYTES) return 'UNKNOWN';
    const error = object(object(JSON.parse(body)).error);
    if (error.code !== 403 || (error.status !== undefined && error.status !== 'PERMISSION_DENIED')) return 'UNKNOWN';
    const details = list(error.details);
    if (details.length > 16) return 'UNKNOWN';
    const reasons = new Set<InspectionApiReason>();
    for (const raw of details) {
      const detail = object(raw);
      if (typeof detail['@type'] !== 'string') return 'UNKNOWN';
      if (detail['@type'] !== 'type.googleapis.com/google.rpc.ErrorInfo') continue;
      if (detail.domain !== 'googleapis.com' ||
        (detail.metadata !== undefined && object(detail.metadata).service !== undefined && detail.metadata.service !== 'sheets.googleapis.com')) return 'UNKNOWN';
      if (detail.reason !== 'SERVICE_DISABLED' && detail.reason !== 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' && detail.reason !== 'PERMISSION_DENIED') return 'UNKNOWN';
      reasons.add(detail.reason);
    }
    if (reasons.size > 1) return 'UNKNOWN';
    return reasons.values().next().value ?? (error.status === 'PERMISSION_DENIED' ? 'PERMISSION_DENIED' : 'UNKNOWN');
  } catch { return 'UNKNOWN'; }
}
type Json = Record<string, any>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
  return value;
}
function list(value: unknown): unknown[] {
  if (value === undefined) return []; // Protobuf JSON omits default/empty repeated fields.
  if (!Array.isArray(value)) throw Error();
  return value;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw Error();
  return value as number;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw Error();
  return value;
}
function url(value: unknown): string | null {
  if (value === undefined) return null;
  const link = object(value);
  if (Object.keys(link).some(key => key !== 'uri')) throw Error();
  return text(link.uri);
}
function formatLink(value: unknown): string | null {
  if (value === undefined) return null;
  const format = object(value);
  return format.textFormat === undefined ? null : url(object(format.textFormat).link);
}
function scalar(value: unknown, formulaAllowed: boolean): string | number | boolean {
  if (value === undefined) return '';
  const item = object(value), keys = Object.keys(item);
  if (!keys.length) return '';
  if (keys.length !== 1) throw Error();
  switch (keys[0]) {
    case 'stringValue': return text(item.stringValue);
    case 'numberValue': if (!Number.isFinite(item.numberValue)) throw Error(); return item.numberValue;
    case 'boolValue': if (typeof item.boolValue !== 'boolean') throw Error(); return item.boolValue;
    case 'formulaValue': if (!formulaAllowed) throw Error(); return text(item.formulaValue);
    // Formula errors have no faithfully equivalent GAS getValues() representation here.
    case 'errorValue': if (!formulaAllowed) failCell('EFFECTIVE_ERROR_UNSUPPORTED'); throw Error();
    default: throw Error();
  }
}
function cell(value: unknown) {
  return diagnose('SHEET_READ_FAILED', 'CELL_SCHEMA_INVALID', () => {
    const data = object(value);
    const knownFields = ['userEnteredValue', 'effectiveValue', 'formattedValue', 'userEnteredFormat', 'effectiveFormat',
      'hyperlink', 'note', 'textFormatRuns', 'dataValidation', 'pivotTable', 'dataSourceTable', 'dataSourceFormula', 'chipRuns'];
    if (Object.keys(data).some(key => !knownFields.includes(key))) throw Error();
    // These features are outside this adapter's verified coverage; never silently discard them.
    if (list(data.chipRuns).length || data.dataSourceFormula !== undefined || data.dataSourceTable !== undefined || data.pivotTable !== undefined) failCell('CELL_FEATURE_UNSUPPORTED');
    const entered = scalar(data.userEnteredValue, true), effective = scalar(data.effectiveValue, false);
    const formula = data.userEnteredValue?.formulaValue === undefined ? '' : text(data.userEnteredValue.formulaValue);
    if (formula && !formula.startsWith('=')) throw Error();
    if (data.userEnteredValue !== undefined && data.effectiveValue === undefined && entered !== '') throw Error();
    if (!formula && data.userEnteredValue !== undefined && entered !== effective) throw Error();
    // Dates are numeric serials in REST, but Date objects in GAS. Block instead of guessing.
    const numberFormat = data.effectiveFormat?.numberFormat === undefined ? undefined : object(data.effectiveFormat.numberFormat);
    for (const raw of [data.userEnteredFormat?.numberFormat, numberFormat]) {
      if (typeof effective === 'number' && raw !== undefined &&
        !['NUMBER', 'PERCENT', 'CURRENCY', 'SCIENTIFIC', 'TEXT'].includes(object(raw).type)) {
        failCell(['DATE', 'TIME', 'DATE_TIME'].includes(object(raw).type) ? 'DATE_TIME_UNSUPPORTED' : 'CELL_SCHEMA_INVALID');
      }
    }
    const links = [data.hyperlink === undefined ? null : text(data.hyperlink), formatLink(data.userEnteredFormat), formatLink(data.effectiveFormat)];
    for (const raw of list(data.textFormatRuns)) {
      const run = object(raw); integer(run.startIndex ?? 0);
      links.push(run.format === undefined ? null : url(object(run.format).link));
    }
    const rich = { getLinkUrl: () => links.find(link => !!link) ?? null,
      getRuns: () => links.map(link => ({ getText: () => '', getLinkUrl: () => link })) };
    return { formula, value: effective, rich, note: data.note === undefined ? '' : text(data.note),
      numberFormat: numberFormat?.pattern === undefined ? '' : text(numberFormat.pattern),
      used: entered !== '' || effective !== '' || links.some(Boolean) };
  });
}

/** GAS-compatible synchronous, GET-only adapter. It has no Advanced Service dependency. */
export function sheetsApiRiskInspector(runtime: UserInfoRuntime, sourceIds: readonly string[]): SpreadsheetPort {
  const api: RiskReadApi = { openById(id) {
    return diagnose('SPREADSHEET_ACCESS_FAILED', 'UNKNOWN', () => {
      // Caller-provided URLs and arbitrary file IDs never reach UrlFetchApp.
      if (!sourceIds.includes(id) || !/^[A-Za-z0-9_-]{3,200}$/.test(id)) throw Error();
      const token = runtime.getOAuthToken();
      if (typeof token !== 'string' || !token || token.length > 16384 || /\s/.test(token)) throw Error();
      let response: ReturnType<UserInfoRuntime['fetch']>, status: number;
      try {
        response = runtime.fetch(`${SHEETS_READ_URL}${id}?fields=${encodeURIComponent(FIELDS)}`, {
          method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true,
          followRedirects: false, muteHttpExceptions: true });
        status = response.getResponseCode();
        if (!Number.isInteger(status) || status < 100 || status > 599) throw Error();
      } catch {
        // Never retain the upstream exception, which may contain a URL, credentials or body.
        throw new SpreadsheetInspectionError('SPREADSHEET_ACCESS_FAILED', 'REQUEST_FAILED');
      }
      if (status !== 200) {
        const flags = status === 403 ? { hasContentLength: false, isJsonContentType: false, hasContentEncoding: false } : undefined;
        const apiReason = flags ? forbiddenReason(response, flags) : undefined;
        throw new SpreadsheetInspectionError('SPREADSHEET_ACCESS_FAILED',
          status === 401 ? 'HTTP_401' : status === 403 ? 'HTTP_403' : status === 404 ? 'HTTP_404' : 'HTTP_OTHER', apiReason, flags);
      }
      diagnose('SPREADSHEET_ACCESS_FAILED', 'CONTENT_TYPE_INVALID', () => {
        const mime = Object.entries(response.getHeaders()).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
        if (typeof mime !== 'string' || !/^application\/json(?:\s*;|$)/i.test(mime)) throw Error();
      });
      const body = response.getContentText();
      if (typeof body !== 'string') throw Error();
      if (body.length > MAX_RESPONSE_CHARS) throw new SpreadsheetInspectionError('SPREADSHEET_ACCESS_FAILED', undefined, undefined, undefined, 'BODY_TOO_LARGE');
      const parsed = diagnose('SPREADSHEET_ACCESS_FAILED', 'JSON_INVALID', () => JSON.parse(body));
      const book = diagnose('SPREADSHEET_ACCESS_FAILED', 'ROOT_INVALID', () => {
        const value = object(parsed);
        if (value.spreadsheetId !== id || !Array.isArray(value.sheets) || !value.sheets.length) throw Error();
        return value;
      });
      return { getId: () => id, getSheets: () => {
        return diagnose('SHEET_READ_FAILED', 'UNKNOWN', () => {
          const ids = new Set<number>(), names = new Set<string>(); let total = 0;
          return book.sheets.map((raw: unknown) => {
            const { sheet, name, maxRows, maxColumns } = diagnose('SHEET_READ_FAILED', 'SHEET_PROPERTIES_INVALID', () => {
              const sheet = object(raw), properties = object(sheet.properties), grid = object(properties.gridProperties);
              const sheetId = integer(properties.sheetId), name = text(properties.title);
              if (properties.sheetType !== 'GRID' || !name || ids.has(sheetId) || names.has(name)) throw Error();
              ids.add(sheetId); names.add(name);
              const maxRows = integer(grid.rowCount), maxColumns = integer(grid.columnCount);
              if (!maxRows || !maxColumns) throw Error();
              return { sheet, name, maxRows, maxColumns };
            });
            const { cells, lastRow, lastColumn } = diagnose('SHEET_READ_FAILED', 'GRID_DATA_INVALID', () => {
              const cells = new Map<string, ReturnType<typeof cell>>(); let lastRow = 0, lastColumn = 0;
              const blocks = list(sheet.data);
              // Unranged spreadsheets.get emits one GridData block per grid sheet. An explicit
              // block (possibly {}) is required to distinguish an empty grid from absent coverage.
              if (blocks.length === 0) throw new SpreadsheetInspectionError('SHEET_READ_FAILED', undefined, undefined, undefined, 'GRID_DATA_MISSING');
              if (blocks.length !== 1) throw Error();
              const block = object(blocks[0]);
              if (integer(block.startRow ?? 0) !== 0 || integer(block.startColumn ?? 0) !== 0) throw Error();
              const rows = list(block.rowData);
              if (rows.length > maxRows) throw Error();
              rows.forEach((rawRow, r) => {
                const values = list(object(rawRow).values);
                if (values.length > maxColumns) throw Error();
                values.forEach((rawCell, c) => {
                  const value = cell(rawCell);
                  if (value.used) { lastRow = Math.max(lastRow, r + 1); lastColumn = Math.max(lastColumn, c + 1); }
                  if (total + lastRow * lastColumn > 250000) throw new SpreadsheetInspectionError('RISK_SCAN_LIMIT');
                  if (value.used) cells.set(`${r},${c}`, value);
                });
              });
              total += lastRow * lastColumn;
              return { cells, lastRow, lastColumn };
            });
            return { getName: () => name, getLastRow: () => lastRow, getLastColumn: () => lastColumn,
              getMaxRows: () => maxRows, getMaxColumns: () => maxColumns,
              getRange(row: number, column: number, height: number, width: number) {
                const matrix = <T>(read: (value: ReturnType<typeof cell> | undefined) => T): T[][] =>
                  Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => read(cells.get(`${row + r - 1},${column + c - 1}`))));
                return { getFormulas: () => matrix(value => value?.formula ?? ''), getValues: () => matrix(value => value?.value ?? ''),
                  getRichTextValues: () => matrix(value => value?.rich ?? null), getNotes: () => matrix(value => value?.note ?? ''),
                  getNumberFormats: () => matrix(value => value?.numberFormat ?? '') };
              } };
          });
        });
      } };
    });
  } };
  return gasSpreadsheetInspector(api, 250000, undefined, true);
}
