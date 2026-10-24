import { afterEach, expect, it, vi } from 'vitest';
import { probeSheetsApi } from './readiness-entrypoints';
import { TEST_USERS_KEY } from './admin-preflight';
import { TEST_INSTALLATION_KEY } from './test-configuration';
import { TEST_READINESS_SCRIPT_ID } from './readiness-target';
import { PRODUCTION_SCRIPT_ID, TEST_RESET_SOURCES } from './test-sources';
import { SHEETS_READ_URL } from './sheets-api-risk-adapter';
import { USERINFO_URL } from './admin-identity';

const propertyKey = 'KUB_TEST_DIAGNOSTIC_SHEET_ID', diagnosticId = 'independent-diagnostic-sheet-1234567890';
const token = 'private-oauth-token', subject = 'private-subject', email = 'private@example.test';
const sensitive = `${SHEETS_READ_URL}${diagnosticId} ${token} ${subject} ${email} Authorization Bearer`;
function fixture() {
  const user = { issuer: 'https://accounts.google.com', subject, email, active: true, roles: ['ADMIN'], authorizationVersion: 1 };
  const properties = new Map([
    [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: TEST_READINESS_SCRIPT_ID })],
    [TEST_USERS_KEY, JSON.stringify({ version: 1, users: [user] })], [propertyKey, diagnosticId],
  ]);
  const forbidden = vi.fn(() => { throw Error(sensitive); });
  const response = { getResponseCode: vi.fn(() => 200), getHeaders: forbidden, getContentText: forbidden,
    getContent: forbidden, getBlob: forbidden };
  const identityResponse = { getResponseCode: vi.fn(() => 200), getHeaders: () => ({ 'Content-Type': 'application/json' }),
    getContentText: () => JSON.stringify({ sub: subject, email, email_verified: true }) };
  const scriptId = vi.fn(() => TEST_READINESS_SCRIPT_ID), webAppUrl = vi.fn((): string | null => null), getOAuthToken = vi.fn(() => token);
  const getProperty = vi.fn((key: string) => properties.get(key) ?? null);
  const fetch = vi.fn((url: string, options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => {
    expect(options).toEqual({ method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true,
      followRedirects: false, muteHttpExceptions: true });
    if (url === USERINFO_URL) return identityResponse;
    expect(url).toBe(`${SHEETS_READ_URL}${properties.get(propertyKey)}?fields=spreadsheetId`);
    return response;
  });
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ getProperty, setProperty: forbidden }) });
  vi.stubGlobal('ScriptApp', { getScriptId: scriptId, getService: () => ({ getUrl: webAppUrl }), getOAuthToken });
  vi.stubGlobal('UrlFetchApp', { fetch });
  vi.stubGlobal('DriveApp', { getFileById: forbidden }); vi.stubGlobal('SpreadsheetApp', { openById: forbidden });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { properties, user, response, identityResponse, forbidden, scriptId, webAppUrl, getOAuthToken, getProperty, fetch, log,
    sheetCalls: () => fetch.mock.calls.filter(([url]) => url.startsWith(SHEETS_READ_URL)) };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
type Fixture = ReturnType<typeof fixture>;
function check(f: Fixture, httpStatus: 200 | 401 | 403 | 404 | 'OTHER' | 'REQUEST_FAILED') {
  const before = JSON.stringify([...f.properties]), result = probeSheetsApi();
  expect(result).toEqual({ operation: 'SHEETS_API_PROBE', status: httpStatus === 200 ? 'PASS' : 'BLOCKED', httpStatus, resetAllowed: false });
  expect(f.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(result));
  expect(f.forbidden).not.toHaveBeenCalled(); expect(JSON.stringify([...f.properties])).toBe(before);
  for (const value of [diagnosticId, SHEETS_READ_URL, token, subject, email, 'Authorization', 'Bearer',
    ...Object.values(TEST_RESET_SOURCES).map(source => source.id)]) expect(JSON.stringify(f.log.mock.calls)).not.toContain(value);
}

