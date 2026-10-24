import { TestAdminDiagnostics, TEST_USERS_KEY } from './admin-preflight';
import { TEST_RESET_SOURCES } from './test-sources';
import { gasSpreadsheetInspector } from './spreadsheet-risk-inspector';
import { ManualEvidenceStore, type ManualEvidenceInput } from './manual-evidence';
import { TestPreparation } from './prepare-review';
import { gasTestDrive } from './gas-test-reset';
import { TEST_CONFIG_KEY, ROLES, readTestConfiguration, validId } from './test-configuration';
import { PropertyUserRepository } from '../../security/property-user-repository';

const REQUEST_KEY = 'KUB_TEST_ADMIN_REQUEST_V1';
/** Only private editor functions enter this composition. No setup setters or browser identity. */
function context() {
  const properties = PropertiesService.getScriptProperties();
  const hash = (text: string) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => (b & 255).toString(16).padStart(2, '0')).join('');
  const bytes = (text: string) => Utilities.newBlob(text).getBytes().length;
  const books = gasSpreadsheetInspector(SpreadsheetApp, 250000, hash);
  const users = new PropertyUserRepository({ getProperty: key => key === 'KUB_SECURITY_USERS_V1' ? properties.getProperty(TEST_USERS_KEY) : null });
  const evidence = new ManualEvidenceStore(properties, books, hash, Date.now, subject => {
    const user = users.find('https://accounts.google.com', subject); return user?.active === true && user.roles.includes('ADMIN');
  });
  const admin = new TestAdminDiagnostics({ properties, scriptId: () => ScriptApp.getScriptId(),
    webAppUrl: () => ScriptApp.getService().getUrl() || null,
    identity: { getOAuthToken: () => ScriptApp.getOAuthToken(), fetch: (url, options) => UrlFetchApp.fetch(url, options) },
    sources: TEST_RESET_SOURCES, now: Date.now, spreadsheets: books, dependencies: evidence,
    sourceFile: id => { const file = DriveApp.getFileById(id); return { id: file.getId(), mimeType: file.getMimeType(), trashed: file.isTrashed() }; },
  });
  const lock = { run<T>(fn: () => T): T { const l = LockService.getScriptLock(); if (!l.tryLock(1000)) throw Error('TEST_RESET_BUSY'); try { return fn(); } finally { l.releaseLock(); } } };
  const preparation = new TestPreparation({ admin, properties, scriptId: () => ScriptApp.getScriptId(), sources: TEST_RESET_SOURCES,
    drive: gasTestDrive({ drive: DriveApp }), books, dependencies: evidence, lock, now: Date.now,
    uniqueId: () => Utilities.getUuid(), hash, utf8Bytes: bytes });
  return { properties, admin, preparation, evidence, bytes, lock };
}
function request(properties: ReturnType<typeof PropertiesService.getScriptProperties>, operation: string) {
  let value; try { value = JSON.parse(properties.getProperty(REQUEST_KEY) || 'null'); } catch { throw Error('ADMIN_REQUEST_INVALID'); }
  if (!value || value.version !== 1 || value.operation !== operation) throw Error('ADMIN_REQUEST_INVALID');
  return value;
}
function expected(value: unknown): string | null {
  if (value === null || validId(value)) return value; throw Error('ADMIN_REQUEST_INVALID');
}
function execute(action: string) {
  const c = context();
  if (action === 'identity') return c.admin.identity();
  if (action === 'preflight') return c.admin.preflight();
  c.admin.identity();
  if (action === 'review') return c.preparation.reviewPending();
  const r = request(c.properties, action);
  if (action === 'prepare') return c.preparation.prepare(expected(r.expectedGeneration));
  if (action === 'recover') { if (!validId(r.pendingGenerationId)) throw Error('ADMIN_REQUEST_INVALID'); return c.preparation.recoverPending(expected(r.expectedGeneration), r.pendingGenerationId); }
  if (action === 'record-review') { if (!validId(r.pendingGenerationId)) throw Error('ADMIN_REQUEST_INVALID'); return c.preparation.recordReview(r.pendingGenerationId); }
  if (action === 'activate') { if (!validId(r.expectedGeneration)) throw Error('ADMIN_REQUEST_INVALID'); return c.preparation.activate(r.expectedGeneration); }
  if (action === 'rollback') { if (!validId(r.expectedGeneration)) throw Error('ADMIN_REQUEST_INVALID'); return c.preparation.rollback(r.expectedGeneration); }
  if (action === 'evidence') return c.lock.run(() => {
    const actor = c.admin.identity(), state = readTestConfiguration(c.properties.getProperty(TEST_CONFIG_KEY), ScriptApp.getScriptId(), TEST_RESET_SOURCES);
    const generations = [state.active, state.previous].flatMap(g => g ? ROLES.map(role => g.files[role].id) : []);
    const allowed = ROLES.map(role => TEST_RESET_SOURCES[role].id)
      .concat(generations, Object.values(state.pending?.files ?? {}).flatMap(f => f ? [f.id] : []));
    const commitment = c.evidence.record(r.evidence as ManualEvidenceInput, actor.subject, allowed, c.bytes);
    return { status: 'RECORDED', commitment, activationAllowed: false };
  });
  throw Error('ADMIN_REQUEST_INVALID');
}
function report(action: string) {
  let result;
  try { result = execute(action); }
  catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message) ? error.message : 'ADMIN_OPERATION_FAILED';
    result = { status: 'BLOCKED', operation: action, code, activationAllowed: false };
  }
  console.log(JSON.stringify(result)); return result;
}
export function adminIdentity() { return report('identity'); }
export function readOnlyPreflight() { return report('preflight'); }
export function prepareTestCopies() { return report('prepare'); }
export function reviewPending() { return report('review'); }
export function recoverPending() { return report('recover'); }
export function recordPendingReview() { return report('record-review'); }
export function registerReviewEvidence() { return report('evidence'); }
export function activatePendingGeneration() { return report('activate'); }
export function rollbackActiveGeneration() { return report('rollback'); }
