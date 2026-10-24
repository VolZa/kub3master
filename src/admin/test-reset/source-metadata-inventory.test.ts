import { afterEach, expect, it, vi } from 'vitest';
import { inspectSourceMetadata, SOURCE_METADATA_FIELDS } from './source-metadata-inventory';
import { readOnlyPreflight, sourceMetadataInventory } from './readiness-entrypoints';
import { SHEETS_READ_URL } from './sheets-api-risk-adapter';
import { USERINFO_URL } from './admin-identity';
import { TEST_USERS_KEY } from './admin-preflight';
import { TEST_INSTALLATION_KEY, ROLES } from './test-configuration';
import { TEST_READINESS_SCRIPT_ID } from './readiness-target';
import { PRODUCTION_SCRIPT_ID, TEST_RESET_SOURCES } from './test-sources';

const id = 'synthetic-metadata-source-1234567890', token = 'private-oauth-token';
const sensitive = 'private-cell-content private@example.test private-subject Authorization Bearer';
function grid(sheetId = 0, title = 'synthetic', rowCount = 1000, columnCount = 26): any {
  return { properties: { sheetId, title, sheetType: 'GRID', gridProperties: { rowCount, columnCount } } };
}
function fixture() {
  const book: any = { spreadsheetId: id, sheets: [grid()] };
  const response = { getResponseCode: vi.fn(() => 200), getHeaders: vi.fn((): any => ({ 'Content-Type': 'application/json' })),
    getContentText: vi.fn((): any => JSON.stringify(book)) };
  const runtime = { getOAuthToken: vi.fn(() => token),
    fetch: vi.fn((_url: string, _options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => response) };
  return { book, response, runtime, scan: () => inspectSourceMetadata(runtime, 'MASTER', id) };
}
type Fixture = ReturnType<typeof fixture>;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('uses one fixed metadata-only GET and returns only validated metadata', () => {
  const f = fixture();
  expect(f.scan()).toEqual({ role: 'MASTER', status: 'PASS', spreadsheetId: id,
    sheets: [{ sheetId: 0, title: 'synthetic', sheetType: 'GRID', hidden: false, rowCount: 1000, columnCount: 26, allocatedCells: 26000 }],
    totalAllocatedCells: 26000, estimatedRequests4096: 7 });
  expect(f.runtime.fetch).toHaveBeenCalledExactlyOnceWith(`${SHEETS_READ_URL}${id}?fields=${encodeURIComponent(SOURCE_METADATA_FIELDS)}`, {
    method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true,
    followRedirects: false, muteHttpExceptions: true });
  expect(SOURCE_METADATA_FIELDS).toBe('spreadsheetId,sheets(properties(sheetId,title,sheetType,hidden,gridProperties(rowCount,columnCount)))');
  expect(decodeURIComponent(f.runtime.fetch.mock.calls[0][0])).not.toMatch(/GridData|rowData|values|CellData|includeGridData|ranges/);
});

it('includes every sheet and hidden sheet, and estimates row/column tiles independently per sheet', () => {
  const f = fixture(); f.book.sheets = [grid(2, 'wide', 2, 4097), grid(3, 'small', 10, 10)];
  f.book.sheets[0].properties.hidden = true;
  expect(f.scan()).toMatchObject({ status: 'PASS', totalAllocatedCells: 8294, estimatedRequests4096: 5,
    sheets: [{ sheetId: 2, title: 'wide', hidden: true, allocatedCells: 8194 }, { sheetId: 3, hidden: false, allocatedCells: 100 }] });
});

it.each(['OBJECT', 'DATA_SOURCE'])('does not invent absent GridProperties for %s', sheetType => {
  const f = fixture(); f.book.sheets.push({ properties: { sheetId: 1, title: 'without-grid', sheetType } });
  expect(f.scan()).toMatchObject({ status: 'PASS', totalAllocatedCells: null, estimatedRequests4096: null,
    sheets: [{ allocatedCells: 26000 }, { sheetType, hidden: false, rowCount: null, columnCount: null, allocatedCells: null }] });
});
it('reports DATA_SOURCE dimensions when present without claiming ordinary range support', () => {
  const f = fixture(); f.book.sheets[0].properties.sheetType = 'DATA_SOURCE';
  expect(f.scan()).toMatchObject({ status: 'PASS', totalAllocatedCells: 26000, estimatedRequests4096: null });
});
it.each([[1, 4096, 1], [1, 4097, 2], [4097, 1, 2], [3, 2000, 2], [Number.MAX_SAFE_INTEGER, 1, Math.ceil(Number.MAX_SAFE_INTEGER / 4096)]])(
  'keeps estimates and arithmetic exact for %s x %s', (rows, columns, requests) => {
    const f = fixture(); f.book.sheets = [grid(0, 'bounds', rows, columns)];
    expect(f.scan()).toMatchObject({ status: 'PASS', totalAllocatedCells: rows * columns, estimatedRequests4096: requests });
  });

const invalid: [string, (f: Fixture) => void][] = [
  ['ROOT_INVALID', f => { f.book.spreadsheetId = 'wrong-id'; }],
  ['ROOT_INVALID', f => { f.book.sheets = []; }],
  ['ROOT_INVALID', f => { f.book.sheets = {}; }],
  ['ROOT_INVALID', f => { f.book.rawSecret = sensitive; }],
  ['SHEET_COUNT_LIMIT', f => { f.book.sheets = Array.from({ length: 1001 }, (_, i) => grid(i, `sheet-${i}`)); }],
  ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets[0] = null; }],
  ['SHEET_PROPERTIES_INVALID', f => { delete f.book.sheets[0].properties; }],
  ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets.push(grid(0, 'duplicate-id')); }],
  ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets.push(grid(1, 'synthetic')); }],
  ...[-1, 0.5, '0', null].map((value): [string, (f: Fixture) => void] => ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets[0].properties.sheetId = value; }]),
  ...['UNKNOWN', 'SHEET_TYPE_UNSPECIFIED', null].map((value): [string, (f: Fixture) => void] => ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets[0].properties.sheetType = value; }]),
  ...['', 'x'.repeat(101), null].map((value): [string, (f: Fixture) => void] => ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets[0].properties.title = value; }]),
  ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets[0].properties.hidden = 'false'; }],
  ['SHEET_PROPERTIES_INVALID', f => { f.book.sheets[0].data = [{ rowData: [{ values: [{ note: sensitive }] }] }]; }],
  ['GRID_PROPERTIES_INVALID', f => { delete f.book.sheets[0].properties.gridProperties; }],
  ['GRID_PROPERTIES_INVALID', f => { f.book.sheets[0].properties.gridProperties = null; }],
  ['GRID_PROPERTIES_INVALID', f => { f.book.sheets[0].properties.sheetType = 'OBJECT'; }],
  ...[0, -1, 0.5, '12', null, Number.MAX_SAFE_INTEGER + 1].flatMap(value => ['rowCount', 'columnCount'].map((key): [string, (f: Fixture) => void] =>
    ['GRID_PROPERTIES_INVALID', f => { f.book.sheets[0].properties.gridProperties[key] = value; }])),
  ['ARITHMETIC_OVERFLOW', f => { f.book.sheets = [grid(0, 'overflow', Number.MAX_SAFE_INTEGER, 2)]; }],
  ['ARITHMETIC_OVERFLOW', f => { f.book.sheets = [grid(0, 'max', Number.MAX_SAFE_INTEGER, 1), grid(1, 'extra', 1, 1)]; }],
];
it.each(invalid)('fails closed without partial metadata or raw errors: %s (%#)', (detail, configure) => {
  const f = fixture(); configure(f);
  expect(f.scan()).toEqual({ role: 'MASTER', status: 'BLOCKED', sheets: [], totalAllocatedCells: null,
    estimatedRequests4096: null, inspectionDetail: detail });
  expect(JSON.stringify(f.scan())).not.toContain(sensitive);
});