it.each([200, 401, 403, 404, 201, 204, 301, 400, 429, 500, 503, NaN] as const)('returns only the allowlisted HTTP result without reading Sheets body/headers: %s', code => {
  const f = fixture(); f.response.getResponseCode.mockReturnValue(code);
  check(f, code === 200 || code === 401 || code === 403 || code === 404 ? code : 'OTHER');
  expect(f.sheetCalls()).toHaveLength(1); expect(f.fetch.mock.calls[0][0]).toBe(USERINFO_URL);
  expect(f.getProperty).toHaveBeenCalledWith(propertyKey);
});

it.each(['fetch', 'status', 'token'] as const)('sanitizes request failures: %s', mode => {
  const f = fixture();
  if (mode === 'fetch') {
    const original = f.fetch.getMockImplementation()!;
    f.fetch.mockImplementation((url, options) => { if (url.startsWith(SHEETS_READ_URL)) throw Error(sensitive); return original(url, options); });
  }
  if (mode === 'status') f.response.getResponseCode.mockImplementation(() => { throw Error(sensitive); });
  if (mode === 'token') f.getOAuthToken.mockReturnValueOnce(token).mockImplementation(() => { throw Error(sensitive); });
  check(f, 'REQUEST_FAILED'); expect(f.sheetCalls()).toHaveLength(mode === 'token' ? 0 : 1);
});

it.each([null, '', 'short', 'has spaces in invalid diagnostic id', 'https://docs.google.com/spreadsheets/d/sheet-id',
  'x'.repeat(201), '../invalid-path-diagnostic-id', 'valid-looking-id-with-query?fields=sheets',
  ...Object.values(TEST_RESET_SOURCES).map(source => source.id)])('blocks invalid or production diagnostic ID before any Sheets request (%#)', id => {
  const f = fixture(); if (id === null) f.properties.delete(propertyKey); else f.properties.set(propertyKey, id);
  check(f, 'REQUEST_FAILED'); expect(f.sheetCalls()).toHaveLength(0);
});

it.each(['x'.repeat(20), 'x'.repeat(200)])('accepts bounded plain identifier formats (%#)', id => {
  const f = fixture(); f.properties.set(propertyKey, id); check(f, 200); expect(f.sheetCalls()).toHaveLength(1);
});

it.each(['missing-marker', 'malformed-marker', 'wrong-marker', 'wrong-script', 'production-script', 'web-app'] as const)(
  'enforces TEST installation and exact target before authorization or request: %s', mode => {
    const f = fixture();
    if (mode === 'missing-marker') f.properties.delete(TEST_INSTALLATION_KEY);
    if (mode === 'malformed-marker') f.properties.set(TEST_INSTALLATION_KEY, '{');
    if (mode === 'wrong-marker') f.properties.set(TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: 'wrong-script' }));
    if (mode === 'wrong-script') f.scriptId.mockReturnValue('another-test-script-id');
    if (mode === 'production-script') f.scriptId.mockReturnValue(PRODUCTION_SCRIPT_ID);
    if (mode === 'web-app') f.webAppUrl.mockReturnValue('https://script.google.com/macros/s/private-deployment/exec');
    check(f, 'REQUEST_FAILED'); expect(f.fetch).not.toHaveBeenCalled(); expect(f.getOAuthToken).not.toHaveBeenCalled();
    expect(f.getProperty).not.toHaveBeenCalledWith(propertyKey);
  });

it.each(['missing-admin', 'inactive', 'manager', 'unknown', 'malformed-directory', 'identity-denied'] as const)(
  'requires a current active TEST ADMIN before reading the diagnostic ID: %s', mode => {
    const f = fixture();
    if (mode === 'inactive') f.user.active = false;
    if (mode === 'manager') f.user.roles = ['MANAGER'];
    if (mode === 'unknown') f.user.subject = 'different-subject';
    f.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [f.user] }));
    if (mode === 'missing-admin') f.properties.delete(TEST_USERS_KEY);
    if (mode === 'malformed-directory') f.properties.set(TEST_USERS_KEY, '{');
    if (mode === 'identity-denied') f.identityResponse.getResponseCode.mockReturnValue(403);
    check(f, 'REQUEST_FAILED'); expect(f.sheetCalls()).toHaveLength(0);
    expect(f.getProperty).not.toHaveBeenCalledWith(propertyKey);
  });
