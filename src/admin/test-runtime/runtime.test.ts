import { expect, it, vi } from 'vitest';
import { createTestRuntime } from './runtime';
import { TestRuntimeResolver } from './resolver';
import { verifiedIdentity, type Role } from '../../security/permission-service';
import { TEST_CONFIG_KEY, TEST_INSTALLATION_KEY, ROLES } from '../test-reset/test-configuration';
import { TEST_RESET_SOURCES, PRODUCTION_SCRIPT_ID } from '../test-reset/test-sources';
import { ScopedSpreadsheetRegistry } from '../../infrastructure/spreadsheets/ScopedSpreadsheetRegistry';

function fixture() {
  let scriptId = 'test-runtime-script';
  const state = { version: 1, environment: 'TEST', scriptId, folderId: 'test-folder', previous: null,
    active: { id: 'generation-one', createdAt: '2026-10-23T10:00:00Z',
      files: Object.fromEntries(ROLES.map(r => [r, { id: `copy-${r}`, sourceId: TEST_RESET_SOURCES[r].id, sheets: [...TEST_RESET_SOURCES[r].requiredSheets] }])),
      evidence: Object.fromEntries(ROLES.map(r => [r, `evidence-${r}`])) } };
  const props = new Map([[TEST_CONFIG_KEY, JSON.stringify(state)], [TEST_INSTALLATION_KEY, JSON.stringify({ version: 1, environment: 'TEST', scriptId })]]);
  const user = { issuer: 'https://accounts.google.com', subject: 'admin', active: true, roles: ['ADMIN'] as Role[], authorizationVersion: 1 };
  const identity = verifiedIdentity(user.issuer, user.subject, 2000000000000);
  const ports = { properties: { getProperty: (k: string) => props.get(k) ?? null }, scriptId: () => scriptId,
    identity: { current: () => identity }, users: { find: () => user }, now: () => 1800000000000 };
  const openById = vi.fn((id: string) => ({ getId: () => id,
    getSheetByName: () => ({ getDataRange: () => ({ getValues: () => [[id, 42]] }) }) } as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet));
  return { ports, props, state, user, openById, runtime: createTestRuntime(ports, { openById }),
    save: () => props.set(TEST_CONFIG_KEY, JSON.stringify(state)), script: (id: string) => { scriptId = id; } };
}
it('uses only canonical active TEST targets and reuses generation-scoped cache', () => {
  const f = fixture();
  for (const role of ROLES) expect(f.runtime.readValues(role, 'sheet')).toEqual([[`copy-${role}`, 42]]);
  f.runtime.readValues('MASTER', 'sheet'); expect(f.openById).toHaveBeenCalledTimes(3);
  expect(f.openById.mock.calls.flat()).not.toEqual(expect.arrayContaining(ROLES.map(r => TEST_RESET_SOURCES[r].id)));
});
it.each(['missing', 'invalid-json', 'pending-only', 'marker', 'script', 'production-script', 'duplicate', 'source-id', 'evidence', 'inactive', 'manager', 'legacy', 'forged-identity'])(
  'fails closed before open for %s', mode => {
    const f = fixture();
    if (mode === 'missing') f.props.delete(TEST_CONFIG_KEY);
    if (mode === 'invalid-json') f.props.set(TEST_CONFIG_KEY, '{');
    if (mode === 'pending-only') { (f.state as any).active = null; f.save(); }
    if (mode === 'marker') f.props.delete(TEST_INSTALLATION_KEY);
    if (mode === 'script') f.script('another-script');
    if (mode === 'production-script') f.script(PRODUCTION_SCRIPT_ID);
    if (mode === 'duplicate') { f.state.active.files.REPORTING.id = f.state.active.files.MASTER.id; f.save(); }
    if (mode === 'source-id') { f.state.active.files.MASTER.id = TEST_RESET_SOURCES.REPORTING.id; f.save(); }
    if (mode === 'evidence') { f.state.active.evidence.MASTER = ''; f.save(); }
    if (mode === 'inactive') f.user.active = false;
    if (mode === 'manager') f.user.roles = ['MANAGER'];
    if (mode === 'legacy') f.user.roles = ['ERP_OWNER' as Role];
    if (mode === 'forged-identity') f.ports.identity.current = () => ({ issuer: 'https://accounts.google.com', subject: 'admin', expiresAt: 2000000000000 });
    expect(() => f.runtime.readValues('MASTER', 'sheet')).toThrow(); expect(f.openById).not.toHaveBeenCalled();
  });
