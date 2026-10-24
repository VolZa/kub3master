/** TEST-only administration. Never import into production composition or register as a GAS RPC. */
import { TEST_CONFIG_KEY, TEST_INSTALLATION_KEY, ROLES, readTestConfiguration, validateGeneration,
  type FileRole, type Generation, type TestConfig } from './test-configuration';
export { TEST_CONFIG_KEY, TEST_INSTALLATION_KEY, ROLES, type FileRole, type TestFile, type Generation, type TestConfig } from './test-configuration';
export interface PropertiesPort { getProperty(key: string): string | null; setProperty(key: string, value: string): void }
export interface DrivePort {
  findFolders(name: string): string[];
  createFolder(name: string): string;
  assertFolder(id: string, name: string): void;
  copy(sourceId: string, name: string, folderId: string): string;
  assertCopy(id: string, folderId: string): void;
}
export interface BookSnapshot { id: string; sheets: string[]; hazards: string[]; fingerprint?: string }
export interface SpreadsheetPort { inspect(id: string, productionIds: readonly string[]): BookSnapshot }
export interface SafetyEvidence {
  fileId: string; evidenceId: string;
  fingerprint?: string; commitment?: string; expiresAt?: number;
  externalConnections: 'SAFE' | 'UNSAFE' | 'UNKNOWN';
  boundScripts: 'SAFE' | 'UNSAFE' | 'UNKNOWN';
  triggers: 'SAFE' | 'UNSAFE' | 'UNKNOWN';
}
export interface TestResetPorts {
  properties: PropertiesPort; drive: DrivePort; spreadsheets: SpreadsheetPort;
  /** Trusted administrative inspector, NOT booleans from a browser or the copied workbook. */
  safety: { inspect(fileId: string): SafetyEvidence };
  authorization: { require(permission: 'USER_MANAGE'): unknown };
  context: { scriptId(): string; execution: 'TEST_ADMIN_EDITOR' };
  lock: { run<T>(operation: () => T): T };
  sources: Readonly<Record<FileRole, { id: string; requiredSheets: readonly string[] }>>;
  forbiddenScriptIds: readonly string[];
  now(): Date; uniqueId(): string; utf8Bytes(value: string): number;
}
export interface ResetResult {
  status: 'OK' | 'BLOCKED'; operation: 'RESET' | 'ROLLBACK'; code?: string;
  activeGenerationId: string | null; createdFileIds: string[]; folderId: string | null;
}
const fail = (code: string): never => { throw new Error(code); };
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{3,200}$/.test(value);
const names = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(n => typeof n === 'string' && n.length > 0) && new Set(v).size === v.length;
const sameNames = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export class TestReset {
  constructor(private readonly p: TestResetPorts) {}
  private guard(): void {
    this.p.authorization.require('USER_MANAGE');
    const script = this.p.context.scriptId();
    if (this.p.context.execution !== 'TEST_ADMIN_EDITOR' || !id(script) || this.p.forbiddenScriptIds.includes(script)) fail('TEST_CONTEXT_REQUIRED');
    const raw = this.p.properties.getProperty(TEST_INSTALLATION_KEY);
    let installation; try { installation = raw ? JSON.parse(raw) : undefined; } catch { fail('TEST_CONTEXT_REQUIRED'); }
    if (installation?.version !== 1 || installation.environment !== 'TEST' || installation.scriptId !== script) fail('TEST_CONTEXT_REQUIRED');
    const sourceIds = ROLES.map(role => this.p.sources[role].id);
    if (sourceIds.some(s => !id(s)) || new Set(sourceIds).size !== 3 ||
      ROLES.some(role => !names([...this.p.sources[role].requiredSheets]))) fail('SOURCE_CONFIGURATION_INVALID');
  }
  private generation(value: any): asserts value is Generation {
    validateGeneration(value, this.p.sources);
  }
  private read(): TestConfig {
    return readTestConfiguration(this.p.properties.getProperty(TEST_CONFIG_KEY), this.p.context.scriptId(), this.p.sources);
  }
  private write(state: TestConfig): void {
    const serialized = JSON.stringify(state);
    if (this.p.utf8Bytes(serialized) > 8500) fail('TEST_CONFIG_SIZE_LIMIT');
    // One property replacement. A write/readback exception has uncertain outcome: no automatic rewrite.
    try {
      this.p.properties.setProperty(TEST_CONFIG_KEY, serialized);
      if (this.p.properties.getProperty(TEST_CONFIG_KEY) !== serialized) fail('READBACK');
    } catch { fail('CONFIG_COMMIT_UNCONFIRMED'); }
  }
  private inspect(fileId: string, expected: string[]): string {
    const snapshot = this.p.spreadsheets.inspect(fileId, ROLES.map(r => this.p.sources[r].id));
    if (snapshot.id !== fileId || !names(snapshot.sheets) || !sameNames(snapshot.sheets, expected)) fail('COPY_SHEETS_MISMATCH');
    if (!Array.isArray(snapshot.hazards) || snapshot.hazards.length) fail('EXTERNAL_REFERENCE_RISK');
    const evidence = this.p.safety.inspect(fileId);
    if (!evidence || evidence.fileId !== fileId || !evidence.evidenceId ||
      [evidence.externalConnections, evidence.boundScripts, evidence.triggers].some(s => s !== 'SAFE')) fail('SAFETY_REVIEW_REQUIRED');
    return evidence.evidenceId;
  }
  /** expectedActiveGenerationId is an explicit compare-and-swap precondition, null on first run. */
  reset(expectedActiveGenerationId: string | null): ResetResult {
    this.guard();
    return this.p.lock.run(() => {
      this.guard(); const state = this.read();
      if (state.pending) fail('PENDING_GENERATION_EXISTS');
      if ((state.active?.id ?? null) !== expectedActiveGenerationId) fail('STALE_TEST_GENERATION');
      const created: string[] = []; let folder = state.folderId;
      try {
        if (!folder) {
          const matches = this.p.drive.findFolders('ERP_KUB_TEST');
          if (matches.length > 1) fail('AMBIGUOUS_TEST_FOLDER');
          folder = matches[0] ?? this.p.drive.createFolder('ERP_KUB_TEST');
          if (!id(folder)) fail('TEST_FOLDER_INVALID');
          this.p.drive.assertFolder(folder, 'ERP_KUB_TEST');
          this.write({ ...state, folderId: folder }); // Persist folder even if later candidate validation fails.
        } else this.p.drive.assertFolder(folder, 'ERP_KUB_TEST');
        const generation: Generation = { id: this.p.uniqueId(), createdAt: this.p.now().toISOString(), files: {} as Generation['files'], evidence: {} as Generation['evidence'] };
        if (!id(generation.id) || [state.active?.id, state.previous?.id].includes(generation.id)) fail('GENERATION_ID_INVALID');
        const sourceSheets = {} as Record<FileRole, string[]>;
        for (const role of ROLES) {
          const source = this.p.spreadsheets.inspect(this.p.sources[role].id, []);
          if (source.id !== this.p.sources[role].id || !names(source.sheets) || this.p.sources[role].requiredSheets.some(s => !source.sheets.includes(s))) fail('SOURCE_SHEETS_MISSING');
          sourceSheets[role] = source.sheets;
        }
        const forbidden = new Set(ROLES.map(r => this.p.sources[r].id));
        for (const old of [state.active, state.previous]) if (old) ROLES.forEach(r => forbidden.add(old.files[r].id));
        for (const role of ROLES) {
          const fileId = this.p.drive.copy(this.p.sources[role].id, `ERP_KUB_TEST_${role}_${generation.id}`, folder);
          if (!id(fileId) || forbidden.has(fileId)) fail('COPY_ID_NOT_NEW');
          forbidden.add(fileId); created.push(fileId);
          this.p.drive.assertCopy(fileId, folder);
          generation.files[role] = { id: fileId, sourceId: this.p.sources[role].id, sheets: sourceSheets[role] };
        }
        // All three candidates exist before validation; no production IDs are rewritten inside copies.
        for (const role of ROLES) generation.evidence[role] = this.inspect(generation.files[role].id, sourceSheets[role]);
        for (const role of ROLES) {
          const after = this.p.spreadsheets.inspect(this.p.sources[role].id, []);
          if (after.id !== this.p.sources[role].id || !names(after.sheets) || !sameNames(after.sheets, sourceSheets[role])) fail('SOURCE_STRUCTURE_CHANGED');
        }
        this.generation(generation);
        this.write({ ...state, folderId: folder, active: generation, previous: state.active });
        return { status: 'OK', operation: 'RESET', activeGenerationId: generation.id, createdFileIds: created, folderId: folder };
      } catch (error) {
        return { status: 'BLOCKED', operation: 'RESET', code: error instanceof Error ? error.message : 'RESET_FAILED',
          activeGenerationId: null, createdFileIds: created, folderId: folder }; // Caller must reload config; never guess after uncertain commit.
      }
    });
  }
  rollback(expectedActiveGenerationId: string): ResetResult {
    this.guard(); return this.p.lock.run(() => {
      this.guard(); const state = this.read();
      if (state.pending) fail('PENDING_GENERATION_EXISTS');
      if (!state.active || state.active.id !== expectedActiveGenerationId || !state.previous || !state.folderId) fail('ROLLBACK_PRECONDITION_FAILED');
      const folder = state.folderId!;
      this.p.drive.assertFolder(folder, 'ERP_KUB_TEST');
      const restored = JSON.parse(JSON.stringify(state.previous)) as Generation;
      for (const role of ROLES) {
        this.p.drive.assertCopy(restored.files[role].id, folder);
        restored.evidence[role] = this.inspect(restored.files[role].id, restored.files[role].sheets);
      }
      this.write({ ...state, active: restored, previous: state.active });
      return { status: 'OK', operation: 'ROLLBACK', activeGenerationId: restored.id, createdFileIds: [], folderId: state.folderId };
    });
  }
  /** TEST consumer resolver: intentionally has no production default. */
  activeConfig(): Readonly<TestConfig> {
    this.guard(); const state = this.read(); if (!state.active) fail('TEST_NOT_INITIALIZED');
    return JSON.parse(JSON.stringify(state));
  }
}
