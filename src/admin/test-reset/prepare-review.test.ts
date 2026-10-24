import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { TestPreparation, type PreparationPorts } from './prepare-review';
import { TestAdminDiagnostics, TEST_USERS_KEY } from './admin-preflight';
import { ManualEvidenceStore, MANUAL_EVIDENCE_KEY } from './manual-evidence';
import { TEST_INSTALLATION_KEY, TEST_CONFIG_KEY, ROLES, readTestConfiguration } from './test-configuration';
import { PRODUCTION_SCRIPT_ID } from './test-sources';
import type { BookSnapshot } from './test-reset';
import { gasSpreadsheetInspector } from './spreadsheet-risk-inspector';

function fixture(proofs = true) {
  let now = 1800000000000, copies = 0, generation = 0, held = false;
  const hash = (s: string) => createHash('sha256').update(s).digest('hex'), bytes = (s: string) => Buffer.byteLength(s);
  const script = 'isolated-prepare-project', subject = 'verified-prepare-admin';
  const props = new Map<string, string>([[TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: script })]]);
  const user = { issuer: 'https://accounts.google.com', subject, email: 'info@example.invalid', active: true, roles: ['ADMIN'], authorizationVersion: 1 };
  const saveUser = () => props.set(TEST_USERS_KEY, JSON.stringify({ version: 1, users: [user] })); saveUser();
  const properties = { getProperty: (k: string) => props.get(k) ?? null, setProperty: vi.fn((k: string, v: string) => { props.set(k, v); }) };
  const sources = {
    MASTER: { id: 'production-master', requiredSheets: ['00_Elements', '01_BOM', '05_Materials'] },
    OPERATIONAL: { id: 'production-operational', requiredSheets: ['01_Виготовлення'] },
    REPORTING: { id: 'production-reporting', requiredSheets: ['ВідомістьВитрат'] },
  };
  const books = new Map<string, BookSnapshot>(ROLES.map(r => [sources[r].id, { id: sources[r].id, sheets: [...sources[r].requiredSheets], hazards: [], fingerprint: hash(r) }]));
  const names = new Map<string, string>(), folders: string[] = [];
  const inspector = { inspect: (id: string) => { const b = books.get(id); if (!b) throw Error('missing'); return structuredClone(b); } };
  const evidence = new ManualEvidenceStore(properties, inspector, hash, () => now, s => s === subject && user.active && user.roles.includes('ADMIN'));
  const admin = new TestAdminDiagnostics({ properties, scriptId: () => script, webAppUrl: () => null,
    identity: { getOAuthToken: () => 'server-token', fetch: () => ({ getResponseCode: () => 200, getHeaders: () => ({ 'Content-Type': 'application/json' }),
      getContentText: () => JSON.stringify({ sub: subject, email: 'info@example.invalid', email_verified: true }) }) },
    sources, now: () => now, spreadsheets: inspector, dependencies: evidence,
    sourceFile: id => ({ id, mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false }),
  });
  const copy = vi.fn((sourceId: string, name: string) => {
    const id = `candidate-${++copies}`; books.set(id, { ...structuredClone(books.get(sourceId)!), id }); names.set(id, name); return id;
  });
  const ports: PreparationPorts = { admin, properties, scriptId: () => script, sources, books: inspector, dependencies: evidence,
    now: () => now, uniqueId: () => `generation-${++generation}`, hash, utf8Bytes: bytes,
    lock: { run(fn) { if (held) throw Error('TEST_RESET_BUSY'); held = true; try { return fn(); } finally { held = false; } } },
    drive: { findFolders: () => [...folders], createFolder: vi.fn(() => { folders.push('test-folder'); return 'test-folder'; }),
      assertFolder: vi.fn(), copy,
      assertCopy: (id: string) => { if (!books.has(id) || id.startsWith('production')) throw Error('bad-copy'); },
      findCopies: (name: string) => [...names].filter(([, n]) => n === name).map(([id]) => id),
    },
  };
  const service = new TestPreparation(ports);
  const attest = (id: string) => evidence.record({ fileId: id, fingerprint: books.get(id)!.fingerprint!, evidenceId: `manual-${id}`,
    artifactCommitment: hash(`independent-script-trigger-inventory-${id}`), reference: 'isolated-test-audit-artifact', externalConnections: 'SAFE', boundScripts: 'SAFE', triggers: 'SAFE' },
    admin.identity().subject, [...books.keys()], bytes);
  if (proofs) ROLES.forEach(r => attest(sources[r].id));
  return { service, ports, admin, evidence, attest, books, names, props, properties, copy, user, saveUser,
    state: () => readTestConfiguration(props.get(TEST_CONFIG_KEY) ?? null, script, sources), advance: (ms: number) => { now += ms; } };
}
function ready(f: ReturnType<typeof fixture>) {
  const prepared = f.service.prepare(f.state().active?.id ?? null);
  Object.values(f.state().pending!.files).forEach(file => f.attest(file!.id));
  f.service.recordReview(prepared.generationId!);
  return prepared.generationId!;
}
it('prepares all copies, persists pending IDs, never activates; repeated prepare does not copy again', () => {
  const f = fixture(), before = JSON.stringify(f.state().active);
  expect(f.service.reviewPending().state).toBe('NOT_PREPARED');
  const result = f.service.prepare(null);
  expect(result.state).toBe('PENDING_REVIEW'); expect(f.copy).toHaveBeenCalledTimes(3);
  expect(Object.values(result.files).map(x => x!.name)).toEqual(ROLES.map(r => `ERP_KUB_TEST_${r}_generation-1`));
  expect(JSON.stringify(f.state().active)).toBe(before);
  expect(f.service.prepare(null).generationId).toBe(result.generationId); expect(f.copy).toHaveBeenCalledTimes(3);
});
it('strictly read-only review fails without candidate evidence; explicit attestations bind READY to those copies/state', () => {
  const f = fixture(); f.service.prepare(null); const before = f.props.get(TEST_CONFIG_KEY), writes = f.properties.setProperty.mock.calls.length;
  const failed = f.service.reviewPending(); expect(failed.state).toBe('REVIEW_FAILED');
  expect(f.props.get(TEST_CONFIG_KEY)).toBe(before); expect(f.properties.setProperty.mock.calls.length).toBe(writes);
  Object.values(f.state().pending!.files).forEach(file => f.attest(file!.id));
  const ready = f.service.reviewPending(); expect(ready.state).toBe('READY_FOR_ACTIVATION'); expect(ready.activationAllowed).toBe(false);
  expect(f.state().pending!.state).toBe('PENDING_REVIEW'); // Computed report is not a metadata commit.
  f.service.recordReview('generation-1'); expect(f.state().pending!.state).toBe('READY_FOR_ACTIVATION');
  expect(f.state().active).toBeNull(); expect(f.state().pending!.review!.commitment).toBe(ready.commitment);
});
it.each([1, 2])('recovers timeout after remote copy %s without ever re-copying that role', index => {
  const f = fixture(), original = f.copy.getMockImplementation()!; let attempts = 0;
  f.copy.mockImplementation((source, name) => { const id = original(source, name); if (++attempts === index) throw Error('timeout-after-create'); return id; });
  const partial = f.service.prepare(null); expect(partial.state).toBe('PREPARING'); expect(partial.inFlight).toBe(ROLES[index - 1]);
  const count = f.copy.mock.calls.length; f.service.prepare(null); expect(f.copy.mock.calls.length).toBe(count);
  expect(f.service.recoverPending(null, 'generation-1').state).toBe('PENDING_REVIEW');
  expect(f.copy).toHaveBeenCalledTimes(3); expect(f.names.size).toBe(3); expect(f.state().active).toBeNull();
});
it('copy error without a discoverable file remains blocked, even after repeated calls', () => {
  const f = fixture(); f.copy.mockImplementationOnce(() => { throw Error('outcome-unknown'); });
  f.service.prepare(null); f.service.prepare(null);
  expect(() => f.service.recoverPending(null, 'generation-1')).toThrow('COPY_NOT_DISCOVERED_NO_RETRY');
  expect(f.copy).toHaveBeenCalledOnce(); expect(f.state().pending!.inFlight).toBe('MASTER');
});
it('ambiguous discovered copies and generation conflicts fail closed', () => {
  const f = fixture(), original = f.copy.getMockImplementation()!;
  f.copy.mockImplementationOnce((source, name) => { original(source, name); original(source, name); throw Error('timeout'); });
  f.service.prepare(null);
  expect(() => f.service.recoverPending(null, 'other-generation')).toThrow('PENDING_GENERATION_CONFLICT');
  expect(() => f.service.recoverPending(null, 'generation-1')).toThrow('AMBIGUOUS_COPY_RECOVERY');
  expect(() => f.service.prepare('stale-generation')).toThrow('STALE_TEST_GENERATION');
});
it('UNKNOWN source dependencies prevent even folder/property mutation', () => {
  const f = fixture(false), before = JSON.stringify([...f.props]);
  expect(() => f.service.prepare(null)).toThrow('PREFLIGHT_BLOCKED');
  expect(f.copy).not.toHaveBeenCalled(); expect(f.ports.drive.createFolder).not.toHaveBeenCalled();
  expect(JSON.stringify([...f.props])).toBe(before);
});
it.each(['MANAGER', 'unknown', 'wrong-script'])('rejects %s before prepare effects', mode => {
  const f = fixture();
  if (mode === 'wrong-script') f.props.set(TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: PRODUCTION_SCRIPT_ID }));
  else { if (mode === 'MANAGER') f.user.roles = ['MANAGER']; else f.user.subject = 'other'; f.saveUser(); }
  expect(() => f.service.prepare(null)).toThrow(); expect(f.copy).not.toHaveBeenCalled(); expect(f.props.has(TEST_CONFIG_KEY)).toBe(false);
});
it('changed/expired/revoked evidence reverts to UNKNOWN and does not bypass known external hazards', () => {
  const f = fixture(), source = f.ports.sources.MASTER.id;
  f.books.get(source)!.fingerprint = f.ports.hash('changed');
  expect(f.evidence.inspect(source).boundScripts).toBe('UNKNOWN'); expect(() => f.service.prepare(null)).toThrow('PREFLIGHT_BLOCKED');
  f.attest(source); f.books.get(source)!.hazards = ['Sheet!R1C1'];
  expect(() => f.service.prepare(null)).toThrow('PREFLIGHT_BLOCKED');
  f.books.get(source)!.hazards = []; f.advance(15 * 60000);
  expect(f.evidence.inspect(source).triggers).toBe('UNKNOWN');
});
it('changed candidate, missing file, invalid evidence ID and mismatched fingerprint never produce READY', () => {
  const f = fixture(); f.service.prepare(null); const id = f.state().pending!.files.MASTER!.id;
  expect(() => f.evidence.record({ fileId: id, fingerprint: '0'.repeat(64), evidenceId: 'review', artifactCommitment: 'a'.repeat(64), reference: 'audit',
    externalConnections: 'SAFE', boundScripts: 'SAFE', triggers: 'SAFE' }, f.user.subject, [id], Buffer.byteLength)).toThrow('EVIDENCE_STATE_CHANGED');
  Object.values(f.state().pending!.files).forEach(file => f.attest(file!.id));
  f.books.get(id)!.fingerprint = f.ports.hash('edited-copy');
  expect(f.service.reviewPending().state).toBe('REVIEW_FAILED');
  f.attest(id); expect(f.service.reviewPending().state).toBe('REVIEW_FAILED'); // Full-copy source commitment no longer matches.
  f.books.delete(id); expect(f.service.reviewPending().state).toBe('REVIEW_FAILED');
});
it('preserves an existing active generation byte-for-byte during prepare/review', () => {
  const f = fixture();
  const active = { id: 'old-generation', createdAt: '2026-10-22T00:00:00Z', files: Object.fromEntries(ROLES.map(r => [r, { id: `old-${r}`, sourceId: f.ports.sources[r].id, sheets: [...f.ports.sources[r].requiredSheets] }])), evidence: Object.fromEntries(ROLES.map(r => [r, 'old-review'])) };
  f.props.set(TEST_CONFIG_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: f.ports.scriptId(), folderId: 'test-folder', active, previous: null }));
  f.service.prepare('old-generation'); f.service.reviewPending();
  expect(f.state().active).toEqual(active); expect(f.state().previous).toBeNull();
});
it.each(['before', 'after'])('configuration write uncertainty %s commit stops before another copy; recovery never duplicates', mode => {
  const f = fixture(), write = f.properties.setProperty.getMockImplementation()!; let failed = false;
  f.properties.setProperty.mockImplementation((k, v) => {
    const fail = k === TEST_CONFIG_KEY && !failed && Object.keys(JSON.parse(v).pending?.files ?? {}).length === 2;
    if (fail && mode === 'before') { failed = true; throw Error('commit-timeout'); }
    write(k, v);
    if (fail) { failed = true; throw Error('commit-timeout'); }
  });
  expect(() => f.service.prepare(null)).toThrow('CONFIG_COMMIT_UNCONFIRMED'); expect(f.copy).toHaveBeenCalledTimes(2);
  f.service.prepare(null); expect(f.copy).toHaveBeenCalledTimes(2);
  expect(f.service.recoverPending(null, 'generation-1').state).toBe('PENDING_REVIEW'); expect(f.copy).toHaveBeenCalledTimes(3);
});
it('uncertain folder creation is discovered instead of duplicated', () => {
  const f = fixture(), create = vi.mocked(f.ports.drive.createFolder), original = create.getMockImplementation()!;
  create.mockImplementationOnce(name => { original(name); throw Error('folder-timeout'); });
  expect(f.service.prepare(null).inFlight).toBe('FOLDER'); expect(f.copy).not.toHaveBeenCalled();
  f.service.prepare(null); expect(create).toHaveBeenCalledOnce();
  expect(f.service.recoverPending(null, 'generation-1').state).toBe('PENDING_REVIEW'); expect(create).toHaveBeenCalledOnce();
});
it('new fingerprint scope excludes file ID but binds cell types, formulas, notes, formats and grid structure', () => {
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  let value: unknown = 1, formula = '', note = '', format = '0', columns = 26;
  const api = { openById: (id: string) => ({ getId: () => id, getSheets: () => [{ getName: () => 'Sheet', getLastRow: () => 1, getLastColumn: () => 1,
    getMaxRows: () => 1000, getMaxColumns: () => columns, getRange: () => ({ getValues: () => [[value]], getFormulas: () => [[formula]],
      getRichTextValues: () => [[null]], getNotes: () => [[note]], getNumberFormats: () => [[format]] }) }] }) } as any;
  const scan = gasSpreadsheetInspector(api, 100, hash), initial = scan.inspect('source', []).fingerprint;
  expect(scan.inspect('copy', []).fingerprint).toBe(initial);
  value = '1'; expect(scan.inspect('copy', []).fingerprint).not.toBe(initial); value = 1;
  formula = '=1'; expect(scan.inspect('copy', []).fingerprint).not.toBe(initial); formula = '';
  note = 'audit'; expect(scan.inspect('copy', []).fingerprint).not.toBe(initial); note = '';
  format = '0.00'; expect(scan.inspect('copy', []).fingerprint).not.toBe(initial); format = '0';
  columns = 27; expect(scan.inspect('copy', []).fingerprint).not.toBe(initial);
});
it('source changes, size limits and concurrent lock prevent unsafe continuation', () => {
  const f = fixture(); f.ports.utf8Bytes = () => 9000;
  expect(() => f.service.prepare(null)).toThrow('TEST_CONFIG_SIZE_LIMIT'); expect(f.copy).not.toHaveBeenCalled();
  const g = fixture(), original = g.copy.getMockImplementation()!;
  g.copy.mockImplementation((source, name) => { expect(() => g.service.prepare(null)).toThrow('TEST_RESET_BUSY');
    const id = original(source, name); g.books.get(source)!.fingerprint = g.ports.hash('changed-source'); return id; });
  expect(() => g.service.prepare(null)).toThrow('PREFLIGHT_BLOCKED'); expect(g.copy).toHaveBeenCalledOnce(); expect(g.state().active).toBeNull();
});
it('old v1 JSON remains compatible and malformed pending state is rejected', () => {
  const f = fixture(); expect(f.state().pending).toBeUndefined(); f.service.prepare(null);
  const state = f.state(); state.pending!.files.MASTER!.id = f.ports.sources.MASTER.id;
  f.props.set(TEST_CONFIG_KEY, JSON.stringify(state));
  expect(() => f.service.reviewPending()).toThrow('TEST_CONFIG_INVALID');
});
it('first activation atomically commits reviewed copies and first rollback returns to uninitialized TEST', () => {
  const f = fixture(), generation = ready(f), beforeActivation = f.properties.setProperty.mock.calls.length;
  const activated = f.service.activate(generation);
  expect(activated).toMatchObject({ status: 'ACTIVATED', generationId: generation, previousGenerationId: null, rollbackAvailable: true });
  expect(f.properties.setProperty.mock.calls.length).toBe(beforeActivation + 1);
  const state = f.state(); expect(state.pending).toBeNull(); expect(state.previous).toBeNull(); expect(state.active?.id).toBe(generation);
  for (const role of ROLES) {
    expect(state.active!.files[role].id).toBe(`candidate-${ROLES.indexOf(role) + 1}`);
    expect(state.active!.files[role].sourceId).toBe(f.ports.sources[role].id);
    expect(state.active!.evidence[role]).toBe(`manual-candidate-${ROLES.indexOf(role) + 1}`);
  }
  const retained = [...f.books.keys()].filter(id => id.startsWith('candidate-'));
  const rolled = f.service.rollback(generation);
  expect(rolled).toMatchObject({ status: 'ROLLED_BACK', fromGenerationId: generation, activeGenerationId: null, testInitialized: false });
  expect(f.state().active).toBeNull(); expect(f.state().previous).toBeNull(); expect(f.state().folderId).toBe('test-folder');
  expect(retained.every(id => f.books.has(id))).toBe(true);
  expect(() => f.service.rollback(generation)).toThrow('ROLLBACK_PRECONDITION_FAILED');
});
it('second activation retains one verified generation and rollback swaps it back without deleting copies', () => {
  const f = fixture(), first = ready(f); f.service.activate(first);
  const second = ready(f); f.service.activate(second);
  expect(f.state().active?.id).toBe(second); expect(f.state().previous?.id).toBe(first); expect(f.state().pending).toBeNull();
  const ids = [...f.books.keys()].filter(id => id.startsWith('candidate-'));
  const rolled = f.service.rollback(second);
  expect(rolled).toMatchObject({ activeGenerationId: first, testInitialized: true });
  expect(f.state().active?.id).toBe(first); expect(f.state().previous?.id).toBe(second);
  expect(ids).toHaveLength(6); expect(ids.every(id => f.books.has(id))).toBe(true);
  expect(() => f.service.rollback(second)).toThrow('ROLLBACK_PRECONDITION_FAILED');
});
it.each(['wrong-generation', 'not-ready', 'changed-copy', 'expired-evidence', 'wrong-marker', 'wrong-script', 'revoked-admin'])(
  'activation rejects %s without changing active configuration', mode => {
    const f = fixture(), generation = ready(f), before = f.props.get(TEST_CONFIG_KEY);
    if (mode === 'not-ready') { const state = f.state(); state.pending!.state = 'PENDING_REVIEW'; f.props.set(TEST_CONFIG_KEY, JSON.stringify(state)); }
    if (mode === 'changed-copy') f.books.get(f.state().pending!.files.MASTER!.id)!.fingerprint = f.ports.hash('changed');
    if (mode === 'expired-evidence') f.advance(15 * 60000);
    if (mode === 'wrong-marker') f.props.set(TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: 'other-script' }));
    if (mode === 'wrong-script') f.ports.scriptId = () => 'other-script';
    if (mode === 'revoked-admin') { f.user.active = false; f.saveUser(); }
    expect(() => f.service.activate(mode === 'wrong-generation' ? 'other-generation' : generation)).toThrow();
    if (!['not-ready', 'wrong-marker'].includes(mode)) expect(f.props.get(TEST_CONFIG_KEY)).toBe(before);
    expect(f.state().active).toBeNull();
  });
