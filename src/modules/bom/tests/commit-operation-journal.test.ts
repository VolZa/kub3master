/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/commit-operation-journal.test.ts
 * Module: BOM
 * Layer: Tests
 * Responsibility: verify pre-creation durability, event retries, evidence gates and writer compatibility with GAS mocks.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { CommitOperationJournal, openCommitOperationJournal, commitDigest } from '../commit/commit-operation-journal';
import { JOURNAL_HEADERS, writeSafeBOM } from '../commit/safe-bom-writer';
import type { PreparedBOM, BOMPreparationInput } from '../preparation/bom-preparation.model';
import type { ElementRow } from '../../elements/element.model';
import type { InsertIntent, JournalResult } from '../commit/commit-operation.model';
const input: BOMPreparationInput = { parentInput: 'Плита; P', projectDocumentID: 'D', specification: 'Арматура; R_12_A500C_L400; 4' };
const root = { kind: 'pending-element' as const, localKey: 'root' };
const part = { kind: 'pending-element' as const, localKey: 'part' };
const material = { id: '3014', code: 'R_12_A500C', name: 'Rebar', category: 'rebar' as const, profileType: 'round' as const, diameter: 12, class: 'A500C', weightPerMeter: 1.15, baseUnit: 'кг', isActive: true };
const prepared: PreparedBOM = {
  rootType: 'product', parent: root, writeScope: { root, initializeMaterialBOMFor: ['part'] },
  sourceContext: { ...input, searchProjectDocumentIDs: ['D'] },
  pendingElements: [
    { localKey: 'root', row: { Code: 'P', PrefixName: 'Плита', Name: 'P', Type: 'product', Category: 'concrete_mix', BaseUnit: 'шт', ProjectDocumentID: 'D' } },
    { localKey: 'part', row: { Code: 'R_12_A500C_L400', PrefixName: 'Арматура', Name: 'Rebar Part', Type: 'part', Category: 'rebar', BaseUnit: 'шт', ParentMaterialID: '3014', ProjectDocumentID: '', ProfileType: 'round', Diameter: 12, Class: 'A500C', Length: 400 } },
  ],
  components: [{ sourceRowIndex: 0, input: { prefix: 'Арматура', code: 'R_12_A500C_L400', spec: 'R_12_A500C_L400', qty: 4 }, ref: part,
    identity: { kind: 'material-part', code: 'R_12_A500C_L400', materialID: '3014', geometry: { diameter: 12, length: 400, className: 'A500C', profileType: 'round' } } }],
  plannedEdges: [{ parent: root, child: part, qty: 4, unit: 'шт' }, { parent: part, child: { kind: 'material', material }, qty: 0.46, unit: 'кг' }],
};
const clone = <T>(v: T): T => structuredClone(v);
function intent(key = 'part', reservedID = '2000010'): InsertIntent {
  return { localKey: key, reservedID, row: { ...prepared.pendingElements.find(item => item.localKey === key)!.row,
    ID: reservedID, CreatedAt: new Date('2026-10-13T00:00:00Z') } };
}
function accepted(result: JournalResult) { if (result.status === 'CONFLICT') throw new Error(result.error); return result.state; }

