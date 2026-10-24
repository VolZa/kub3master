import { expect, it, vi } from 'vitest';
import { GoogleAdminIdentityProvider, USERINFO_URL } from './admin-identity';
import { TestAdminDiagnostics, TEST_USERS_KEY, type AdminPreflightPorts } from './admin-preflight';
import { TEST_INSTALLATION_KEY, TEST_CONFIG_KEY, ROLES } from './test-configuration';
import { PRODUCTION_SCRIPT_ID } from './test-sources';

function fixture() {
  const script = 'isolated-test-admin-script', sub = 'confirmed-google-subject', token = 'opaque-token-must-not-be-logged';
  const user = { issuer: 'https://accounts.google.com', subject: sub, email: 'informational@example.invalid', active: true, roles: ['ADMIN'], authorizationVersion: 1 };
  const props = new Map<string, string>([
    [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: script })],
    [TEST_USERS_KEY, JSON.stringify({ version: 1, users: [user] })],
  ]);
  let response: unknown = { sub, email: 'verified@example.invalid', email_verified: true };
  const fetch = vi.fn(() => ({ getResponseCode: (): number => 200, getHeaders: () => ({ 'Content-Type': 'application/json; charset=UTF-8' }), getContentText: () => JSON.stringify(response) }));
  const tokenProvider = vi.fn(() => token);
  const sources = {
    MASTER: { id: 'production-master', requiredSheets: ['00_Elements', '01_BOM', '05_Materials'] },
    OPERATIONAL: { id: 'production-operational', requiredSheets: ['01_Виготовлення'] },
    REPORTING: { id: 'production-reporting', requiredSheets: ['ВідомістьВитрат'] },
  };
  const sourceFile = vi.fn(id => ({ id, mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false }));
  const inspect = vi.fn((id: string) => ({ id, sheets: [...sources[ROLES.find(r => sources[r].id === id)!].requiredSheets], hazards: [] as string[] }));
  const ports: AdminPreflightPorts = {
    properties: { getProperty: key => props.get(key) ?? null }, scriptId: () => script, webAppUrl: () => null,
    identity: { getOAuthToken: tokenProvider, fetch }, sources, sourceFile, spreadsheets: { inspect },
    dependencies: { inspect: fileId => ({ fileId, evidenceId: 'isolated-test-evidence', externalConnections: 'SAFE', boundScripts: 'SAFE', triggers: 'SAFE' }) },
    now: () => 1800000000000,
  };
  const admin = () => new TestAdminDiagnostics(ports);
  const saveUser = () => props.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [user] }));
  return { admin, ports, props, user, saveUser, fetch, tokenProvider, sourceFile, inspect, response: (value: unknown) => { response = value; }, token };
}
it('uses fixed Google UserInfo endpoint, TLS/no redirects, verified issuer+subject, and preserves read-only state', () => {
  const f = fixture(), before = JSON.stringify([...f.props]);
  const result = f.admin().preflight();
  expect(result).toMatchObject({ status: 'PASS', resetAllowed: false, configKey: TEST_CONFIG_KEY, configState: 'UNINITIALIZED' });
  expect(f.sourceFile).toHaveBeenCalledTimes(3); expect(f.inspect).toHaveBeenCalledTimes(3);
  expect(f.fetch.mock.calls[0]).toEqual([USERINFO_URL, expect.objectContaining({ method: 'get', followRedirects: false, validateHttpsCertificates: true,
    headers: { Authorization: `Bearer ${f.token}` } })]);
  expect(JSON.stringify(result)).not.toContain(f.token); expect(JSON.stringify([...f.props])).toBe(before);
  expect(f.admin().identity()).toMatchObject({ status: 'PASS', issuer: 'https://accounts.google.com', subject: f.user.subject, permission: 'USER_MANAGE' });
});
it.each(['unknown', 'inactive', 'MANAGER', 'ERP_OWNER', 'WORKSHOP_MANAGER', 'TECHNOLOGIST', 'missing-directory', 'malformed-directory'] as const)('denies %s before any production source read', mode => {
  const f = fixture();
  if (mode === 'unknown') f.user.subject = 'different-enrolled-subject';
  if (mode === 'inactive') f.user.active = false;
  if (mode === 'MANAGER' || mode === 'ERP_OWNER' || mode === 'WORKSHOP_MANAGER' || mode === 'TECHNOLOGIST') f.user.roles = [mode];
  f.saveUser();
  if (mode === 'missing-directory') f.props.delete(TEST_USERS_KEY);
  if (mode === 'malformed-directory') f.props.set(TEST_USERS_KEY, '{');
  expect(() => f.admin().preflight()).toThrow('ACCESS_DENIED'); expect(f.sourceFile).not.toHaveBeenCalled(); expect(f.inspect).not.toHaveBeenCalled();
});
it('never falls back to another directory or Google/browser role claims', () => {
  const f = fixture(); f.props.set('KUB_SECURITY_USERS_V1', f.props.get(TEST_USERS_KEY)!); f.props.delete(TEST_USERS_KEY);
  f.response({ sub: f.user.subject, email: 'owner@example.invalid', email_verified: true, roles: ['ADMIN'], owner: true });
  expect(() => f.admin().identity()).toThrow('ACCESS_DENIED');
});
it.each(['production', 'wrong-script', 'missing-marker', 'malformed-marker', 'wrong-environment', 'web-deployed'] as const)('blocks %s before OAuth token retrieval', mode => {
  const f = fixture();
  if (mode === 'production') f.ports.scriptId = () => PRODUCTION_SCRIPT_ID;
  if (mode === 'wrong-script') f.ports.scriptId = () => 'some-other-script';
  if (mode === 'missing-marker') f.props.delete(TEST_INSTALLATION_KEY);
  if (mode === 'malformed-marker') f.props.set(TEST_INSTALLATION_KEY, '{');
  if (mode === 'wrong-environment') f.props.set(TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'PRODUCTION', scriptId: 'isolated-test-admin-script' }));
  if (mode === 'web-deployed') f.ports.webAppUrl = () => 'https://script.google.com/some/exec';
  expect(() => f.admin().preflight()).toThrow('TEST_CONTEXT_REQUIRED'); expect(f.tokenProvider).not.toHaveBeenCalled(); expect(f.sourceFile).not.toHaveBeenCalled();
});
it.each([401, 403, 302, 500])('fails closed on HTTP %s without exposing response/token', status => {
  const f = fixture(); f.fetch.mockReturnValue({ getResponseCode: () => status, getHeaders: () => ({ 'Content-Type': 'application/json' }), getContentText: () => f.token });
  expect(() => f.admin().identity()).toThrow(/^ACCESS_DENIED$/); expect(f.fetch).toHaveBeenCalledOnce();
});
it.each([
  {}, { sub: 's' }, { sub: 's', email: 'a@example.invalid' }, { sub: '', email: 'a@example.invalid', email_verified: true },
  { sub: 's', email: 'a@example.invalid', email_verified: false }, { sub: 's', email: 'a@example.invalid', email_verified: 'true' },
  { sub: 's', email: 'a@example.invalid', email_verified: true, iss: 'https://attacker.invalid' },
  { sub: 's\nforged', email: 'a@example.invalid', email_verified: true },
])('rejects incomplete/untrusted UserInfo %j', info => {
  const f = fixture(); f.response(info); expect(() => f.admin().identity()).toThrow('ACCESS_DENIED');
});
it('rejects malformed JSON, wrong MIME, empty token and network errors with sanitized failure', () => {
  for (const mode of ['json', 'mime', 'token', 'network']) {
    const f = fixture();
    if (mode === 'json') f.fetch.mockReturnValue({ getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }), getContentText: () => '{' });
    if (mode === 'mime') f.fetch.mockReturnValue({ getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'text/html' }), getContentText: () => '{}' });
    if (mode === 'token') f.tokenProvider.mockReturnValue('');
    if (mode === 'network') f.fetch.mockImplementation(() => { throw Error(f.token); });
    expect(() => f.admin().identity()).toThrow(/^ACCESS_DENIED$/); expect(f.sourceFile).not.toHaveBeenCalled();
  }
});
it('short-lived identity is server-branded and expires without persisting a session', () => {
  const f = fixture(), provider = new GoogleAdminIdentityProvider(f.ports.identity, f.ports.now);
  expect(provider.current()).toEqual({ issuer: 'https://accounts.google.com', subject: f.user.subject, expiresAt: 1800000060000 });
});
it('UNKNOWN dependencies remain UNKNOWN and prevent PASS', () => {
  const f = fixture(); f.ports.dependencies.inspect = fileId => ({ fileId, evidenceId: '', externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' });
  const result = f.admin().preflight(); expect(result.status).toBe('BLOCKED'); expect(result.resetAllowed).toBe(false);
  for (const source of result.sources) expect(source.blockers).toEqual(['EXTERNAL_CONNECTIONS_UNKNOWN', 'BOUND_SCRIPTS_UNKNOWN', 'TRIGGERS_UNKNOWN']);
});
it('known IMPORTRANGE/links, missing sheets, wrong MIME and scan errors block before any reset', () => {
  for (const mode of ['links', 'sheets', 'mime', 'scan']) {
    const f = fixture(), inspect = f.inspect.getMockImplementation()!;
    if (mode === 'mime') f.sourceFile.mockImplementation(id => ({ id, mimeType: 'text/plain', trashed: false }));
    if (mode === 'scan') f.inspect.mockImplementation(() => { throw Error('RISK_SCAN_LIMIT'); });
    if (mode === 'links' || mode === 'sheets') f.inspect.mockImplementation(id => ({ ...inspect(id), ...(mode === 'links' ? { hazards: ['Sheet!R1C1'] } : { sheets: ['unexpected'] }) }));
    const result = f.admin().preflight(); expect(result.status).toBe('BLOCKED'); expect(result.sources.every(s => s.status === 'BLOCKED')).toBe(true);
  }
});
it('preserves canonical configuration and rejects incomplete or production-active JSON', () => {
  const f = fixture(); f.props.set(TEST_CONFIG_KEY, '{');
  expect(() => f.admin().preflight()).toThrow('TEST_CONFIG_INVALID'); expect(f.sourceFile).not.toHaveBeenCalled();
  f.props.set(TEST_CONFIG_KEY, JSON.stringify({ version: 1, environment: 'PRODUCTION' }));
  expect(() => f.admin().preflight()).toThrow('TEST_CONFIG_INVALID');
});
it('rechecks current roles before returning a diagnostic result', () => {
  const f = fixture(), inspect = f.inspect.getMockImplementation()!;
  f.inspect.mockImplementation(id => { f.user.active = false; f.saveUser(); return inspect(id); });
  expect(() => f.admin().preflight()).toThrow('ACCESS_DENIED');
});