it.each([401, 403, 404, 201, 301, 429, 500, NaN])('does not read HTTP error bodies or headers: %s', status => {
  const f = fixture(); f.response.getResponseCode.mockReturnValue(status);
  expect(f.scan()).toMatchObject({ status: 'BLOCKED', inspectionDetail: Number.isNaN(status) ? 'REQUEST_FAILED' :
    status === 401 ? 'HTTP_401' : status === 403 ? 'HTTP_403' : status === 404 ? 'HTTP_404' : 'HTTP_OTHER' });
  expect(f.response.getHeaders).not.toHaveBeenCalled(); expect(f.response.getContentText).not.toHaveBeenCalled();
});
it.each(['token', 'fetch', 'status'])('sanitizes synchronous %s failures', mode => {
  const f = fixture(); const fail = () => { throw Error(`${sensitive} ${token} ${id}`); };
  if (mode === 'token') f.runtime.getOAuthToken.mockImplementation(fail);
  if (mode === 'fetch') f.runtime.fetch.mockImplementation(fail);
  if (mode === 'status') f.response.getResponseCode.mockImplementation(fail);
  expect(f.scan()).toMatchObject({ status: 'BLOCKED', inspectionDetail: 'REQUEST_FAILED' });
  expect(f.response.getContentText).not.toHaveBeenCalled();
});
it.each([null, {}, { 'Content-Type': 'text/html' }, { 'Content-Type': [sensitive] }])('rejects invalid Content-Type (%#)', headers => {
  const f = fixture(); f.response.getHeaders.mockReturnValue(headers);
  expect(f.scan()).toMatchObject({ status: 'BLOCKED', inspectionDetail: 'CONTENT_TYPE_INVALID' });
  expect(f.response.getContentText).not.toHaveBeenCalled();
});
it.each([['{private-invalid-json', 'JSON_INVALID'], ['null', 'ROOT_INVALID'], ['[]', 'ROOT_INVALID'],
  [null, 'BODY_INVALID'], ['x'.repeat(1048577), 'BODY_TOO_LARGE']])('bounds and validates the metadata body (%#)', (body, detail) => {
  const f = fixture(); f.response.getContentText.mockReturnValue(body);
  expect(f.scan()).toMatchObject({ status: 'BLOCKED', inspectionDetail: detail });
});
it('accepts the exact metadata character limit and valid mixed-case MIME', () => {
  const f = fixture(), body = JSON.stringify(f.book);
  f.response.getHeaders.mockReturnValue({ 'content-TYPE': 'Application/JSON; charset=UTF-8' });
  f.response.getContentText.mockReturnValue(body + ' '.repeat(1048576 - body.length));
  expect(f.scan().status).toBe('PASS');
});
it.each(['short', 'https://private.invalid', '../invalid-id', 'x'.repeat(201), `${id}?secret=value`])('blocks invalid source IDs before fetch (%#)', badId => {
  const f = fixture(); expect(inspectSourceMetadata(f.runtime, 'MASTER', badId)).toMatchObject({ status: 'BLOCKED', inspectionDetail: 'SPREADSHEET_ID_INVALID' });
  expect(f.runtime.getOAuthToken).not.toHaveBeenCalled(); expect(f.runtime.fetch).not.toHaveBeenCalled();
});

