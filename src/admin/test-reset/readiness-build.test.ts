import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { rollup } from 'rollup';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TEST_INSTALLATION_KEY } from './test-configuration';
import { TEST_USERS_KEY } from './admin-preflight';
import { TEST_READINESS_SCRIPT_ID } from './readiness-target';
import { PRODUCTION_SCRIPT_ID, TEST_RESET_SOURCES } from './test-sources';
import { INSPECTION_DETAILS } from './spreadsheet-risk-inspector';

const SCOPES = [
  'openid', 'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
].sort();
const GLOBALS = ['KUB_TEST_adminIdentity', 'KUB_TEST_probeIdentity', 'KUB_TEST_probeSheetsApi', 'KUB_TEST_readOnlyPreflight'].sort();
const EXPECTED_READINESS_MANIFEST = {
  timeZone: 'Europe/Kyiv', runtimeVersion: 'V8', exceptionLogging: 'NONE',
  dependencies: { enabledAdvancedServices: [{ userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }] },
  oauthScopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/script.external_request',
    'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  urlFetchWhitelist: ['https://openidconnect.googleapis.com/v1/userinfo', 'https://sheets.googleapis.com/v4/spreadsheets/'],
};

async function build() {
  const { default: config } = await import(`${pathToFileURL(resolve('rollup.test-readiness.config.mjs')).href}?t=${Date.now()}`);
  const bundle = await rollup(config); let output;
  try { output = await bundle.generate(config.output); } finally { await bundle.close(); }
  const chunk = output.output.find(item => item.type === 'chunk');
  const asset = output.output.find(item => item.type === 'asset' && item.fileName === 'appsscript.json');
  if (!chunk || chunk.type !== 'chunk' || !asset || asset.type !== 'asset') throw Error('READINESS_BUILD_MISSING');
  return { code: chunk.code, manifest: JSON.parse(asset.source as string) };
}

function runtime(code: string, response: unknown = { sub: 'bootstrap-subject-001', email: 'admin@example.test', email_verified: true }) {
  let scriptId = TEST_READINESS_SCRIPT_ID, responseCode = 200, contentType = 'application/json';
  let oauthCalls = 0, fetchCalls = 0, sourceCalls = 0, propertyReads = 0;
  const logs: string[] = [];
  const properties = new Map<string, string>([[TEST_INSTALLATION_KEY,
    JSON.stringify({ version: 1, environment: 'TEST', scriptId: TEST_READINESS_SCRIPT_ID })]]);
  const mutation = () => { throw Error('MUTATION_ATTEMPTED'); };
  const sandbox: Record<string, any> = {
    console: { log: (value: string) => logs.push(value) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key: string) => { propertyReads++; return properties.get(key) ?? null; }, setProperty: mutation }) },
    ScriptApp: { getScriptId: () => scriptId, getService: () => ({ getUrl: () => null }),
      getOAuthToken: () => { oauthCalls++; return 'server-oauth-token'; }, newTrigger: mutation },
    UrlFetchApp: { fetch: (url: string, options: any) => {
      fetchCalls++;
      expect(options).toMatchObject({ method: 'get', followRedirects: false, validateHttpsCertificates: true, muteHttpExceptions: true });
      expect(options.headers.Authorization).toBe('Bearer server-oauth-token');
      if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/')) {
        const id = url.split('/spreadsheets/')[1].split('?')[0];
        const source = Object.values(TEST_RESET_SOURCES).find(value => value.id === id)!;
        return { getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }),
          getContentText: () => JSON.stringify({ spreadsheetId: id, sheets: source.requiredSheets.map((title, sheetId) => ({
            properties: { sheetId, title, sheetType: 'GRID', gridProperties: { rowCount: 1000, columnCount: 26 } }, data: [{}],
          })) }) };
      }
      expect(url).toBe('https://openidconnect.googleapis.com/v1/userinfo');
      return { getResponseCode: () => responseCode, getHeaders: () => ({ 'Content-Type': contentType }), getContentText: () => JSON.stringify(response) };
    } },
    DriveApp: { getFileById: (id: string) => { sourceCalls++; return { getId: () => id,
      getMimeType: () => 'application/vnd.google-apps.spreadsheet', isTrashed: () => false, makeCopy: mutation, setTrashed: mutation }; } },
    SpreadsheetApp: { openById: () => { throw Error('SPREADSHEETAPP_FORBIDDEN'); } },
    Utilities: { DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algorithm: string, value: string) => [...createHash('sha256').update(value).digest()],
      newBlob: (value: string) => ({ getBytes: () => Buffer.from(value) }) },
  };
  runInNewContext(code, sandbox);
  return { sandbox, properties, logs,
    counts: () => ({ oauthCalls, fetchCalls, sourceCalls, propertyReads }),
    setScriptId: (value: string) => { scriptId = value; }, setResponseCode: (value: number) => { responseCode = value; },
    setContentType: (value: string) => { contentType = value; } };
}

