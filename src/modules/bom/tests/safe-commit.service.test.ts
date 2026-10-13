/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/safe-commit.service.test.ts
 * Module: BOM commit
 * Layer: Tests
 * Responsibility: exercise trusted orchestration and crash recovery using real modules and failure-injectable GAS mocks.
 */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { SafeCommitService } from '../commit/safe-commit.service';
import * as safeCommitExports from '../commit/safe-commit.service';
import { submitBOM } from '../../../ui/bom-commit.api';
import { openCommitOperationJournal, commitDigest } from '../commit/commit-operation-journal';
import { ELEMENT_COLUMNS, MasterFreshElementStore } from '../commit/fresh-element-store';
import { mapElementRowToDomain } from '../../elements/element.mapper';
import { MaterialRepository } from '../../../domain/materials/material.repository';
import { PHYSICAL_BOM_HEADERS } from '../commit/physical-bom-schema';
import { JOURNAL_HEADERS } from '../commit/safe-bom-writer';
import { SpreadsheetConfig } from '../../../infrastructure/spreadsheets/SpreadsheetConfig';
import type { BOMPreparationInput } from '../preparation/bom-preparation.model';
import type { CatalogItem } from '../../catalog/catalog.model';
import { freshCommitContext } from '../commit/fresh-commit-context';
import { CATALOG_HEADERS } from '../../catalog/catalog.headers';
import { MATERIAL_HEADERS } from '../../material/material.headers';
import { PROJECT_DOCUMENT_DEPENDENCY_HEADERS } from '../../project-document-dependency/project-document-dependency.headers';
let bom: unknown[][], contextVersion: string, failBOM: boolean, bomWrites = 0, failBOMAt = -1;
const input: BOMPreparationInput = { parentInput: '\u041f\u043b\u0438\u0442\u0430; P', specification: '\u0410\u0440\u043c\u0430\u0442\u0443\u0440\u0430; R_12_A500C_L400; 4', projectDocumentID: '9' };
const clone = <T>(value: T): T => structuredClone(value);
let journal: unknown[][], elements: unknown[][], counters: unknown[][];
let held: boolean, timeout: boolean, failInsert: 'before' | 'after' | '', failCounter: boolean;
let failEvent: string, failKind: string, failAfter: boolean, currentEvent: string;
const acquire = vi.fn(), release = vi.fn(), inserts = vi.fn(), forbidden = vi.fn(), open = vi.fn();
const lock = { hasLock: () => held, tryLock: acquire, releaseLock: release } as unknown as GoogleAppsScript.Lock.Lock;
function table(data: unknown[][], name: string) {
  return {
    getName: () => name, getLastColumn: () => data[0].length, getLastRow: () => data.length,
    getDataRange: () => ({ getValues: () => clone(data), getFormulas: () => data.map(row => row.map(() => '')), getMergedRanges: () => [] }),
    getRange: (r: number, c: number, count = 1, width = 1) => ({
      isPartOfMerge: () => false,
      setValues: (matrix: unknown[][]) => { expect(held).toBe(true); bomWrites++; if (failBOM || bomWrites === failBOMAt) { failBOM = false; throw new Error('physical BOM write failure'); } matrix.forEach((values, offset) => { data[r - 1 + offset] = values.map(value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value); }); },
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
  vi.clearAllMocks(); held = false; timeout = false; failInsert = ''; failCounter = false; failEvent = ''; failKind = ''; failAfter = false;
  bomWrites = 0; failBOMAt = -1;
  journal = [clone(JOURNAL_HEADERS)]; elements = [clone([...ELEMENT_COLUMNS])];
  counters = [['Type', 'LastID'], ['part', 2000009], ['product', 4000013], ['assembly', 3000000]]; bom = [[...PHYSICAL_BOM_HEADERS], ['4000001', '4001', 2, 'pcs', 'foreign note', 'P2', 'old'], Array(7).fill(''), ['4001', '3014', .46, 'kg', 'own note', 'old', 'material']]; contextVersion = 'v1'; failBOM = false;
  acquire.mockImplementation(() => { if (timeout) return false; if (held) throw new Error('nested lock'); held = true; return true; });
  release.mockImplementation(() => { expect(held).toBe(true); held = false; });
  open.mockImplementation((id: string) => { expect(id).toBe(SpreadsheetConfig.MASTER.id); return { getSheetByName: (name: string) => {
    if (name === '_BOM_CommitJournal') return table(journal, name);
    if (name === '00_Elements') return table(elements, name);
    if (name === '_Config_ID_Counters') return table(counters, name);
    if (name === '01_BOM') return table(bom, name);
    if (name === '05_Materials') return table([['MaterialID'], ['3014']], name);
    forbidden(); throw new Error(`Forbidden sheet ${name}`);
  } }; });
  vi.stubGlobal('SpreadsheetApp', { openById: open, flush: () => expect(held).toBe(true), getActive: forbidden, getActiveSpreadsheet: forbidden });
  vi.stubGlobal('LockService', { getScriptLock: () => lock });
  vi.stubGlobal('Utilities', { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_a: string, text: string) => [...createHash('sha256').update(text).digest()] });

});
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function context() {
  const material = { id: '3014', code: 'R_12_A500C', name: 'Rebar', category: 'rebar' as const, profileType: 'round' as const, diameter: 12, class: 'A500C', weightPerMeter: 1.15, baseUnit: 'кг', isActive: true };
  const materials = new MaterialRepository([]); materials.setData([material]);
  const rows = new MasterFreshElementStore(lock).read().map(mapElementRowToDomain);
  const template = (type: CatalogItem['type'], supportsLength = false): CatalogItem => ({ id: 1, typeCode: type, name: type, type, category: 'rebar', profileType: 'round', hasBOM: true, productionType: 'produced', supportsLength });
  return { deps: { elements: { findByType: (type: string) => rows.filter(row => row.type === type) }, materials,
    catalog: { resolveTemplate: (prefix: string) => prefix.toLowerCase() === 'плита' ? template('product') : prefix.toLowerCase() === 'каркас' ? template('assembly') : prefix.toLowerCase() === 'стержень' ? template('part') : template('material', true) },
    documents: { resolve: () => ['9'] } }, validationContext: { materialsDigest: commitDigest(contextVersion), catalogDigest: commitDigest(contextVersion), documents: ['9'] } };
}
const service = () => new SafeCommitService(context);
function state() { held = true; try { return openCommitOperationJournal(lock).load('O'); } finally { held = false; } }
function seed(key: string, id: string) {
  const pending = state().manifest.prepared.pendingElements.find(item => item.localKey === key)!;
  elements.push(ELEMENT_COLUMNS.map(column => column === 'ID' ? id : column === 'CreatedAt' ? new Date() : column === 'IsActive' ? true : pending.row[column as keyof typeof pending.row] ?? ''));
}
it.each(['Плита', 'Каркас', 'Стержень'])('commits and repeats a new %s under exactly one lock', prefix => {
  const request = { ...input, parentInput: `${prefix}; P` }, before = clone(bom);
  const first = service().commitBOM(request, 'O'); expect(first.status, first.error).toBe('COMMITTED');
  expect(acquire).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1); expect(held).toBe(false);
  const inserted = inserts.mock.calls.length, counter = clone(counters), physical = clone(bom);
  expect(service().commitBOM(request, 'O').status).toBe('ALREADY_APPLIED'); expect(inserts).toHaveBeenCalledTimes(inserted); expect(counters).toEqual(counter); expect(bom).toEqual(physical);
  expect(bom.slice(0, before.length)).toEqual(before);
});
it('rejects any input diagnostic without journal, IDs, Elements or BOM mutations', () => {
  const before = clone({ journal, counters, elements, bom });
  expect(service().commitBOM({ ...input, specification: 'Арматура; UNKNOWN; 4' }, 'O').status).toBe('VALIDATION_ERROR');
  expect({ journal, counters, elements, bom }).toEqual(before);
});
it.each(['elements', 'bom', 'journal', 'counters'])('rejects invalid %s schema before all side effects', kind => {
  if (kind === 'elements') elements[0][0] = 'Wrong'; if (kind === 'bom') bom[0][4] = 'CreatedAt'; if (kind === 'journal') journal[0][0] = 'Wrong'; if (kind === 'counters') counters[0][0] = 'Wrong';
  const before = clone({ journal, counters, elements, bom });
  expect(service().commitBOM(input, 'O').status).toBe('VALIDATION_ERROR'); expect({ journal, counters, elements, bom }).toEqual(before);
});
it.each(['initial', 'ready', 'reserve:pending:1', 'intent:pending:1', 'created:pending:1', 'created:pending:2', 'bom-ready', 'bom-plan', 'completed'])('repairs crash at %s without duplicating owned creation', event => {
  failEvent = event; failKind = 'OP_FRAME'; failAfter = true;
  const first = service().commitBOM(input, 'O'); expect(first.status, first.error).toBe('RECOVERY_REQUIRED');
  const resumed = service().resumeBOMCommit('O'); expect(['COMMITTED', 'ALREADY_APPLIED'], resumed.error).toContain(resumed.status);
  expect(elements).toHaveLength(3); expect(new Set(elements.slice(1).map(row => row[0])).size).toBe(2);
  expect(state().status).toBe('COMPLETED');
});
it('retries a failure before any durable manifest without side effects', () => {
  failEvent = 'initial'; failKind = 'OP_FRAME';
  expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED'); expect(journal).toHaveLength(1); expect(elements).toHaveLength(1);
  expect(service().commitBOM(input, 'O').status).toBe('COMMITTED');
});
it('recovers reservation gap without rolling counters back', () => {
  failCounter = true; expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED');
  expect(service().resumeBOMCommit('O').status).toBe('COMMITTED'); expect(counters[2][1]).toBe(4000015);
});
it.each(['before', 'after'] as const)('recovers insert failure %s physical append with durable intent', failure => {
  failInsert = failure; expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED');
  const counter = clone(counters); expect(service().resumeBOMCommit('O').status).toBe('COMMITTED'); expect(counters).toEqual(counter.map((row, index) => index === 1 ? ['part', 2000010] : row));
});
it('recovers own CREATED Part lacking material BOM without treating it as REUSED', () => {
  failEvent = 'bom-ready'; failKind = 'OP_FRAME';
  expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED'); expect(elements).toHaveLength(3);
  const partID = state().elements['pending:2'].id!; expect(bom.some(row => row[0] === partID)).toBe(false);
  expect(service().resumeBOMCommit('O').status).toBe('COMMITTED'); expect(bom.filter(row => row[0] === partID)).toHaveLength(1);
});
it('uses foreign Part without BOM as REUSED and never initializes it', () => {
  failEvent = 'reserve:pending:2'; failKind = 'OP_FRAME'; service().commitBOM(input, 'O'); seed('pending:2', '4185');
  expect(service().resumeBOMCommit('O').status).toBe('COMMITTED'); expect(state().elements['pending:2'].status).toBe('REUSED'); expect(bom.some(row => row[0] === '4185')).toBe(false);
});
it('recovers writer failure using the durable target, not a new mapping', () => {
  failBOM = true; expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED');
  const plan = clone(state().bomPlan); expect(service().resumeBOMCommit('O').status).toBe('COMMITTED'); expect(state().bomPlan).toEqual(plan); expect(inserts).toHaveBeenCalledTimes(2);
});
it.each(['Material', 'Catalog', 'document'])('blocks changed %s context before new creation on retry', kind => {
  failEvent = 'reserve:pending:1'; failKind = 'OP_FRAME'; service().commitBOM(input, 'O');
  const changed = new SafeCommitService(() => { const fresh = context();
    if (kind === 'Material') fresh.validationContext.materialsDigest = commitDigest('changed-material');
    if (kind === 'Catalog') fresh.validationContext.catalogDigest = commitDigest('changed-catalog');
    if (kind === 'document') fresh.validationContext.documents = ['9', '10'];
    return fresh;
  });
  const before = clone({ counters, elements, bom }); expect(changed.resumeBOMCommit('O').status).toBe('CONFLICT'); expect({ counters, elements, bom }).toEqual(before);
});
it('rejects same OperationID with another input without modifying journal', () => {
  service().commitBOM(input, 'O'); const before = clone({ journal, counters, elements, bom });
  expect(service().commitBOM({ ...input, specification: 'Арматура; R_12_A500C_L400; 7' }, 'O').status).toBe('CONFLICT'); expect({ journal, counters, elements, bom }).toEqual(before);
});
it('protects a newer specification from an older completed operation', () => {
  service().commitBOM(input, 'O'); expect(service().commitBOM({ ...input, specification: 'Арматура; R_12_A500C_L400; 7' }, 'New').status).toBe('COMMITTED');
  const before = clone({ elements, bom }); expect(service().resumeBOMCommit('O').status).toBe('CONFLICT'); expect({ elements, bom }).toEqual(before);
});
it('does not apply an old mapped target if another specification changed before writer start', () => {
  failEvent = 'bom-plan'; failKind = 'OP_END'; failAfter = true; service().commitBOM(input, 'O');
  service().commitBOM({ ...input, specification: 'Арматура; R_12_A500C_L400; 7' }, 'New');
  const before = clone(bom); expect(service().resumeBOMCommit('O').status).toBe('CONFLICT'); expect(bom).toEqual(before);
});
it('preserves Comments during Qty changes and retains old Part on replacement', () => {
  service().commitBOM(input, 'O'); const rootID = state().elements['pending:1'].id!, oldPart = state().elements['pending:2'].id!;
  bom.find(row => row[0] === rootID)![4] = 'operator note';
  expect(service().commitBOM({ ...input, specification: 'Арматура; R_12_A500C_L400; 7' }, 'Qty').status).toBe('COMMITTED'); expect(bom.find(row => row[0] === rootID)![4]).toBe('operator note');
  expect(service().commitBOM({ ...input, specification: 'Арматура; R_12_A500C_L800; 7' }, 'Replace').status).toBe('COMMITTED');
  expect(elements.some(row => row[0] === oldPart)).toBe(true); expect(bom.some(row => row[0] === oldPart)).toBe(true); expect(bom.find(row => row[0] === rootID)![4]).toBe('');
});
it('returns recovery-required on lock timeout and refuses nested acquisition', () => {
  timeout = true; expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED'); expect(release).not.toHaveBeenCalled();
  timeout = false; held = true; expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED'); held = false;
});
it('fresh production factory reads only MASTER without cached application factories', () => {
  held = true;
  const original = open.getMockImplementation()!;
  const catalog = [[...CATALOG_HEADERS], ...[
    { ID: 1, TypeCode: 'плита', Name: 'Plate', Type: 'product', Category: 'concrete_mix', ProfileType: 'concrete', HasBOM: true, ProductionType: 'produced', SupportsLength: false },
    { ID: 2, TypeCode: 'арматура', Name: 'Rebar', Type: 'material', Category: 'rebar', ProfileType: 'round', HasBOM: false, ProductionType: 'purchased', SupportsLength: true },
  ].map(item => CATALOG_HEADERS.map(header => (item as Record<string, unknown>)[header] ?? ''))];
  const materials = [[...MATERIAL_HEADERS], MATERIAL_HEADERS.map(header => ({ MaterialID: 3014, Code: 'R_12_A500C', Name: 'Rebar', Category: 'rebar', ProfileType: 'round', Diameter: 12, Class: 'A500C', WeightPerMeter: 1.15, BaseUnit: 'кг', IsActive: true } as Record<string, unknown>)[header] ?? '')];
  open.mockImplementation((id: string) => ({ getSheetByName: (name: string) => name === '04_Catalog' ? table(catalog, name) : name === '05_Materials' ? table(materials, name) : name === '21_ProjectDocumentDependencies' ? table([[...PROJECT_DOCUMENT_DEPENDENCY_HEADERS]], name) : original(id).getSheetByName(name) }));
  const originalContext = freshCommitContext(lock, '9'); expect(originalContext.deps.materials.getAll()).toHaveLength(1);
  materials[1][MATERIAL_HEADERS.indexOf('WeightPerMeter')] = 1.2;
  expect(freshCommitContext(lock, '9').validationContext.materialsDigest).not.toBe(originalContext.validationContext.materialsDigest);
  materials[1][MATERIAL_HEADERS.indexOf('WeightPerMeter')] = 1.15;
  held = false;
  const result = new SafeCommitService().commitBOM(input, 'Production'); expect(result.status, result.error).toBe('COMMITTED');
});
it.each(['Плита', 'Каркас', 'Стержень'])('commits existing %s without creating Elements and verifies no-op without writer journal', prefix => {
  const request = { ...input, parentInput: `${prefix}; P` }; service().commitBOM(request, 'O');
  const before = clone({ counters, elements, bom });
  expect(service().commitBOM(request, 'Existing').status).toBe('ALREADY_APPLIED');
  expect(service().resumeBOMCommit('Existing').status).toBe('ALREADY_APPLIED'); expect({ counters, elements, bom }).toEqual(before);
  expect(journal.some(row => row[0] === 'Existing_BOM')).toBe(false);
  service().commitBOM({ ...request, specification: 'Арматура; R_12_A500C_L400; 7' }, 'Newer'); const newer = clone(bom);
  expect(service().resumeBOMCommit('Existing').status).toBe('CONFLICT'); expect(bom).toEqual(newer);
});
it('validates a changed fresh context after Prepare before any manifest or reservation', () => {
  const before = clone({ journal, counters, elements, bom }); let calls = 0;
  const app = new SafeCommitService(() => { calls++; if (calls === 2) contextVersion = 'changed'; return context(); });
  expect(app.commitBOM(input, 'O').status).toBe('VALIDATION_ERROR'); expect({ journal, counters, elements, bom }).toEqual(before);
});
it('accepts explicit Comment change as part of immutable request', () => {
  service().commitBOM(input, 'O'); const saved = state();
  const parentID = saved.elements['pending:1'].id!, childID = saved.elements['pending:2'].id!;
  const request = { ...input, commentChanges: [{ parentID, childID, unit: 'шт', comment: 'approved' }] };
  expect(service().commitBOM(request, 'Comment').status).toBe('COMMITTED'); expect(bom.find(row => row[0] === parentID)![4]).toBe('approved');
  expect(service().commitBOM({ ...request, commentChanges: [{ parentID, childID, unit: 'шт', comment: 'other' }] }, 'Comment').status).toBe('CONFLICT');
});
it('serializes competing operations and reuses global material Part without a second reservation', () => {
  service().commitBOM(input, 'O'); const partCounter = counters[1][1];
  expect(service().commitBOM({ ...input, parentInput: 'Плита; P2' }, 'Second').status).toBe('COMMITTED');
  expect(counters[1][1]).toBe(partCounter); expect(elements.filter(row => row[ELEMENT_COLUMNS.indexOf('Type')] === 'part')).toHaveLength(1);
  const id = state().elements['pending:2'].id!; expect(bom.filter(row => row[0] === id)).toHaveLength(1);
});
it('stops before writer when another pending identity conflicts, with no new Elements', () => {
  failEvent = 'reserve:pending:1'; failKind = 'OP_FRAME'; service().commitBOM(input, 'O'); seed('pending:2', '4185'); seed('pending:2', '4186');
  const before = clone({ counters, elements, bom }); expect(service().resumeBOMCommit('O').status).toBe('CONFLICT'); expect({ counters, elements, bom }).toEqual(before);
});
it('recovers after root physical write but before the new Part material edge is written', () => {
  failBOMAt = 2; expect(service().commitBOM(input, 'O').status).toBe('RECOVERY_REQUIRED');
  const saved = state(), rootID = saved.elements['pending:1'].id!, partID = saved.elements['pending:2'].id!;
  expect(bom.some(row => row[0] === rootID)).toBe(true); expect(bom.some(row => row[0] === partID)).toBe(false);
  failBOMAt = -1; expect(service().resumeBOMCommit('O').status).toBe('COMMITTED');
  expect(bom.filter(row => row[0] === rootID)).toHaveLength(1); expect(bom.filter(row => row[0] === partID)).toHaveLength(1);
});
it('replays a large target frame only when reconstructed mapping matches its immutable digest', () => {
  service().commitBOM(input, 'O'); const rootID = state().elements['pending:1'].id!;
  bom.find(row => row[0] === rootID)![4] = 'x'.repeat(10000);
  failEvent = 'bom-plan'; failKind = 'OP_FRAME'; failAfter = true;
  const changed = { ...input, specification: 'Арматура; R_12_A500C_L400; 7' };
  expect(service().commitBOM(changed, 'Large').status).toBe('RECOVERY_REQUIRED');
  expect(service().resumeBOMCommit('Large').status).toBe('COMMITTED'); expect(bom.find(row => row[0] === rootID)![4]).toHaveLength(10000);
});
it('retries original input when a large manifest lost acknowledgment before any durable payload', () => {
  const large = { ...input, specification: Array(50).fill('Арматура; R_12_A500C_L400; 1').join('\n') };
  failEvent = 'initial'; failKind = 'OP_FRAME'; failAfter = true;
  expect(service().commitBOM(large, 'Large').status).toBe('RECOVERY_REQUIRED'); expect(elements).toHaveLength(1);
  expect(service().resumeBOMCommit('Large').status).toBe('RECOVERY_REQUIRED');
  expect(service().commitBOM(large, 'Large').status).toBe('COMMITTED'); expect(elements).toHaveLength(3);
});
it('trusted UI route serializes submissions, preserves foreign duplicate slots and old Parts', () => {
  vi.stubGlobal('Session', { getActiveUser: () => ({ getEmail: () => 'owner@example.com' }) });
  vi.stubGlobal('DriveApp', { getFileById: (id: string) => { expect(id).toBe(SpreadsheetConfig.MASTER.id); return { getOwner: () => ({ getEmail: () => 'owner@example.com' }), getEditors: () => [] }; } });
  const app = service(); vi.spyOn(safeCommitExports, 'commitBOM').mockImplementation((raw, id) => app.commitBOM(raw, id));
  bom.push(clone(bom[1])); const before = clone(bom);
  const raw = { projectDocumentID: input.projectDocumentID!, parentInput: input.parentInput, specification: input.specification };
  expect(submitBOM({ ...raw, operationID: 'Ui1' }).status).toBe('COMMITTED');
  const rows = clone(elements), ids = clone(counters), written = clone(bom);
  expect(submitBOM({ ...raw, operationID: 'Ui2' }).status).toBe('ALREADY_APPLIED');
  expect(submitBOM({ ...raw, operationID: 'Ui1' }).status).toBe('ALREADY_APPLIED');
  expect(elements).toEqual(rows); expect(counters).toEqual(ids); expect(bom).toEqual(written); expect(bom.slice(0, before.length)).toEqual(before);
  expect(submitBOM({ ...raw, specification: raw.specification + '\nАрматура; R_12_A500C_L400; 1', operationID: 'Ui1' }).status).toBe('CONFLICT');
  expect(bom).toEqual(written);
});