it.each(['PENDING_REVIEW', 'READY_FOR_ACTIVATION'])('never opens %s candidates', state => {
  const f = fixture(); const active = f.state.active;
  (f.state as any).active = null;
  (f.state as any).pending = { id: active.id, createdAt: active.createdAt, state, baseActiveId: null, inFlight: null,
    files: Object.fromEntries(ROLES.map(r => [r, { id: active.files[r].id, name: `ERP_KUB_TEST_${r}_${active.id}` }])),
    sheets: Object.fromEntries(ROLES.map(r => [r, active.files[r].sheets])),
    sourceHashes: Object.fromEntries(ROLES.map(r => [r, 'a'.repeat(64)])),
    review: { at: active.createdAt, commitment: 'b'.repeat(64),
      hashes: Object.fromEntries(ROLES.map(r => [r, 'a'.repeat(64)])), evidenceIds: active.evidence } };
  f.save(); expect(() => f.runtime.readValues('MASTER', 'sheet')).toThrow(); expect(f.openById).not.toHaveBeenCalled();
});
it('pending READY candidates never replace an existing active target', () => {
  const f = fixture(); const a = f.state.active;
  (f.state as any).pending = { id: 'pending-generation', createdAt: a.createdAt, state: 'READY_FOR_ACTIVATION', baseActiveId: a.id, inFlight: null,
    files: Object.fromEntries(ROLES.map(r => [r, { id: `pending-${r}`, name: `ERP_KUB_TEST_${r}_pending-generation` }])),
    sheets: Object.fromEntries(ROLES.map(r => [r, a.files[r].sheets])), sourceHashes: Object.fromEntries(ROLES.map(r => [r, 'a'.repeat(64)])),
    review: { at: a.createdAt, commitment: 'b'.repeat(64), hashes: Object.fromEntries(ROLES.map(r => [r, 'a'.repeat(64)])), evidenceIds: a.evidence } };
  f.save(); expect(f.runtime.readValues('MASTER', 'sheet')).toEqual([['copy-MASTER', 42]]);
});
it('rejects state changes during the actual values read', () => {
  const f = fixture(); f.openById.mockImplementation(id => ({ getId: () => id,
    getSheetByName: () => ({ getDataRange: () => ({ getValues: () => { f.props.delete(TEST_CONFIG_KEY); return [[1]]; } }) }) } as any));
  expect(() => f.runtime.readValues('MASTER', 'sheet')).toThrow();
});
it('switches generation and invalidates cached books even when old registry is retained', () => {
  const f = fixture(); f.runtime.readValues('MASTER', 'sheet');
  f.state.active.id = 'generation-two'; f.state.active.files.MASTER.id = 'new-copy-master'; f.save();
  expect(f.runtime.readValues('MASTER', 'sheet')).toEqual([['new-copy-master', 42]]);
  expect(f.openById).toHaveBeenCalledTimes(2);
  f.props.delete(TEST_CONFIG_KEY); expect(() => f.runtime.readValues('MASTER', 'sheet')).toThrow();
  f.save(); f.runtime.readValues('MASTER', 'sheet'); expect(f.openById).toHaveBeenCalledTimes(3);
});
it('rechecks ADMIN after a cache hit and never exposes mutation handles', () => {
  const f = fixture(); f.runtime.readValues('MASTER', 'sheet'); f.user.roles = ['MANAGER'];
  expect(() => f.runtime.readValues('MASTER', 'sheet')).toThrow('ACCESS_DENIED');
  expect(() => f.runtime.write()).toThrow('TEST_ROUTE_BLOCKED');
  expect(Object.keys(f.runtime).sort()).toEqual(['readValues', 'write']);
});
it('rejects wrong opened ID and generation changes during read', () => {
  const f = fixture(); f.openById.mockImplementation(id => {
    f.state.active.id = 'changed-generation'; f.save();
    return { getId: () => id } as any;
  });
  expect(() => f.runtime.readValues('MASTER', 'sheet')).toThrow('TEST_CONTEXT_CHANGED');
  const g = fixture(); g.openById.mockReturnValue({ getId: () => TEST_RESET_SOURCES.MASTER.id } as any);
  expect(() => g.runtime.readValues('MASTER', 'sheet')).toThrow('TEST_CONTEXT_CHANGED');
});
it('registry validates has as well as get and clears on failed validation', () => {
  let token = 'one'; const open = vi.fn(() => ({} as any));
  const registry = new ScopedSpreadsheetRegistry({ open, cacheToken: () => { if (!token) throw Error('invalid'); return token; } });
  registry.get('MASTER'); token = 'two'; expect(registry.has('MASTER')).toBe(false);
  registry.get('MASTER'); token = ''; expect(() => registry.has('MASTER')).toThrow();
  token = 'two'; expect(registry.has('MASTER')).toBe(false);
});
it('unknown routes cannot be resolved', () => {
  const f = fixture(); expect(() => new TestRuntimeResolver(f.ports).target('OTHER' as any)).toThrow('TEST_ROUTE_BLOCKED');
});
