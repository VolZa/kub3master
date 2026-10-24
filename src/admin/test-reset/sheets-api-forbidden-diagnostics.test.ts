import { expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { sheetsApiRiskInspector } from './sheets-api-risk-adapter';
import { TestAdminDiagnostics, TEST_USERS_KEY, type AdminPreflightPorts } from './admin-preflight';
import { TEST_INSTALLATION_KEY } from './test-configuration';
import { SpreadsheetInspectionError } from './spreadsheet-risk-inspector';

const secret = 'private-token private@example.test private-subject https://sheets.googleapis.com/v4/spreadsheets/private-id';
const detail = (reason: string) => ({ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', domain: 'googleapis.com', reason,
  metadata: { service: 'sheets.googleapis.com', consumer: secret } });
const payload = (details?: unknown) => ({ error: { code: 403, status: 'PERMISSION_DENIED', message: secret, ...(details === undefined ? {} : { details }) } });
function fixture(value: unknown, headers?: Record<string, any>) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  const response = { getResponseCode: vi.fn(() => 403), getHeaders: vi.fn(() => headers ?? {
    'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') }), getContentText: vi.fn(() => body) };
  const runtime = { getOAuthToken: () => 'private-token', fetch: vi.fn(() => response) };
  const scan = () => sheetsApiRiskInspector(runtime, ['source-id']).inspect('source-id', []);
  return { response, runtime, scan };
}
const cases: [string, unknown][] = [
  ...['SERVICE_DISABLED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'PERMISSION_DENIED'].map((reason): [string, unknown] => [reason, payload([detail(reason)])]),
  ['PERMISSION_DENIED', payload()], ['PERMISSION_DENIED', payload([])],
  ['PERMISSION_DENIED', payload([{ '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: secret, url: secret }] }])],
  ['SERVICE_DISABLED', payload([detail('SERVICE_DISABLED'), detail('SERVICE_DISABLED')])],
  ['UNKNOWN', payload([detail('OTHER_REASON')])], ['UNKNOWN', payload([detail(secret)])],
  ['UNKNOWN', payload([detail('SERVICE_DISABLED'), detail('ACCESS_TOKEN_SCOPE_INSUFFICIENT')])],
  ['UNKNOWN', payload([{ ...detail('SERVICE_DISABLED'), domain: 'untrusted.example' }])],
  ['UNKNOWN', payload([{ ...detail('SERVICE_DISABLED'), metadata: { service: 'other.googleapis.com' } }])],
  ['UNKNOWN', payload([{ ...detail('SERVICE_DISABLED'), metadata: null }])],
  ['UNKNOWN', payload(null)], ['UNKNOWN', payload([null])], ['UNKNOWN', payload({ reason: 'SERVICE_DISABLED' })],
  ['UNKNOWN', payload([{ reason: 'SERVICE_DISABLED' }])],
  ['UNKNOWN', payload(Array.from({ length: 17 }, () => detail('SERVICE_DISABLED')))],
  ['UNKNOWN', { error: { code: 401, status: 'PERMISSION_DENIED', details: [detail('SERVICE_DISABLED')] } }],
  ['UNKNOWN', { error: { code: 403, status: 'INVALID_ARGUMENT', details: [detail('SERVICE_DISABLED')] } }],
  ['UNKNOWN', { error: { code: 403, message: 'SERVICE_DISABLED ACCESS_TOKEN_SCOPE_INSUFFICIENT' } }],
  ['UNKNOWN', { error: { code: '403', status: 'PERMISSION_DENIED' } }],
  ['UNKNOWN', null], ['UNKNOWN', []], ['UNKNOWN', {}], ['UNKNOWN', { error: [] }], ['UNKNOWN', `{${secret}`],
  ['SERVICE_DISABLED', { error: { code: 403, status: 'PERMISSION_DENIED', message: `Приватне повідомлення ${secret}`, details: [detail('SERVICE_DISABLED')] } }],
];
const validLength = Buffer.byteLength(JSON.stringify(payload([detail('SERVICE_DISABLED')])));
const headerCases: [Record<string, any>, boolean, boolean, boolean, number][] = [
  [{}, false, false, false, 0],
  [{ 'Content-Type': 'application/json' }, false, true, false, 0],
  [{ 'cOnTeNt-TyPe': 'APPLICATION/JSON; charset=UTF-8', 'CONTENT-LENGTH': validLength }, true, true, false, 1],
  [{ 'Content-Type': 'application/json', 'Content-Length': validLength, 'Content-Encoding': 'identity' }, true, true, true, 1],
  [{ 'Content-Type': 'application/json', 'Content-Length': validLength, 'Content-Encoding': undefined }, true, true, true, 1],
  [{ 'Content-Type': 'application/json', 'Content-Length': validLength, 'Content-Encoding': 'gzip' }, true, true, true, 0],
  [{ 'Content-Type': 'application/json', 'Content-Length': 'invalid', 'Content-Encoding': null }, true, true, true, 0],
  [{ 'Content-Type': 'application/json', 'Content-Length': undefined }, true, true, false, 0],
  [{ 'Content-Type': 'application/json', 'Content-Length': null }, true, true, false, 0],
  [{ 'Content-Type': 'application/json', 'Content-Length': ['12'] }, true, true, false, 0],
  [{ 'Content-Type': 'application/json', 'Content-Length': 16385 }, true, true, false, 0],
  [{ 'Content-Type': 'text/html', 'Content-Length': validLength }, true, false, false, 0],
  [{ 'Content-Type': 'application/json-invalid', 'Content-Length': validLength }, true, false, false, 0],
  [{ 'Content-Type': ['application/json'], 'Content-Length': validLength }, true, false, false, 0],
  [{ 'Content-Type': null, 'Content-Length': validLength }, true, false, false, 0],
  [{ 'Content-Type': 123, 'Content-Length': validLength }, true, false, false, 0],
];
it.each(headerCases)('reports only header presence and JSON format without any extra body read (%#)', (headers, hasContentLength, isJsonContentType, hasContentEncoding, bodyReads) => {
  const f = fixture(payload([detail('SERVICE_DISABLED')]), headers);
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect(JSON.parse(JSON.stringify(caught))).toEqual({ reason: 'SPREADSHEET_ACCESS_FAILED', accessFailure: 'HTTP_403',
    apiReason: bodyReads ? 'SERVICE_DISABLED' : 'UNKNOWN', headerFlags: { hasContentLength, isJsonContentType, hasContentEncoding } });
  expect(f.response.getHeaders).toHaveBeenCalledOnce(); expect(f.response.getContentText).toHaveBeenCalledTimes(bodyReads);
});

it('keeps flags false when response headers cannot be inspected, without retrying or reading body', () => {
  const f = fixture(payload()); f.response.getHeaders.mockImplementation(() => { throw Error(secret); });
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect((caught as SpreadsheetInspectionError).headerFlags).toEqual({ hasContentLength: false, isJsonContentType: false, hasContentEncoding: false });
  expect((caught as SpreadsheetInspectionError).apiReason).toBe('UNKNOWN');
  expect(f.response.getHeaders).toHaveBeenCalledOnce(); expect(f.response.getContentText).not.toHaveBeenCalled();
});

it.each(cases)('returns only allowlisted structured 403 classifications: %s (%#)', (apiReason, value) => {
  const f = fixture(value);
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SpreadsheetInspectionError);
  expect(JSON.parse(JSON.stringify(caught))).toEqual({ reason: 'SPREADSHEET_ACCESS_FAILED', accessFailure: 'HTTP_403', apiReason,
    headerFlags: { hasContentLength: true, isJsonContentType: true, hasContentEncoding: false } });
  expect((caught as Error).message).toBe('SOURCE_INSPECTION_FAILED');
  expect(f.response.getContentText).toHaveBeenCalledOnce();
});

it.each([
  {}, { 'Content-Type': 'text/html', 'Content-Length': 10 },
  { 'Content-Type': 'application/json' }, { 'Content-Type': 'application/json', 'Content-Length': 16385 },
  { 'Content-Type': 'application/json', 'Content-Length': 0 }, { 'Content-Type': 'application/json', 'Content-Length': '-1' },
  { 'Content-Type': 'application/json', 'Content-Length': ['100'] },
  { 'Content-Type': 'application/json', 'Content-Length': 100, 'Content-Encoding': 'gzip' },
])('does not read unknown-size, oversized, compressed or non-JSON diagnostics (%#)', headers => {
  const f = fixture(payload([detail('SERVICE_DISABLED')]), headers);
  expect(() => f.scan()).toThrow('SOURCE_INSPECTION_FAILED');
  try { f.scan(); } catch (error) { expect((error as SpreadsheetInspectionError).apiReason).toBe('UNKNOWN'); }
  expect(f.response.getContentText).not.toHaveBeenCalled();
});

it.each(['headers', 'body', 'oversized', 'length-mismatch', 'unicode-bytes'] as const)('sanitizes failed or inconsistent diagnostic reads: %s', mode => {
  const f = fixture(payload([detail('SERVICE_DISABLED')]));
  if (mode === 'headers') f.response.getHeaders.mockImplementation(() => { throw Error(secret); });
  if (mode === 'body') f.response.getContentText.mockImplementation(() => { throw Error(secret); });
  if (mode === 'oversized') f.response.getContentText.mockReturnValue('x'.repeat(16385));
  if (mode === 'length-mismatch') f.response.getContentText.mockReturnValue('{}');
  if (mode === 'unicode-bytes') f.response.getContentText.mockReturnValue('я'.repeat(9000));
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ reason: 'SPREADSHEET_ACCESS_FAILED', accessFailure: 'HTTP_403', apiReason: 'UNKNOWN' });
  expect(JSON.stringify(caught)).not.toContain(secret);
});

it('accepts the 16 KiB boundary and rejects a larger declared body before reading', () => {
  const raw = JSON.stringify(payload([detail('SERVICE_DISABLED')]));
  const body = raw + ' '.repeat(16384 - Buffer.byteLength(raw));
  const f = fixture(body);
  try { f.scan(); } catch (error) { expect((error as SpreadsheetInspectionError).apiReason).toBe('SERVICE_DISABLED'); }
  const tooLarge = fixture(body + ' ');
  try { tooLarge.scan(); } catch (error) { expect((error as SpreadsheetInspectionError).apiReason).toBe('UNKNOWN'); }
  expect(tooLarge.response.getContentText).not.toHaveBeenCalled();
});

it.each(['plain', 'gzip', 'br', 'deflate', 'identity', 'malformed', 'oversized'] as const)(
  'keeps missing Content-Length UNKNOWN without reading any body representation: %s', mode => {
    const decoded = mode === 'malformed' ? '{invalid JSON' : mode === 'oversized' ? 'x'.repeat(16385) : JSON.stringify(payload([detail('SERVICE_DISABLED')]));
    const headers = { 'Content-Type': 'application/json',
      ...(['gzip', 'br', 'deflate', 'identity'].includes(mode) ? { 'Content-Encoding': mode } : {}) };
    const f = fixture(decoded, headers);
    const getContent = vi.fn(() => { throw Error(secret); }), getBlob = vi.fn(() => { throw Error(secret); });
    Object.assign(f.response, { getContent, getBlob });
    let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ reason: 'SPREADSHEET_ACCESS_FAILED', accessFailure: 'HTTP_403', apiReason: 'UNKNOWN',
      headerFlags: { hasContentLength: false, isJsonContentType: true, hasContentEncoding: 'Content-Encoding' in headers } });
    expect(f.response.getContentText).not.toHaveBeenCalled();
    expect(getContent).not.toHaveBeenCalled(); expect(getBlob).not.toHaveBeenCalled();
    expect(f.runtime.fetch).toHaveBeenCalledOnce(); // No retry attempting to weaken the guard.
    expect(JSON.stringify(caught)).not.toContain(secret);
  });

