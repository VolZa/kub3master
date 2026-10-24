import { TEST_CONFIG_KEY, ROLES, readTestConfiguration, validId, type TestConfig, type PendingGeneration, type FileRole, type Sources, type Generation } from './test-configuration';
import type { PropertiesPort, DrivePort, SpreadsheetPort, SafetyEvidence } from './test-reset';
import type { TestAdminDiagnostics } from './admin-preflight';
export interface PreparationPorts {
  admin: Pick<TestAdminDiagnostics, 'identity' | 'preflight'>; properties: PropertiesPort;
  scriptId(): string; sources: Sources;
  drive: DrivePort & { findCopies(name: string, folderId: string): string[] };
  books: SpreadsheetPort; dependencies: { inspect(id: string): SafetyEvidence };
  lock: { run<T>(fn: () => T): T }; now(): number; uniqueId(): string; hash(s: string): string; utf8Bytes(s: string): number;
}
const die = (code: string): never => { throw Error(code); };
const hex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export class TestPreparation {
  constructor(private readonly p: PreparationPorts) {}
  private read() { return readTestConfiguration(this.p.properties.getProperty(TEST_CONFIG_KEY), this.p.scriptId(), this.p.sources); }
  private write(state: TestConfig) {
    const raw = JSON.stringify(state);
    if (this.p.utf8Bytes(raw) > 8500) die('TEST_CONFIG_SIZE_LIMIT');
    readTestConfiguration(raw, this.p.scriptId(), this.p.sources);
    try { this.p.properties.setProperty(TEST_CONFIG_KEY, raw); if (this.p.properties.getProperty(TEST_CONFIG_KEY) !== raw) throw Error(); }
    catch { die('CONFIG_COMMIT_UNCONFIRMED'); }
  }
  private expected(state: TestConfig, expected: string | null) {
    if ((state.active?.id ?? null) !== expected) die('STALE_TEST_GENERATION');
  }
  private sameNames(a: readonly string[], b: readonly string[]) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  private snapshot(id: string) {
    const b = this.p.books.inspect(id, ROLES.map(r => this.p.sources[r].id));
    if (b.id !== id || !hex(b.fingerprint)) die('FINGERPRINT_UNAVAILABLE'); return b;
  }
  private evidence(id: string, fingerprint: string) {
    const e = this.p.dependencies.inspect(id);
    if (e.fileId !== id || e.fingerprint !== fingerprint || !hex(e.commitment) || !e.evidenceId ||
      !Number.isFinite(e.expiresAt) || e.expiresAt! <= this.p.now() ||
      [e.externalConnections, e.boundScripts, e.triggers].some(s => s !== 'SAFE')) die('DEPENDENCY_REVIEW_REQUIRED');
    return e;
  }
  private sources() {
    const report = this.p.admin.preflight();
    if (report.status !== 'PASS') die('PREFLIGHT_BLOCKED');
    return Object.fromEntries(ROLES.map(role => {
      const b = this.snapshot(this.p.sources[role].id);
      if (b.hazards.length) die('EXTERNAL_REFERENCE_RISK');
      this.evidence(b.id, b.fingerprint!); return [role, b];
    })) as Record<FileRole, ReturnType<TestPreparation['snapshot']>>;
  }
  private assertNew(id: string, state: TestConfig) {
    if (!validId(id) || ROLES.some(r => this.p.sources[r].id === id) ||
      [state.active, state.previous].some(g => g && ROLES.some(r => g.files[r].id === id)) ||
      Object.values(state.pending!.files).some(f => f?.id === id)) die('COPY_ID_NOT_NEW');
  }
  private result(s: TestConfig) {
    return { state: s.pending?.state ?? 'NOT_PREPARED', generationId: s.pending?.id ?? null,
      files: s.pending?.files ?? {}, inFlight: s.pending?.inFlight ?? null, failure: s.pending?.failure ?? null,
      activeGenerationId: s.active?.id ?? null, activationAllowed: false };
  }
  prepare(expectedGeneration: string | null) {
    this.p.admin.identity(); return this.p.lock.run(() => {
      this.p.admin.identity(); const state = this.read(); this.expected(state, expectedGeneration);
      // A repeated call is diagnostic only: never silently restart a pending operation.
      if (state.pending) return this.result(state);
      const sources = this.sources(), generationId = this.p.uniqueId();
      if (!validId(generationId) || [state.active?.id, state.previous?.id].includes(generationId)) die('GENERATION_ID_INVALID');
      state.pending = { id: generationId, createdAt: new Date(this.p.now()).toISOString(), baseActiveId: expectedGeneration,
        state: 'PREPARING', files: {}, sheets: Object.fromEntries(ROLES.map(r => [r, sources[r].sheets])) as Record<FileRole, string[]>,
        sourceHashes: Object.fromEntries(ROLES.map(r => [r, sources[r].fingerprint!])) as Record<FileRole, string>, inFlight: null };
      // Reserve capacity for IDs and review metadata before side effects; never truncate manifests.
      if (this.p.utf8Bytes(JSON.stringify(state)) + 3000 > 8500) die('TEST_CONFIG_SIZE_LIMIT');
      this.write(state); return this.advance(state);
    });
  }
  private advance(state: TestConfig) {
    const pending = state.pending!;
    if (pending.inFlight) return this.result(state);
    const sources = this.sources();
    if (ROLES.some(r => sources[r].fingerprint !== pending.sourceHashes[r])) die('SOURCE_STATE_CHANGED');
    if (!state.folderId) {
      const folders = this.p.drive.findFolders('ERP_KUB_TEST'); if (folders.length > 1) die('AMBIGUOUS_TEST_FOLDER');
      if (folders.length === 1) { state.folderId = folders[0]; this.p.drive.assertFolder(state.folderId, 'ERP_KUB_TEST'); this.write(state); }
      else {
        pending.inFlight = 'FOLDER'; this.write(state);
        try { state.folderId = this.p.drive.createFolder('ERP_KUB_TEST'); this.p.drive.assertFolder(state.folderId, 'ERP_KUB_TEST'); }
        catch { return this.uncertain(state); }
        pending.inFlight = null; this.write(state);
      }
    }
    this.p.drive.assertFolder(state.folderId!, 'ERP_KUB_TEST');
    for (const role of ROLES) if (pending.files[role]) {
      this.p.drive.assertCopy(pending.files[role]!.id, state.folderId!);
      if (this.snapshot(pending.files[role]!.id).fingerprint !== pending.sourceHashes[role]) die('RECOVERY_STATE_MISMATCH');
    }
    for (const role of ROLES) if (!pending.files[role]) {
      // Recheck authentication, dependencies and source state immediately before each makeCopy.
      const current = this.sources();
      if (ROLES.some(r => current[r].fingerprint !== pending.sourceHashes[r])) die('SOURCE_STATE_CHANGED');
      const name = `ERP_KUB_TEST_${role}_${pending.id}`;
      pending.inFlight = role; this.write(state);
      if (this.p.drive.findCopies(name, state.folderId!).length) {
        pending.failure = 'EXISTING_COPY_REQUIRES_RECOVERY'; this.write(state); return this.result(state);
      }
      let id: string;
      try { id = this.p.drive.copy(this.p.sources[role].id, name, state.folderId!); }
      catch { return this.uncertain(state); }
      this.assertNew(id, state);
      pending.files[role] = { id, name }; pending.inFlight = null; delete pending.failure;
      this.write(state); // Save every returned ID before starting another copy.
      this.p.drive.assertCopy(id, state.folderId!);
    }
    const after = this.sources();
    pending.state = ROLES.some(r => after[r].fingerprint !== pending.sourceHashes[r]) ? 'REVIEW_FAILED' : 'PENDING_REVIEW';
    if (pending.state === 'REVIEW_FAILED') pending.failure = 'SOURCE_STATE_CHANGED';
    this.write(state); return this.result(state);
  }
  private uncertain(state: TestConfig) {
    state.pending!.failure = 'COPY_OUTCOME_UNKNOWN'; this.write(state); return this.result(state);
  }
  recoverPending(expectedGeneration: string | null, pendingId: string) {
    this.p.admin.identity(); return this.p.lock.run(() => {
      this.p.admin.identity(); const state = this.read(); this.expected(state, expectedGeneration);
      const pending = state.pending; if (!pending || pending.id !== pendingId) return die('PENDING_GENERATION_CONFLICT');
      if (pending.state !== 'PREPARING') return this.result(state);
      if (pending.inFlight === 'FOLDER') {
        const folders = this.p.drive.findFolders('ERP_KUB_TEST'); if (folders.length !== 1) die('FOLDER_RECOVERY_REQUIRED');
        this.p.drive.assertFolder(folders[0], 'ERP_KUB_TEST'); state.folderId = folders[0];
      } else if (pending.inFlight) {
        if (!state.folderId) return die('FOLDER_RECOVERY_REQUIRED');
        const role = pending.inFlight, name = `ERP_KUB_TEST_${role}_${pending.id}`;
        const ids = this.p.drive.findCopies(name, state.folderId);
        if (ids.length !== 1) die(ids.length ? 'AMBIGUOUS_COPY_RECOVERY' : 'COPY_NOT_DISCOVERED_NO_RETRY');
        this.assertNew(ids[0], state); this.p.drive.assertCopy(ids[0], state.folderId);
        const b = this.snapshot(ids[0]);
        if (b.fingerprint !== pending.sourceHashes[role]) die('RECOVERY_STATE_MISMATCH');
        pending.files[role] = { id: ids[0], name };
      }
      pending.inFlight = null; delete pending.failure; this.write(state);
      return this.advance(state); // Only unattempted roles may now be copied, after fresh preflight.
    });
  }
  /** Strictly read-only: no property writes, Drive mutation or activation. */
  reviewPending() {
    this.p.admin.identity(); return this.review(this.read());
  }
  private review(state: TestConfig) {
    const pending = state.pending;
    if (!pending) return { ...this.result(state), state: 'NOT_PREPARED', blockers: ['NOT_PREPARED'], files: [] };
    if (pending.inFlight || ROLES.some(r => !pending.files[r])) return { ...this.result(state), state: 'PREPARING', blockers: ['RECOVERY_REQUIRED'], files: [] };
    const files = ROLES.map(role => {
      const file = pending.files[role]!, blockers: string[] = []; let fingerprint = '', evidenceId = '', commitment = '';
      try {
        this.p.drive.assertCopy(file.id, state.folderId!);
        const named = this.p.drive.findCopies(file.name, state.folderId!);
        if (named.length !== 1 || named[0] !== file.id) die('COPY_NAME_AMBIGUOUS');
        const b = this.snapshot(file.id); fingerprint = b.fingerprint!;
        if (!this.sameNames(b.sheets, pending.sheets[role])) blockers.push('COPY_SHEETS_MISMATCH');
        if (fingerprint !== pending.sourceHashes[role]) blockers.push('COPY_STATE_MISMATCH');
        if (b.hazards.length) blockers.push('EXTERNAL_REFERENCE_RISK');
        const evidence = this.evidence(file.id, fingerprint); evidenceId = evidence.evidenceId; commitment = evidence.commitment!;
      } catch { blockers.push('DEPENDENCY_OR_COPY_REVIEW_REQUIRED'); }
      return { role, id: file.id, fingerprint, evidenceId, commitment, blockers };
    });
    this.p.admin.identity();
    const blockers = files.flatMap(f => f.blockers), ready = !blockers.length;
    return { generationId: pending.id, state: ready ? 'READY_FOR_ACTIVATION' : 'REVIEW_FAILED', files, blockers,
      commitment: this.p.hash(JSON.stringify([pending.id, files])), activeGenerationId: state.active?.id ?? null, activationAllowed: false };
  }
  /** Explicit metadata checkpoint, separate from read-only review. Always recomputes trusted review. */
  recordReview(pendingId: string) {
    this.p.admin.identity(); return this.p.lock.run(() => {
      this.p.admin.identity(); const state = this.read(), pending = state.pending;
      if (!pending || pending.id !== pendingId) return die('PENDING_GENERATION_CONFLICT');
      const report = this.review(state);
      if (report.state === 'PREPARING' || report.state === 'NOT_PREPARED') die('RECOVERY_REQUIRED');
      pending.state = report.state as 'READY_FOR_ACTIVATION' | 'REVIEW_FAILED';
      pending.review = { at: new Date(this.p.now()).toISOString(), commitment: report.commitment!,
        hashes: Object.fromEntries(report.files.map(f => [f.role, f.fingerprint || '0'.repeat(64)])) as Record<FileRole, string>,
        evidenceIds: Object.fromEntries(report.files.map(f => [f.role, f.evidenceId])) as Record<FileRole, string> };
      this.write(state); return report;
    });
  }
  /** Commit a freshly revalidated READY candidate with one property replacement. */
  activate(expectedGeneration: string) {
    this.p.admin.identity(); return this.p.lock.run(() => {
      this.p.admin.identity(); const state = this.read(), pending = state.pending;
      if (!pending || pending.id !== expectedGeneration || pending.state !== 'READY_FOR_ACTIVATION' || !pending.review ||
        pending.baseActiveId !== (state.active?.id ?? null)) die('ACTIVATION_PRECONDITION_FAILED');
      const candidate = pending!, review = pending!.review!;
      const report = this.review(state);
      if (report.state !== 'READY_FOR_ACTIVATION' || report.commitment !== review.commitment ||
        ROLES.some(role => {
          const file = report.files.find(f => f.role === role);
          return !file || file.id !== candidate.files[role]!.id || file.fingerprint !== review.hashes[role] ||
            file.evidenceId !== review.evidenceIds[role];
        })) die('ACTIVATION_EVIDENCE_STALE');
      const generation: Generation = { id: candidate.id, createdAt: candidate.createdAt,
        files: Object.fromEntries(ROLES.map(role => [role, { id: candidate.files[role]!.id,
          sourceId: this.p.sources[role].id, sheets: [...candidate.sheets[role]] }])) as Generation['files'],
        evidence: { ...review.evidenceIds } };
      this.p.admin.identity();
      this.write({ ...state, active: generation, previous: state.active, pending: null });
      return { status: 'ACTIVATED' as const, generationId: generation.id,
        previousGenerationId: state.active?.id ?? null, files: generation.files, rollbackAvailable: true };
    });
  }
  private validateRollbackTarget(state: TestConfig, generation: Generation) {
    if (!state.folderId) die('ROLLBACK_TARGET_INVALID');
    const folderId = state.folderId!;
    for (const role of ROLES) {
      const file = generation.files[role], name = `ERP_KUB_TEST_${role}_${generation.id}`;
      this.p.drive.assertCopy(file.id, folderId);
      const named = this.p.drive.findCopies(name, folderId);
      if (named.length !== 1 || named[0] !== file.id) die('ROLLBACK_TARGET_INVALID');
      const book = this.snapshot(file.id);
      if (!this.sameNames(book.sheets, file.sheets) || book.hazards.length) die('ROLLBACK_TARGET_INVALID');
      const evidence = this.evidence(file.id, book.fingerprint!);
      if (evidence.evidenceId !== generation.evidence[role]) die('ROLLBACK_EVIDENCE_STALE');
    }
  }
  /** Roll back one activation. With no previous generation this disables TEST runtime. */
  rollback(expectedGeneration: string) {
    this.p.admin.identity(); return this.p.lock.run(() => {
      this.p.admin.identity(); const state = this.read();
      if (!state.active || state.active.id !== expectedGeneration || state.pending) die('ROLLBACK_PRECONDITION_FAILED');
      const current = state.active!, target = state.previous;
      if (target) this.validateRollbackTarget(state, target);
      this.p.admin.identity();
      this.write({ ...state, active: target, previous: target ? current : null, pending: null });
      return { status: 'ROLLED_BACK' as const, fromGenerationId: current.id,
        activeGenerationId: target?.id ?? null, testInitialized: target !== null,
        retainedFileIds: ROLES.map(role => current.files[role].id) };
    });
  }
}