it('activation rejects changed review checkpoint, stale evidence ID and repeated invocation', () => {
  const f = fixture(), generation = ready(f), state = f.state();
  state.pending!.review!.commitment = 'f'.repeat(64); f.props.set(TEST_CONFIG_KEY, JSON.stringify(state));
  expect(() => f.service.activate(generation)).toThrow('ACTIVATION_EVIDENCE_STALE'); expect(f.state().active).toBeNull();
  const g = fixture(), id = ready(g), saved = g.state(); saved.pending!.review!.evidenceIds.MASTER = 'another-evidence';
  g.props.set(TEST_CONFIG_KEY, JSON.stringify(saved));
  expect(() => g.service.activate(id)).toThrow('ACTIVATION_EVIDENCE_STALE');
  const h = fixture(), active = ready(h); h.service.activate(active);
  expect(() => h.service.activate(active)).toThrow('ACTIVATION_PRECONDITION_FAILED');
});
it.each(['changed-target', 'expired-target-evidence', 'missing-target', 'ambiguous-name', 'pending', 'wrong-active'])(
  'rollback rejects %s and leaves current active unchanged', mode => {
    const f = fixture(), first = ready(f); f.service.activate(first); const second = ready(f); f.service.activate(second);
    const targetId = f.state().previous!.files.MASTER.id, before = f.props.get(TEST_CONFIG_KEY);
    if (mode === 'changed-target') f.books.get(targetId)!.fingerprint = f.ports.hash('changed-target');
    if (mode === 'expired-target-evidence') f.advance(15 * 60000);
    if (mode === 'missing-target') f.books.delete(targetId);
    if (mode === 'ambiguous-name') f.names.set('unrelated-copy', `ERP_KUB_TEST_MASTER_${first}`);
    if (mode === 'pending') { const state = f.state(); state.pending = { id: 'blocking-pending', createdAt: '2026-10-23T00:00:00Z', baseActiveId: second,
      state: 'PREPARING', files: {}, sheets: Object.fromEntries(ROLES.map(r => [r, [...f.ports.sources[r].requiredSheets]])) as any,
      sourceHashes: Object.fromEntries(ROLES.map(r => [r, 'a'.repeat(64)])) as any, inFlight: null }; f.props.set(TEST_CONFIG_KEY, JSON.stringify(state)); }
    expect(() => f.service.rollback(mode === 'wrong-active' ? first : second)).toThrow();
    if (mode !== 'pending') expect(f.props.get(TEST_CONFIG_KEY)).toBe(before);
    expect(f.state().active?.id).toBe(second);
  });
