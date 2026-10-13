/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/bom-preparation.test.ts
 * Module: BOM
 * Layer: Tests
 * Responsibility: verify preparation plans, complete diagnostics and absence of writes using spies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareBOM, BOMPreparationDependencies } from '../preparation/bom-preparation.service';
import type { BOMPreparationInput } from '../preparation/bom-preparation.model';
import { MockElementRepository } from '../../elements/mock/mock.element.repository';
import type { ElementRow } from '../../elements/element.model';
import { MaterialRepository } from '../../../domain/materials/material.repository';
import type { Material } from '../../../domain/materials/material.model';
import { CatalogHelper } from '../../catalog/catalog.helper';
import type { CatalogItem } from '../../catalog/catalog.model';
import { generateIdByType } from '../../../utils/id';
import { replaceBOMForParent, insertBOMRows, deleteBOMTree, deleteBOMByParentId } from '../bom.repository';
vi.mock('../../../utils/id', () => ({ generateIdByType: vi.fn(() => { throw new Error('ID reservation forbidden'); }) }));
vi.mock('../bom.repository', () => ({
  replaceBOMForParent: vi.fn(), insertBOMRows: vi.fn(), deleteBOMTree: vi.fn(), deleteBOMByParentId: vi.fn(),
}));
const date = new Date('2026-03-01T00:00:00Z');
const root: ElementRow = { ID: '4000000', Code: 'П-1', PrefixName: 'плита', Name: 'Product', Type: 'product',
  Category: 'concrete_mix', BaseUnit: 'шт', ProjectDocumentID: 'DOC', CreatedAt: date };
const part: ElementRow = { ...root, ID: '2000000', Code: 'EXISTING', Type: 'part', PrefixName: 'арматура', ParentMaterialID: '3011' };
const concrete: Material = { id: '3201', code: 'C_20_25', name: 'Concrete', category: 'concrete_mix', profileType: 'concrete', baseUnit: 'м3', isActive: true };
const rebar: Material = { id: '3011', code: 'R_6_A500C', name: 'Rebar', category: 'rebar', profileType: 'round', baseUnit: 'кг', diameter: 6, class: 'A500C', weightPerMeter: 0.222, isActive: true };
const input: BOMPreparationInput = { parentInput: 'Плита; П-1', projectDocumentID: 'DOC', specification: 'Бетон; C20/25; 1,169' };
const repositoryChecks: Array<() => void> = [];
function template(type: CatalogItem['type'], supportsLength = false): CatalogItem {
  return { id: 1, typeCode: type, name: type, type, category: 'rebar', profileType: 'round', hasBOM: true, productionType: 'produced', supportsLength };
}
function setup(rows: ElementRow[] = [root, part], materials: Material[] = [concrete, rebar]) {
  const elements = new MockElementRepository(structuredClone(rows));
  const materialRepo = new MaterialRepository([]);
  materialRepo.setData(structuredClone(materials));
  const catalog = { resolveTemplate: vi.fn((prefix: string) => {
    if (prefix.toLowerCase() === 'плита') return template('product');
    if (prefix.toLowerCase() === 'бетон') return template('material');
    if (['арматура', 'кутник', 'полоса'].includes(prefix.toLowerCase())) return template('material', true);
    throw new Error(`Catalog template not found: ${prefix}`);
  }) };
  const documents = { resolve: vi.fn(() => ['DOC', 'DEPENDENCY']) };
  const insert = vi.spyOn(elements, 'insert');
  const update = vi.spyOn(elements, 'updateType');
  const setData = vi.spyOn(materialRepo, 'setData');
  const deps: BOMPreparationDependencies = { elements, materials: materialRepo, catalog, documents };
  const snapshot = structuredClone({ elements: elements.getAll(), materials: materialRepo.getAll() });
  repositoryChecks.push(() => {
    expect(insert).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(setData).not.toHaveBeenCalled();
    expect({ elements: elements.getAll(), materials: materialRepo.getAll() }).toEqual(snapshot);
  });
  return { elements, materialRepo, catalog, documents, insert, update, setData, deps };
}

