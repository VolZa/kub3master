/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/physical-bom-mapping.test.ts
 * Module: BOM
 * Layer: Tests
 * Responsibility: verify physical mapping, edge comments, scope and stable-slot reading without mutations.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mapPreparedBOMToPhysicalPlan, type ResolvedBOMBinding } from '../commit/physical-bom-mapper';
import { PHYSICAL_BOM_HEADERS } from '../commit/physical-bom-schema';
import { getAllBOMRows, getChildrenRows } from '../bom.repository';
import type { PreparedBOM } from '../preparation/bom-preparation.model';
import type { ElementFull } from '../../elements/element.model';
import { SpreadsheetConfig } from '../../../infrastructure/spreadsheets/SpreadsheetConfig';
const element = (id: string, code: string, type: ElementFull['type']): ElementFull => ({ id, code, type, name: code, prefixName: code, category: 'rebar', baseUnit: 'шт', isActive: true, createdAt: new Date() });
const root = { kind: 'existing-element' as const, element: element('4000000', 'П-1', 'product') };
const child = { kind: 'existing-element' as const, element: element('2000000', 'ГСк-1', 'part') };
const material = { kind: 'material' as const, material: { id: '3014', code: 'R_12_A500C', name: 'Rebar', category: 'rebar' as const, profileType: 'round' as const, baseUnit: 'кг', isActive: true } };
const base: PreparedBOM = {
  rootType: 'product', parent: root, writeScope: { root, initializeMaterialBOMFor: [] }, pendingElements: [],
  sourceContext: { parentInput: 'P', specification: 'Part', searchProjectDocumentIDs: ['9'] },
  components: [{ sourceRowIndex: 0, input: { prefix: 'Part', code: 'ГСк-1', spec: 'Part', qty: 3 }, ref: child, identity: { kind: 'project-element', code: 'ГСк-1', projectDocumentID: '9' } }],
  plannedEdges: [{ parent: root, child, qty: 3, unit: 'шт' }],
};
const clone = <T>(value: T): T => structuredClone(value);
const row = (parent = '4000000', child = '2000000', comment = 'old note', unit = 'шт') => [parent, child, 1, unit, comment, 'P', 'C'];
let snapshot: unknown[][], formulas: string[][];
const forbidden = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); snapshot = [[...PHYSICAL_BOM_HEADERS], row(), Array(7).fill(''), row('2000000', '3014', 'part note', 'кг')];
  formulas = snapshot.map(values => values.map(() => ''));
  vi.stubGlobal('SpreadsheetApp', { openById: (id: string) => {
    expect(id).toBe(SpreadsheetConfig.MASTER.id);
    return { getSheetByName: (name: string) => { expect(name).toBe('01_BOM'); return {
      getDataRange: () => ({ getValues: () => clone(snapshot), getFormulas: () => clone(formulas) }),
      clearContents: forbidden, deleteRows: forbidden, getRange: forbidden,
    }; } };
  }, getActive: forbidden, getActiveSpreadsheet: forbidden });
});
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
function options() {
  return { prepared: clone(base), writerOperationID: 'O_BOM', headers: [...PHYSICAL_BOM_HEADERS], existingRows: clone(snapshot.slice(1)),
    bindings: [{ ref: root, id: '4000000', code: 'П-1', origin: 'existing' }, { ref: child, id: '2000000', code: 'ГСк-1', origin: 'existing' }] as ResolvedBOMBinding[],
    createdParts: [] as { id: string; operationID: string }[] };
}
it('maps exact seven columns with verified codes and preserves edge comment while Qty changes', () => {
  const input = options(), before = clone(input.existingRows);
  const plan = mapPreparedBOMToPhysicalPlan(input);
  expect(plan.targetRows).toEqual([['4000000', '2000000', 3, 'шт', 'old note', 'П-1', 'ГСк-1']]);
  expect(plan.affectedParentIDs).toEqual(['4000000']); expect(input.existingRows).toEqual(before);
  expect(plan.targetRows[0].some(value => value instanceof Date || typeof value === 'object')).toBe(false);
});
it('does not inherit removed ChildID comment when logical target changes', () => {
  const input = options(); input.existingRows = [row('4000000', '4001', 'belongs to old Part')];
  expect(mapPreparedBOMToPhysicalPlan(input).targetRows[0][4]).toBe('');
});
it('does not inherit another parent or unit comment', () => {
  const input = options(); input.existingRows = [row('4000001', '2000000', 'foreign'), row('4000000', '2000000', 'different unit', 'кг')];
  expect(mapPreparedBOMToPhysicalPlan(input).targetRows[0][4]).toBe('');
});
it('permits an explicit comment replacement or explicit clearing', () => {
  for (const comment of ['new note', '']) {
    expect(mapPreparedBOMToPhysicalPlan({ ...options(), commentChanges: [{ parentID: '4000000', childID: '2000000', unit: 'шт', comment }] }).targetRows[0][4]).toBe(comment);
  }
});
it('blocks duplicate existing edge comments unless explicitly resolved', () => {
  const input = options(); input.existingRows.push(row('4000000', '2000000', 'another'));
  expect(() => mapPreparedBOMToPhysicalPlan(input)).toThrow('Ambiguous');
  expect(mapPreparedBOMToPhysicalPlan({ ...input, commentChanges: [{ parentID: '4000000', childID: '2000000', unit: 'шт', comment: 'resolved' }] }).targetRows[0][4]).toBe('resolved');
});
it.each(['missing', 'ambiguous', 'code', 'id', 'scope'])('blocks %s mapping information', kind => {
  const input = options();
  if (kind === 'missing') input.bindings.pop();
  if (kind === 'ambiguous') input.bindings.push(clone(input.bindings[1]));
  if (kind === 'code') input.bindings[1].code = 'wrong';
  if (kind === 'id') input.bindings[1].id = 'pending:1';
  if (kind === 'scope') input.prepared.writeScope.root = child;
  expect(() => mapPreparedBOMToPhysicalPlan(input)).toThrow();
});
it('maps canonical direct Material without an intermediate Part', () => {
  const input = options(); input.prepared.components = []; input.prepared.plannedEdges = [{ parent: root, child: material, qty: .46, unit: 'кг' }];
  input.bindings.push({ ref: material, id: '3014', code: material.material.code, origin: 'material' });
  expect(mapPreparedBOMToPhysicalPlan(input).targetRows).toEqual([['4000000', '3014', .46, 'кг', '', 'П-1', 'R_12_A500C']]);
});
function materialPart(origin: 'created' | 'reused') {
  const input = options(), part = { kind: 'pending-element' as const, localKey: 'part' };
  input.prepared.pendingElements = [{ localKey: 'part', row: { Code: 'R_12_A500C_L400', PrefixName: 'Part', Name: 'Part', Type: 'part', ParentMaterialID: '3014', Category: 'rebar', BaseUnit: 'шт', Diameter: 12, Length: 400 } }];
  input.prepared.components = []; input.prepared.writeScope.initializeMaterialBOMFor = ['part'];
  input.prepared.plannedEdges = [{ parent: root, child: part, qty: 3, unit: 'шт' }, { parent: part, child: material, qty: .46, unit: 'кг' }];
  input.bindings.push({ ref: part, id: '2000010', code: 'R_12_A500C_L400', origin }, { ref: material, id: '3014', code: material.material.code, origin: 'material' });
  if (origin === 'created') input.createdParts = [{ id: '2000010', operationID: 'O_BOM' }];
  return input;
}
it('includes only receipt-authorized new Part initialization and keeps per-unit consumption', () => {
  const plan = mapPreparedBOMToPhysicalPlan(materialPart('created'));
  expect(plan.affectedParentIDs).toEqual(['4000000', '2000010']); expect(plan.targetRows.map(row => row[2])).toEqual([3, .46]);
});
it('drops pending initialization edges for a now REUSED Part and preserves its existing BOM', () => {
  const input = materialPart('reused'); input.existingRows.push(row('2000010', '3014', 'own comment', 'кг'));
  const before = clone(input.existingRows), plan = mapPreparedBOMToPhysicalPlan(input);
  expect(plan.affectedParentIDs).toEqual(['4000000']); expect(plan.targetRows).toHaveLength(1); expect(input.existingRows).toEqual(before);
});
it.each(['missing receipt', 'foreign receipt', 'existing BOM', 'foreign parent'])('blocks %s scope', kind => {
  const input = materialPart('created');
  if (kind === 'missing receipt') input.createdParts = [];
  if (kind === 'foreign receipt') input.createdParts[0].operationID = 'Other_BOM';
  if (kind === 'existing BOM') input.existingRows.push(row('2000010', '3014', 'own', 'кг'));
  if (kind === 'foreign parent') input.prepared.plannedEdges.push({ parent: child, child: material, qty: 1, unit: 'кг' });
  expect(() => mapPreparedBOMToPhysicalPlan(input)).toThrow();
});
it('blocks comments targeting a foreign or absent edge', () => {
  expect(() => mapPreparedBOMToPhysicalPlan({ ...options(), commentChanges: [{ parentID: '4000001', childID: '2000000', unit: 'шт', comment: 'x' }] })).toThrow();
});
it('reader skips only fully empty stable slots without modifying physical positions', () => {
  snapshot.push(row('4000001', '2000000', 'foreign'), row('4000001', '2000000', 'duplicate'));
  const before = clone(snapshot); const result = getAllBOMRows();
  expect(result).toHaveLength(4); expect(getChildrenRows('2000000')[0].comment).toBe('part note'); expect(snapshot).toEqual(before);
});
it.each(['parent', 'child', 'qty', 'unit', 'comment', 'code', 'width', 'formula'])('reader exposes damaged %s row as controlled error', kind => {
  if (kind === 'parent') snapshot[1][0] = '';
  if (kind === 'child') snapshot[1][1] = 'pending:1';
  if (kind === 'qty') snapshot[1][2] = '1';
  if (kind === 'unit') snapshot[1][3] = '';
  if (kind === 'comment') snapshot[1][4] = new Date(NaN);
  if (kind === 'code') snapshot[1][5] = '';
  if (kind === 'width') snapshot[1].pop();
  if (kind === 'formula') formulas[1][5] = '=1+1';
  expect(() => getAllBOMRows()).toThrow();
});
it.each(['CreatedAt', 'extra', 'reordered'])('reader and mapper reject %s schema', kind => {
  if (kind === 'CreatedAt') snapshot[0][4] = 'CreatedAt';
  if (kind === 'extra') snapshot[0].push('Extra');
  if (kind === 'reordered') [snapshot[0][0], snapshot[0][1]] = [snapshot[0][1], snapshot[0][0]];
  expect(() => getAllBOMRows()).toThrow('schema');
  expect(() => mapPreparedBOMToPhysicalPlan({ ...options(), headers: snapshot[0] })).toThrow('schema');
});

