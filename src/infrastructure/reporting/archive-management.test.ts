import { expect, it } from 'vitest';
import { SavedReportsManagement, validateArchiveName, type ArchiveEntry, type ArchiveManagementStore, type ArchiveOperation } from './archive-management';
import { ArchiveRolePolicy, listSavedMaterialReportsWeb, renameSavedMaterialReportWeb, deleteSavedMaterialReportWeb } from '../../ui/archive-management-web';
const entry = (id = 1): ArchiveEntry => ({ reportId: `MC_${String(id).padStart(6, '0')}`, sheetId: 100 + id, sheetName: `MC_${String(id).padStart(6, '0')}`,
  sourceSheetId: id, savedAt: '2026-10-21T12:00:00Z', houseCode: 'H001', productCode: 'П-1', dateFrom: '2026-06-30', dateTo: '2026-07-01', method: 'normative' });
class Store implements ArchiveManagementStore {
  rows = [entry()]; names = new Map<number, string>([[101, 'MC_000001'], [0, 'ВідомістьВитрат'], [2, 'ReportIndex']]);
  operations = new Map<string, ArchiveOperation>(); held = false; fail = ''; deletes: number[] = [];
  lock() { if (this.held) return false; this.held = true; return true; }
  unlock() { this.held = false; }
  entries() { return this.rows.map(r => ({ ...r })); }
  verify(e: ArchiveEntry) { if (this.operations.get(e.reportId)?.state === 'PENDING') throw new Error('ARCHIVE_RECOVERY_REQUIRED'); if (this.names.get(e.sheetId) !== e.sheetName) throw new Error('PHYSICAL_MISMATCH'); }
  nameExists(name: string, except: number) { return [...this.names].some(([id, n]) => id !== except && n.toLowerCase() === name.toLowerCase()); }
  operation(id: string) { return this.operations.get(id); }
  pendingOperations() { return [...this.operations.values()].filter(o => o.state === 'PENDING'); }
  begin(o: ArchiveOperation) { this.operations.set(o.entry.reportId, structuredClone(o)); }
  renameSheet(e: ArchiveEntry, name: string) { if (this.fail === 'sheet') throw new Error('sheet'); this.names.set(e.sheetId, name); if (this.fail === 'rename-response') throw new Error('timeout'); }
  renameIndex(e: ArchiveEntry, name: string) { if (this.fail === 'index') throw new Error('index'); this.rows.find(r => r.reportId === e.reportId)!.sheetName = name; }
  deleteSheet(e: ArchiveEntry) { this.names.delete(e.sheetId); this.deletes.push(e.sheetId); if (this.fail === 'delete-response') throw new Error('timeout'); }
  deleteIndex(e: ArchiveEntry) { if (this.fail === 'index') throw new Error('index'); this.rows = this.rows.filter(r => r.reportId !== e.reportId); }
  finish(o: ArchiveOperation) { if (this.fail === 'finish') throw new Error('finish'); this.operations.set(o.entry.reportId, { ...o, state: 'COMPLETE' }); }
}
const policy = new ArchiveRolePolicy(() => ({ email: 'verified@example.com', roles: ['ERP_OWNER'] }));
it('lists empty/one/multiple archives and opens verified exact gid only', () => {
  const s = new Store(), service = new SavedReportsManagement(s, policy);
  expect(service.list()[0]).toMatchObject({ state: 'ACTIVE', url: expect.stringContaining('#gid=101') });
  s.rows.push(entry(2)); s.names.set(102, 'MC_000002'); expect(service.list()).toHaveLength(2);
  s.rows = []; expect(service.list()).toEqual([]);
});
it('renames sheet and index without changing business/physical IDs', () => {
  const s = new Store(), service = new SavedReportsManagement(s, policy);
  expect(service.rename('MC_000001', 101, 'Плита — червень')).toMatchObject({ status: 'OK', reportId: 'MC_000001', sheetId: 101, sheetName: 'Плита — червень' });
  expect(s.names.get(101)).toBe('Плита — червень'); expect(s.rows[0].sheetName).toBe('Плита — червень'); expect(s.held).toBe(false);
});
it.each(['', ' ', 'x/y', 'x\\y', 'x:y', 'x?y', '[x]', '*', '=1', "'x", 'ПоточнийЗвіт', 'ReportIndex', 'ВідомістьВитрат', 'Аркуш2', '_KUB_PREVIOUS_1', 'x'.repeat(101)])('rejects invalid/protected name %s', name => {
  expect(() => validateArchiveName(name)).toThrow('INVALID_ARCHIVE_NAME');
});
it('rejects conflicts and wrong physical identity without mutation', () => {
  const s = new Store(), service = new SavedReportsManagement(s, policy); s.names.set(22, 'Existing');
  expect(() => service.rename('MC_000001', 101, 'Existing')).toThrow('ARCHIVE_NAME_CONFLICT');
  expect(() => service.delete('MC_000001', 22)).toThrow('ARCHIVE_ID_MISMATCH');
  expect(s.deletes).toEqual([]);
});
it('returns diagnostic for missing/mismatched sheets rather than hiding index rows', () => {
  const s = new Store(); s.names.delete(101);
  const result = new SavedReportsManagement(s, policy).list();
  expect(result[0]).toMatchObject({ state: 'DIAGNOSTIC' }); expect(result[0]).not.toHaveProperty('url');
});
it.each(['sheet', 'index', 'rename-response', 'finish'])('rename %s failure stays pending and is never automatically replayed', fail => {
  const s = new Store(); s.fail = fail; const service = new SavedReportsManagement(s, policy);
  expect(() => service.rename('MC_000001', 101, 'New')).toThrow('RENAME_RECOVERY_REQUIRED');
  s.fail = ''; expect(() => service.rename('MC_000001', 101, 'New')).toThrow('RENAME_RECOVERY_REQUIRED');
  expect(service.list()[0].state).toBe('DIAGNOSTIC'); expect(s.held).toBe(false);
});
it('deletes exact registered sheet and index only', () => {
  const s = new Store(); expect(new SavedReportsManagement(s, policy).delete('MC_000001', 101)).toMatchObject({ status: 'OK' });
  expect(s.rows).toEqual([]); expect(s.names.has(101)).toBe(false); expect(s.names.get(0)).toBe('ВідомістьВитрат');
});
it.each(['index', 'delete-response', 'finish'])('delete %s failure provides diagnostics including orphaned intent', fail => {
  const s = new Store(); s.fail = fail; const service = new SavedReportsManagement(s, policy);
  expect(() => service.delete('MC_000001', 101)).toThrow('DELETE_RECOVERY_REQUIRED');
  expect(() => service.delete('MC_000001', 101)).toThrow('DELETE_RECOVERY_REQUIRED');
  expect(service.list()[0].state).toBe('DIAGNOSTIC'); expect(s.deletes).toEqual([101]);
});
it('blocks unregistered/system sheets even with forged index name', () => {
  const s = new Store(), service = new SavedReportsManagement(s, policy);
  expect(() => service.delete('MC_000099', 0)).toThrow('ARCHIVE_ID_MISMATCH');
  s.rows[0].sheetId = 0; s.rows[0].sheetName = 'ВідомістьВитрат';
  expect(() => service.delete('MC_000001', 0)).toThrow('INVALID_ARCHIVE_IDENTITY'); expect(s.deletes).toEqual([]);
});
it('honors shared busy lock and both future archive roles; denies unidentified/unprivileged roles', () => {
  const s = new Store(); s.held = true;
  expect(() => new SavedReportsManagement(s, policy).list()).toThrow('REPORT_BUSY');
  for (const role of ['ERP_OWNER', 'WORKSHOP_MANAGER']) for (const action of ['list', 'open', 'save', 'rename', 'delete'] as const) {
    expect(() => new ArchiveRolePolicy(() => ({ email: 'verified@example.com', roles: [role] })).authorize(action)).not.toThrow();
  }
  for (const user of [undefined, { email: '', roles: ['ERP_OWNER'] }, { email: 'x', roles: ['VIEWER'] }, { email: 'x', roles: ['TECHNOLOGIST'] }]) {
    expect(() => new ArchiveRolePolicy(() => user).authorize('delete')).toThrow('ARCHIVE_ACCESS_DENIED');
  }
});
it('production handlers are fail-closed without a configured server identity provider', () => {
  expect(() => listSavedMaterialReportsWeb()).toThrow('ACCESS_DENIED');
  expect(() => renameSavedMaterialReportWeb({ reportId: 'MC_000001', sheetId: 101, newName: 'New' })).toThrow('ACCESS_DENIED');
  expect(() => deleteSavedMaterialReportWeb({ reportId: 'MC_000001', sheetId: 101 })).toThrow('ACCESS_DENIED');
});