describe('TEST readiness-only build', () => {
  it('has exact scopes, four manual globals and no mutation/reset surface', async () => {
    const { code, manifest } = await build();
    expect([...manifest.oauthScopes].sort()).toEqual(SCOPES);
    expect(manifest.urlFetchWhitelist).toEqual(['https://openidconnect.googleapis.com/v1/userinfo', 'https://sheets.googleapis.com/v4/spreadsheets/']);
    expect(code).not.toMatch(/\bSpreadsheetApp\b/);
    expect(manifest).toEqual(EXPECTED_READINESS_MANIFEST);
    expect(code).not.toMatch(/\bSheets\s*(?:\.|\[)/);
    const ast = ts.createSourceFile('Code.gs', code, ts.ScriptTarget.Latest, true);
    const globals = ast.statements.filter(ts.isFunctionDeclaration).map(node => node.name!.text).sort();
    expect(globals).toEqual(GLOBALS); expect(globals.every(name => !name.endsWith('_'))).toBe(true);
    for (const term of ['makeCopy', 'setTrashed', 'setProperty', 'setValues', 'KUB_TEST_prepare_', 'KUB_TEST_reviewPending_',
      'KUB_TEST_activate_', 'KUB_TEST_rollback_', 'doGet', 'doPost', 'onOpen', 'onEdit']) expect(code).not.toMatch(new RegExp(`\\b${term}\\b`));
  }, 30000);

  it('copies only the TEST readiness manifest and preserves production and TEST admin manifests', async () => {
    const paths = ['appsscript.json', 'targets/test-admin/appsscript.json'];
    const before = paths.map(path => readFileSync(path, 'utf8'));
    const source = readFileSync('targets/test-readiness/appsscript.json', 'utf8');
    expect(JSON.parse(source)).toEqual(EXPECTED_READINESS_MANIFEST);
    const { manifest } = await build();
    expect(manifest).toEqual(JSON.parse(source));
    expect(readFileSync('targets/test-readiness/appsscript.json', 'utf8')).toBe(source);
    paths.forEach((path, index) => {
      expect(readFileSync(path, 'utf8')).toBe(before[index]);
      expect(JSON.parse(before[index]).dependencies).toEqual({});
    });
  }, 30000);

  it('exposes a guarded independent Sheets API probe with exactly four safe output fields', async () => {
    const { code } = await build(), id = 'independent-diagnostic-sheet-1234567890';
    for (const mode of [200, 401, 403, 404, 500, 'throw', 'invalid-id', 'production-id', 'unauthorized'] as const) {
      const vm = runtime(code);
      if (mode !== 'unauthorized') vm.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com',
        subject: 'bootstrap-subject-001', email: 'admin@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] }));
      vm.properties.set('KUB_TEST_DIAGNOSTIC_SHEET_ID', mode === 'invalid-id' ? 'invalid' : mode === 'production-id' ? TEST_RESET_SOURCES.MASTER.id : id);
      const originalFetch = vm.sandbox.UrlFetchApp.fetch; let sheetCalls = 0, contentReads = 0;
      vm.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
        if (!url.startsWith('https://sheets.googleapis.com/')) return originalFetch(url, options);
        sheetCalls++;
        expect(url).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`);
        expect(options).toMatchObject({ method: 'get', muteHttpExceptions: true, followRedirects: false, validateHttpsCertificates: true });
        if (mode === 'throw') throw Error(`${url} server-oauth-token Authorization Bearer admin@example.test`);
        return { getResponseCode: () => mode,
          getHeaders: () => { contentReads++; throw Error('PRIVATE_HEADERS'); },
          getContentText: () => { contentReads++; throw Error('PRIVATE_BODY'); } };
      };
      const before = JSON.stringify([...vm.properties]);
      const httpStatus = typeof mode === 'string' ? 'REQUEST_FAILED' : mode === 500 ? 'OTHER' : mode;
      const expected = { operation: 'SHEETS_API_PROBE', status: mode === 200 ? 'PASS' : 'BLOCKED', httpStatus, resetAllowed: false };
      expect(vm.sandbox.KUB_TEST_probeSheetsApi()).toEqual(expected);
      expect(vm.logs).toEqual([JSON.stringify(expected)]);
      expect(contentReads).toBe(0); expect(vm.counts().sourceCalls).toBe(0);
      expect(sheetCalls).toBe(['invalid-id', 'production-id', 'unauthorized'].includes(String(mode)) ? 0 : 1);
      expect(JSON.stringify([...vm.properties])).toBe(before);
      expect(() => vm.sandbox.KUB_TEST_probeSheetsApi({ sheetId: id })).toThrow('MANUAL_ONLY');
    }
  }, 30000);

  it('probes identity without enrollment, authorization or property mutation', async () => {
    const { code } = await build(); const vm = runtime(code); const before = JSON.stringify([...vm.properties]);
    expect(vm.counts()).toEqual({ oauthCalls: 0, fetchCalls: 0, sourceCalls: 0, propertyReads: 0 });
    const result = vm.sandbox.KUB_TEST_probeIdentity();
    expect(result).toMatchObject({ status: 'PASS', operation: 'IDENTITY_PROBE', issuer: 'https://accounts.google.com',
      subject: 'bootstrap-subject-001', email: 'admin@example.test', rolesAssigned: false, authorizationGranted: false, resetAllowed: false });
    expect(JSON.stringify([...vm.properties])).toBe(before); expect(vm.properties.has(TEST_USERS_KEY)).toBe(false);
    expect(() => vm.sandbox.KUB_TEST_probeIdentity({ role: 'ADMIN' })).toThrow('MANUAL_ONLY');
    expect(vm.logs.join('')).not.toContain('server-oauth-token');
  }, 30000);

  it('keeps admin checks default-deny until a matching ADMIN is enrolled manually', async () => {
    const { code } = await build(); const vm = runtime(code);
    expect(vm.sandbox.KUB_TEST_adminIdentity()).toMatchObject({ status: 'BLOCKED', code: 'ACCESS_DENIED', resetAllowed: false });
    vm.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com',
      subject: 'bootstrap-subject-001', email: 'admin@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] }));
    expect(vm.sandbox.KUB_TEST_adminIdentity()).toMatchObject({ status: 'PASS', operation: 'ADMIN_IDENTITY',
      scriptId: TEST_READINESS_SCRIPT_ID, subject: 'bootstrap-subject-001', permission: 'USER_MANAGE', resetAllowed: false });
    const preflight = vm.sandbox.KUB_TEST_readOnlyPreflight();
    expect(preflight.status).toBe('BLOCKED'); expect(preflight.resetAllowed).toBe(false); expect(preflight.sources).toHaveLength(3);
    expect(preflight.sources.every((source: any) => source.dependencies.boundScripts === 'UNKNOWN' &&
      source.dependencies.triggers === 'UNKNOWN' && source.blockers.includes('BOUND_SCRIPTS_UNKNOWN'))).toBe(true);
    expect(vm.counts().sourceCalls).toBe(3);
    expect(() => vm.sandbox.KUB_TEST_adminIdentity({ subject: 'forged' })).toThrow('MANUAL_ONLY');
    expect(() => vm.sandbox.KUB_TEST_readOnlyPreflight({ permission: 'USER_MANAGE' })).toThrow('MANUAL_ONLY');
  }, 30000);

  it('rejects wrong/production script before token use and rejects bad UserInfo', async () => {
    const { code } = await build(); const vm = runtime(code);
    vm.setScriptId('different-test-script-id-1234567890');
    expect(vm.sandbox.KUB_TEST_probeIdentity()).toMatchObject({ status: 'BLOCKED', code: 'TEST_CONTEXT_REQUIRED' });
    vm.setScriptId(PRODUCTION_SCRIPT_ID);
    expect(vm.sandbox.KUB_TEST_probeIdentity()).toMatchObject({ status: 'BLOCKED', code: 'TEST_CONTEXT_REQUIRED' });
    expect(vm.counts().oauthCalls).toBe(0);
    const invalid = runtime(code, { sub: 'bad subject', email: 'admin@example.test', email_verified: true });
    expect(invalid.sandbox.KUB_TEST_probeIdentity()).toMatchObject({ status: 'BLOCKED', code: 'ACCESS_DENIED', reason: 'IDENTITY_FIELDS_INVALID' });
    const failed = runtime(code); failed.setResponseCode(401);
    expect(failed.sandbox.KUB_TEST_probeIdentity()).toMatchObject({ status: 'BLOCKED', code: 'ACCESS_DENIED', reason: 'USERINFO_HTTP_DENIED', httpStatus: 401 });
    expect(failed.sandbox.KUB_TEST_adminIdentity()).toEqual({ status: 'BLOCKED', operation: 'ADMIN_IDENTITY', code: 'ACCESS_DENIED', resetAllowed: false });
    expect(failed.sandbox.KUB_TEST_readOnlyPreflight()).toEqual({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', code: 'ACCESS_DENIED', resetAllowed: false });
    expect(failed.logs.join('')).not.toMatch(/server-oauth-token|admin@example.test|bootstrap-subject-001|Authorization|Bearer/);
    const wrongMime = runtime(code); wrongMime.setContentType('text/html');
    expect(wrongMime.sandbox.KUB_TEST_probeIdentity()).toMatchObject({ status: 'BLOCKED', code: 'ACCESS_DENIED', reason: 'USERINFO_CONTENT_TYPE_INVALID' });
  }, 30000);

  it('keeps the checked-in manifest free of extra scopes', () => {
    const manifest = JSON.parse(readFileSync('targets/test-readiness/appsscript.json', 'utf8'));
    expect([...manifest.oauthScopes].sort()).toEqual(SCOPES);
  });

  it('reports source stages only after TEST installation and ADMIN checks in the built bundle', async () => {
    const { code } = await build();
    for (const stage of ['DRIVE_ACCESS_FAILED', 'SOURCE_FILE_INVALID', 'SPREADSHEET_ACCESS_FAILED', 'RISK_SCAN_LIMIT', 'SHEET_READ_FAILED']) {
      const vm = runtime(code), secret = 'private-cell-content server-oauth-token admin@example.test bootstrap-subject-001 Authorization';
      vm.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com',
        subject: 'bootstrap-subject-001', email: 'admin@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] }));
      const fail = () => { throw Error(secret); };
      if (stage === 'DRIVE_ACCESS_FAILED') vm.sandbox.DriveApp.getFileById = fail;
      if (stage === 'SOURCE_FILE_INVALID') vm.sandbox.DriveApp.getFileById = (id: string) => ({ getId: () => id, getMimeType: () => 'text/plain', isTrashed: () => false });
      if (['SPREADSHEET_ACCESS_FAILED', 'RISK_SCAN_LIMIT', 'SHEET_READ_FAILED'].includes(stage)) {
        const fetch = vm.sandbox.UrlFetchApp.fetch;
        vm.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
          if (!url.startsWith('https://sheets.googleapis.com/')) return fetch(url, options);
          if (stage === 'SPREADSHEET_ACCESS_FAILED') return fail();
          const id = url.split('/spreadsheets/')[1].split('?')[0];
          const rowData = Array.from({ length: 501 }, (_, r) => r === 500 ? { values: Array.from({ length: 500 }, () => ({ effectiveValue: { numberValue: 1 } })) } : {});
          return { getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }),
            getContentText: () => JSON.stringify({ spreadsheetId: id, sheets: [{ properties: { sheetId: 0, title: 'sheet',
              sheetType: 'GRID', gridProperties: { rowCount: 1000, columnCount: 500 } },
              data: stage === 'SHEET_READ_FAILED' ? undefined : [{ rowData }] }] }) };
        };
      }
      const before = JSON.stringify([...vm.properties]);
      const result = vm.sandbox.KUB_TEST_readOnlyPreflight();
      expect(result).toMatchObject({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', resetAllowed: false });
      expect(result.sources).toHaveLength(3);
      for (const source of result.sources) {
        expect(source.inspectionFailure).toBe(stage); expect(source.blockers).toContain('SOURCE_INSPECTION_FAILED');
        expect(source.dependencies).toEqual({ externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' });
      }
      expect(JSON.stringify([...vm.properties])).toBe(before);
      expect(vm.logs.join('')).not.toMatch(/private-cell-content|server-oauth-token|admin@example.test|bootstrap-subject-001|Authorization/);
    }
  }, 30000);

  it('exposes only fixed fetch exception classes through the manual probe in the built bundle', async () => {
    const { code } = await build();
    for (const [message, requestFailure] of [
      ['You do not have permission to call UrlFetchApp.fetch.', 'AUTHORIZATION_REQUIRED'],
      ['DNS error:', 'NETWORK_FAILURE'], ['Unexpected request error:', 'OTHER_REQUEST_ERROR'],
    ]) {
      const vm = runtime(code), before = JSON.stringify([...vm.properties]);
      vm.sandbox.UrlFetchApp.fetch = () => { throw new Error(`${message} server-oauth-token Authorization Bearer admin@example.test bootstrap-subject-001`); };
      expect(vm.sandbox.KUB_TEST_probeIdentity()).toEqual({ status: 'BLOCKED', operation: 'IDENTITY_PROBE',
        code: 'ACCESS_DENIED', resetAllowed: false, reason: 'USERINFO_REQUEST_FAILED', requestFailure });
      expect(vm.sandbox.KUB_TEST_adminIdentity()).toEqual({ status: 'BLOCKED', operation: 'ADMIN_IDENTITY', code: 'ACCESS_DENIED', resetAllowed: false });
      expect(vm.sandbox.KUB_TEST_readOnlyPreflight()).toEqual({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', code: 'ACCESS_DENIED', resetAllowed: false });
      expect(JSON.stringify([...vm.properties])).toBe(before); expect(vm.counts().sourceCalls).toBe(0);
      expect(vm.logs.join('')).not.toMatch(/server-oauth-token|admin@example.test|bootstrap-subject-001|Authorization|Bearer/);
    }
  }, 30000);

  it('preserves safe REST access codes through the built manual preflight without reading rejected bodies', async () => {
    const { code } = await build();
    for (const mode of [401, 403, 404, 500, 'throw'] as const) {
      const vm = runtime(code);
      vm.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com',
        subject: 'bootstrap-subject-001', email: 'admin@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] }));
      const originalFetch = vm.sandbox.UrlFetchApp.fetch;
      let contentReads = 0;
      vm.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
        if (!url.startsWith('https://sheets.googleapis.com/')) return originalFetch(url, options);
        expect(options.muteHttpExceptions).toBe(true);
        if (mode === 'throw') throw Error(`${url} server-oauth-token Authorization Bearer admin@example.test bootstrap-subject-001`);
        return { getResponseCode: () => mode,
          getHeaders: () => { contentReads++; throw Error('PRIVATE_HEADERS'); },
          getContentText: () => { contentReads++; throw Error('PRIVATE_BODY'); } };
      };
      const result = vm.sandbox.KUB_TEST_readOnlyPreflight();
      expect(result).toMatchObject({ status: 'BLOCKED', resetAllowed: false });
      expect(result.sources).toHaveLength(3);
      for (const source of result.sources) {
        expect(source.inspectionFailure).toBe('SPREADSHEET_ACCESS_FAILED');
        expect(source.inspectionAccessFailure).toBe(mode === 'throw' ? 'REQUEST_FAILED' : mode === 500 ? 'HTTP_OTHER' : `HTTP_${mode}`);
        expect(source.inspectionApiReason).toBe(mode === 403 ? 'UNKNOWN' : undefined);
        for (const key of ['hasContentLength', 'isJsonContentType', 'hasContentEncoding']) expect(source[key]).toBe(mode === 403 ? false : undefined);
        expect(source.blockers).toContain('SOURCE_INSPECTION_FAILED');
        expect(source.dependencies).toEqual({ externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' });
      }
      expect(contentReads).toBe(mode === 403 ? 3 : 0); // Only the guarded header read is attempted for 403.
      expect(vm.logs.join('')).not.toMatch(/sheets\.googleapis\.com|server-oauth-token|Authorization|Bearer|admin@example.test|bootstrap-subject-001|PRIVATE_BODY|PRIVATE_HEADERS/);
      for (const source of Object.values(TEST_RESET_SOURCES)) expect(vm.logs.join('')).not.toContain(source.id);
    }
  }, 30000);

  it('returns only allowlisted structured 403 reasons in the built readiness log', async () => {
    const { code } = await build();
    for (const apiReason of ['SERVICE_DISABLED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'PERMISSION_DENIED', 'UNKNOWN']) {
      const vm = runtime(code);
      vm.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com',
        subject: 'bootstrap-subject-001', email: 'admin@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] }));
      const originalFetch = vm.sandbox.UrlFetchApp.fetch;
      vm.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
        if (!url.startsWith('https://sheets.googleapis.com/')) return originalFetch(url, options);
        expect(options.muteHttpExceptions).toBe(true);
        const body = JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED',
          message: `${url} server-oauth-token Authorization Bearer admin@example.test bootstrap-subject-001`,
          details: apiReason === 'PERMISSION_DENIED' ? [] : [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            domain: 'googleapis.com', reason: apiReason === 'UNKNOWN' ? 'UNRECOGNIZED' : apiReason,
            metadata: { service: 'sheets.googleapis.com', consumer: 'private-project-id' } }] } });
        return { getResponseCode: () => 403, getHeaders: () => ({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }),
          getContentText: () => body };
      };
      const before = JSON.stringify([...vm.properties]), result = vm.sandbox.KUB_TEST_readOnlyPreflight();
      expect(result).toMatchObject({ status: 'BLOCKED', resetAllowed: false });
      for (const source of result.sources) {
        expect(source).toMatchObject({ status: 'BLOCKED', inspectionFailure: 'SPREADSHEET_ACCESS_FAILED',
          inspectionAccessFailure: 'HTTP_403', inspectionApiReason: apiReason,
          hasContentLength: true, isJsonContentType: true, hasContentEncoding: false,
          dependencies: { externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' } });
      }
      expect(JSON.stringify([...vm.properties])).toBe(before);
      expect(vm.logs.join('')).not.toMatch(/sheets\.googleapis\.com|server-oauth-token|Authorization|Bearer|admin@example.test|bootstrap-subject-001|private-project-id/);
      for (const source of Object.values(TEST_RESET_SOURCES)) expect(vm.logs.join('')).not.toContain(source.id);
    }
  }, 30000);

  it('carries every safe inspection detail through the built manual preflight, preserving blockers and read counts', async () => {
    const { code } = await build();
    for (const detail of INSPECTION_DETAILS) {
      const vm = runtime(code);
      vm.properties.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [{ issuer: 'https://accounts.google.com',
        subject: 'bootstrap-subject-001', email: 'admin@example.test', active: true, roles: ['ADMIN'], authorizationVersion: 1 }] }));
      const originalFetch = vm.sandbox.UrlFetchApp.fetch; let sheetCalls = 0, bodyReads = 0;
      vm.sandbox.UrlFetchApp.fetch = (url: string, options: any) => {
        if (!url.startsWith('https://sheets.googleapis.com/')) return originalFetch(url, options);
        sheetCalls++;
        const id = url.split('/spreadsheets/')[1].split('?')[0];
        const value = detail === 'DATE_TIME_UNSUPPORTED' ? { effectiveValue: { numberValue: 45000 }, effectiveFormat: { numberFormat: { type: 'DATE' } } } :
          detail === 'EFFECTIVE_ERROR_UNSUPPORTED' ? { effectiveValue: { errorValue: { type: 'REF', message: 'PRIVATE_CELL_ERROR' } } } :
          detail === 'CELL_FEATURE_UNSUPPORTED' ? { chipRuns: [{ chip: { richLinkProperties: { uri: 'https://private.invalid' } } }] } :
          detail === 'CELL_SCHEMA_INVALID' ? { note: { private: 'PRIVATE_CELL_CONTENT' } } : {};
        const sheet: any = { properties: { sheetId: 0, title: 'synthetic', sheetType: detail === 'SHEET_PROPERTIES_INVALID' ? 'DATA_SOURCE' : 'GRID',
          gridProperties: { rowCount: 1000, columnCount: 26 } }, data: [{ rowData: [{ values: [value] }] }] };
        if (detail === 'GRID_DATA_MISSING') delete sheet.data;
        if (detail === 'GRID_DATA_INVALID') sheet.data[0].startRow = 1;
        return { getResponseCode: () => 200,
          getHeaders: () => ({ 'Content-Type': detail === 'CONTENT_TYPE_INVALID' ? 'text/html' : 'application/json' }),
          getContentText: () => {
            bodyReads++;
            if (detail === 'UNKNOWN') throw Error(`${url} server-oauth-token Authorization Bearer admin@example.test`);
            if (detail === 'BODY_TOO_LARGE') return 'x'.repeat(8000001);
            if (detail === 'JSON_INVALID') return '{PRIVATE_INVALID_JSON';
            return JSON.stringify({ spreadsheetId: detail === 'ROOT_INVALID' ? 'wrong-id' : id, sheets: [sheet] });
          } };
      };
      const before = JSON.stringify([...vm.properties]), result = vm.sandbox.KUB_TEST_readOnlyPreflight();
      expect(result).toMatchObject({ status: 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', resetAllowed: false });
      expect(result.sources).toHaveLength(3);
      const failure = ['CONTENT_TYPE_INVALID', 'BODY_TOO_LARGE', 'JSON_INVALID', 'ROOT_INVALID', 'UNKNOWN'].includes(detail)
        ? 'SPREADSHEET_ACCESS_FAILED' : 'SHEET_READ_FAILED';
      for (const source of result.sources) {
        expect(source).toMatchObject({ status: 'BLOCKED', inspectionFailure: failure, inspectionDetail: detail,
          dependencies: { externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' } });
        expect(source.blockers).toContain('SOURCE_INSPECTION_FAILED'); expect(source.inspectionAccessFailure).toBeUndefined();
      }
      expect(sheetCalls).toBe(3); expect(bodyReads).toBe(detail === 'CONTENT_TYPE_INVALID' ? 0 : 3);
      expect(JSON.stringify([...vm.properties])).toBe(before);
      const logged = vm.logs.join('');
      expect(logged).toBe(JSON.stringify(result));
      expect(logged).not.toMatch(/sheets\.googleapis\.com|server-oauth-token|Authorization|Bearer|admin@example.test|bootstrap-subject-001|PRIVATE_|synthetic|private.invalid/);
      for (const source of Object.values(TEST_RESET_SOURCES)) expect(logged).not.toContain(source.id);
    }
  }, 30000);
});
