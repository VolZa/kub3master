import { expect, it } from 'vitest';
import { SaveMaterialConsumptionReportUseCase, type SaveAttempt, type SavedReport, type SavedReportStore } from './saved-report';
import type { ReportSnapshot } from './report-snapshot';
class Store implements SavedReportStore {
  current = 10; held = false; sequence = 0; copies = 0; fail = '';
  journal = new Map<number, SaveAttempt>(); index: SavedReport[] = []; archives = new Map<number, SavedReport>();
  lock() { if (this.held) return false; this.held = true; return true; }
  unlock() { this.held = false; }
  currentId() { return this.current; }
  snapshot(): ReportSnapshot { return { schema: 1, reportType: 'material-consumption', method: 'normative', bomBasis: 'CURRENT_BOM',
    generatedDate: '2026-06-30', filters: { houseCode: 'H001', dateFrom: '2026-06-30' }, lossPercents: { rebar: 7, rolled: 5, concrete: 2 }, manufacturingIds: ['М00000075'] }; }
  attempt(id: number) { return this.journal.get(id); }
  persist(id: number, a: SaveAttempt) { this.journal.set(id, JSON.parse(JSON.stringify(a))); }
  reserveId() { return `MC_${String(++this.sequence).padStart(6, '0')}`; }
  copyAndVerify(source: number, a: SaveAttempt) {
    this.copies++;
    if (this.fail === 'copy') throw new Error('COPY_FAILED');
    const id = 100 + this.copies; this.archives.set(id, { ...a.report, sheetId: id } as SavedReport);
    if (this.fail === 'readback') throw new Error('READBACK_FAILED');
    return id;
  }
  register(r: SavedReport) { if (this.fail === 'index') throw new Error('INDEX_FAILED'); this.index.push(r); if (this.fail === 'index-response') throw new Error('TIMEOUT'); }
  confirm(r: SavedReport) { if (!this.archives.has(r.sheetId) || !this.index.some(x => x.reportId === r.reportId)) throw new Error('NOT_CONFIRMED'); }
}
it('first save creates MC_000001 and registers snapshot, then returns same archive without duplicate', () => {
  const s = new Store(), save = new SaveMaterialConsumptionReportUseCase(s);
  expect(save.execute(10)).toMatchObject({ status: 'OK', reportId: 'MC_000001', sheetId: 101, url: expect.stringContaining('#gid=101') });
  expect(s.index[0].snapshot.lossPercents).toEqual({ rebar: 7, rolled: 5, concrete: 2 });
  expect(s.index[0].snapshot.generatedDate).toBe('2026-06-30');
  expect(save.execute(10)).toMatchObject({ status: 'ALREADY_SAVED', sheetId: 101 }); expect(s.copies).toBe(1);
});
it('second current produces MC_000002, does not reuse deleted IDs, and leaves archive independent', () => {
  const s = new Store(), save = new SaveMaterialConsumptionReportUseCase(s); save.execute(10);
  const first = JSON.stringify(s.archives.get(101)); s.current = 11;
  expect(save.execute(11)).toMatchObject({ reportId: 'MC_000002' });
  expect(JSON.stringify(s.archives.get(101))).toBe(first);
  s.index.pop(); s.archives.delete(102); s.current = 12;
  expect(save.execute(12)).toMatchObject({ reportId: 'MC_000003' });
});
it('rejects stale identity and a concurrent Generate/Save lock before copying', () => {
  const s = new Store(), save = new SaveMaterialConsumptionReportUseCase(s);
  expect(() => save.execute(9)).toThrow('STALE_CURRENT_REPORT');
  s.held = true; expect(() => save.execute(10)).toThrow('REPORT_BUSY'); expect(s.copies).toBe(0);
});
it.each(['copy', 'readback', 'index', 'index-response'])('blocks repeat after partial %s without creating a second archive', fail => {
  const s = new Store(); s.fail = fail; const save = new SaveMaterialConsumptionReportUseCase(s);
  expect(() => save.execute(10)).toThrow('SAVE_RECOVERY_REQUIRED');
  expect(s.held).toBe(false); s.fail = '';
  expect(() => save.execute(10)).toThrow('SAVE_RECOVERY_REQUIRED'); expect(s.copies).toBe(1);
});