describe('read-only Prepare BOM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryChecks.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('SpreadsheetApp', { openById: vi.fn(() => { throw new Error('Sheets forbidden'); }) });
    vi.stubGlobal('LockService', { getScriptLock: vi.fn(() => { throw new Error('Lock forbidden'); }) });
  });
  afterEach(() => {
    repositoryChecks.forEach(check => check());
    expect(generateIdByType).not.toHaveBeenCalled();
    for (const writer of [replaceBOMForParent, insertBOMRows, deleteBOMTree, deleteBOMByParentId]) expect(writer).not.toHaveBeenCalled();
    expect(SpreadsheetApp.openById).not.toHaveBeenCalled();
    expect(LockService.getScriptLock).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  it('returns a complete plan for all valid rows without mutating repositories', () => {
    const s = setup();
    const before = structuredClone({ elements: s.elements.getAll(), materials: s.materialRepo.getAll() });
    const result = prepareBOM({ ...input, specification: 'Арматура; EXISTING; 2\nБетон; C20/25; 1,169\nАрматура; R_6_A500C_L800; 2' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { parent: { kind: 'existing-element', element: { id: '4000000' } }, components: [
      { ref: { kind: 'existing-element', element: { id: '2000000' } } },
      { ref: { kind: 'material', material: { id: '3201' } } },
      { ref: { kind: 'pending-element' } },
    ] } });
    if (!result.ok) throw new Error('plan expected');
    expect(result.prepared.pendingElements).toHaveLength(1);
    expect(result.prepared.pendingElements[0].row).toMatchObject({ Code: 'R_6_A500C_L800', Type: 'part', ParentMaterialID: '3011', Length: 800, ProjectDocumentID: '' });
    expect(result.prepared.pendingElements[0].row).not.toHaveProperty('ID');
    expect(result.prepared.plannedEdges).toHaveLength(4);
    expect(result.prepared.plannedEdges[3]).toMatchObject({ parent: { kind: 'pending-element' }, child: { kind: 'material', material: { id: '3011' } }, qty: 0.18, unit: 'кг' });
    expect({ elements: s.elements.getAll(), materials: s.materialRepo.getAll() }).toEqual(before);
    expect(s.insert).not.toHaveBeenCalled(); expect(s.update).not.toHaveBeenCalled(); expect(s.setData).not.toHaveBeenCalled();
  });
  it('returns every row error and no partial plan', () => {
    const s = setup();
    const result = prepareBOM({ ...input, specification: 'Бетон; C20/25; 1\nАрматура; MISSING; 2\n\nБетон; C20/25; -1\nАрматура; R_99_A500C_L800; 1' }, s.deps);
    expect(result).toMatchObject({ ok: false, errors: [ { sourceRowIndex: 1 }, { sourceRowIndex: 3 }, { sourceRowIndex: 4 } ] });
    expect(result).not.toHaveProperty('prepared');
    expect(s.insert).not.toHaveBeenCalled();
  });
  it('rejects a single error among successful rows without creating planned elements', () => {
    const s = setup([]);
    const before = structuredClone(s.elements.getAll());
    const result = prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 2\nБетон; UNKNOWN; 1' }, s.deps);
    expect(result).toMatchObject({ ok: false, errors: [{ sourceRowIndex: 1 }] });
    expect(result).not.toHaveProperty('prepared');
    expect(s.elements.getAll()).toEqual(before); expect(s.insert).not.toHaveBeenCalled();
  });
  it.each(['', ' \n\t'])('rejects empty specification %s without a deletion plan', specification => {
    const s = setup();
    expect(prepareBOM({ ...input, specification }, s.deps)).toMatchObject({ ok: false, errors: [{ code: 'EMPTY_SPECIFICATION' }] });
    expect(s.insert).not.toHaveBeenCalled();
  });
  it('plans a new Product with temporary references and no reserved ID', () => {
    const s = setup([]);
    const result = prepareBOM(input, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { parent: { kind: 'pending-element', localKey: 'pending:1' }, pendingElements: [{ row: { Type: 'product', Code: 'П-1', ProjectDocumentID: 'DOC' } }] } });
    if (!result.ok) throw new Error('plan expected');
    expect(result.prepared.pendingElements[0].row).not.toHaveProperty('ID');
    expect(s.insert).not.toHaveBeenCalled();
  });
  it('deduplicates repeated pending Parts and aggregates edges by parent/child/unit', () => {
    const s = setup();
    const result = prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 2\nАрматура; R_6_A500C_L800; 3' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.pendingElements).toHaveLength(1);
    expect(result.prepared.components[0].ref).toEqual(result.prepared.components[1].ref);
    expect(result.prepared.plannedEdges).toMatchObject([{ qty: 5, unit: 'шт' }, { qty: 0.18, unit: 'кг' }]);
  });
  it.each(['4000000', '4000013', '1012'])('reuses root ID %s and legacy/7-digit components', id => {
    const s = setup([{ ...root, ID: id }, { ...part, ID: '4185' }]);
    const result = prepareBOM({ ...input, specification: 'Арматура; EXISTING; 2\nАрматура; EXISTING; 3' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { parent: { kind: 'existing-element', element: { id } }, pendingElements: [], plannedEdges: [{ qty: 5, child: { element: { id: '4185' } } }] } });
  });
  it.each(['C20/25', 'C_20_25', 'C20/25, м3'])('resolves canonical direct concrete %s', code => {
    const s = setup();
    expect(prepareBOM({ ...input, specification: `Бетон; ${code}; 1,169` }, s.deps)).toMatchObject({ ok: true, prepared: { pendingElements: [], plannedEdges: [{ qty: 1.169, unit: 'м3', child: { material: { id: '3201' } } }] } });
  });
  it.each(['0', '-1', 'NaN', 'Infinity', 'abc'])('rejects invalid quantity %s', qty => {
    const s = setup();
    expect(prepareBOM({ ...input, specification: `Бетон; C20/25; ${qty}` }, s.deps)).toMatchObject({ ok: false, errors: [{ sourceRowIndex: 0 }] });
  });
  it('rejects a conflicting explicit unit and missing canonical unit', () => {
    const s = setup();
    expect(prepareBOM({ ...input, specification: 'Бетон; C20/25, кг; 1' }, s.deps)).toMatchObject({ ok: false });
    const invalid = setup([root], [{ ...concrete, baseUnit: '' }]);
    expect(prepareBOM(input, invalid.deps)).toMatchObject({ ok: false });
  });
  it.each(['арматура', 'кутник', 'полоса'])('prepares length material Parts for %s', prefix => {
    const dimensions = prefix === 'арматура' ? {} : prefix === 'кутник' ? { profileType: 'angle' as const, width: 100, height: 63, thickness: 8 } : { profileType: 'plate' as const, width: 40, thickness: 5 };
    const s = setup([root], [{ ...rebar, ...dimensions }]);
    const spec = prefix === 'арматура' ? 'R_6_A500C_L800' : prefix === 'кутник' ? 'L100x63x8, L=800' : '5x40x800';
    const result = prepareBOM({ ...input, specification: `${prefix}; ${spec}; 2` }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { pendingElements: [{ row: { Type: 'part', Length: 800, ParentMaterialID: '3011' } }] } });
    expect(s.insert).not.toHaveBeenCalled();
  });
  it('validates weightPerMeter before any Part insertion', () => {
    const s = setup([root], [{ ...rebar, weightPerMeter: undefined }]);
    expect(prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 2' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: 'Invalid weightPerMeter' }] });
    expect(s.insert).not.toHaveBeenCalled();
  });
  it('reports missing Catalog and invalid Catalog types before writes', () => {
    const s = setup();
    s.catalog.resolveTemplate.mockImplementation(() => { throw new Error('Catalog missing'); });
    expect(prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: 'Catalog missing' }] });
    s.catalog.resolveTemplate.mockReturnValue({ ...template('material', true), type: 'invalid' } as unknown as CatalogItem);
    expect(prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: 'Invalid Catalog type' }] });
  });
  it('collects parent and component errors independently', () => {
    const s = setup();
    expect(prepareBOM({ ...input, parentInput: 'bad', specification: 'Бетон; C20/25; -1' }, s.deps)).toMatchObject({ ok: false, errors: [{ code: 'PARENT_INVALID' }, { sourceRowIndex: 0 }] });
  });
  it('retains dependency document lookup and does not mutate returned objects', () => {
    const s = setup([root, { ...part, ProjectDocumentID: 'DEPENDENCY' }]);
    const before = structuredClone(s.elements.getAll());
    const result = prepareBOM({ ...input, specification: 'Арматура; EXISTING; 2' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { pendingElements: [], sourceContext: { searchProjectDocumentIDs: ['DOC', 'DEPENDENCY'] } } });
    if (result.ok && result.prepared.parent.kind === 'existing-element') result.prepared.parent.element.name = 'changed';
    expect(s.elements.getAll()).toEqual(before);
    expect(s.documents.resolve).toHaveBeenCalledWith('DOC');
  });
  it('reuses a Part found by material identity without planning changes to its BOM', () => {
    const s = setup([root, { ...part, Code: 'R_6_A500C_L800', ProjectDocumentID: '', ParentMaterialID: '3011' }]);
    const result = prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 2' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { pendingElements: [], plannedEdges: [
      { child: { kind: 'existing-element', element: { id: '2000000' } }, qty: 2 },
    ] } });
    if (!result.ok) throw new Error('plan expected');
    expect(result.prepared.plannedEdges).toHaveLength(1);
  });
  it('aggregates 1 + 2 Parts but keeps material consumption at 0.46 kg per Part', () => {
    const s = setup([root], [{ ...rebar, weightPerMeter: 0.575 }]);
    const result = prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1\nАрматура; R_6_A500C_L800; 2' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.pendingElements).toHaveLength(1);
    expect(result.prepared.plannedEdges).toHaveLength(2);
    expect(result.prepared.plannedEdges).toMatchObject([
      { parent: { kind: 'existing-element' }, child: { kind: 'pending-element' }, qty: 3, unit: 'шт' },
      { parent: { kind: 'pending-element' }, child: { kind: 'material' }, qty: 0.46, unit: 'кг' },
    ]);
  });
  it.each(['DOC', ''])('reuses repeated existing Parts from document %s without outgoing material edges', projectDocumentID => {
    const s = setup([root, { ...part, Code: 'R_6_A500C_L800', ProjectDocumentID: projectDocumentID }],
      [{ ...rebar, weightPerMeter: 0.575 }]);
    const result = prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1\nАрматура; R_6_A500C_L800; 2' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.pendingElements).toEqual([]);
    expect(result.prepared.plannedEdges).toHaveLength(1);
    expect(result.prepared.plannedEdges[0]).toMatchObject({
      parent: { kind: 'existing-element', element: { id: '4000000' } },
      child: { kind: 'existing-element', element: { id: '2000000' } }, qty: 3, unit: 'шт',
    });
  });
  it('reports context failures and continues collecting component errors', () => {
    const s = setup();
    s.documents.resolve.mockImplementation(() => { throw new Error('Dependency read failed'); });
    expect(prepareBOM({ ...input, specification: 'Бетон; C20/25; -1' }, s.deps)).toMatchObject({ ok: false, errors: [
      { code: 'CONTEXT_INVALID' }, { sourceRowIndex: 0 },
    ] });
  });
  it('rejects missing component fields on every physical line', () => {
    const s = setup();
    expect(prepareBOM({ ...input, specification: 'Бетон\n; ; 2' }, s.deps)).toMatchObject({ ok: false, errors: [
      { sourceRowIndex: 0 }, { sourceRowIndex: 1 },
    ] });
  });
  it('rejects overflow during repeated-edge aggregation', () => {
    const s = setup();
    expect(prepareBOM({ ...input, specification: 'Бетон; C_20_25; 1e308\nБетон; C_20_25; 1e308' }, s.deps))
      .toMatchObject({ ok: false, errors: [{ message: 'Aggregated quantity overflow' }] });
  });
  it.each(['R_6_A500C_L0', 'R_6_A500C_L-800'])('rejects invalid explicit length %s', code => {
    const s = setup();
    expect(prepareBOM({ ...input, specification: `Арматура; ${code}; 1` }, s.deps)).toMatchObject({ ok: false });
  });
});
