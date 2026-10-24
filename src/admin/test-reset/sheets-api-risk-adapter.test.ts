import { afterEach, expect, it, vi } from 'vitest';
import { sheetsApiRiskInspector, SHEETS_READ_URL } from './sheets-api-risk-adapter';
import { SpreadsheetInspectionError, type InspectionDetail } from './spreadsheet-risk-inspector';
import { readOnlyPreflight } from './readiness-entrypoints';
import { TEST_RESET_SOURCES } from './test-sources';
import { TEST_INSTALLATION_KEY } from './test-configuration';
import { TestAdminDiagnostics, TEST_USERS_KEY } from './admin-preflight';
import { TEST_READINESS_SCRIPT_ID } from './readiness-target';

const id = 'allowed-source-id', token = 'private-oauth-token', secret = 'private-cell-content private@example.test private-subject Authorization Bearer';
function fixture() {
  const sheet: any = { properties: { sheetId: 0, title: 'data', sheetType: 'GRID', hidden: true,
    gridProperties: { rowCount: 1000, columnCount: 500 } }, data: [{ rowData: [{ values: [{}] }] }] };
  const book: any = { spreadsheetId: id, sheets: [sheet] };
  const response = { getResponseCode: vi.fn(() => 200), getHeaders: vi.fn(() => ({ 'Content-Type': 'application/json; charset=UTF-8' })),
    getContentText: vi.fn(() => JSON.stringify(book)) };
  const runtime = { getOAuthToken: vi.fn(() => token), fetch: vi.fn(() => response) };
  const scan = () => sheetsApiRiskInspector(runtime, [id]).inspect(id, [id]);
  const put = (value: any) => { sheet.data[0].rowData[0].values[0] = value; };
  return { book, sheet, response, runtime, scan, put };
}
type Fixture = ReturnType<typeof fixture>;
function denied(f: Fixture, reason: string) {
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SpreadsheetInspectionError);
  expect(caught).toMatchObject({ message: 'SOURCE_INSPECTION_FAILED', reason });
  expect(JSON.stringify(caught)).not.toContain(token); expect(JSON.stringify(caught)).not.toContain(secret);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('uses only the fixed GET endpoint and complete grid fields with TLS/no redirects and a server token', () => {
  const f = fixture();
  expect(f.scan()).toEqual({ id, sheets: ['data'], hazards: [] });
  const [target, options] = f.runtime.fetch.mock.calls[0] as unknown as [string, any];
  expect(target).toBe(`${SHEETS_READ_URL}${id}?fields=${encodeURIComponent('spreadsheetId,sheets(properties,data(startRow,startColumn,rowData(values)))')}`);
  expect(target).not.toContain('ranges='); expect(target).not.toContain(token);
  expect(options).toEqual({ method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true,
    followRedirects: false, muteHttpExceptions: true });
  expect(f.runtime.fetch).toHaveBeenCalledOnce();
});

it.each(['IMPORTRANGE', 'IMPORTDATA', 'IMPORTXML', 'IMPORTHTML', 'IMAGE', 'GOOGLEFINANCE', 'HYPERLINK'])('preserves formula hazard detection: %s', name => {
  const f = fixture(); f.put({ userEnteredValue: { formulaValue: `=${name}("argument")` }, effectiveValue: { stringValue: 'display' } });
  expect(f.scan().hazards).toEqual(['data!R1C1']);
});
it.each([
  { effectiveValue: { stringValue: 'https://external.invalid/private-cell-content' } },
  { effectiveValue: { stringValue: id } },
  { userEnteredValue: { formulaValue: `='[${id}]'!A1` }, effectiveValue: { numberValue: 1 } },
  { effectiveValue: { stringValue: 'label' }, hyperlink: 'https://external.invalid/private' },
  { effectiveValue: { stringValue: 'label' }, userEnteredFormat: { textFormat: { link: { uri: 'mailto:private@example.test' } } } },
  { effectiveValue: { stringValue: 'label' }, effectiveFormat: { textFormat: { link: { uri: 'https://external.invalid/private' } } } },
  { userEnteredValue: { stringValue: 'multiple links' }, effectiveValue: { stringValue: 'multiple links' },
    textFormatRuns: [{ startIndex: 0, format: { link: { uri: 'https://one.invalid' } } }, { startIndex: 5, format: { link: { uri: 'https://two.invalid' } } }] },
  { effectiveValue: { stringValue: 'inherited link' }, userEnteredFormat: { textFormat: { link: { uri: 'https://inherited.invalid' } } },
    textFormatRuns: [{ startIndex: 0, format: {} }] },
])('detects URL, source IDs and every rich-link surface (%#)', value => {
  const f = fixture(); f.put(value);
  expect(f.scan().hazards).toEqual(['data!R1C1']);
  expect(JSON.stringify(f.scan())).not.toContain('external.invalid');
});

