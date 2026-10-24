import { GoogleAdminIdentityProvider, IdentityProbeError } from './admin-identity';
import { TestAdminDiagnostics, requireTestInstallation } from './admin-preflight';
import { TEST_RESET_SOURCES } from './test-sources';
import { TEST_READINESS_SCRIPT_ID } from './readiness-target';
import { sheetsApiRiskInspector, SHEETS_READ_URL } from './sheets-api-risk-adapter';

function context() {
  const properties = PropertiesService.getScriptProperties();
  const scriptId = ScriptApp.getScriptId(), webAppUrl = ScriptApp.getService().getUrl() || null;
  requireTestInstallation(properties, scriptId, webAppUrl, TEST_READINESS_SCRIPT_ID);
  const runtime = { getOAuthToken: () => ScriptApp.getOAuthToken(), fetch: (url: string, options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions) => UrlFetchApp.fetch(url, options) };
  const identity = new GoogleAdminIdentityProvider(runtime, Date.now);
  const books = sheetsApiRiskInspector(runtime, Object.values(TEST_RESET_SOURCES).map(source => source.id));
  const admin = new TestAdminDiagnostics({ properties, scriptId: () => ScriptApp.getScriptId(),
    webAppUrl: () => ScriptApp.getService().getUrl() || null, identity: runtime,
    sources: TEST_RESET_SOURCES, now: Date.now, spreadsheets: books,
    // Readiness build deliberately has no evidence writer. UNKNOWN is the only honest result.
    dependencies: { inspect: fileId => ({ fileId, evidenceId: '', externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' }) },
    sourceFile: id => { const file = DriveApp.getFileById(id); return { id: file.getId(), mimeType: file.getMimeType(), trashed: file.isTrashed() }; },
  });
  return { properties, identity, admin, runtime };
}
function report(operation: string, fn: () => unknown) {
  let result;
  try { result = fn(); }
  catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message) ? error.message : 'READINESS_OPERATION_FAILED';
    result = { status: 'BLOCKED', operation, code, resetAllowed: false,
      ...(operation === 'IDENTITY_PROBE' && error instanceof IdentityProbeError
        ? { reason: error.reason, ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
          ...(error.requestFailure === undefined ? {} : { requestFailure: error.requestFailure }) } : {}) };
  }
  console.log(JSON.stringify(result)); return result;
}
export function probeIdentity() { return report('IDENTITY_PROBE', () => {
  const { identity } = context(), value = identity.probeForReadiness();
  return { status: 'PASS', operation: 'IDENTITY_PROBE', issuer: value.issuer, subject: value.subject,
    email: value.email, rolesAssigned: false, authorizationGranted: false, resetAllowed: false };
}); }
export function adminIdentity() { return report('ADMIN_IDENTITY', () => context().admin.identity()); }
export function readOnlyPreflight() { return report('READ_ONLY_PREFLIGHT', () => context().admin.preflightForReadiness()); }

/** Independent control request. No Sheets response headers/body or identity are reported. */
export function probeSheetsApi() {
  let httpStatus: 200 | 401 | 403 | 404 | 'OTHER' | 'REQUEST_FAILED' = 'REQUEST_FAILED';
  try {
    const { properties, admin, runtime } = context();
    admin.identity(); // Existing TEST enrollment + USER_MANAGE check, without logging its result.
    const id = properties.getProperty('KUB_TEST_DIAGNOSTIC_SHEET_ID');
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(id) ||
      Object.values(TEST_RESET_SOURCES).some(source => source.id === id)) throw Error();
    const token = runtime.getOAuthToken();
    if (typeof token !== 'string' || !token || token.length > 16384 || /\s/.test(token)) throw Error();
    const response = runtime.fetch(`${SHEETS_READ_URL}${id}?fields=spreadsheetId`, {
      method: 'get', headers: { Authorization: `Bearer ${token}` }, validateHttpsCertificates: true,
      followRedirects: false, muteHttpExceptions: true });
    const code = response.getResponseCode();
    httpStatus = code === 200 || code === 401 || code === 403 || code === 404 ? code : 'OTHER';
  } catch { /* All precondition, authorization and request failures stay sanitized and closed. */ }
  const result = { operation: 'SHEETS_API_PROBE' as const, status: httpStatus === 200 ? 'PASS' as const : 'BLOCKED' as const,
    httpStatus, resetAllowed: false as const };
  console.log(JSON.stringify(result)); return result;
}
