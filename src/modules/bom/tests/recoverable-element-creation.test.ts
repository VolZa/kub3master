/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/recoverable-element-creation.test.ts
 * Module: BOM commit
 * Layer: Tests
 * Responsibility: verify creation crash recovery, fresh identity checks and caller-owned locks with GAS mocks.
 */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { openCommitOperationJournal } from '../commit/commit-operation-journal';
import { openRecoverableElementCreation, createRecoverableElement } from '../commit/recoverable-element-creation';
import { ELEMENT_COLUMNS, MasterFreshElementStore, physicalElement } from '../commit/fresh-element-store';
import { JOURNAL_HEADERS, writeSafeBOMUnderLock, recoverSafeBOMUnderLock } from '../commit/safe-bom-writer';
import { generateIdByType, generateIdByTypeUnderLock } from '../../../utils/id';
import { withScriptLock } from '../../../utils/script-lock';
import { SpreadsheetConfig } from '../../../infrastructure/spreadsheets/SpreadsheetConfig';
import type { PreparedBOM, BOMPreparationInput } from '../preparation/bom-preparation.model';
import type { ElementRow } from '../../elements/element.model';
const input: BOMPreparationInput = { parentInput: 'P', specification: 'R', projectDocumentID: '9' };
const root = { kind: 'pending-element' as const, localKey: 'root' };
const part = { kind: 'pending-element' as const, localKey: 'part' };
const material = { id: '3014', code: 'R_12_A500C', name: 'Rebar', category: 'rebar' as const, profileType: 'round' as const, baseUnit: 'кг', isActive: true };
const prepared: PreparedBOM = {
  rootType: 'product', parent: root, sourceContext: { ...input, searchProjectDocumentIDs: ['9'] },
  writeScope: { root, initializeMaterialBOMFor: ['part'] },
  pendingElements: [
    { localKey: 'root', row: { Code: 'P', PrefixName: 'Плита', Name: 'P', Type: 'product', ProjectDocumentID: '9', Category: 'concrete_mix', BaseUnit: 'шт' } },
    { localKey: 'part', row: { Code: 'R_12_A500C_L400', PrefixName: 'Арматура', Name: 'Part', Type: 'part', ParentMaterialID: '3014', ProjectDocumentID: '', Category: 'rebar', BaseUnit: 'шт', ProfileType: 'round', Diameter: 12, Length: 400, Class: 'A500C' } },
  ],
  components: [{ sourceRowIndex: 0, input: { prefix: 'Арматура', code: 'R_12_A500C_L400', spec: 'R', qty: 4 }, ref: part,
    identity: { kind: 'material-part', code: 'R_12_A500C_L400', materialID: '3014', geometry: { diameter: 12, length: 400 } } }],
  plannedEdges: [{ parent: root, child: part, qty: 4, unit: 'шт' }, { parent: part, child: { kind: 'material', material }, qty: .46, unit: 'кг' }],
};
const clone = <T>(value: T): T => structuredClone(value);
let journal: unknown[][], elements: unknown[][], counters: unknown[][];
let held: boolean, timeout: boolean, failInsert: 'before' | 'after' | '', failCounter: boolean;
let failEvent: string, failKind: string, failAfter: boolean, currentEvent: string;
const acquire = vi.fn(), release = vi.fn(), inserts = vi.fn(), forbidden = vi.fn(), open = vi.fn();
const lock = { hasLock: () => held, tryLock: acquire, releaseLock: release } as unknown as GoogleAppsScript.Lock.Lock;
function table(data: unknown[][], name: string) {
  return {
    getName: () => name, getLastColumn: () => data[0].length, getLastRow: () => data.length,
    getDataRange: () => ({ getValues: () => clone(data) }),
    getRange: (r: number, c: number, count = 1, width = 1) => ({
      getValues: () => clone(data.slice(r - 1, r - 1 + count).map(row => row.slice(c - 1, c - 1 + width))),
      setValue: (value: unknown) => { expect(held).toBe(true); data[r - 1][c - 1] = value; if (failCounter) { failCounter = false; throw new Error('counter acknowledgement lost'); } },
    }),
    appendRow: (row: unknown[]) => {
      expect(held).toBe(true);
      if (name === '00_Elements') {
        inserts(); if (failInsert === 'before') { failInsert = ''; throw new Error('insert rejected'); }
        data.push(row.map(value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value));
        if (failInsert === 'after') { failInsert = ''; throw new Error('insert acknowledgement lost'); } return;
      }
      if (row[1] === 'OP_FRAME') currentEvent = JSON.parse(String(row[3]).slice(1)).eventID;
      const fail = failEvent === currentEvent && failKind === row[1];
      if (fail && !failAfter) { failEvent = ''; throw new Error('journal rejected'); }
      data.push(row.map(value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value));
      if (fail) { failEvent = ''; throw new Error('journal acknowledgement lost'); }
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks(); held = true; timeout = false; failInsert = ''; failCounter = false; failEvent = ''; failKind = ''; failAfter = false;
  journal = [clone(JOURNAL_HEADERS)]; elements = [clone([...ELEMENT_COLUMNS])];
  counters = [['Type', 'LastID'], ['part', 2000009], ['product', 4000013]];
  acquire.mockImplementation(() => { if (timeout) return false; if (held) throw new Error('nested lock'); held = true; return true; });
  release.mockImplementation(() => { expect(held).toBe(true); held = false; });
  open.mockImplementation((id: string) => { expect(id).toBe(SpreadsheetConfig.MASTER.id); return { getSheetByName: (name: string) => {
    if (name === '_BOM_CommitJournal') return table(journal, name);
    if (name === '00_Elements') return table(elements, name);
    if (name === '_Config_ID_Counters') return table(counters, name);
    if (name === '05_Materials') return table([['MaterialID'], ['3014']], name);
    forbidden(); throw new Error(`Forbidden sheet ${name}`);
  } }; });
  vi.stubGlobal('SpreadsheetApp', { openById: open, flush: () => expect(held).toBe(true), getActive: forbidden, getActiveSpreadsheet: forbidden });
  vi.stubGlobal('LockService', { getScriptLock: () => lock });
  vi.stubGlobal('Utilities', { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_a: string, text: string) => [...createHash('sha256').update(text).digest()] });
  expect(openCommitOperationJournal(lock).begin('O', input, clone(prepared)).status).toBe('APPLIED');
});
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const api = () => openRecoverableElementCreation(lock);
const load = () => openCommitOperationJournal(lock).load('O');
function existing(id = '4001', patch: Partial<ElementRow> = {}) {
  const row: ElementRow = { ...prepared.pendingElements[1].row, ID: id, CreatedAt: new Date('2020-01-01'), ...patch };
  elements.push(ELEMENT_COLUMNS.map(key => physicalElement(row)[key])); return row;
}
it('creates material Part only after durable intent and returns scoped physical receipt without BOM access', () => {
  expect(api().create('O', 'part').status).toBe('APPLIED');
  expect(load().elements.part.status).toBe('CREATED');
  expect(api().receipts('O')).toEqual([{ id: '2000010', operationID: 'O_BOM' }]);
  expect(inserts).toHaveBeenCalledTimes(1); expect(acquire).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled();
});
it('creates root, preserves project context and excludes it from material receipts', () => {
  expect(api().create('O', 'root').status).toBe('APPLIED');
  expect(load().elements.root.id).toBe('4000014'); expect(api().receipts('O')).toEqual([]);
});
it('retries after crash before insert with same reserved ID and no second reservation', () => {
  failInsert = 'before'; expect(api().create('O', 'part').status).toBe('CONFLICT');
  expect(load().elements.part.status).toBe('INSERT_INTENT');
  expect(api().create('O', 'part').status).toBe('APPLIED'); expect(counters[1][1]).toBe(2000010);
});
it('recovers persisted insert with lost acknowledgment without another insert', () => {
  failInsert = 'after'; expect(api().create('O', 'part').status).toBe('CONFLICT');
  expect(api().create('O', 'part').status).toBe('APPLIED'); expect(inserts).toHaveBeenCalledTimes(1);
});
it.each(['OP_FRAME', 'OP_DATA', 'OP_END'])('repairs CREATED lost acknowledgment at %s through fresh verification', kind => {
  failEvent = 'created:part'; failKind = kind; failAfter = true;
  expect(api().create('O', 'part').status).toBe('CONFLICT');
  expect(api().create('O', 'part').status).toBe('ALREADY_APPLIED');
  expect(api().receipts('O')).toHaveLength(1); expect(inserts).toHaveBeenCalledTimes(1);
});
it('leaves burned counter after reservation failure and recovers using a new higher ID', () => {
  failCounter = true; expect(api().create('O', 'part').status).toBe('CONFLICT');
  expect(load().elements.part.status).toBe('RESERVING'); expect(elements).toHaveLength(1);
  expect(api().create('O', 'part').status).toBe('APPLIED'); expect(load().elements.part.id).toBe('2000011');
});
it('does not insert when intent persistence is rejected; retries from RESERVING', () => {
  failEvent = 'intent:part'; failKind = 'OP_FRAME';
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(elements).toHaveLength(1);
  expect(api().create('O', 'part').status).toBe('APPLIED'); expect(load().elements.part.id).toBe('2000011');
});
it('repairs complete intent chunks before insert without reserving again', () => {
  failEvent = 'intent:part'; failKind = 'OP_DATA'; failAfter = true;
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(inserts).not.toHaveBeenCalled();
  expect(api().create('O', 'part').status).toBe('APPLIED'); expect(counters[1][1]).toBe(2000010);
});
it('recovers canonical intent from frame when insert intent acknowledgment was lost', () => {
  failEvent = 'intent:part'; failKind = 'OP_FRAME'; failAfter = true;
  expect(api().create('O', 'part').status).toBe('CONFLICT');
  expect(api().create('O', 'part').status).toBe('APPLIED'); expect(counters[1][1]).toBe(2000010); expect(inserts).toHaveBeenCalledTimes(1);
});
it('reuses existing historical material Part without reservation, mutation or receipt', () => {
  existing('4001', { ProjectDocumentID: 'old-context' }); const before = clone(elements);
  expect(api().create('O', 'part').status).toBe('APPLIED');
  expect(load().elements.part).toMatchObject({ status: 'REUSED', id: '4001' });
  expect(api().receipts('O')).toEqual([]); expect(elements).toEqual(before); expect(counters[1][1]).toBe(2000009);
});
it('rechecks physical state on repeat after CREATED and preserves old Parts', () => {
  existing('4001', { Code: 'R_14_A500C_L500', Diameter: 14, Length: 500 }); const old = clone(elements[1]);
  expect(api().create('O', 'part').status).toBe('APPLIED');
  expect(api().create('O', 'part').status).toBe('ALREADY_APPLIED'); expect(elements[1]).toEqual(old);
  elements[2][ELEMENT_COLUMNS.indexOf('Length')] = 999;
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(() => api().receipts('O')).toThrow();
});
it.each([{ Type: 'assembly' as const }, { ParentMaterialID: '3015' }, { Length: 999 }, { Class: 'A400' }])('rejects conflicting identity %j before reservation', patch => {
  existing('4001', patch); expect(api().create('O', 'part').status).toBe('CONFLICT');
  expect(counters[1][1]).toBe(2000009); expect(inserts).not.toHaveBeenCalled();
});
it('rejects duplicate business candidates', () => {
  existing('4001'); existing('4002'); expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(inserts).not.toHaveBeenCalled();
});
it('rejects reserved ID collision after durable intent', () => {
  failInsert = 'before'; api().create('O', 'part'); existing('2000010', { Name: 'foreign' });
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(api().receipts('O')).toEqual([]);
});
it('does not adopt a foreign matching Part after intent', () => {
  failInsert = 'before'; api().create('O', 'part'); existing('4001');
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(load().elements.part.status).toBe('INSERT_INTENT');
});
it('refuses physical mismatch and duplicate IDs after insertion', () => {
  failInsert = 'after'; api().create('O', 'part'); elements.push(clone(elements[1]));
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(api().receipts('O')).toEqual([]);
});
it('never issues CREATED from intent alone', () => {
  failInsert = 'before'; api().create('O', 'part'); expect(api().receipts('O')).toEqual([]);
  expect(openCommitOperationJournal(lock).confirmCreated('O', 'created:part', 'part').status).toBe('CONFLICT');
});
it('serializes cooperating operations so second operation reuses first Part', () => {
  expect(api().create('O', 'part').status).toBe('APPLIED');
  expect(openCommitOperationJournal(lock).begin('Other', input, clone(prepared)).status).toBe('APPLIED');
  expect(api().create('Other', 'part').status).toBe('APPLIED');
  expect(openCommitOperationJournal(lock).load('Other').elements.part.status).toBe('REUSED'); expect(inserts).toHaveBeenCalledTimes(1);
});
it('public coordinator releases outer lock after failure and success', () => {
  held = false; failInsert = 'after'; expect(createRecoverableElement('O', 'part').status).toBe('CONFLICT');
  expect(held).toBe(false); expect(release).toHaveBeenCalledTimes(1);
  expect(createRecoverableElement('O', 'part').status).toBe('APPLIED'); expect(release).toHaveBeenCalledTimes(2);
});
it('lock timeout has no mutations and never releases unowned lock', () => {
  held = false; timeout = true; expect(() => createRecoverableElement('O', 'part')).toThrow('acquire'); expect(release).not.toHaveBeenCalled(); expect(inserts).not.toHaveBeenCalled();
});
it('public APIs refuse nested acquisition and internal APIs refuse missing ownership', () => {
  expect(() => createRecoverableElement('O', 'part')).toThrow('already held');
  expect(() => generateIdByType('part')).toThrow('already held'); expect(() => withScriptLock(() => 0)).toThrow('already held');
  const coordinator = api(); held = false;
  expect(coordinator.create('O', 'part').status).toBe('CONFLICT');
  expect(() => generateIdByTypeUnderLock('part', lock)).toThrow('Caller-owned');
  expect(() => writeSafeBOMUnderLock({} as never, lock)).toThrow('Caller-owned');
  expect(() => recoverSafeBOMUnderLock('O_BOM', lock)).toThrow('Caller-owned');
  expect(() => new MasterFreshElementStore(lock).insert(existing())).toThrow('Caller-owned'); expect(inserts).not.toHaveBeenCalled();
});
it('internal allocator reserves under outer lock without reacquisition or release', () => {
  expect(generateIdByTypeUnderLock('part', lock)).toBe('2000010'); expect(acquire).not.toHaveBeenCalled(); expect(release).not.toHaveBeenCalled();
});
it('public allocator retains reservation behavior and releases lock', () => {
  held = false; expect(generateIdByType('part')).toBe('2000010'); expect(acquire).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
});
it('refuses invalid journal before Element or counter mutations', () => {
  journal[2][4] = 'corrupt'; const before = clone(elements);
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(elements).toEqual(before); expect(counters[1][1]).toBe(2000009);
});
it('fresh reader normalizes numerical IDs and respects physical header order', () => {
  existing(); const reversed = [...ELEMENT_COLUMNS].reverse();
  elements = [reversed, reversed.map(key => elements[1][ELEMENT_COLUMNS.indexOf(key)])];
  elements[1][reversed.indexOf('ID')] = 4001;
  expect(new MasterFreshElementStore(lock).read()[0].ID).toBe('4001');
  expect(api().create('O', 'part').status).toBe('APPLIED'); expect(inserts).not.toHaveBeenCalled();
});
it.each(['assembly', 'part'] as const)('supports separate %s root creation and material child creation', type => {
  const plan = clone(prepared); plan.rootType = type; plan.pendingElements[0].row.Type = type;
  counters.push(['assembly', 3000000]);
  expect(openCommitOperationJournal(lock).begin('Separate', input, plan).status).toBe('APPLIED');
  expect(api().create('Separate', 'root').status).toBe('APPLIED');
  expect(api().create('Separate', 'part').status).toBe('APPLIED'); expect(api().receipts('Separate')).toHaveLength(1);
});
it('preserves project root identity across different documents', () => {
  const project = (doc: string, id: string) => {
    const row: ElementRow = { ...prepared.pendingElements[0].row, ID: id, ProjectDocumentID: doc, CreatedAt: new Date() };
    elements.push(ELEMENT_COLUMNS.map(key => physicalElement(row)[key]));
  };
  project('8', '4000000'); project('9', '4000001');
  expect(api().create('O', 'root').status).toBe('APPLIED'); expect(load().elements.root.id).toBe('4000001'); expect(inserts).not.toHaveBeenCalled();
});
it('refuses creation of missing project child under Product policy', () => {
  const plan = clone(prepared); plan.writeScope.initializeMaterialBOMFor = [];
  plan.pendingElements[1].row = { Code: 'ГСк-1', PrefixName: 'Стержень', Name: 'Part', Type: 'part', Category: 'rebar', BaseUnit: 'шт', ProjectDocumentID: '9' };
  plan.components[0].identity = { kind: 'project-element', code: 'ГСк-1', projectDocumentID: '9' };
  plan.plannedEdges = plan.plannedEdges.slice(0, 1);
  expect(openCommitOperationJournal(lock).begin('Project', input, plan).status).toBe('APPLIED');
  expect(api().create('Project', 'part').status).toBe('CONFLICT'); expect(inserts).not.toHaveBeenCalled();
});
it('rejects oversized canonical identity event without truncation or insertion', () => {
  const plan = clone(prepared); plan.pendingElements[1].row.Comment = 'x'.repeat(21000);
  expect(openCommitOperationJournal(lock).begin('Large', input, plan).status).toBe('APPLIED');
  expect(api().create('Large', 'part').status).toBe('CONFLICT'); expect(inserts).not.toHaveBeenCalled();
  expect(openCommitOperationJournal(lock).load('Large').elements.part.status).toBe('RESERVING');
});
it('repairs REUSED frame acknowledgment loss without assigning a created receipt', () => {
  existing(); failEvent = 'reuse:part'; failKind = 'OP_FRAME'; failAfter = true;
  expect(api().create('O', 'part').status).toBe('CONFLICT'); expect(api().create('O', 'part').status).toBe('ALREADY_APPLIED');
  expect(api().receipts('O')).toEqual([]); expect(inserts).not.toHaveBeenCalled();
});
it('releases outer lock even when opening the durable journal throws', () => {
  held = false; open.mockImplementationOnce(() => { throw new Error('MASTER unavailable'); });
  expect(() => createRecoverableElement('O', 'part')).toThrow('MASTER unavailable'); expect(held).toBe(false); expect(release).toHaveBeenCalledTimes(1);
});
