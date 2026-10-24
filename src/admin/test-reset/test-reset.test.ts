import { expect, it, vi } from 'vitest';
import { HandlerAuthorization } from '../../security/production-authorization';
import { verifiedIdentity, type Role } from '../../security/permission-service';
import { createGasTestReset, gasSpreadsheetInspector, type TestResetGasRuntime } from './gas-test-reset';
import { TestReset, TEST_CONFIG_KEY, TEST_INSTALLATION_KEY, ROLES, type TestResetPorts, type BookSnapshot, type SafetyEvidence } from './test-reset';
import { SpreadsheetConfig } from '../../infrastructure/spreadsheets/SpreadsheetConfig';

function fixture() {
  const scriptId = 'isolated-test-script', props = new Map<string, string>([
    [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId })],
  ]);
  const sources = {
    MASTER: { id: 'production-master', requiredSheets: ['00_Elements', '01_BOM', '05_Materials'] },
    OPERATIONAL: { id: 'production-operational', requiredSheets: ['01_Виготовлення'] },
    REPORTING: { id: 'production-reporting', requiredSheets: ['ВідомістьВитрат'] },
  };
  const books = new Map<string, BookSnapshot>(ROLES.map(r => [sources[r].id, { id: sources[r].id, sheets: [...sources[r].requiredSheets, 'Extra'], hazards: [] }]));
  const originals = JSON.stringify([...books]);
  let count = 0, generation = 0, held = false, folders: string[] = [];
  const inspect = vi.fn((id: string) => structuredClone(books.get(id)!));
  const safety = vi.fn((fileId: string): SafetyEvidence => ({ fileId, evidenceId: `review-${fileId}`, externalConnections: 'SAFE', boundScripts: 'SAFE', triggers: 'SAFE' }));
  const copy = vi.fn((sourceId: string) => { const file = `new-copy-${++count}`; books.set(file, { ...structuredClone(books.get(sourceId)!), id: file }); return file; });
  const properties = { getProperty: (key: string) => props.get(key) ?? null, setProperty: vi.fn((key: string, value: string) => { props.set(key, value); }) };
  const user = { issuer: 'https://accounts.google.com', subject: 'isolated-reset-admin', active: true, roles: ['ADMIN'] as Role[], authorizationVersion: 1 };
  const identity = verifiedIdentity(user.issuer, user.subject, 1800003600000);
  const authorization = new HandlerAuthorization({ current: () => identity }, { find: () => user }, () => 1800000000000);
  const ports: TestResetPorts = { properties, sources, authorization, safety: { inspect: safety },
    context: { scriptId: () => scriptId, execution: 'TEST_ADMIN_EDITOR' }, forbiddenScriptIds: ['production-script'],
    now: () => new Date('2026-10-23T10:00:00Z'), uniqueId: () => `generation-${++generation}`, utf8Bytes: s => Buffer.byteLength(s),
    lock: { run(operation) { if (held) throw Error('TEST_RESET_BUSY'); held = true; try { return operation(); } finally { held = false; } } },
    spreadsheets: { inspect },
    drive: { copy, findFolders: vi.fn(() => folders), createFolder: vi.fn(() => { folders = ['test-folder']; return 'test-folder'; }),
      assertFolder: vi.fn(), assertCopy: vi.fn() },
  };
  const service = new TestReset(ports);
  return { service, ports, props, properties, books, inspect, copy, safety, user,
    config: () => JSON.parse(props.get(TEST_CONFIG_KEY)!),
    originalUnchanged: () => expect(JSON.stringify([...books].filter(([id]) => id.startsWith('production-')))).toBe(originals) };
}
it('first reset creates folder and three complete copies; one TEST JSON activates only new IDs', () => {
  const f = fixture(); const result = f.service.reset(null);
  expect(result.status).toBe('OK'); expect(result.createdFileIds).toHaveLength(3);
  expect(f.config()).toMatchObject({ environment: 'TEST', folderId: 'test-folder', previous: null, active: { id: 'generation-1' } });
  expect(f.copy.mock.calls.map(c => c[0])).toEqual(ROLES.map(r => f.ports.sources[r].id));
  for (const role of ROLES) expect(f.config().active.files[role].sheets).toContain('Extra');
  expect(f.safety).toHaveBeenCalledTimes(3); f.originalUnchanged();
  expect([...f.props.keys()].sort()).toEqual([TEST_CONFIG_KEY, TEST_INSTALLATION_KEY].sort());
});
it('subsequent reset reuses saved folder, retains old copies and supports verified compare-and-swap rollback', () => {
  const f = fixture(), one = f.service.reset(null), two = f.service.reset(one.activeGenerationId);
  expect(two.status).toBe('OK'); expect(f.ports.drive.createFolder).toHaveBeenCalledOnce();
  expect(f.config().previous.id).toBe(one.activeGenerationId);
  const after = f.service.rollback(two.activeGenerationId!);
  expect(after.activeGenerationId).toBe(one.activeGenerationId);
  expect(f.config().previous.id).toBe(two.activeGenerationId);
  for (const file of [...one.createdFileIds, ...two.createdFileIds]) expect(f.books.has(file)).toBe(true);
  expect(f.copy).toHaveBeenCalledTimes(6); f.originalUnchanged();
});
it.each(['copy-error', 'missing-sheet', 'wrong-open-id', 'external-link', 'unknown-script', 'unsafe-trigger', 'wrong-evidence-file'] as const)('failed %s leaves previous active JSON and all old files unchanged', mode => {
  const f = fixture(), first = f.service.reset(null), before = f.props.get(TEST_CONFIG_KEY);
  if (mode === 'copy-error') f.copy.mockImplementationOnce(() => { throw Error('copy-failed'); });
  if (mode === 'missing-sheet' || mode === 'wrong-open-id' || mode === 'external-link') {
    const read = f.inspect.getMockImplementation()!;
    f.inspect.mockImplementation(id => {
      const b = read(id); if (id.startsWith('new-copy-') && !first.createdFileIds.includes(id)) {
        if (mode === 'missing-sheet') b.sheets.pop();
        if (mode === 'wrong-open-id') b.id = 'other';
        if (mode === 'external-link') b.hazards = ['IMPORTRANGE'];
      } return b;
    });
  }
  if (mode === 'unknown-script') f.safety.mockImplementation(fileId => ({ fileId, evidenceId: 'review', externalConnections: 'SAFE', boundScripts: 'UNKNOWN', triggers: 'SAFE' }));
  if (mode === 'unsafe-trigger') f.safety.mockImplementation(fileId => ({ fileId, evidenceId: 'review', externalConnections: 'SAFE', boundScripts: 'SAFE', triggers: 'UNSAFE' }));
  if (mode === 'wrong-evidence-file') f.safety.mockImplementation(() => ({ fileId: 'wrong-file', evidenceId: 'review', externalConnections: 'SAFE', boundScripts: 'SAFE', triggers: 'SAFE' }));
  expect(f.service.reset(first.activeGenerationId).status).toBe('BLOCKED');
  expect(f.props.get(TEST_CONFIG_KEY)).toBe(before);
  first.createdFileIds.forEach(id => expect(f.books.has(id)).toBe(true)); f.originalUnchanged();
});
it('failed initial validation saves only folder, retains candidates, and resolver never falls back to production', () => {
  const f = fixture(); f.safety.mockImplementation(fileId => ({ fileId, evidenceId: '', externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' }));
  const result = f.service.reset(null);
  expect(result.status).toBe('BLOCKED'); expect(result.createdFileIds).toHaveLength(3);
  expect(f.config().folderId).toBe('test-folder'); expect(f.config().active).toBeNull();
  expect(() => f.service.activeConfig()).toThrow('TEST_NOT_INITIALIZED');
});
it.each(['MANAGER', 'ERP_OWNER', 'WORKSHOP_MANAGER', 'TECHNOLOGIST'])('denies %s before any Drive operation', role => {
  const f = fixture(); f.user.roles = [role as Role]; // Intentional legacy input exercises runtime fail-closed behavior.
  expect(() => f.service.reset(null)).toThrow('ACCESS_DENIED'); expect(f.copy).not.toHaveBeenCalled();
  expect(f.ports.drive.findFolders).not.toHaveBeenCalled();
});
it.each(['production', 'wrong-installation', 'missing-installation', 'malformed-config', 'production-file-in-config'] as const)('denies %s context/config before copies', mode => {
  const f = fixture();
  if (mode === 'production') f.ports.context.scriptId = () => 'production-script';
  if (mode === 'wrong-installation') f.props.set(TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'PRODUCTION', scriptId: 'isolated-test-script' }));
  if (mode === 'missing-installation') f.props.delete(TEST_INSTALLATION_KEY);
  if (mode === 'malformed-config') f.props.set(TEST_CONFIG_KEY, '{');
  if (mode === 'production-file-in-config') {
    f.service.reset(null); const config = f.config(); config.active.files.MASTER.id = 'production-master';
    f.props.set(TEST_CONFIG_KEY, JSON.stringify(config)); f.copy.mockClear();
  }
  expect(() => f.service.reset(null)).toThrow(); expect(f.copy).not.toHaveBeenCalled();
});
it('no lost update on stale/concurrent reset; lock is released after failure', () => {
  const f = fixture(), first = f.service.reset(null);
  expect(() => f.service.reset(null)).toThrow('STALE_TEST_GENERATION');
  let nested = false; f.safety.mockImplementation(fileId => {
    if (!nested) { nested = true; expect(() => f.service.reset(first.activeGenerationId)).toThrow('TEST_RESET_BUSY'); }
    return { fileId, evidenceId: 'review', externalConnections: 'SAFE', boundScripts: 'SAFE', triggers: 'SAFE' };
  });
  const second = f.service.reset(first.activeGenerationId); expect(second.status).toBe('OK');
  expect(f.service.activeConfig().active?.id).toBe(second.activeGenerationId);
});
it('ambiguous folder and reused production copy ID fail closed without deleting anything', () => {
  const f = fixture(); vi.mocked(f.ports.drive.findFolders).mockReturnValue(['folder-a', 'folder-b']);
  expect(f.service.reset(null).code).toBe('AMBIGUOUS_TEST_FOLDER'); expect(f.copy).not.toHaveBeenCalled();
  vi.mocked(f.ports.drive.findFolders).mockReturnValue([]); f.copy.mockReturnValueOnce('production-master');
  expect(f.service.reset(null).code).toBe('COPY_ID_NOT_NEW'); expect(f.config().active).toBeNull();
});
it('rollback revalidates retained files; missing/unsafe copies do not switch config', () => {
  const f = fixture(), first = f.service.reset(null), second = f.service.reset(first.activeGenerationId), before = f.props.get(TEST_CONFIG_KEY);
  f.books.get(first.createdFileIds[0])!.hazards = ['external'];
  expect(() => f.service.rollback(second.activeGenerationId!)).toThrow('EXTERNAL_REFERENCE_RISK');
  expect(f.props.get(TEST_CONFIG_KEY)).toBe(before);
  expect(() => f.service.rollback('wrong-generation')).toThrow('ROLLBACK_PRECONDITION_FAILED');
});
it('uncertain property commit is reported explicitly without retry or automatic rollback', () => {
  const f = fixture(); f.service.reset(null); const active = f.config().active.id;
  f.properties.setProperty.mockImplementation(() => { throw Error('write-timeout'); });
  const before = f.properties.setProperty.mock.calls.length;
  expect(f.service.reset(active).code).toBe('CONFIG_COMMIT_UNCONFIRMED');
  expect(f.properties.setProperty.mock.calls.length - before).toBe(1);
});
it('UTF-8 property limit blocks activation', () => {
  const f = fixture(); f.ports.utf8Bytes = () => 9000;
  expect(f.service.reset(null).code).toBe('TEST_CONFIG_SIZE_LIMIT'); expect(f.copy).not.toHaveBeenCalled();
});
it('anonymous identity and inactive administrator never inherit script/file owner rights', () => {
  const f = fixture();
  f.ports.authorization = new HandlerAuthorization({ current: () => undefined }, { find: () => f.user });
  expect(() => f.service.reset(null)).toThrow('ACCESS_DENIED');
  expect(f.copy).not.toHaveBeenCalled();
  const g = fixture(); g.user.active = false;
  expect(() => g.service.reset(null)).toThrow('ACCESS_DENIED'); expect(g.copy).not.toHaveBeenCalled();
});
it('source completeness and changed source structure block activation', () => {
  const f = fixture(); f.books.get('production-master')!.sheets = ['00_Elements'];
  expect(f.service.reset(null).code).toBe('SOURCE_SHEETS_MISSING'); expect(f.copy).not.toHaveBeenCalled();
  const g = fixture(), read = g.inspect.getMockImplementation()!; let masterReads = 0;
  g.inspect.mockImplementation(id => { const row = read(id); if (id === 'production-master' && ++masterReads > 1) row.sheets.push('new-sheet'); return row; });
  expect(g.service.reset(null).code).toBe('SOURCE_STRUCTURE_CHANGED'); expect(g.config().active).toBeNull();
});
it('GAS adapter uses Drive File.makeCopy(source name,destination), mocks only, with ScriptLock', () => {
  const f = fixture(), files = new Map<string, any>(), properties = f.properties;
  let count = 0;
  const folder = { getId: () => 'test-folder', getName: () => 'ERP_KUB_TEST', isTrashed: () => false };
  const iterator = (values: any[]) => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
  const made = vi.fn((name: string, destination: unknown) => {
    expect(destination).toBe(folder); const fileId = `gas-copy-${++count}`;
    const file = { getId: () => fileId, getMimeType: () => 'application/vnd.google-apps.spreadsheet', isTrashed: () => false, getParents: () => iterator([folder]) };
    files.set(fileId, file); return file;
  });
  ROLES.forEach(r => files.set(SpreadsheetConfig[r].id, { makeCopy: made, isTrashed: () => false, getMimeType: () => 'application/vnd.google-apps.spreadsheet' }));
  const release = vi.fn(), open = vi.fn((fileId: string) => {
    const role = ROLES.find(r => SpreadsheetConfig[r].id === fileId) ?? ROLES[Number(fileId.slice(-1)) - 1];
    const sheets = role === 'MASTER' ? ['00_Elements', '01_BOM', '05_Materials'] : role === 'OPERATIONAL' ? ['01_Виготовлення'] : ['ВідомістьВитрат'];
    return { getId: () => fileId, getSheets: () => sheets.map(name => ({ getName: () => name, getLastRow: () => 0, getLastColumn: () => 0 })) };
  });
  const runtime = { drive: { getFoldersByName: () => iterator([]), createFolder: () => folder, getFolderById: () => folder, getFileById: (fileId: string) => files.get(fileId) },
    spreadsheets: { openById: open }, properties: { getScriptProperties: () => properties }, script: { getScriptId: () => 'isolated-test-script' },
    locks: { getScriptLock: () => ({ tryLock: () => true, releaseLock: release }) },
    utilities: { getUuid: () => 'gas-generation', newBlob: (s: string) => ({ getBytes: () => Buffer.from(s) }) },
  } as unknown as TestResetGasRuntime;
  const service = createGasTestReset(f.ports.authorization, { inspect: f.safety }, runtime);
  expect(service.reset(null).status).toBe('OK'); expect(made).toHaveBeenCalledTimes(3); expect(release).toHaveBeenCalledOnce();
  expect(made.mock.calls.map(c => c[0])).toEqual(ROLES.map(r => `ERP_KUB_TEST_${r}_gas-generation`));
});
it('formula/rich-link scanner blocks external references and fails when bounded scan is exceeded', () => {
  const range = { getValues: () => [['', 'production-master']], getFormulas: () => [['=IMPORTRANGE("x","a1")', '']], getRichTextValues: () => [[null, null]] };
  const api = { openById: () => ({ getId: () => 'copy-id', getSheets: () => [{ getName: () => 'Sheet', getLastRow: () => 1, getLastColumn: () => 2, getRange: () => range }] }) } as any;
  expect(gasSpreadsheetInspector(api).inspect('copy-id', ['production-master']).hazards).toHaveLength(2);
  expect(() => gasSpreadsheetInspector(api, 1).inspect('copy-id', [])).toThrow('RISK_SCAN_LIMIT');
});