it.each([false, true])('does not decompress a small gzip payload with an oversized decoded error (Content-Length: %s)', withLength => {
  const decoded = JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'x'.repeat(128 * 1024),
    details: [detail('SERVICE_DISABLED')] } });
  const compressed = gzipSync(Buffer.from(decoded, 'utf8'));
  expect(compressed.byteLength).toBeLessThan(16384); expect(Buffer.byteLength(decoded)).toBeGreaterThan(16384);
  const f = fixture(decoded, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip',
    ...(withLength ? { 'Content-Length': compressed.byteLength } : {}) });
  const getContent = vi.fn(() => [...compressed]), getBlob = vi.fn(() => ({ getBytes: () => [...compressed] }));
  Object.assign(f.response, { getContent, getBlob });
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ reason: 'SPREADSHEET_ACCESS_FAILED', accessFailure: 'HTTP_403', apiReason: 'UNKNOWN',
    headerFlags: { hasContentLength: withLength, isJsonContentType: true, hasContentEncoding: true } });
  expect(f.response.getContentText).not.toHaveBeenCalled(); expect(getContent).not.toHaveBeenCalled(); expect(getBlob).not.toHaveBeenCalled();
});

it.each(['{invalid JSON', 'x'.repeat(16385)])('fails closed on malformed or oversized uncompressed JSON with a known length (%#)', body => {
  const f = fixture(body);
  let caught: unknown; try { f.scan(); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ reason: 'SPREADSHEET_ACCESS_FAILED', accessFailure: 'HTTP_403', apiReason: 'UNKNOWN' });
  expect(f.response.getContentText).toHaveBeenCalledTimes(Buffer.byteLength(body) > 16384 ? 0 : 1);
});