it('keeps safe scalar values, sparse coordinates, hidden sheets, sheet ordering and the 20-location cap', () => {
  const f = fixture();
  f.sheet.data[0].rowData = [{ values: [{ effectiveValue: { numberValue: 0 } }, { effectiveValue: { boolValue: false } },
    { userEnteredValue: { formulaValue: '=SUM(1,2)' }, effectiveValue: { numberValue: 3 } }] }, {},
    { values: [{}, { hyperlink: 'https://only-link.invalid' }] }];
  const another = { properties: { ...f.sheet.properties, sheetId: 1, title: 'hidden-link-sheet' }, data: [{ rowData:
    Array.from({ length: 25 }, () => ({ values: [{ effectiveValue: { stringValue: 'https://hazard.invalid' } }] })) }] };
  f.book.sheets.push(another);
  const result = f.scan();
  expect(result.sheets).toEqual(['data', 'hidden-link-sheet']); expect(result.hazards).toHaveLength(20);
  expect(result.hazards[0]).toBe('data!R3C2'); expect(result.hazards[1]).toBe('hidden-link-sheet!R1C1');
});

it('uses actual used bounds rather than allocated grid size and preserves the cumulative 250000 limit', () => {
  const f = fixture(); f.sheet.properties.gridProperties = { rowCount: 1000000, columnCount: 500 };
  expect(f.scan().hazards).toEqual([]); // Huge allocated but empty grid is not a used-cell limit.
  f.sheet.data[0].rowData = Array.from({ length: 500 }, (_, row) => row === 499 ? { values:
    Array.from({ length: 500 }, (_, column) => column === 499 ? { effectiveValue: { numberValue: 1 } } : {}) } : {});
  expect(f.scan().hazards).toEqual([]); // Exactly 500 x 500.
  f.book.sheets.push({ properties: { ...f.sheet.properties, sheetId: 1, title: 'other' },
    data: [{ rowData: [{ values: [{ effectiveValue: { numberValue: 1 } }] }] }] });
  denied(f, 'RISK_SCAN_LIMIT');
});

