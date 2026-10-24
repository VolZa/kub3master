import { afterEach, expect, it, vi } from 'vitest';
import { TestAdminDiagnostics, TEST_USERS_KEY, type AdminPreflightPorts } from './admin-preflight';
import { TEST_READINESS_SCRIPT_ID } from './readiness-target';
import { TEST_INSTALLATION_KEY } from './test-configuration';
import { TEST_RESET_SOURCES } from './test-sources';
import { gasSpreadsheetInspector, SpreadsheetInspectionError } from './spreadsheet-risk-inspector';

const secret = 'private-cell-content private-token private@example.test private-subject Authorization Bearer';
const fail = () => { throw Error(secret); };
function fixture() {
  let currentId = '';
  const props = new Map<string, string>([
    [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: TEST_READINESS_SCRIPT_ID })],
    [TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com',
      subject: 'private-subject', email: 'private@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] })],
  ]);
  const properties = { getProperty: (key: string) => props.get(key) ?? null };
  const range = { getFormulas: vi.fn(() => [['']]), getValues: vi.fn(() => [['ordinary value']]), getRichTextValues: vi.fn(() => [[null]]) };
  const sheet = { getLastRow: vi.fn(() => 1), getLastColumn: vi.fn(() => 1), getRange: vi.fn(() => range) };
  const book = { getId: vi.fn(() => currentId), getSheets: vi.fn(() => {
    const source = Object.values(TEST_RESET_SOURCES).find(value => value.id === currentId)!;
    return source.requiredSheets.map(name => ({ ...sheet, getName: () => name }));
  }) };
  const openById = vi.fn((id: string) => { currentId = id; return book as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet; });
  const api = { openById };
  const file = { getId: vi.fn(() => currentId), getMimeType: vi.fn(() => 'application/vnd.google-apps.spreadsheet'), isTrashed: vi.fn(() => false) };
  const getFileById = vi.fn((id: string) => { currentId = id; return file; });
  const sourceFile = (id: string) => { const value = getFileById(id);
    return { id: value.getId(), mimeType: value.getMimeType(), trashed: value.isTrashed() }; };
  const identity = { getOAuthToken: () => 'private-token', fetch: vi.fn(() => ({ getResponseCode: () => 200,
    getHeaders: () => ({ 'Content-Type': 'application/json' }),
    getContentText: () => JSON.stringify({ sub: 'private-subject', email: 'private@example.test', email_verified: true }) })) };
  const dependencies: AdminPreflightPorts['dependencies'] = { inspect: fileId => ({ fileId, evidenceId: '',
    externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' }) };
  const ports: AdminPreflightPorts = { properties, scriptId: () => TEST_READINESS_SCRIPT_ID, webAppUrl: () => null,
    identity, sources: TEST_RESET_SOURCES, spreadsheets: gasSpreadsheetInspector(api, 250000, undefined, true),
    sourceFile, dependencies, now: Date.now };
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => properties });
  vi.stubGlobal('ScriptApp', { getScriptId: ports.scriptId, getService: () => ({ getUrl: ports.webAppUrl }), getOAuthToken: identity.getOAuthToken });
  vi.stubGlobal('UrlFetchApp', { fetch: identity.fetch });
  vi.stubGlobal('DriveApp', { getFileById }); vi.stubGlobal('SpreadsheetApp', api);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  // Scanner/diagnostic unit tests retain the GAS fixture; the readiness REST composition
  // is exercised independently in sheets-api-risk-adapter.test.ts and readiness-build.test.ts.
  const readOnlyPreflight = () => { const result = new TestAdminDiagnostics(ports).preflightForReadiness();
    console.log(JSON.stringify(result)); return result; };
  return { props, ports, api, file, getFileById, openById, book, sheet, range, log, readOnlyPreflight };
}
type Fixture = ReturnType<typeof fixture>;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const cases: [string, (f: Fixture) => void][] = [
  ['DRIVE_ACCESS_FAILED', f => { f.getFileById.mockImplementation(fail); }],
  ['DRIVE_ACCESS_FAILED', f => { f.file.getMimeType.mockImplementation(fail); }],
  ['SOURCE_FILE_INVALID', f => { f.file.getMimeType.mockReturnValue('text/plain'); }],
  ['SOURCE_FILE_INVALID', f => { f.file.isTrashed.mockReturnValue(true); }],
  ['SPREADSHEET_ACCESS_FAILED', f => { f.openById.mockImplementation(fail); }],
  ['RISK_SCAN_LIMIT', f => { f.sheet.getLastRow.mockReturnValue(250001); }],
  ['SHEET_READ_FAILED', f => { f.book.getSheets.mockImplementation(fail); }],
  ['SHEET_READ_FAILED', f => { f.sheet.getLastRow.mockImplementation(fail); }],
  ['SHEET_READ_FAILED', f => { f.sheet.getRange.mockImplementation(fail); }],
  ['SHEET_READ_FAILED', f => { f.range.getFormulas.mockImplementation(fail); }],
  ['SHEET_READ_FAILED', f => { f.range.getValues.mockImplementation(fail); }],
  ['SHEET_READ_FAILED', f => { f.range.getRichTextValues.mockImplementation(fail); }],
  ['SNAPSHOT_INVALID', f => { f.book.getId.mockReturnValue('wrong-id'); }],
  ['SNAPSHOT_INVALID', f => { f.book.getSheets.mockReturnValue([]); }],
];
it.each(cases)('reports only the source failure stage in manual readiness: %s (%#)', (inspectionFailure, configure) => {
  const f = fixture(); configure(f); const before = JSON.stringify([...f.props]);
  const result = f.readOnlyPreflight();
  expect(result).toMatchObject({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', resetAllowed: false });
  expect(result.sources).toHaveLength(3);
  for (const source of result.sources) {
    expect(source).toMatchObject({ status: 'BLOCKED', inspectionFailure,
      dependencies: { externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' } });
    expect(source.blockers).toEqual(['SOURCE_INSPECTION_FAILED', 'EXTERNAL_CONNECTIONS_UNKNOWN', 'BOUND_SCRIPTS_UNKNOWN', 'TRIGGERS_UNKNOWN']);
  }
  expect(f.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(result));
  for (const value of ['private-cell-content', 'private-token', 'private@example.test', 'private-subject', 'Authorization', 'Bearer']) {
    expect(JSON.stringify(f.log.mock.calls)).not.toContain(value);
  }
  const ordinary = new TestAdminDiagnostics(f.ports).preflight();
  expect(ordinary.sources.every(source => source.inspectionFailure === undefined && source.blockers.includes('SOURCE_INSPECTION_FAILED'))).toBe(true);
  expect(JSON.stringify([...f.props])).toBe(before);
  if (inspectionFailure.startsWith('DRIVE_') || inspectionFailure === 'SOURCE_FILE_INVALID') expect(f.openById).not.toHaveBeenCalled();
  if (inspectionFailure === 'RISK_SCAN_LIMIT') expect(f.sheet.getRange).not.toHaveBeenCalled();
});

it('handles invalid hazards and unknown inspectors without copying arbitrary errors', () => {
  const f = fixture();
  for (const mode of ['hazards', 'unknown'] as const) {
    f.ports.spreadsheets = { inspect: id => {
      if (mode === 'unknown') throw { get message() { throw Error(secret); } };
      return { id, sheets: ['valid-sheet'], hazards: null } as any;
    } };
    const result = new TestAdminDiagnostics(f.ports).preflightForReadiness();
    expect(result.sources.every(source => source.inspectionFailure === (mode === 'unknown' ? 'SPREADSHEET_INSPECTION_FAILED' : 'SNAPSHOT_INVALID'))).toBe(true);
    expect(result.sources.every(source => source.inspectionDetail === 'UNKNOWN')).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
  }
});

it('never copies an unrecognized detail value and keeps detail out of ordinary admin results', () => {
  const f = fixture(); f.ports.spreadsheets = { inspect: () => {
    throw new SpreadsheetInspectionError('SHEET_READ_FAILED', undefined, undefined, undefined, secret as any);
  } };
  const result = new TestAdminDiagnostics(f.ports).preflightForReadiness();
  expect(result.status).toBe('BLOCKED'); expect(result.resetAllowed).toBe(false);
  expect(result.sources.every(source => source.inspectionFailure === 'SHEET_READ_FAILED' && source.inspectionDetail === 'UNKNOWN')).toBe(true);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(new TestAdminDiagnostics(f.ports).preflight().sources.every(source => source.inspectionDetail === undefined)).toBe(true);
});

it('keeps the 250000 cell limit and successful scan output identical in both modes', () => {
  const f = fixture(); const id = TEST_RESET_SOURCES.MASTER.id;
  f.book.getSheets.mockImplementation(() => [{ ...f.sheet, getName: () => 'sheet' }]);
  f.sheet.getLastRow.mockReturnValue(500); f.sheet.getLastColumn.mockReturnValue(500);
  f.range.getValues.mockReturnValue([]); f.range.getFormulas.mockReturnValue([]); f.range.getRichTextValues.mockReturnValue([]);
  const standard = gasSpreadsheetInspector(f.api), diagnostic = gasSpreadsheetInspector(f.api, 250000, undefined, true);
  expect(diagnostic.inspect(id, [])).toEqual(standard.inspect(id, []));
  f.sheet.getLastColumn.mockReturnValue(501);
  expect(() => standard.inspect(id, [])).toThrow(/^RISK_SCAN_LIMIT$/);
  let error: unknown; try { diagnostic.inspect(id, []); } catch (value) { error = value; }
  expect(error).toBeInstanceOf(SpreadsheetInspectionError);
  expect(error).toMatchObject({ message: 'SOURCE_INSPECTION_FAILED', reason: 'RISK_SCAN_LIMIT' });
});

it('preserves hazard detection and does not add failure detail on a completed scan', () => {
  const f = fixture(); f.range.getValues.mockReturnValue([['https://external.invalid/private-cell-content']]);
  const result = f.readOnlyPreflight();
  expect(result.sources.every(source => source.inspectionFailure === undefined && source.blockers.includes('EXTERNAL_REFERENCE_RISK') && source.hazardLocations.length > 0)).toBe(true);
  expect(f.log.mock.calls.join('')).not.toContain('private-cell-content');
});

it.each(['marker', 'admin', 'revocation'] as const)('keeps authorization fail-closed: %s', mode => {
  const f = fixture();
  if (mode === 'marker') f.props.delete(TEST_INSTALLATION_KEY);
  if (mode === 'admin') f.props.delete(TEST_USERS_KEY);
  if (mode === 'revocation') {
    const original = f.openById.getMockImplementation()!;
    f.openById.mockImplementation(id => { f.props.delete(TEST_USERS_KEY); return original(id); });
  }
  expect(f.readOnlyPreflight).toThrow(mode === 'marker' ? 'TEST_CONTEXT_REQUIRED' : 'ACCESS_DENIED');
  if (mode !== 'revocation') expect(f.getFileById).not.toHaveBeenCalled();
});