it('exposes the 403 reason only in guarded readiness diagnostics, retaining UNKNOWN dependencies and no writes', () => {
  const f = fixture(payload([detail('SERVICE_DISABLED')])), scriptId = 'isolated-test-script';
  const properties = new Map([
    [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId })],
    [TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com', subject: 'subject',
      email: 'admin@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] })],
  ]);
  const ports: AdminPreflightPorts = { properties: { getProperty: key => properties.get(key) ?? null }, scriptId: () => scriptId,
    webAppUrl: () => null, now: Date.now,
    identity: { getOAuthToken: () => 'token', fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }),
      getContentText: () => JSON.stringify({ sub: 'subject', email: 'admin@example.test', email_verified: true }) }) },
    sources: { MASTER: { id: 'source-id', requiredSheets: ['data'] }, OPERATIONAL: { id: 'other-source', requiredSheets: ['data'] }, REPORTING: { id: 'third-source', requiredSheets: ['data'] } },
    sourceFile: id => ({ id, mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false }),
    spreadsheets: sheetsApiRiskInspector(f.runtime, ['source-id', 'other-source', 'third-source']),
    dependencies: { inspect: fileId => ({ fileId, evidenceId: '', externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' }) } };
  const before = JSON.stringify([...properties]), admin = new TestAdminDiagnostics(ports);
  const result = admin.preflightForReadiness();
  expect(result).toMatchObject({ status: 'BLOCKED', resetAllowed: false });
  for (const source of result.sources) expect(source).toMatchObject({ status: 'BLOCKED', inspectionFailure: 'SPREADSHEET_ACCESS_FAILED',
    inspectionAccessFailure: 'HTTP_403', inspectionApiReason: 'SERVICE_DISABLED',
    hasContentLength: true, isJsonContentType: true, hasContentEncoding: false,
    dependencies: { externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' } });
  expect(admin.preflight().sources.every(source => source.inspectionApiReason === undefined && source.inspectionAccessFailure === undefined &&
    source.hasContentLength === undefined && source.isJsonContentType === undefined && source.hasContentEncoding === undefined)).toBe(true);
  expect(JSON.stringify([...properties])).toBe(before); expect(JSON.stringify(result)).not.toContain(secret);
  f.runtime.fetch.mockClear(); properties.delete(TEST_USERS_KEY);
  expect(() => admin.preflightForReadiness()).toThrow('ACCESS_DENIED'); expect(f.runtime.fetch).not.toHaveBeenCalled();
});