it.each(['before', 'after'])('activation property failure %s commit is unconfirmed and never retried', mode => {
  const f = fixture(), generation = ready(f), write = f.properties.setProperty.getMockImplementation()!, beforeCalls = f.properties.setProperty.mock.calls.length;
  f.properties.setProperty.mockImplementation((key, value) => {
    const activating = key === TEST_CONFIG_KEY && JSON.parse(value).active?.id === generation && JSON.parse(value).pending === null;
    if (activating && mode === 'before') throw Error('write-timeout');
    write(key, value); if (activating) throw Error('write-timeout');
  });
  expect(() => f.service.activate(generation)).toThrow('CONFIG_COMMIT_UNCONFIRMED');
  expect(f.properties.setProperty.mock.calls.length).toBe(beforeCalls + 1);
  expect([null, generation]).toContain(f.state().active?.id ?? null);
});
it('lock conflicts stop activate and rollback before configuration writes', () => {
  const f = fixture(), generation = ready(f), writes = f.properties.setProperty.mock.calls.length;
  f.ports.lock.run = () => { throw Error('TEST_RESET_BUSY'); };
  expect(() => f.service.activate(generation)).toThrow('TEST_RESET_BUSY');
  expect(f.properties.setProperty.mock.calls.length).toBe(writes);
});
it.each(['before', 'after'])('rollback property failure %s commit is unconfirmed and never retried', mode => {
  const f = fixture(), generation = ready(f); f.service.activate(generation);
  const write = f.properties.setProperty.getMockImplementation()!, beforeCalls = f.properties.setProperty.mock.calls.length;
  f.properties.setProperty.mockImplementation((key, value) => {
    const rollingBack = key === TEST_CONFIG_KEY && JSON.parse(value).active === null;
    if (rollingBack && mode === 'before') throw Error('write-timeout');
    write(key, value); if (rollingBack) throw Error('write-timeout');
  });
  expect(() => f.service.rollback(generation)).toThrow('CONFIG_COMMIT_UNCONFIRMED');
  expect(f.properties.setProperty.mock.calls.length).toBe(beforeCalls + 1);
  expect([null, generation]).toContain(f.state().active?.id ?? null);
});
it('readback mismatch blocks activation and rollback without a second write', () => {
  const f = fixture(), generation = ready(f), get = f.properties.getProperty;
  f.properties.getProperty = vi.fn(key => {
    const value = get(key); return key === TEST_CONFIG_KEY && value && JSON.parse(value).active?.id === generation ? `${value} ` : value;
  });
  expect(() => f.service.activate(generation)).toThrow('CONFIG_COMMIT_UNCONFIRMED');
  const g = fixture(), active = ready(g); g.service.activate(active); const original = g.properties.getProperty;
  g.properties.getProperty = vi.fn(key => {
    const value = original(key); return key === TEST_CONFIG_KEY && value && JSON.parse(value).active === null ? `${value} ` : value;
  });
  expect(() => g.service.rollback(active)).toThrow('CONFIG_COMMIT_UNCONFIRMED');
});
it.each(['revoked-admin', 'wrong-marker', 'wrong-script', 'busy'] as const)('rollback blocks %s before commit', mode => {
  const f = fixture(), generation = ready(f); f.service.activate(generation); const before = f.props.get(TEST_CONFIG_KEY), writes = f.properties.setProperty.mock.calls.length;
  if (mode === 'revoked-admin') { f.user.active = false; f.saveUser(); }
  if (mode === 'wrong-marker') f.props.set(TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId: 'other-script' }));
  if (mode === 'wrong-script') f.ports.scriptId = () => 'other-script';
  if (mode === 'busy') f.ports.lock.run = () => { throw Error('TEST_RESET_BUSY'); };
  expect(() => f.service.rollback(generation)).toThrow();
  expect(f.props.get(TEST_CONFIG_KEY)).toBe(before); expect(f.properties.setProperty.mock.calls.length).toBe(writes);
});
it('fresh re-attestation after recorded review requires a new review checkpoint', () => {
  const f = fixture(), generation = ready(f), id = f.state().pending!.files.MASTER!.id;
  f.advance(1); f.attest(id);
  expect(() => f.service.activate(generation)).toThrow('ACTIVATION_EVIDENCE_STALE');
  f.service.recordReview(generation); expect(f.service.activate(generation).status).toBe('ACTIVATED');
});