const invalid: [string, (f: Fixture) => void][] = [
  ...[301, 401, 403, 404, 429, 500].map((code): [string, (f: Fixture) => void] => ['SPREADSHEET_ACCESS_FAILED', f => { f.response.getResponseCode.mockReturnValue(code); }]),
  ['SPREADSHEET_ACCESS_FAILED', f => { f.runtime.fetch.mockImplementation(() => { throw Error(secret); }); }],
  ['SPREADSHEET_ACCESS_FAILED', f => { f.response.getHeaders.mockReturnValue({ 'Content-Type': 'text/html' }); }],
  ['SPREADSHEET_ACCESS_FAILED', f => { f.response.getContentText.mockReturnValue(`{${secret}`); }],
  ['SPREADSHEET_ACCESS_FAILED', f => { f.response.getContentText.mockReturnValue('x'.repeat(8000001)); }],
  ['SPREADSHEET_ACCESS_FAILED', f => { f.book.spreadsheetId = 'wrong'; }],
  ['SPREADSHEET_ACCESS_FAILED', f => { delete f.book.sheets; }],
  ['SPREADSHEET_ACCESS_FAILED', f => { f.runtime.getOAuthToken.mockReturnValue('bad token'); }],
  ['SHEET_READ_FAILED', f => { f.sheet.properties.sheetType = 'DATA_SOURCE'; }],
  ['SHEET_READ_FAILED', f => { f.book.sheets.push(f.sheet); }],
  ['SHEET_READ_FAILED', f => { f.sheet.properties.gridProperties.rowCount = -1; }],
  ['SHEET_READ_FAILED', f => { delete f.sheet.data; }],
  ['SHEET_READ_FAILED', f => { f.sheet.data = [{}, {}]; }],
  ['SHEET_READ_FAILED', f => { f.sheet.data[0].startRow = 1; }],
  ['SHEET_READ_FAILED', f => { f.sheet.data[0].startColumn = 1; }],
  ['SHEET_READ_FAILED', f => { f.sheet.data[0].rowData = null; }],
  ['SHEET_READ_FAILED', f => { f.sheet.data[0].rowData[0].values = null; }],
  ['SHEET_READ_FAILED', f => { f.sheet.properties.gridProperties.columnCount = 1;
    f.sheet.data[0].rowData[0].values = [{}, {}]; }],
  ...[
    null, { effectiveValue: { errorValue: { type: 'ERROR', message: secret } } },
    { effectiveValue: { unknownValue: secret } }, { effectiveValue: { numberValue: '1' } },
    { userEnteredValue: { formulaValue: '=1' } },
    { effectiveValue: { numberValue: 45000 }, effectiveFormat: { numberFormat: { type: 'DATE' } } },
    { chipRuns: [{ chip: { richLinkProperties: { uri: 'https://external.invalid' } } }] },
    { chipRuns: [{ chip: { personProperties: { email: 'private@example.test' } } }] },
    { dataSourceFormula: {} }, { dataSourceTable: {} }, { pivotTable: {} },
    { textFormatRuns: [{ format: { link: { futureField: secret } } }] },
    { hyperlink: 123 }, { userEnteredFormat: 'invalid' },
    { futureCellField: { hiddenLink: secret } }, { effectiveValue: { numberValue: 1 }, effectiveFormat: { numberFormat: 'invalid' } },
    { userEnteredValue: { stringValue: 'https://external.invalid' }, effectiveValue: { stringValue: 'different' } },
  ].map((value): [string, (f: Fixture) => void] => ['SHEET_READ_FAILED', f => f.put(value)]),
];
it.each(invalid)('fails closed with fixed diagnostic metadata on missing coverage or request failure: %s (%#)', (reason, configure) => {
  const f = fixture(); configure(f); denied(f, reason);
});

