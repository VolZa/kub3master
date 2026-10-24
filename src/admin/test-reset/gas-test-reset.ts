import { TEST_RESET_SOURCES, PRODUCTION_SCRIPT_ID } from './test-sources';
import { gasSpreadsheetInspector } from './spreadsheet-risk-inspector';
export { gasSpreadsheetInspector } from './spreadsheet-risk-inspector';
import { TestReset, ROLES, type TestResetPorts, type SafetyEvidence } from './test-reset';

const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';
export interface TestResetGasRuntime {
  drive: Pick<typeof DriveApp, 'getFileById' | 'getFolderById' | 'getFoldersByName' | 'createFolder'>;
  spreadsheets: Pick<typeof SpreadsheetApp, 'openById'>;
  properties: Pick<typeof PropertiesService, 'getScriptProperties'>;
  script: Pick<typeof ScriptApp, 'getScriptId'>;
  locks: Pick<typeof LockService, 'getScriptLock'>;
  utilities: Pick<typeof Utilities, 'getUuid' | 'newBlob'>;
}

/** No global wrapper, no register call, no production import. Only a separately reviewed TEST admin
 * composition may invoke this factory. authorization must use verified identity + PermissionService.
 * This function never infers ADMIN from a Google file owner or GAS USER_DEPLOYING.
 */
export function createGasTestReset(
  authorization: TestResetPorts['authorization'],
  safety: TestResetPorts['safety'] = { inspect: fileId => ({ fileId, evidenceId: '', externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' }) },
  runtime: TestResetGasRuntime = { drive: DriveApp, spreadsheets: SpreadsheetApp, properties: PropertiesService,
    script: ScriptApp, locks: LockService, utilities: Utilities },
): TestReset {
  const p = runtime.properties.getScriptProperties();
  const sources = TEST_RESET_SOURCES;
  return new TestReset({
    properties: p, authorization, safety,
    context: { scriptId: () => runtime.script.getScriptId(), execution: 'TEST_ADMIN_EDITOR' },
    forbiddenScriptIds: [PRODUCTION_SCRIPT_ID], sources,
    now: () => new Date(), uniqueId: () => runtime.utilities.getUuid(),
    utf8Bytes: text => runtime.utilities.newBlob(text).getBytes().length,
    spreadsheets: gasSpreadsheetInspector(runtime.spreadsheets),
    lock: { run(operation) {
      const lock = runtime.locks.getScriptLock();
      if (!lock.tryLock(1000)) throw Error('TEST_RESET_BUSY');
      try { return operation(); } finally { lock.releaseLock(); }
    } },
    drive: gasTestDrive(runtime),
  });
}

/** Documented evidence shape only; a successful SpreadsheetApp.openById is NOT a safety audit. */
export type TestResetSafetyReview = SafetyEvidence;

export function gasTestDrive(runtime: Pick<TestResetGasRuntime, 'drive'>) {
  const productionIds = ROLES.map(role => TEST_RESET_SOURCES[role].id);
  return {
      findFolders(name: string) { const folders = runtime.drive.getFoldersByName(name), ids: string[] = [];
        while (folders.hasNext()) { ids.push(folders.next().getId()); if (ids.length > 1) break; } return ids; },
      createFolder: (name: string) => runtime.drive.createFolder(name).getId(),
      assertFolder(folderId: string, name: string) {
        const folder = runtime.drive.getFolderById(folderId);
        if (folder.getId() !== folderId || folder.getName() !== name || folder.isTrashed()) throw Error('TEST_FOLDER_INVALID');
      },
      copy(sourceId: string, name: string, folderId: string) {
        if (!productionIds.includes(sourceId)) throw Error('SOURCE_CONFIGURATION_INVALID');
        const source = runtime.drive.getFileById(sourceId);
        if (source.isTrashed() || source.getMimeType() !== SHEETS_MIME) throw Error('SOURCE_FILE_INVALID');
        return source.makeCopy(name, runtime.drive.getFolderById(folderId)).getId();
      },
      findCopies(name: string, folderId: string): string[] {
        const files = runtime.drive.getFolderById(folderId).getFilesByName(name), ids: string[] = [];
        while (files.hasNext()) { ids.push(files.next().getId()); if (ids.length > 1) break; } return ids;
      },
      assertCopy(fileId: string, folderId: string) {
        if (productionIds.includes(fileId)) throw Error('COPY_ID_NOT_NEW');
        const file = runtime.drive.getFileById(fileId), parents = file.getParents(); let inFolder = false;
        while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
        if (file.getId() !== fileId || file.isTrashed() || file.getMimeType() !== SHEETS_MIME || !inFolder) throw Error('COPY_FILE_INVALID');
      },
    };
}