describe('Durable pre-creation journal', () => {
  let journal: unknown[][], bom: unknown[][], held: boolean, attempts: number, failAt: number, afterAppend: boolean;
  let missing: boolean;
  let api: CommitOperationJournal;
  let sheet: GoogleAppsScript.Spreadsheet.Sheet;
  const physical = new Map<string, ElementRow>();
  const verifier = { readCreatedElement: vi.fn((value: InsertIntent) => {
    const row = physical.get(value.reservedID); if (!row) throw new Error('Element does not physically exist'); return clone(row);
  }) };
  const lock = { hasLock: () => held } as GoogleAppsScript.Lock.Lock;
  const forbidden = vi.fn(() => { throw new Error('Forbidden creation/BOM write'); });
  beforeEach(() => {
    held = true; attempts = 0; failAt = -1; afterAppend = false; missing = false; physical.clear(); vi.clearAllMocks();
    journal = [clone(JOURNAL_HEADERS)];
    bom = [['ParentID', 'ChildID', 'Qty', 'Unit', 'CreatedAt', 'ParentCode', 'ChildCode'],
      ['4000000', '4001', 1, 'шт', new Date('2026-10-13'), 'P', 'C']];
    const table = (data: unknown[][], isJournal: boolean) => ({
      getLastColumn: () => data[0].length,
      getDataRange: () => ({ getValues: () => clone(data), getFormulas: () => data.map(row => row.map(() => '')), getMergedRanges: () => [] }),
      getRange: (r: number, c: number, count = 1, width = 1) => ({
        getValues: () => clone(data.slice(r - 1, r - 1 + count).map(row => row.slice(c - 1, c - 1 + width))),
        isPartOfMerge: () => false,
        setValues: (matrix: unknown[][]) => {
          if (isJournal) forbidden();
          matrix.forEach((row, offset) => { data[r - 1 + offset] = row.map(value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value); });
        },
      }),
      appendRow: (row: unknown[]) => {
        if (!isJournal) forbidden();
        attempts++;
        if (attempts === failAt && !afterAppend) throw new Error('append rejected');
        data.push(row.map(value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value));
        if (attempts === failAt && afterAppend) throw new Error('append acknowledgement lost');
      },
    });
    sheet = table(journal, true) as unknown as GoogleAppsScript.Spreadsheet.Sheet;
    api = new CommitOperationJournal(sheet, lock, verifier);
    vi.stubGlobal('SpreadsheetApp', { flush: () => { if (!held) throw new Error('lock missing'); }, openById: () => ({ getSheetByName: (name: string) => {
      if (name === '_BOM_CommitJournal') return missing ? null : sheet;
      if (name === '01_BOM') return table(bom, false);
      forbidden(); return null;
    } }) });
    vi.stubGlobal('LockService', { getScriptLock: () => ({ hasLock: () => held, tryLock: () => { held = true; return true; }, releaseLock: () => { held = false; } }) });
    vi.stubGlobal('Utilities', { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm: string, text: string) => [...createHash('sha256').update(text).digest()].map(v => v > 127 ? v - 256 : v) });
  });
  afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
  const begin = () => accepted(api.begin('operation', clone(input), clone(prepared)));
  it('reads original 1H.3B identity frames without retryPayload', () => {
    begin(); accepted(api.reserving('operation', 'reserve-part', 'part'));
    accepted(api.insertIntent('operation', 'intent-part', intent()));
    let previous = '';
    for (const row of journal.slice(1)) {
      if (row[0] !== 'operation') continue;
      if (row[1] === 'OP_FRAME') {
        const frame = JSON.parse(String(row[3])); delete frame.retryPayload;
        row[3] = JSON.stringify(frame);
      }
      row[4] = commitDigest([row[0], row[1], row[2], row[3], previous]); previous = String(row[4]);
    }
    expect(api.load('operation').elements.part.status).toBe('INSERT_INTENT');
  });
  const create = () => {
    begin(); accepted(api.reserving('operation', 'reserve-part', 'part'));
    accepted(api.insertIntent('operation', 'intent-part', intent()));
    physical.set('2000010', intent().row);
    return accepted(api.confirmCreated('operation', 'created-part', 'part'));
  };
  it('persists full immutable plan and independent writer binding before creation', () => {
    const state = begin(); expect(state.status).toBe('READY');
    expect(state.manifest).toMatchObject({ version: 1, operationID: 'operation', writerOperationID: 'operation_BOM', prepared });
    expect(state.manifest.requestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(api.createdReceipts('operation')).toEqual([]); expect(verifier.readCreatedElement).not.toHaveBeenCalled();
  });
  it('repeats begin without duplicate events', () => {
    begin(); const length = journal.length;
    expect(api.begin('operation', clone(input), clone(prepared)).status).toBe('ALREADY_APPLIED'); expect(journal).toHaveLength(length);
  });
  it('conflicts on OperationID with different input or plan', () => {
    begin(); const count = journal.length;
    const other = clone(prepared); other.sourceContext.specification = 'changed';
    expect(api.begin('operation', { ...input, specification: 'changed' }, other).status).toBe('CONFLICT');
    const changed = clone(prepared); changed.plannedEdges[0].qty = 8;
    expect(api.begin('operation', input, changed).status).toBe('CONFLICT'); expect(journal).toHaveLength(count);
  });
  it.each([1, 2, 3, 4, 5, 6])('retries lost append acknowledgement at begin record %s without duplicates', point => {
    failAt = point; afterAppend = true;
    expect(api.begin('operation', input, prepared).status).toBe('CONFLICT'); failAt = -1;
    expect(accepted(api.begin('operation', input, prepared)).status).toBe('READY');
    expect(api.load('operation').events.map(event => event.type)).toEqual(['INITIALIZED', 'READY']);
    expect(journal).toHaveLength(7);
  });
  it.each([1, 2, 3])('repairs a partial event append before record %s', point => {
    begin(); failAt = attempts + point;
    expect(api.reserving('operation', 'reserve-part', 'part').status).toBe('CONFLICT'); failAt = -1;
    expect(api.reserving('operation', 'reserve-part', 'part').status).toBe('APPLIED');
    expect(api.load('operation').events.filter(event => event.type === 'RESERVING')).toHaveLength(1);
  });
  it.each(['manifest', 'chunk', 'digest', 'lost chunk'])('rejects damaged %s without further writes', damage => {
    begin();
    if (damage === 'manifest') journal[1][3] = '{}';
    if (damage === 'chunk') journal[2][3] = 'corrupt';
    if (damage === 'digest') journal[2][4] = '0'.repeat(64);
    if (damage === 'lost chunk') journal.splice(2, 1);
    const count = journal.length;
    expect(() => api.load('operation')).toThrow(); expect(api.reserving('operation', 'reserve', 'part').status).toBe('CONFLICT'); expect(journal).toHaveLength(count);
  });
  it('does not expose INSERT_INTENT until the entire event is durable', () => {
    begin(); accepted(api.reserving('operation', 'reserve', 'part')); failAt = attempts + 2;
    expect(api.insertIntent('operation', 'intent', intent()).status).toBe('CONFLICT');
    expect(() => api.load('operation')).toThrow('Incomplete');
    expect(api.confirmCreated('operation', 'created', 'part').status).toBe('CONFLICT');
    expect(verifier.readCreatedElement).not.toHaveBeenCalled(); failAt = -1;
    accepted(api.insertIntent('operation', 'intent', intent()));
    expect(api.load('operation').elements.part.intent?.row.CreatedAt).toEqual(intent().row.CreatedAt);
  });
  it('cannot issue CREATED receipts from INSERT_INTENT or absent physical Element', () => {
    begin(); accepted(api.reserving('operation', 'reserve', 'part')); accepted(api.insertIntent('operation', 'intent', intent()));
    expect(api.createdReceipts('operation')).toEqual([]);
    expect(new CommitOperationJournal(sheet, lock).confirmCreated('operation', 'created', 'part').status).toBe('CONFLICT');
    expect(api.confirmCreated('operation', 'created', 'part').status).toBe('CONFLICT'); expect(api.createdReceipts('operation')).toEqual([]);
    physical.set('2000010', { ...intent().row, Length: 999 });
    expect(api.confirmCreated('operation', 'created', 'part').status).toBe('CONFLICT'); expect(api.createdReceipts('operation')).toEqual([]);
  });
  it('requires physical readback for CREATED and issues receipt only for initialization scope', () => {
    create(); expect(api.createdReceipts('operation')).toEqual([{ id: '2000010', operationID: 'operation_BOM' }]);
    expect(verifier.readCreatedElement).toHaveBeenCalled();
    expect(verifier.readCreatedElement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      operationID: 'operation', writerOperationID: 'operation_BOM', insertIntentEventID: 'intent-part',
      insertIntentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });
  it('retries CREATED after lost acknowledgement without duplicate evidence', () => {
    begin(); accepted(api.reserving('operation', 'reserve', 'part')); accepted(api.insertIntent('operation', 'intent', intent()));
    physical.set('2000010', intent().row); failAt = attempts + 3; afterAppend = true;
    expect(api.confirmCreated('operation', 'created', 'part').status).toBe('CONFLICT'); failAt = -1;
    expect(api.confirmCreated('operation', 'created', 'part').status).toBe('ALREADY_APPLIED');
    expect(api.load('operation').events.filter(event => event.type === 'CREATED')).toHaveLength(1);
  });
  it('reused Elements never yield creation receipts', () => {
    begin(); accepted(api.reused('operation', 'reuse', 'part', intent().row));
    expect(api.createdReceipts('operation')).toEqual([]);
    expect(api.load('operation').elements.part.status).toBe('REUSED');
  });
  it.each(['intent first', 'unknown key', 'ready too soon', 'complete too soon', 'wrong row', 'second reservation'])('rejects invalid transition %s before mutation', kind => {
    begin(); let result;
    if (kind === 'intent first') result = api.insertIntent('operation', 'intent', intent());
    if (kind === 'unknown key') result = api.reserving('operation', 'reserve', 'unknown');
    if (kind === 'ready too soon') result = api.bomReady('operation', 'bom');
    if (kind === 'complete too soon') result = api.completed('operation', 'done', 'operation_BOM', 'COMMITTED');
    if (kind === 'wrong row') { accepted(api.reserving('operation', 'reserve', 'part')); result = api.insertIntent('operation', 'intent', { ...intent(), row: { ...intent().row, Diameter: 14 } }); }
    if (kind === 'second reservation') { accepted(api.reserving('operation', 'reserve', 'part')); result = api.reserving('operation', 'other-reserve', 'part'); }
    expect(result?.status).toBe('CONFLICT');
  });
  it('blocks creation after conflict and keeps retry of the same conflict idempotent', () => {
    begin(); accepted(api.conflict('operation', 'conflict', 'external identity changed'));
    expect(api.reserving('operation', 'reserve', 'part').status).toBe('CONFLICT');
    expect(api.conflict('operation', 'conflict', 'external identity changed').status).toBe('ALREADY_APPLIED');
    expect(() => api.createdReceipts('operation')).toThrow('Conflicted');
  });
  it('binds completion to the correct writer and rejects post-terminal transitions', () => {
    create(); accepted(api.reused('operation', 'root-reuse', 'root', intent('root', '4000000').row)); accepted(api.bomReady('operation', 'bom-ready'));
    expect(api.completed('operation', 'wrong', 'other_BOM', 'COMMITTED').status).toBe('CONFLICT');
    accepted(api.completed('operation', 'done', 'operation_BOM', 'COMMITTED'));
    expect(api.load('operation').status).toBe('COMPLETED'); expect(api.reserving('operation', 'later', 'part').status).toBe('CONFLICT');
  });
  it('preserves actual Safe Writer journal/API alongside operation records', () => {
    begin(); const operationRows = clone(journal);
    held = false;
    expect(writeSafeBOM({ operationID: 'operation_BOM', rootID: '4000000', affectedParentIDs: ['4000000'], createdParts: [],
      targetRows: [['4000000', '4002', 4, 'шт', { date: '2026-10-13T00:00:00.000Z' }, 'P', 'C']] }).status).toBe('COMMITTED');
    held = false;
    expect(writeSafeBOM({ operationID: 'operation_BOM', rootID: '4000000', affectedParentIDs: ['4000000'], createdParts: [],
      targetRows: [['4000000', '4002', 4, 'шт', { date: '2026-10-13T00:00:00.000Z' }, 'P', 'C']] }).status).toBe('ALREADY_APPLIED');
    held = true; expect(api.load('operation').status).toBe('READY');
    expect(journal.filter(row => row[0] === 'operation')).toEqual(operationRows.slice(1));
  });
  it('chunks large plans without truncation and validates all pieces', () => {
    const big = clone(prepared); big.pendingElements[0].row.Comment = '😀'.repeat(20000);
    accepted(api.begin('big', input, big));
    expect(journal.filter(row => row[1] === 'OP_DATA').length).toBeGreaterThan(2);
    expect(journal.filter(row => row[1] === 'OP_DATA').every(row => String(row[3]).length <= 20000)).toBe(true);
    expect(api.load('big').manifest.prepared.pendingElements[0].row.Comment).toBe(big.pendingElements[0].row.Comment);
  });
  it('requires caller lock and never creates a missing journal', () => {
    held = false; expect(api.begin('operation', input, prepared).status).toBe('CONFLICT'); expect(journal).toHaveLength(1);
    held = true; missing = true; expect(() => openCommitOperationJournal(lock)).toThrow('_BOM_CommitJournal');
  });
  it('rejects reserved writer IDs and incomplete prepared manifests', () => {
    expect(api.begin('operation_BOM', input, prepared).status).toBe('CONFLICT');
    const invalid = clone(prepared); invalid.components = [];
    expect(api.begin('operation', input, invalid).status).toBe('CONFLICT'); expect(journal).toHaveLength(1);
  });
  it('rejects a changed payload for the same durable EventID without duplicating records', () => {
    begin(); accepted(api.reserving('operation', 'reserve', 'part')); const count = journal.length;
    expect(api.reserving('operation', 'reserve', 'root').status).toBe('CONFLICT'); expect(journal).toHaveLength(count);
  });
  it('rejects an INSERT_INTENT ID that collides with a canonical Material', () => {
    begin(); accepted(api.reserving('operation', 'reserve', 'part')); const count = journal.length;
    expect(api.insertIntent('operation', 'intent', intent('part', '3014')).status).toBe('CONFLICT'); expect(journal).toHaveLength(count);
  });
  it('does not allow INSERT_INTENT while READY completion is unconfirmed', () => {
    failAt = 6;
    expect(api.begin('operation', input, prepared).status).toBe('CONFLICT'); const count = journal.length;
    expect(api.insertIntent('operation', 'intent', intent()).status).toBe('CONFLICT'); expect(journal).toHaveLength(count);
    failAt = -1; expect(accepted(api.begin('operation', input, prepared)).status).toBe('READY');
  });
});