it.each(['', 'historical note', new Date('2026-10-10T00:00:00Z'), new Date('2026-10-10T07:37:01.123Z')])(
  'reader supports optional Comment %s without changing Qty or source cells', comment => {
    snapshot[1][4] = comment;
    const qty = snapshot[1][2];
    const result = getAllBOMRows();
    expect(result[0].comment).toBe(comment instanceof Date ? comment.toISOString() : comment);
    expect(result[0].qty).toBe(qty);
    expect(typeof result[0].qty).toBe('number');
    expect(snapshot[1][4]).toBe(comment);
  },
);

it('physically reads a synthetic 797-row BOM with 45 native date comments without mutations', () => {
  const dates: Date[] = [];
  snapshot.splice(1);
  for (let i = 0; i < 797; i++) {
    const comment = i < 45 ? new Date(Date.UTC(2026, 9, 10, 7, 37, i)) : i % 2 ? '' : 'note';
    if (comment instanceof Date) dates.push(comment);
    snapshot.push(['4000000', String(2000000 + i), 0.123456789 + i, 'кг', comment, 'P', `C${i}`]);
  }
  formulas = snapshot.map(r => r.map(() => ''));
  const before = snapshot.map(r => r.slice());
  const result = getAllBOMRows();
  expect(result).toHaveLength(797);
  expect(result.filter(r => /^2026-/.test(r.comment ?? ''))).toHaveLength(45);
  expect(result[0].qty).toBe(0.123456789);
  expect(snapshot).toEqual(before);
  expect(snapshot[1][4]).toBe(dates[0]);
});

it.each([0, -1, NaN, Infinity, '2'])('date Comment does not bypass invalid Qty %s', qty => {
  snapshot[1][4] = new Date('2026-10-10T07:37:01Z');
  snapshot[1][2] = qty;
  expect(() => getAllBOMRows()).toThrow('Invalid/partial');
});
