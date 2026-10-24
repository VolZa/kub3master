import type { UserInfoRuntime } from './admin-identity';
import type { FileRole } from './test-configuration';
import { SHEETS_READ_URL } from './sheets-api-risk-adapter';

export const SOURCE_METADATA_FIELDS = 'spreadsheetId,sheets(properties(sheetId,title,sheetType,hidden,gridProperties(rowCount,columnCount)))';
const MAX_METADATA_CHARS = 1048576, MAX_SHEETS = 1000;
export type MetadataInspectionDetail = 'SPREADSHEET_ID_INVALID' | 'REQUEST_FAILED' |
  'HTTP_401' | 'HTTP_403' | 'HTTP_404' | 'HTTP_OTHER' | 'CONTENT_TYPE_INVALID' |
  'BODY_INVALID' | 'BODY_TOO_LARGE' | 'JSON_INVALID' | 'ROOT_INVALID' |
  'SHEET_COUNT_LIMIT' | 'SHEET_PROPERTIES_INVALID' | 'GRID_PROPERTIES_INVALID' | 'ARITHMETIC_OVERFLOW';
export interface SourceMetadataInventory {
  role: FileRole;
  status: 'PASS' | 'BLOCKED';
  spreadsheetId?: string;
  sheets: {
    sheetId: number; title: string; sheetType: 'GRID' | 'OBJECT' | 'DATA_SOURCE'; hidden: boolean;
    rowCount: number | null; columnCount: number | null; allocatedCells: number | null;
  }[];
  totalAllocatedCells: number | null;
  estimatedRequests4096: number | null;
  inspectionDetail?: MetadataInspectionDetail;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw Error();
}
function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw Error();
  return value as number;
}
function safe(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw Error();
  return value;
}

/** Server composition supplies the configured source ID, never an editor/RPC argument.
 * PASS means valid metadata only, not inspected cells or permission to reset.
 */
export function inspectSourceMetadata(runtime: UserInfoRuntime, role: FileRole, expectedId: string): SourceMetadataInventory {
  let detail: MetadataInspectionDetail = 'SPREADSHEET_ID_INVALID';
  try {
    if (typeof expectedId !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(expectedId)) throw Error();
    detail = 'REQUEST_FAILED';
    const token = runtime.getOAuthToken();
    if (typeof token !== 'string' || !token || token.length > 16384 || /\s/.test(token)) throw Error();
    const response = runtime.fetch(`${SHEETS_READ_URL}${expectedId}?fields=${encodeURIComponent(SOURCE_METADATA_FIELDS)}`, {
      method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true,
      followRedirects: false, muteHttpExceptions: true });
    const status = response.getResponseCode();
    if (!Number.isInteger(status) || status < 100 || status > 599) throw Error();
    if (status !== 200) {
      detail = status === 401 ? 'HTTP_401' : status === 403 ? 'HTTP_403' : status === 404 ? 'HTTP_404' : 'HTTP_OTHER';
      throw Error(); // Never read rejected response headers or body.
    }
    detail = 'CONTENT_TYPE_INVALID';
    const mime = Object.entries(object(response.getHeaders())).find(([name]) => name.toLowerCase() === 'content-type')?.[1];
    if (typeof mime !== 'string' || !/^application\/json(?:\s*;|$)/i.test(mime)) throw Error();
    detail = 'BODY_INVALID';
    const body = response.getContentText();
    if (typeof body !== 'string') throw Error();
    detail = 'BODY_TOO_LARGE';
    if (body.length > MAX_METADATA_CHARS) throw Error();
    detail = 'JSON_INVALID';
    const parsed: unknown = JSON.parse(body);
    detail = 'ROOT_INVALID';
    const book = object(parsed); keys(book, ['spreadsheetId', 'sheets']);
    if (book.spreadsheetId !== expectedId || !Array.isArray(book.sheets) || !book.sheets.length) throw Error();
    detail = 'SHEET_COUNT_LIMIT';
    if (book.sheets.length > MAX_SHEETS) throw Error();
    const ids = new Set<number>(), titles = new Set<string>();
    let totalAllocatedCells: number | null = 0, estimatedRequests4096: number | null = 0;
    const sheets = book.sheets.map((raw): SourceMetadataInventory['sheets'][number] => {
      detail = 'SHEET_PROPERTIES_INVALID';
      const sheet = object(raw); keys(sheet, ['properties']);
      const properties = object(sheet.properties);
      keys(properties, ['sheetId', 'title', 'sheetType', 'hidden', 'gridProperties']);
      const { sheetId, title, sheetType, hidden } = properties;
      if (!Number.isSafeInteger(sheetId) || (sheetId as number) < 0 || ids.has(sheetId as number) ||
        typeof title !== 'string' || !title || title.length > 100 || titles.has(title) ||
        (sheetType !== 'GRID' && sheetType !== 'OBJECT' && sheetType !== 'DATA_SOURCE') ||
        (hidden !== undefined && typeof hidden !== 'boolean')) throw Error();
      ids.add(sheetId as number); titles.add(title);
      detail = 'GRID_PROPERTIES_INVALID';
      let rowCount: number | null = null, columnCount: number | null = null, allocatedCells: number | null = null;
      if (properties.gridProperties === undefined) {
        if (sheetType === 'GRID') throw Error(); // GRID dimensions are required; OBJECT has none.
        totalAllocatedCells = null; estimatedRequests4096 = null;
      } else {
        if (sheetType === 'OBJECT') throw Error();
        const grid = object(properties.gridProperties); keys(grid, ['rowCount', 'columnCount']);
        rowCount = positiveInteger(grid.rowCount); columnCount = positiveInteger(grid.columnCount);
        detail = 'ARITHMETIC_OVERFLOW';
        allocatedCells = safe(rowCount * columnCount);
        if (totalAllocatedCells !== null) totalAllocatedCells = safe(totalAllocatedCells + allocatedCells);
        // A row-band plan; very wide sheets require one-row column tiles. No partial-row carry.
        if (sheetType !== 'GRID') estimatedRequests4096 = null; // DATA_SOURCE cannot use ordinary range reads.
        else if (estimatedRequests4096 !== null) estimatedRequests4096 = safe(estimatedRequests4096 +
          (columnCount <= 4096 ? Math.ceil(rowCount / Math.floor(4096 / columnCount)) : rowCount * Math.ceil(columnCount / 4096)));
      }
      return { sheetId: sheetId as number, title, sheetType, hidden: hidden ?? false,
        rowCount, columnCount, allocatedCells };
    });
    return { role, status: 'PASS', spreadsheetId: expectedId, sheets, totalAllocatedCells, estimatedRequests4096 };
  } catch {
    // All-or-nothing per source: no raw error, rejected IDs, partial sheets or untrusted fields.
    return { role, status: 'BLOCKED', sheets: [], totalAllocatedCells: null, estimatedRequests4096: null, inspectionDetail: detail };
  }
}
