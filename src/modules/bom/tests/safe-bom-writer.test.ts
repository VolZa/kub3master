/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/safe-bom-writer.test.ts
 * Module: BOM
 * Layer: Tests
 * Responsibility: verify durable scoped writes and recovery with failure-injectable GAS mocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { JOURNAL_HEADERS, writeSafeBOM, recoverSafeBOM, SafeBOMPlan, Cell } from '../commit/safe-bom-writer';
import { SpreadsheetConfig } from '../../../infrastructure/spreadsheets/SpreadsheetConfig';
const headers = ['ParentID', 'ChildID', 'Qty', 'Unit', 'CreatedAt', 'ParentCode', 'ChildCode', 'Comment', 'Formula'];
const date = { date: '2026-10-13T00:00:00.000Z' };
const row = (parent: string, child: string, qty = 1): Cell[] => [parent, child, qty, 'шт', date, 'P', 'C', 'extra', { formula: '=1+1' }];
const request = (): SafeBOMPlan => ({ operationID: 'op-1', rootID: '4000000', affectedParentIDs: ['4000000'], createdParts: [], targetRows: [row('4000000', '2000009', 4)] });
describe('Safe BOM writer and durable journal', () => {
  let bom: Cell[][], journal: unknown[][], held: boolean, missing: string;
  let failJournalAt: number, journalAppends: number, failBOMAt: number, bomWrites: number;
  let partialJournal: boolean, afterWriteFailure: boolean, silentWrite: boolean;
  const release = vi.fn(), acquire = vi.fn(), clearAll = vi.fn(), mutateElements = vi.fn();
  const clone = <T>(value: T): T => structuredClone(value);
  const values = (data: unknown[][]) => data.map(r => r.map(c => c && typeof c === 'object' ? 'date' in c ? new Date(String(c.date)) : 'formula' in c ? 2 : c : c));
  const formulas = (data: unknown[][]) => data.map(r => r.map(c => c && typeof c === 'object' && 'formula' in c ? String(c.formula) : ''));
  beforeEach(() => {
    vi.clearAllMocks(); held = false; missing = ''; failJournalAt = failBOMAt = -1;
    partialJournal = afterWriteFailure = silentWrite = false; journalAppends = bomWrites = 0;
    bom = [clone(headers), row('4000000', '4001', 4), row('4000001', '4001', 2), row('4001', '3014'),
      row('3000001', '4001', 3), row('4000001', '4001', 2), row('4000000', '2000000', 2)];
    journal = [clone(JOURNAL_HEADERS)];
    acquire.mockImplementation(() => { held = true; return true; });
    release.mockImplementation(() => { expect(held).toBe(true); held = false; });
    const sheet = (isJournal: boolean) => ({
      getLastColumn: () => isJournal ? JOURNAL_HEADERS.length : headers.length,
      getDataRange: () => { expect(held).toBe(true); const data = isJournal ? journal : bom; return { getValues: () => values(data), getFormulas: () => formulas(data), getMergedRanges: () => [] }; },
      getRange: (r: number, c: number, count = 1, width = 1) => ({
        isPartOfMerge: () => false,
        getValues: () => values((isJournal ? journal : bom).slice(r - 1, r - 1 + count).map(line => line.slice(c - 1, c - 1 + width))),
        setValues: (matrix: unknown[][]) => {
          expect(held).toBe(true); expect(isJournal).toBe(false); bomWrites++;
          if (bomWrites === failBOMAt) throw new Error('injected BOM write failure');
          if (!silentWrite) matrix.forEach((line, i) => {
            bom[r - 1 + i] ??= Array(headers.length).fill('');
            line.forEach((v, j) => {
              bom[r - 1 + i][c - 1 + j] = v instanceof Date ? { date: v.toISOString() } :
                typeof v === 'string' && v.startsWith("'") ? v.slice(1) :
                typeof v === 'string' && v.startsWith('=') ? { formula: v } : v as Cell;
            });
          });
          if (afterWriteFailure) { afterWriteFailure = false; throw new Error('lost write acknowledgement'); }
        },
      }),
      appendRow: (record: unknown[]) => {
        expect(held).toBe(true); expect(isJournal).toBe(true); journalAppends++;
        record = record.map(value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value);
        if (journalAppends === failJournalAt) {
          if (partialJournal) journal.push(record.slice(0, 4));
          throw new Error('injected journal failure');
        }
        journal.push(clone(record));
      },
      clearContents: clearAll, deleteRows: clearAll,
    });
    vi.stubGlobal('SpreadsheetApp', { openById: (spreadsheetID: string) => {
      expect(spreadsheetID).toBe(SpreadsheetConfig.MASTER.id);
      return { getSheetByName: (name: string) => {
        if (name === missing) return null;
        if (name === '01_BOM') return sheet(false);
        if (name === '_BOM_CommitJournal') return sheet(true);
        mutateElements(); throw new Error('Element access forbidden');
      } };
    }, getActive: () => { throw new Error('active forbidden'); }, flush: () => expect(held).toBe(true) });
    vi.stubGlobal('LockService', { getScriptLock: () => ({ hasLock: () => held, tryLock: acquire, releaseLock: release }) });
    vi.stubGlobal('Utilities', { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm: string, text: string) => [...createHash('sha256').update(text).digest()].map(v => v > 127 ? v - 256 : v) });
  });
  afterEach(() => { expect(clearAll).not.toHaveBeenCalled(); expect(mutateElements).not.toHaveBeenCalled(); expect(held).toBe(false); vi.unstubAllGlobals(); });
  const foreignRows = () => clone(bom.filter((r, i) => i > 0 && r[0] !== '4000000' && r.some(c => c !== '')));
  it('replaces root only, retaining mixed foreign duplicates, old Part BOM and all extra columns/formulas', () => {
    const before = foreignRows();
    expect(writeSafeBOM(request()).status).toBe('COMMITTED');
    expect(foreignRows()).toEqual(before);
    expect(bom[1]).toEqual(request().targetRows[0]);
    expect(bom[6]).toEqual(Array(headers.length).fill(''));
    expect(journal.map(r => r[1])).toContain('CHUNK');
    expect(String(journal[journal.length - 1][3])).toContain('COMMITTED');
  });
  it('repeats the same operation without writes or quantity growth', () => {
    writeSafeBOM(request()); const count = bomWrites;
    expect(writeSafeBOM(request()).status).toBe('ALREADY_APPLIED'); expect(bomWrites).toBe(count);
  });
  it('recognizes equivalent existing rows independent of order and CreatedAt', () => {
    const plan = request(); plan.targetRows = [row('4000000', '2000000', 2), row('4000000', '4001', 4)];
    plan.targetRows[0][4] = { date: '2026-01-01T00:00:00.000Z' };
    expect(writeSafeBOM(plan).status).toBe('ALREADY_APPLIED'); expect(bomWrites).toBe(0); expect(journalAppends).toBe(0);
  });
  it('updates quantity without modifying foreign parents', () => {
    const plan = request(); plan.targetRows = [row('4000000', '4001', 7)]; const before = foreignRows();
    writeSafeBOM(plan); expect(bom[1][2]).toBe(7); expect(foreignRows()).toEqual(before);
  });
  it('initializes only an explicitly authorized new Part and preserves the former Part', () => {
    const plan = request(); plan.affectedParentIDs.push('2000010'); plan.createdParts.push({ id: '2000010', operationID: plan.operationID });
    plan.targetRows = [row('4000000', '2000010', 4), row('2000010', '3015', 0.46)]; const old = clone(bom[3]);
    writeSafeBOM(plan); expect(bom[3]).toEqual(old); expect(bom[6][0]).toBe('2000010');
  });
  it('rejects initializing a Part that already has a BOM', () => {
    const plan = request(); plan.affectedParentIDs.push('4001'); plan.createdParts.push({ id: '4001', operationID: plan.operationID }); plan.targetRows.push(row('4001', '3015'));
    expect(() => writeSafeBOM(plan)).toThrow('existing BOM'); expect(bomWrites).toBe(0); expect(journalAppends).toBe(0);
  });
  it.each(['scope', 'receipt', 'pending', 'quantity', 'unit', 'duplicate', 'empty', 'width'])('rejects invalid plan %s without mutations', kind => {
    const plan = request();
    if (kind === 'scope') plan.targetRows[0][0] = '4000001';
    if (kind === 'receipt') plan.affectedParentIDs.push('2000010');
    if (kind === 'pending') plan.targetRows[0][1] = 'pending:1';
    if (kind === 'quantity') plan.targetRows[0][2] = NaN;
    if (kind === 'unit') plan.targetRows[0][3] = '';
    if (kind === 'duplicate') plan.targetRows.push(clone(plan.targetRows[0]));
    if (kind === 'empty') plan.targetRows = [];
    if (kind === 'width') plan.targetRows[0].pop();
    expect(() => writeSafeBOM(plan)).toThrow(); expect(bomWrites).toBe(0); expect(journalAppends).toBe(0);
  });
  it.each([1, 2, 3])('does not mutate BOM when journal fails at record %s', point => {
    failJournalAt = point; const before = clone(bom);
    expect(() => writeSafeBOM(request())).toThrow(); expect(bom).toEqual(before); expect(bomWrites).toBe(0);
  });
  it('rejects an incomplete journal without changing BOM', () => {
    failJournalAt = 2; partialJournal = true; const before = clone(bom);
    expect(() => writeSafeBOM(request())).toThrow(); failJournalAt = -1;
    expect(recoverSafeBOM('op-1').status).toBe('CONFLICT'); expect(bom).toEqual(before);
  });
  it('recovers a READY operation interrupted before any BOM writes', () => {
    failJournalAt = 4; expect(() => writeSafeBOM(request())).toThrow(); expect(bomWrites).toBe(0);
    failJournalAt = -1; expect(recoverSafeBOM('op-1').status).toBe('RECOVERED');
  });
  it('recovers a partial physical write using only journaled slots', () => {
    const before = foreignRows(); failBOMAt = 2; expect(() => writeSafeBOM(request())).toThrow('recovery required');
    failBOMAt = -1; expect(recoverSafeBOM('op-1').status).toBe('RECOVERED'); expect(foreignRows()).toEqual(before);
  });
  it('recovers a lost acknowledgement after physical write', () => {
    afterWriteFailure = true; expect(() => writeSafeBOM(request())).toThrow('recovery required');
    expect(recoverSafeBOM('op-1').status).toBe('RECOVERED');
  });
  it('finishes target already written when COMMITTED journal acknowledgement fails', () => {
    failJournalAt = 5; expect(() => writeSafeBOM(request())).toThrow(); const count = bomWrites;
    failJournalAt = -1; expect(recoverSafeBOM('op-1').status).toBe('RECOVERED'); expect(bomWrites).toBe(count);
  });
  it.each(['scoped', 'foreign', 'schema'])('stops recovery on external %s changes', change => {
    failBOMAt = 1; expect(() => writeSafeBOM(request())).toThrow(); failBOMAt = -1;
    if (change === 'scoped') bom[1][2] = 999;
    if (change === 'foreign') bom[2][2] = 999;
    if (change === 'schema') bom[0][7] = 'Changed';
    const count = bomWrites; expect(recoverSafeBOM('op-1').status).toBe('CONFLICT'); expect(bomWrites).toBe(count);
  });
  it('rejects reusing an OperationID for another request', () => {
    writeSafeBOM(request()); const count = bomWrites; const plan = request(); plan.targetRows[0][2] = 8;
    expect(writeSafeBOM(plan).status).toBe('CONFLICT'); expect(bomWrites).toBe(count);
  });
  it('detects verification failure and keeps recovery metadata', () => {
    silentWrite = true; expect(() => writeSafeBOM(request())).toThrow('verification failed');
    silentWrite = false; expect(recoverSafeBOM('op-1').status).toBe('RECOVERED');
  });
  it.each(['01_BOM', '_BOM_CommitJournal'])('fails clearly for missing %s', name => {
    missing = name; expect(() => writeSafeBOM(request())).toThrow(name); expect(bomWrites).toBe(0);
  });
  it.each(['bom', 'journal', 'core formula'])('rejects unsupported %s schema', kind => {
    if (kind === 'bom') bom[0][0] = 'Wrong';
    if (kind === 'journal') journal[0][0] = 'Wrong';
    if (kind === 'core formula') bom[1][2] = { formula: '=1+1' };
    expect(() => writeSafeBOM(request())).toThrow(); expect(bomWrites).toBe(0); expect(journalAppends).toBe(0);
  });
  it('chunks large snapshots and verifies integrity before writing', () => {
    bom[1][7] = 'x'.repeat(25000); const plan = request(); plan.targetRows[0][7] = 'y'.repeat(25000);
    writeSafeBOM(plan); expect(journal.filter(r => r[1] === 'CHUNK').length).toBeGreaterThan(1);
    expect(journal.filter(r => r[1] === 'CHUNK').every(r => String(r[3]).length <= 20000)).toBe(true);
    journal.find(r => r[1] === 'CHUNK')![3] = 'corrupt';
    const count = bomWrites; expect(recoverSafeBOM('op-1').status).toBe('CONFLICT'); expect(bomWrites).toBe(count);
  });
  it('times out without reading or writing and releases every acquired lock', () => {
    acquire.mockImplementation(() => false); expect(() => writeSafeBOM(request())).toThrow('acquire'); expect(release).not.toHaveBeenCalled();
    acquire.mockImplementation(() => { held = true; return true; }); writeSafeBOM(request()); expect(release).toHaveBeenCalledTimes(1);
  });
  it('rejects nested ScriptLock acquisition', () => {
    held = true; expect(() => writeSafeBOM(request())).toThrow('already held'); expect(acquire).not.toHaveBeenCalled(); held = false;
  });
  it('does not reapply a completed operation after external changes even if they match the old snapshot', () => {
    const old = clone(bom); writeSafeBOM(request()); const count = bomWrites;
    bom[1] = old[1]; bom[6] = old[6];
    expect(writeSafeBOM(request()).status).toBe('CONFLICT'); expect(bomWrites).toBe(count);
  });
  it('rejects oversized target cells before any writes', () => {
    const plan = request(); plan.targetRows[0][7] = 'x'.repeat(45001);
    expect(() => writeSafeBOM(plan)).toThrow('size limit'); expect(journalAppends).toBe(0); expect(bomWrites).toBe(0);
  });
  it('appends new rows without shifting any foreign rows when target grows', () => {
    const plan = request(); plan.targetRows.push(row('4000000', '2000010'), row('4000000', '2000011'));
    const before = clone(bom); writeSafeBOM(plan);
    for (const index of [2, 3, 4, 5]) expect(bom[index]).toEqual(before[index]);
    expect(bom[7][0]).toBe('4000000');
  });
  it('accepts a repeated OperationID with the same semantic rows in another order', () => {
    const plan = request(); plan.targetRows.push(row('4000000', '2000010', 2));
    writeSafeBOM(plan); const count = bomWrites;
    plan.targetRows.reverse();
    expect(writeSafeBOM(plan).status).toBe('ALREADY_APPLIED'); expect(bomWrites).toBe(count);
  });
  it('does not mistake a partially cleared retired row for a completed target', () => {
    failBOMAt = 2; expect(() => writeSafeBOM(request())).toThrow(); failBOMAt = -1;
    bom[6][0] = ''; // First cell was cleared, but old ChildID and other fields still exist.
    expect(recoverSafeBOM('op-1').status).toBe('RECOVERED');
    expect(bom[6]).toEqual(Array(headers.length).fill(''));
  });
});
