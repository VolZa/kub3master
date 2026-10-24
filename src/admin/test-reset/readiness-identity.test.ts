import { afterEach, expect, it, vi } from 'vitest';
import { GoogleAdminIdentityProvider, type UserInfoRuntime } from './admin-identity';
import { adminIdentity, probeIdentity, readOnlyPreflight } from './readiness-entrypoints';
import { TEST_READINESS_SCRIPT_ID } from './readiness-target';
import { TEST_INSTALLATION_KEY } from './test-configuration';

const token = 'private-oauth-token';
const info = { iss: 'https://accounts.google.com', sub: 'private-subject', email: 'private@example.test', email_verified: true };
const sensitive = `${token} Authorization Bearer ${JSON.stringify(info)}`;
const failure = () => { throw Error(sensitive); };
function fixture() {
  const response = { getResponseCode: vi.fn(() => 200), getHeaders: vi.fn(() => ({ 'Content-Type': 'application/json' })),
    getContentText: vi.fn(() => JSON.stringify(info)) };
  const runtime = { getOAuthToken: vi.fn(() => token), fetch: vi.fn(() => response) };
  const getProperty = vi.fn((key: string) => key === TEST_INSTALLATION_KEY
    ? JSON.stringify({ version: 1, environment: 'TEST', scriptId: TEST_READINESS_SCRIPT_ID }) : null);
  const sourceRead = vi.fn(failure);
  vi.stubGlobal('PropertiesService', { getScriptProperties: () => ({ getProperty }) });
  vi.stubGlobal('ScriptApp', { getScriptId: () => TEST_READINESS_SCRIPT_ID, getService: () => ({ getUrl: () => null }),
    getOAuthToken: runtime.getOAuthToken });
  vi.stubGlobal('UrlFetchApp', { fetch: runtime.fetch });
  vi.stubGlobal('SpreadsheetApp', { openById: sourceRead });
  vi.stubGlobal('DriveApp', { getFileById: sourceRead });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { response, runtime, getProperty, sourceRead, log };
}
type Fixture = ReturnType<typeof fixture>;
const cases: [string, (f: Fixture) => void, number?][] = [
  ['OAUTH_TOKEN_UNAVAILABLE', f => { f.runtime.getOAuthToken.mockImplementation(failure); }],
  ['OAUTH_TOKEN_MISSING', f => { f.runtime.getOAuthToken.mockReturnValue(''); }],
  ['OAUTH_TOKEN_INVALID', f => { f.runtime.getOAuthToken.mockReturnValue('bad token'); }],
  ['USERINFO_REQUEST_FAILED', f => { f.runtime.fetch.mockImplementation(failure); }],
  ['USERINFO_RESPONSE_INVALID', f => { f.response.getResponseCode.mockReturnValue(NaN); }],
  ...[301, 401, 403, 500].map((status): [string, (f: Fixture) => void, number] =>
    ['USERINFO_HTTP_DENIED', f => { f.response.getResponseCode.mockReturnValue(status); }, status]),
  ['USERINFO_CONTENT_TYPE_INVALID', f => { f.response.getHeaders.mockReturnValue({ 'Content-Type': 'text/html' }); }],
  ['USERINFO_BODY_INVALID', f => { f.response.getContentText.mockReturnValue(sensitive.repeat(1000)); }],
  ['USERINFO_JSON_INVALID', f => { f.response.getContentText.mockReturnValue(`{${sensitive}`); }],
  ...[null, [], {}, { ...info, iss: 'https://attacker.test' }, { ...info, sub: '' }, { ...info, sub: 'bad subject' },
    { ...info, email: 'invalid' }, { ...info, email_verified: false }, { ...info, email_verified: 'true' }]
    .map((value): [string, (f: Fixture) => void] =>
      ['IDENTITY_FIELDS_INVALID', f => { f.response.getContentText.mockReturnValue(JSON.stringify(value)); }]),
];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(cases)('reports only safe manual-probe detail: %s (%#)', (reason, configure, httpStatus) => {
  const f = fixture(); configure(f);
  const expected = { status: 'BLOCKED', operation: 'IDENTITY_PROBE', code: 'ACCESS_DENIED', resetAllowed: false,
    reason, ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(reason === 'USERINFO_REQUEST_FAILED' ? { requestFailure: 'OTHER_REQUEST_ERROR' } : {}) };
  expect(probeIdentity()).toEqual(expected);
  expect(f.log).toHaveBeenCalledWith(JSON.stringify(expected));
  const logged = JSON.stringify(f.log.mock.calls);
  for (const secret of [token, info.sub, info.email, 'Authorization', 'Bearer', sensitive]) expect(logged).not.toContain(secret);
  const provider = new GoogleAdminIdentityProvider(f.runtime as UserInfoRuntime);
  for (const call of [() => provider.probe(), () => provider.current()]) {
    try { call(); expect.fail('must deny'); }
    catch (error) { expect(error).toBeInstanceOf(Error); expect((error as Error).message).toBe('ACCESS_DENIED');
      expect(Object.keys(error as object)).toEqual([]); }
  }
  expect(adminIdentity()).toEqual({ status: 'BLOCKED', operation: 'ADMIN_IDENTITY', code: 'ACCESS_DENIED', resetAllowed: false });
  expect(readOnlyPreflight()).toEqual({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', code: 'ACCESS_DENIED', resetAllowed: false });
  expect(f.sourceRead).not.toHaveBeenCalled();
  if (reason.startsWith('OAUTH_TOKEN_')) expect(f.runtime.fetch).not.toHaveBeenCalled();
  if (reason === 'USERINFO_HTTP_DENIED') {
    expect(f.response.getHeaders).not.toHaveBeenCalled(); expect(f.response.getContentText).not.toHaveBeenCalled();
  }
});

it('checks installation before the diagnostic token path', () => {
  const f = fixture(); f.getProperty.mockReturnValue(null);
  expect(probeIdentity()).toEqual({ status: 'BLOCKED', operation: 'IDENTITY_PROBE', code: 'TEST_CONTEXT_REQUIRED', resetAllowed: false });
  expect(f.runtime.getOAuthToken).not.toHaveBeenCalled();
});

const requestFailures: [string, unknown][] = [
  ...['Authorization is required to perform that action.',
    'You do not have permission to call UrlFetchApp.fetch. Required permissions: script.external_request',
    'Exception: You do not have permission to call fetch.', 'Access denied: UrlFetchApp.']
    .map((text): [string, unknown] => ['AUTHORIZATION_REQUIRED', Error(`${text} ${sensitive}`)]),
  ...['DNS error:', 'Address unavailable:', 'Timeout:', 'Connection timed out:',
    'Connection reset:', 'Connection refused:', 'Socket timeout:', 'Socket closed:', 'SSL error:', 'Network error:']
    .map((text): [string, unknown] => ['NETWORK_FAILURE', Error(`${text} ${sensitive}`)]),
  ['NETWORK_FAILURE', { message: `Exception: DNS error: ${sensitive}` }],
  ['AUTHORIZATION_REQUIRED', `Error: Authorization is required to perform that action. ${sensitive}`],
  ...['Service invoked too many times: urlfetch.', 'Invalid argument:', 'Server error occurred, please try again.',
    'URL is not in the urlFetchWhitelist:', 'Немає дозволу на виклик.',
    'Unrecognized error mentioning Authorization, DNS error or Timeout:']
    .map((text): [string, unknown] => ['OTHER_REQUEST_ERROR', Error(`${text} ${sensitive}`)]),
  ['OTHER_REQUEST_ERROR', null], ['OTHER_REQUEST_ERROR', undefined], ['OTHER_REQUEST_ERROR', 403],
  ['OTHER_REQUEST_ERROR', { message: 403 }],
  ['OTHER_REQUEST_ERROR', { get message() { throw Error(sensitive); } }],
  ['OTHER_REQUEST_ERROR', { toString() { throw Error(sensitive); } }],
  ['OTHER_REQUEST_ERROR', Error(`DNS error: ${sensitive.repeat(1000)}`)],
];
it.each(requestFailures)('classifies synchronous fetch failures without leaking details: %s (%#)', (requestFailure, error) => {
  const f = fixture(); f.runtime.fetch.mockImplementation(() => { throw error; });
  const before = f.getProperty(TEST_INSTALLATION_KEY);
  const expected = { status: 'BLOCKED', operation: 'IDENTITY_PROBE', code: 'ACCESS_DENIED', resetAllowed: false,
    reason: 'USERINFO_REQUEST_FAILED', requestFailure };
  expect(probeIdentity()).toEqual(expected);
  expect(f.log).toHaveBeenCalledExactlyOnceWith(JSON.stringify(expected));
  expect(f.runtime.fetch).toHaveBeenCalledExactlyOnceWith('https://openidconnect.googleapis.com/v1/userinfo', {
    method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true,
    followRedirects: false, muteHttpExceptions: true });
  for (const call of [() => new GoogleAdminIdentityProvider(f.runtime).current(), () => new GoogleAdminIdentityProvider(f.runtime).probe()]) {
    let caught: unknown; try { call(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error); expect((caught as Error).message).toBe('ACCESS_DENIED');
    expect(Object.keys(caught as object)).toEqual([]);
  }
  expect(adminIdentity()).toEqual({ status: 'BLOCKED', operation: 'ADMIN_IDENTITY', code: 'ACCESS_DENIED', resetAllowed: false });
  expect(readOnlyPreflight()).toEqual({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', code: 'ACCESS_DENIED', resetAllowed: false });
  expect(f.response.getResponseCode).not.toHaveBeenCalled(); expect(f.sourceRead).not.toHaveBeenCalled();
  expect(f.getProperty(TEST_INSTALLATION_KEY)).toBe(before);
  const logged = JSON.stringify(f.log.mock.calls);
  for (const secret of [token, info.email, info.sub, 'Authorization', 'Bearer', sensitive]) expect(logged).not.toContain(secret);
});

it('does not classify a response accessor exception as a fetch failure', () => {
  const f = fixture(); f.response.getResponseCode.mockImplementation(() => { throw Error('DNS error: private'); });
  expect(probeIdentity()).toEqual({ status: 'BLOCKED', operation: 'IDENTITY_PROBE', code: 'ACCESS_DENIED',
    resetAllowed: false, reason: 'USERINFO_RESPONSE_INVALID' });
});

it('preserves successful verified identity with an optional matching issuer', () => {
  const f = fixture();
  for (const value of [info, { sub: info.sub, email: info.email, email_verified: true }]) {
    f.response.getContentText.mockReturnValue(JSON.stringify(value));
    expect(probeIdentity()).toEqual({ status: 'PASS', operation: 'IDENTITY_PROBE', issuer: info.iss,
      subject: info.sub, email: info.email, rolesAssigned: false, authorizationGranted: false, resetAllowed: false });
  }
});