const detailCases: [InspectionDetail, string, (f: Fixture) => void][] = [
  ['CONTENT_TYPE_INVALID', 'SPREADSHEET_ACCESS_FAILED', f => { f.response.getHeaders.mockReturnValue({ 'Content-Type': 'text/html' }); }],
  ['BODY_TOO_LARGE', 'SPREADSHEET_ACCESS_FAILED', f => { f.response.getContentText.mockReturnValue('x'.repeat(8000001)); }],
  ['JSON_INVALID', 'SPREADSHEET_ACCESS_FAILED', f => { f.response.getContentText.mockReturnValue(`{${secret}`); }],
  ['ROOT_INVALID', 'SPREADSHEET_ACCESS_FAILED', f => { f.book.spreadsheetId = 'wrong-id'; }],
  ['ROOT_INVALID', 'SPREADSHEET_ACCESS_FAILED', f => { f.book.sheets = []; }],
  ['SHEET_PROPERTIES_INVALID', 'SHEET_READ_FAILED', f => { f.sheet.properties.sheetType = 'DATA_SOURCE'; }],
  ['GRID_DATA_MISSING', 'SHEET_READ_FAILED', f => { delete f.sheet.data; }],
  ['GRID_DATA_MISSING', 'SHEET_READ_FAILED', f => { f.sheet.data = []; }],
  ['GRID_DATA_INVALID', 'SHEET_READ_FAILED', f => { f.sheet.data[0].startRow = 1; }],
  ['GRID_DATA_INVALID', 'SHEET_READ_FAILED', f => { f.sheet.data[0].rowData = null; }],
  ...['DATE', 'TIME', 'DATE_TIME'].map((type): [InspectionDetail, string, (f: Fixture) => void] =>
    ['DATE_TIME_UNSUPPORTED', 'SHEET_READ_FAILED', f => f.put({ effectiveValue: { numberValue: 45000 }, effectiveFormat: { numberFormat: { type } } })]),
  ['EFFECTIVE_ERROR_UNSUPPORTED', 'SHEET_READ_FAILED', f => f.put({ effectiveValue: { errorValue: { type: 'REF', message: secret } } })],
  ...[{ chipRuns: [{ chip: { richLinkProperties: { uri: secret } } }] }, { pivotTable: {} }, { dataSourceFormula: {} }, { dataSourceTable: {} }]
    .map((value): [InspectionDetail, string, (f: Fixture) => void] => ['CELL_FEATURE_UNSUPPORTED', 'SHEET_READ_FAILED', f => f.put(value)]),
  ['CELL_SCHEMA_INVALID', 'SHEET_READ_FAILED', f => f.put({ note: { privateValue: secret } })],
  ['CELL_SCHEMA_INVALID', 'SHEET_READ_FAILED', f => f.put({ futureCellField: secret })],
  ['CELL_SCHEMA_INVALID', 'SHEET_READ_FAILED', f => f.put({ effectiveValue: { numberValue: 1 }, effectiveFormat: { numberFormat: { type: 'FUTURE_FORMAT' } } })],
  ['UNKNOWN', 'SPREADSHEET_ACCESS_FAILED', f => { f.response.getContentText.mockImplementation(() => { throw Error(`${secret} ${token}`); }); }],
];
it.each(detailCases)('adds safe detail while preserving the original rejection: %s (%#)', (detail, reason, configure) => {
  const f = fixture(); configure(f);
  let error: unknown; try { f.scan(); } catch (value) { error = value; }
  expect(error).toBeInstanceOf(SpreadsheetInspectionError);
  expect(error).toMatchObject({ message: 'SOURCE_INSPECTION_FAILED', reason, detail });
  expect((error as SpreadsheetInspectionError).accessFailure).toBeUndefined(); // HTTP 200 validation failure, not HTTP denial.
  expect(f.runtime.fetch).toHaveBeenCalledOnce();
  expect(f.response.getContentText).toHaveBeenCalledTimes(detail === 'CONTENT_TYPE_INVALID' ? 0 : 1);
  const safe = JSON.stringify(error);
  for (const value of [secret, token, id, 'data!', 'external.invalid']) expect(safe).not.toContain(value);
});