function entryFixture() {
  const user = { issuer: 'https://accounts.google.com', subject: 'private-subject', email: 'private@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 };
  const properties = new Map([[TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: TEST_READINESS_SCRIPT_ID })],
    [TEST_USERS_KEY, JSON.stringify({ version: 1, users: [user] })]]);
  const forbidden = vi.fn(() => { throw Error(sensitive); });
  const scriptId = vi.fn(() => TEST_READINESS_SCRIPT_ID), webUrl = vi.fn((): string | null => null);
  const status = new Map<string, number>(), metadataBodies = new Map<string, string>();
  const fetch = vi.fn((url: string, options: any) => {
    expect(options).toEqual({ method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true, followRedirects: false, muteHttpExceptions: true });
    if (url === USERINFO_URL) return { getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }),
      getContentText: () => JSON.stringify({ sub: user.subject, email: user.email, email_verified: true }) };
    const sourceId = url.slice(SHEETS_READ_URL.length).split('?')[0];
    expect(Object.values(TEST_RESET_SOURCES).some(source => source.id === sourceId)).toBe(true);
    expect(url).toBe(`${SHEETS_READ_URL}${sourceId}?fields=${encodeURIComponent(SOURCE_METADATA_FIELDS)}`);
    return { getResponseCode: () => status.get(sourceId) ?? 200, getHeaders: () => ({ 'Content-Type': 'application/json' }),
      getContentText: () => metadataBodies.get(sourceId) ?? JSON.stringify({ spreadsheetId: sourceId, sheets: [grid()] }) };
  });
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null,
    setProperty: forbidden, setProperties: forbidden, deleteProperty: forbidden }) });
  vi.stubGlobal('ScriptApp', { getScriptId: scriptId, getService: () => ({ getUrl: webUrl }), getOAuthToken: () => token, newTrigger: forbidden });
  vi.stubGlobal('UrlFetchApp', { fetch }); vi.stubGlobal('DriveApp', { getFileById: forbidden }); vi.stubGlobal('SpreadsheetApp', { openById: forbidden });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { user, properties, forbidden, fetch, log, status, metadataBodies, scriptId, webUrl,
    sheetCalls: () => fetch.mock.calls.filter(([url]) => url.startsWith(SHEETS_READ_URL)) };
}
it('uses existing ADMIN guards, reports all configured sources, performs no writes and logs only the report', () => {
  const f = entryFixture(), before = JSON.stringify([...f.properties]); const result = sourceMetadataInventory();
  expect(result).toMatchObject({ operation: 'SOURCE_METADATA_INVENTORY', status: 'PASS', resetAllowed: false,
    sources: ROLES.map(role => ({ role, status: 'PASS', spreadsheetId: TEST_RESET_SOURCES[role].id })) });
  expect(f.sheetCalls()).toHaveLength(3); expect(f.fetch.mock.calls.filter(([url]) => url === USERINFO_URL)).toHaveLength(2);
  expect(f.forbidden).not.toHaveBeenCalled(); expect(JSON.stringify([...f.properties])).toBe(before);
  expect(f.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(result));
  for (const value of [token, f.user.email, f.user.subject, 'Authorization', 'Bearer']) expect(JSON.stringify(result)).not.toContain(value);
});
it('keeps a failed source BLOCKED while retaining the other inventories', () => {
  const f = entryFixture(); f.status.set(TEST_RESET_SOURCES.OPERATIONAL.id, 403);
  expect(sourceMetadataInventory()).toMatchObject({ status: 'BLOCKED', resetAllowed: false,
    sources: [{ role: 'MASTER', status: 'PASS' }, { role: 'OPERATIONAL', status: 'BLOCKED', sheets: [], inspectionDetail: 'HTTP_403' }, { role: 'REPORTING', status: 'PASS' }] });
  expect(f.sheetCalls()).toHaveLength(3);
});
it.each(['marker', 'production', 'wrong-script', 'webapp', 'missing-admin', 'manager', 'malformed-directory'])('blocks %s before metadata access', mode => {
  const f = entryFixture();
  if (mode === 'marker') f.properties.delete(TEST_INSTALLATION_KEY);
  if (mode === 'production') f.scriptId.mockReturnValue(PRODUCTION_SCRIPT_ID);
  if (mode === 'wrong-script') f.scriptId.mockReturnValue('another-test-script');
  if (mode === 'webapp') f.webUrl.mockReturnValue('https://private.invalid/deployment');
  if (mode === 'missing-admin') f.properties.delete(TEST_USERS_KEY);
  if (mode === 'manager') { f.user.roles = ['MANAGER']; f.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [f.user] })); }
  if (mode === 'malformed-directory') f.properties.set(TEST_USERS_KEY, sensitive);
  expect(sourceMetadataInventory()).toMatchObject({ operation: 'SOURCE_METADATA_INVENTORY', status: 'BLOCKED', resetAllowed: false });
  expect(f.sheetCalls()).toHaveLength(0); expect(f.forbidden).not.toHaveBeenCalled();
});
it('suppresses metadata when ADMIN is revoked before returning', () => {
  const f = entryFixture(), original = f.fetch.getMockImplementation()!;
  f.fetch.mockImplementation((url, options) => { const response = original(url, options); if (url.startsWith(SHEETS_READ_URL)) f.properties.delete(TEST_USERS_KEY); return response; });
  expect(sourceMetadataInventory()).toEqual({ status: 'BLOCKED', operation: 'SOURCE_METADATA_INVENTORY', code: 'ACCESS_DENIED', resetAllowed: false });
  expect(f.log.mock.calls.join('')).not.toContain('spreadsheetId');
});
it('does not change preflight results, UNKNOWN dependencies or resetAllowed', () => {
  const f = entryFixture();
  // Existing preflight fails its read-only Drive inspection; inventory never calls that port.
  const before = readOnlyPreflight(); sourceMetadataInventory(); const after = readOnlyPreflight();
  expect(after).toEqual(before); expect(after).toMatchObject({ status: 'BLOCKED', resetAllowed: false,
    sources: ROLES.map(role => ({ role, dependencies: { externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' } })) });
});