it.each([301, 400, 401, 403, 404, 429, 500, 503, 'throw', 'status-throw', 'invalid-status'] as const)(
  'retains only a fixed REST access code and does not read rejected response content: %s', mode => {
    const f = fixture();
    if (mode === 'throw') f.runtime.fetch.mockImplementation(() => { throw Error(`${secret} ${token} ${SHEETS_READ_URL}${id}`); });
    else if (mode === 'status-throw') f.response.getResponseCode.mockImplementation(() => { throw Error(secret); });
    else f.response.getResponseCode.mockReturnValue(mode === 'invalid-status' ? NaN : mode);
    const accessFailure = typeof mode !== 'number' ? 'REQUEST_FAILED' : mode === 401 ? 'HTTP_401' : mode === 403 ? 'HTTP_403' : mode === 404 ? 'HTTP_404' : 'HTTP_OTHER';
    let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SpreadsheetInspectionError);
    expect(JSON.parse(JSON.stringify(caught))).toEqual({ reason: 'SPREADSHEET_ACCESS_FAILED', accessFailure,
      ...(mode === 403 ? { apiReason: 'UNKNOWN', headerFlags: { hasContentLength: false, isJsonContentType: true, hasContentEncoding: false } } : {}) });
    expect((caught as Error).message).toBe('SOURCE_INSPECTION_FAILED');
    if (mode === 403) expect(f.response.getHeaders).toHaveBeenCalledOnce();
    else expect(f.response.getHeaders).not.toHaveBeenCalled();
    expect(f.response.getContentText).not.toHaveBeenCalled();
    expect(f.runtime.fetch.mock.calls[0]).toEqual([expect.stringContaining(SHEETS_READ_URL), expect.objectContaining({
      method: 'get', muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: true })]);
  });

it.each(['mime', 'json', 'grid'] as const)('does not label HTTP 200 parsing/validation failures as REST request failures: %s', mode => {
  const f = fixture();
  if (mode === 'mime') f.response.getHeaders.mockReturnValue({ 'Content-Type': 'text/html' });
  if (mode === 'json') f.response.getContentText.mockReturnValue(`{${secret}`);
  if (mode === 'grid') delete f.sheet.data;
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SpreadsheetInspectionError);
  expect((caught as SpreadsheetInspectionError).accessFailure).toBeUndefined();
});

it('never fetches arbitrary IDs or URLs', () => {
  const f = fixture();
  for (const other of ['other-source-id', 'https://attacker.invalid', `${id}?fields=values`]) {
    expect(() => sheetsApiRiskInspector(f.runtime, [id]).inspect(other, [])).toThrow('SOURCE_INSPECTION_FAILED');
  }
  expect(f.runtime.fetch).not.toHaveBeenCalled();
});

it.each([undefined, 401, 403, 404, 429, 500, 'throw'] as const)('composes manual readiness with safe REST diagnostics and UNKNOWN dependencies: %s', mode => {
  const properties = new Map([
    [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: TEST_READINESS_SCRIPT_ID })],
    [TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com', subject: 'private-subject',
      email: 'private@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] })],
  ]);
  const rejected = { getResponseCode: () => typeof mode === 'number' ? mode : 200,
    getHeaders: vi.fn(() => { throw Error(secret); }), getContentText: vi.fn(() => { throw Error(secret); }) };
  const fetch = vi.fn((target: string, options: any) => {
    expect(options.method).toBe('get');
    let body: any;
    if (target === 'https://openidconnect.googleapis.com/v1/userinfo') body = { sub: 'private-subject', email: 'private@example.test', email_verified: true };
    else {
      expect(options.muteHttpExceptions).toBe(true);
      if (mode === 'throw') throw Error(`${secret} ${token} ${target}`);
      if (mode !== undefined) return rejected;
      const sourceId = target.split('/spreadsheets/')[1].split('?')[0];
      const source = Object.values(TEST_RESET_SOURCES).find(value => value.id === sourceId)!;
      body = { spreadsheetId: sourceId, sheets: source.requiredSheets.map((title, sheetId) => ({ properties: { sheetId, title, sheetType: 'GRID',
        gridProperties: { rowCount: 1000, columnCount: 26 } }, data: [{ rowData: [{ values: [{ effectiveValue: { stringValue: 'private-cell-content' } }] }] }] })) };
    }
    return { getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }), getContentText: () => JSON.stringify(body) };
  });
  const gasAccess = vi.fn(() => { throw Error(secret); });
  vi.stubGlobal('SpreadsheetApp', { openById: gasAccess });
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ getProperty: (key: string) => properties.get(key) ?? null }) });
  vi.stubGlobal('ScriptApp', { getScriptId: () => TEST_READINESS_SCRIPT_ID, getService: () => ({ getUrl: () => null }), getOAuthToken: () => token });
  vi.stubGlobal('UrlFetchApp', { fetch });
  vi.stubGlobal('DriveApp', { getFileById: (sourceId: string) => ({ getId: () => sourceId, getMimeType: () => 'application/vnd.google-apps.spreadsheet', isTrashed: () => false }) });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {}), before = JSON.stringify([...properties]);
  const result: any = readOnlyPreflight();
  expect(result.status).toBe('BLOCKED'); expect(result.resetAllowed).toBe(false);
  const accessFailure = mode === undefined ? undefined : mode === 'throw' ? 'REQUEST_FAILED' :
    mode === 401 ? 'HTTP_401' : mode === 403 ? 'HTTP_403' : mode === 404 ? 'HTTP_404' : 'HTTP_OTHER';
  expect(result.sources).toHaveLength(3);
  for (const source of result.sources) {
    expect(source.inspectionAccessFailure).toBe(accessFailure);
    expect(source.inspectionFailure).toBe(mode === undefined ? undefined : 'SPREADSHEET_ACCESS_FAILED');
    expect(source.inspectionApiReason).toBe(mode === 403 ? 'UNKNOWN' : undefined);
    expect(source.inspectionDetail).toBe(mode === undefined ? undefined : 'UNKNOWN');
    for (const key of ['hasContentLength', 'isJsonContentType', 'hasContentEncoding']) expect(source[key]).toBe(mode === 403 ? false : undefined);
    expect(source.dependencies).toEqual({ externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' });
    if (mode !== undefined) expect(source.blockers).toContain('SOURCE_INSPECTION_FAILED');
  }
  if (mode === 403) expect(rejected.getHeaders).toHaveBeenCalledTimes(3);
  else expect(rejected.getHeaders).not.toHaveBeenCalled();
  expect(rejected.getContentText).not.toHaveBeenCalled();
  expect(fetch.mock.calls.filter(([target]) => target.startsWith(SHEETS_READ_URL))).toHaveLength(3);
  expect(gasAccess).not.toHaveBeenCalled(); expect(JSON.stringify([...properties])).toBe(before);
  for (const value of [token, 'private-cell-content', 'private@example.test', 'private-subject', 'Authorization', 'Bearer', SHEETS_READ_URL,
    ...Object.values(TEST_RESET_SOURCES).map(source => source.id)]) expect(JSON.stringify(log.mock.calls)).not.toContain(value);
  const ordinary = new TestAdminDiagnostics({ properties: { getProperty: key => properties.get(key) ?? null },
    scriptId: () => TEST_READINESS_SCRIPT_ID, webAppUrl: () => null, now: Date.now, sources: TEST_RESET_SOURCES,
    identity: { getOAuthToken: () => token, fetch }, spreadsheets: sheetsApiRiskInspector({ getOAuthToken: () => token, fetch }, Object.values(TEST_RESET_SOURCES).map(source => source.id)),
    sourceFile: sourceId => ({ id: sourceId, mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false }),
    dependencies: { inspect: fileId => ({ fileId, evidenceId: '', externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' }) },
  }).preflight();
  expect(ordinary.sources.every(source => source.inspectionAccessFailure === undefined && source.inspectionFailure === undefined && source.inspectionApiReason === undefined &&
    source.hasContentLength === undefined && source.isJsonContentType === undefined && source.hasContentEncoding === undefined && source.inspectionDetail === undefined)).toBe(true);
  fetch.mockClear(); properties.delete(TEST_USERS_KEY);
  expect(readOnlyPreflight()).toEqual({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', code: 'ACCESS_DENIED', resetAllowed: false });
  expect(fetch.mock.calls.filter(([target]) => target.startsWith(SHEETS_READ_URL))).toHaveLength(0);
});
