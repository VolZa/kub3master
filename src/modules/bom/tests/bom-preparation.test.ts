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
import { mapPreparedBOMToPhysicalPlan } from '../commit/physical-bom-mapper';
import { PHYSICAL_BOM_HEADERS } from '../commit/physical-bom-schema';
vi.mock('../../../utils/id', () => ({ generateIdByType: vi.fn(() => { throw new Error('ID reservation forbidden'); }) }));
vi.mock('../bom.repository', () => ({
  replaceBOMForParent: vi.fn(), insertBOMRows: vi.fn(), deleteBOMTree: vi.fn(), deleteBOMByParentId: vi.fn(),
}));
const date = new Date('2026-03-01T00:00:00Z');
const root: ElementRow = { ID: '4000000', Code: 'П-1', PrefixName: 'плита', Name: 'Product', Type: 'product',
  Category: 'concrete_mix', BaseUnit: 'шт', ProjectDocumentID: 'DOC', CreatedAt: date };
const part: ElementRow = { ...root, ID: '2000000', Code: 'EXISTING', Type: 'part', PrefixName: 'стержень', ParentMaterialID: '' };
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
    if (prefix.toLowerCase() === 'стержень') return template('part');
    if (prefix.toLowerCase() === 'каркас') return template('assembly');
    if (prefix.toLowerCase() === 'сітка') return template('assembly');
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
    const result = prepareBOM({ ...input, specification: 'Стержень; EXISTING; 2\nБетон; C20/25; 1,169\nАрматура; R_6_A500C_L800; 2' }, s.deps);
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
  it.each([
    ['Сітка; ВСП-П-2.8; ( верхня )', 'ВСП-П-2.8', 'Сітка ВСП-П-2.8 (верхня)'],
    ['Сітка; СП-П-2.8; ( нижня )', 'СП-П-2.8', 'Сітка СП-П-2.8 (нижня)'],
    ['Сітка; СП-П-2.10;', 'СП-П-2.10', 'Сітка СП-П-2.10'],
    ['Сітка; СП-П-2.10;   ', 'СП-П-2.10', 'Сітка СП-П-2.10'],
    ['Сітка; СП-П-2.10', 'СП-П-2.10', 'Сітка СП-П-2.10'],
  ])('preserves parent display name and physical edge codes for %s', (parentInput, code, name) => {
    const s = setup();
    const result = prepareBOM({ ...input, parentInput, specification: 'Стержень; EXISTING; 2' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.pendingElements).toHaveLength(1);
    expect(result.prepared.pendingElements[0].row).toMatchObject({ PrefixName: 'Сітка', Code: code, Name: name });
    const plan = mapPreparedBOMToPhysicalPlan({
      prepared: result.prepared, writerOperationID: 'parent_name_test', headers: [...PHYSICAL_BOM_HEADERS],
      existingRows: [], createdParts: [], bindings: [
        { ref: result.prepared.parent, id: '3000001', code, origin: 'created' },
        { ref: result.prepared.components[0].ref, id: part.ID, code: part.Code, origin: 'existing' },
      ],
    });
    expect(plan.targetRows).toEqual([['3000001', part.ID, 2, 'шт', '', code, part.Code]]);
  });
  it('reuses a parent by Code without renaming its existing display name', () => {
    const existing: ElementRow = { ...root, Code: 'ВСП-П-2.8', PrefixName: 'Сітка', Type: 'assembly', Name: 'Збережена назва' };
    const s = setup([existing, part]);
    const result = prepareBOM({ ...input, parentInput: 'Сітка; ВСП-П-2.8; ( верхня )', specification: 'Стержень; EXISTING; 2' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: {
      parent: { kind: 'existing-element', element: { id: existing.ID, code: existing.Code, name: existing.Name } },
      pendingElements: [],
    } });
  });
  it('deduplicates repeated pending Parts and aggregates edges by parent/child/unit', () => {
    const s = setup([{ ...root, Type: 'assembly', PrefixName: 'каркас' }]);
    const result = prepareBOM({ ...input, parentInput: 'Каркас; П-1', specification: 'Арматура; R_6_A500C_L800; 2\nАрматура; R_6_A500C_L800; 3' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.pendingElements).toHaveLength(1);
    expect(result.prepared.components[0].ref).toEqual(result.prepared.components[1].ref);
    expect(result.prepared.plannedEdges).toMatchObject([{ qty: 5, unit: 'шт' }, { qty: 0.18, unit: 'кг' }]);
  });
  it.each(['4000000', '4000013', '1012'])('reuses root ID %s and legacy/7-digit components', id => {
    const s = setup([{ ...root, ID: id }, { ...part, ID: '4185' }]);
    const result = prepareBOM({ ...input, specification: 'Стержень; EXISTING; 2\nСтержень; EXISTING; 3' }, s.deps);
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
    const s = setup([{ ...root, Type: 'assembly', PrefixName: 'каркас' }], [{ ...rebar, ...dimensions }]);
    const spec = prefix === 'арматура' ? 'R_6_A500C_L800' : prefix === 'кутник' ? 'L100x63x8, L=800' : '5x40x800';
    const result = prepareBOM({ ...input, parentInput: 'Каркас; П-1', specification: `${prefix}; ${spec}; 2` }, s.deps);
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
    s.catalog.resolveTemplate.mockImplementation(prefix => { if (prefix.toLowerCase() === 'плита') return template('product'); throw new Error('Catalog missing'); });
    expect(prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: 'Catalog missing' }] });
    s.catalog.resolveTemplate.mockImplementation(prefix => prefix.toLowerCase() === 'плита' ? template('product') : { ...template('material', true), type: 'invalid' } as unknown as CatalogItem);
    expect(prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: 'Invalid Catalog type' }] });
  });
  it('collects parent and component errors independently', () => {
    const s = setup();
    expect(prepareBOM({ ...input, parentInput: 'bad', specification: 'Бетон; C20/25; -1' }, s.deps)).toMatchObject({ ok: false, errors: [{ code: 'PARENT_INVALID' }, { sourceRowIndex: 0 }] });
  });
  it('retains dependency document lookup and does not mutate returned objects', () => {
    const s = setup([root, { ...part, ProjectDocumentID: 'DEPENDENCY' }]);
    const before = structuredClone(s.elements.getAll());
    const result = prepareBOM({ ...input, specification: 'Стержень; EXISTING; 2' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { pendingElements: [], sourceContext: { searchProjectDocumentIDs: ['DOC', 'DEPENDENCY'] } } });
    if (result.ok && result.prepared.parent.kind === 'existing-element') result.prepared.parent.element.name = 'changed';
    expect(s.elements.getAll()).toEqual(before);
    expect(s.documents.resolve).toHaveBeenCalledWith('DOC');
  });
  it('reuses a Part found by material identity without planning changes to its BOM', () => {
    const s = setup([root, { ...part, Code: 'R_6_A500C_L800', ParentMaterialID: '3011', Diameter: 6, Class: 'A500C', Length: 800, ProfileType: 'round', ProjectDocumentID: '' }]);
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
    const s = setup([root, { ...part, Code: 'R_6_A500C_L800', ParentMaterialID: '3011', Diameter: 6, Class: 'A500C', Length: 800, ProfileType: 'round', ProjectDocumentID: projectDocumentID }],
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
  it.each([false, true])('Product with existing project components and concrete, new root=%s', newRoot => {
    const projectPart: ElementRow = { ...part, Code: 'ГСк-1', ProjectDocumentID: '9', ParentMaterialID: '' };
    const assembly: ElementRow = { ...projectPart, ID: '3000001', Code: 'КП-1', Type: 'assembly', PrefixName: 'каркас' };
    const s = setup([...(newRoot ? [] : [{ ...root, ProjectDocumentID: '9' }]), projectPart, assembly]);
    s.documents.resolve.mockReturnValue(['9']);
    const result = prepareBOM({ ...input, projectDocumentID: '9', specification: 'Стержень; ГСк-1; 1\nСтержень; ГСк-1; 2\nКаркас; КП-1; 1\nБетон; C20/25; 1' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.rootType).toBe('product');
    expect(result.prepared.pendingElements).toHaveLength(newRoot ? 1 : 0);
    expect(result.prepared.writeScope.initializeMaterialBOMFor).toEqual([]);
    expect(result.prepared.plannedEdges).toHaveLength(3);
    expect(result.prepared.plannedEdges[0]).toMatchObject({ qty: 3, child: { element: { id: '2000000', parentMaterialID: '' } } });
    expect(result.prepared.plannedEdges.every(edge => edge.parent === result.prepared.parent)).toBe(true);
    expect(result.prepared.components[0].identity).toMatchObject({ kind: 'project-element', projectDocumentID: '9' });
  });
  it.each(['Стержень; ГСк-1; 1', 'Каркас; КП-1; 1'])('Product rejects absent project component %s', specification => {
    const s = setup([root]);
    expect(prepareBOM({ ...input, specification }, s.deps)).toMatchObject({ ok: false, errors: [{ sourceRowIndex: 0, message: expect.stringContaining('Project Element not found') }] });
  });
  it('selects project identity in the current document and does not cross into unrelated documents', () => {
    const s = setup([root, { ...part, Code: 'ГСк-1', ProjectDocumentID: '9' }, { ...part, ID: '2000001', Code: 'ГСк-1', ProjectDocumentID: '10' }]);
    s.documents.resolve.mockReturnValue(['9']);
    const result = prepareBOM({ ...input, specification: 'Стержень; ГСк-1; 1' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { components: [{ ref: { element: { id: '2000000' } } }] } });
    s.documents.resolve.mockReturnValue(['11']);
    expect(prepareBOM({ ...input, specification: 'Стержень; ГСк-1; 1' }, s.deps)).toMatchObject({ ok: false });
  });
  it('rejects ambiguous project matches and conflicting Types instead of picking the first', () => {
    for (const duplicate of [{ ...part, ID: '2000001' }, { ...part, ID: '3000001', Type: 'assembly' as const }]) {
      const s = setup([root, part, duplicate]);
      expect(prepareBOM({ ...input, specification: 'Стержень; EXISTING; 1' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: expect.stringContaining('Ambiguous') }] });
    }
    const s = setup([root, { ...part, Type: 'assembly' }]);
    expect(prepareBOM({ ...input, specification: 'Стержень; EXISTING; 1' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: expect.stringContaining('Conflicting') }] });
  });
  it('Product reuses canonical material Part 4001 without scheduling its BOM', () => {
    const material = { ...rebar, id: '3014', code: 'R_12_A500C', diameter: 12 };
    const materialPart: ElementRow = { ...part, ID: '4001', Code: 'r_12_a500c_l400', ProjectDocumentID: '', ParentMaterialID: '3014', Diameter: 12, Class: 'A500C', Length: 400, ProfileType: 'round' };
    const s = setup([root, materialPart], [material]);
    const result = prepareBOM({ ...input, specification: 'Арматура; R_12_A500C_L400; 2' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { pendingElements: [], writeScope: { initializeMaterialBOMFor: [] }, components: [{ identity: { kind: 'material-part', materialID: '3014' }, ref: { element: { id: '4001' } } }], plannedEdges: [{ qty: 2 }] } });
    if (!result.ok) throw new Error('plan expected');
    expect(result.prepared.plannedEdges).toHaveLength(1);
  });
  it.each(['material', 'geometry', 'type', 'class', 'profile', 'duplicate'])('rejects conflicting material Part %s without planning a duplicate', conflict => {
    const stored: ElementRow = { ...part, Code: 'R_6_A500C_L800', ProjectDocumentID: '', ParentMaterialID: '3011', Diameter: 6, Class: 'A500C', Length: 800, ProfileType: 'round' };
    if (conflict === 'material') stored.ParentMaterialID = '3014';
    if (conflict === 'geometry') stored.Length = 400;
    if (conflict === 'type') stored.Type = 'assembly';
    if (conflict === 'class') stored.Class = 'A240';
    if (conflict === 'profile') stored.ProfileType = 'plate';
    const s = setup([root, stored, ...(conflict === 'duplicate' ? [{ ...stored, ID: '2000001' }] : [])]);
    const result = prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps);
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty('prepared');
  });
  it('does not identify a material Part by Code alone when a project Part has that Code', () => {
    const s = setup([root, { ...part, Code: 'R_6_A500C_L800', ProjectDocumentID: 'DOC' }]);
    expect(prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps)).toMatchObject({ ok: false });
  });
  it('rejects ambiguous canonical materials for a new material Part', () => {
    const s = setup([root], [rebar, { ...rebar, id: '3014', code: 'OTHER' }]);
    expect(prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps)).toMatchObject({ ok: false, errors: [{ message: expect.stringContaining('Ambiguous canonical Material') }] });
  });
  it('limits Product write scope to root and initial material links of new Parts', () => {
    const s = setup([root], [{ ...rebar, weightPerMeter: 0.575 }]);
    const result = prepareBOM({ ...input, specification: 'Арматура; R_6_A500C_L800; 1\nАрматура; R_6_A500C_L800; 2' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.rootType).toBe('product');
    const pendingKey = result.prepared.pendingElements[0].localKey;
    expect(result.prepared.writeScope).toEqual({ root: result.prepared.parent, initializeMaterialBOMFor: [pendingKey] });
    expect(result.prepared.plannedEdges).toMatchObject([{ qty: 3 }, { qty: 0.46 }]);
    expect(result.prepared.plannedEdges.every(edge => edge.parent === result.prepared.parent ||
      (edge.parent.kind === 'pending-element' && edge.parent.localKey === pendingKey))).toBe(true);
  });
  it.each([false, true])('separately describes project root Part without mandatory material, new=%s', isNew => {
    const rootPart: ElementRow = { ...part, Code: 'ГСк-1', ProjectDocumentID: '9' };
    const s = setup(isNew ? [] : [rootPart]);
    s.documents.resolve.mockReturnValue(['9']);
    const result = prepareBOM({ parentInput: 'Стержень; ГСк-1', projectDocumentID: '9', specification: 'Арматура; R_6_A500C_L800; 1' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.rootType).toBe('part');
    expect(result.prepared.parent.kind).toBe(isNew ? 'pending-element' : 'existing-element');
    if (isNew) expect(result.prepared.pendingElements[0].row.ParentMaterialID).toBeUndefined();
    expect(result.prepared.writeScope.initializeMaterialBOMFor).toHaveLength(1);
  });
  it('plans a new Assembly root and a new material Part without changing the Product policy', () => {
    const s = setup([]);
    const result = prepareBOM({ ...input, parentInput: 'Каркас; КП-1', specification: 'Арматура; R_6_A500C_L800; 2' }, s.deps);
    expect(result).toMatchObject({ ok: true, prepared: { rootType: 'assembly', pendingElements: [
      { row: { Type: 'assembly', Code: 'КП-1' } }, { row: { Type: 'part', ParentMaterialID: '3011' } },
    ] } });
  });
  it('rejects ambiguous roots and project Parts with conflicting material origin', () => {
    const ambiguous = setup([root, { ...root, ID: '4000001' }]);
    expect(prepareBOM(input, ambiguous.deps)).toMatchObject({ ok: false, errors: [{ code: 'PARENT_INVALID', message: expect.stringContaining('Ambiguous') }] });
    const conflicting = setup([root, { ...part, ParentMaterialID: '3011' }]);
    expect(prepareBOM({ ...input, specification: 'Стержень; EXISTING; 1' }, conflicting.deps))
      .toMatchObject({ ok: false, errors: [{ message: expect.stringContaining('Conflicting project') }] });
  });
  it.each(['product', 'assembly', 'part'] as const)('reuses a shared material Part under another %s and document', type => {
    const shared: ElementRow = { ...part, ID: '4001', Code: 'R_12_A500C_L400', ParentMaterialID: '3014',
      ProjectDocumentID: '', Diameter: 12, Class: 'A500C', Length: 400, ProfileType: 'round' };
    const otherRoot = { ...root, ID: '4000013', Code: 'OTHER', Type: type, ProjectDocumentID: 'OTHER-DOC' };
    const s = setup([root, otherRoot, shared], [{ ...rebar, id: '3014', diameter: 12 }]);
    s.documents.resolve.mockReturnValue(['OTHER-DOC']);
    const prefix = type === 'product' ? 'Плита' : type === 'assembly' ? 'Каркас' : 'Стержень';
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = prepareBOM({ parentInput: `${prefix}; OTHER`, projectDocumentID: 'OTHER-DOC',
        specification: 'Арматура; R_12_A500C_L400; 4' }, s.deps);
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(result.prepared.pendingElements).toEqual([]);
      expect(result.prepared.writeScope.initializeMaterialBOMFor).toEqual([]);
      expect(result.prepared.plannedEdges).toHaveLength(1);
      expect(result.prepared.plannedEdges[0]).toMatchObject({ parent: { element: { id: '4000013' } },
        child: { element: { id: '4001', length: 400, diameter: 12, className: 'A500C' } }, qty: 4 });
    }
  });
  it.each([false, true])('changes Product from old Part to new Part without changing former components, new exists=%s', exists => {
    const oldPart: ElementRow = { ...part, ID: '4001', Code: 'R_12_A500C_L400', ParentMaterialID: '3014',
      ProjectDocumentID: '', Diameter: 12, Class: 'A500C', Length: 400, ProfileType: 'round' };
    const newPart: ElementRow = { ...oldPart, ID: '4002', Code: 'R_14_A500C_L500', ParentMaterialID: '3015', Diameter: 14, Length: 500 };
    const otherProduct = { ...root, ID: '4000001', Code: 'П-2' };
    const s = setup([root, otherProduct, oldPart, ...(exists ? [newPart] : [])],
      [{ ...rebar, id: '3014', diameter: 12 }, { ...rebar, id: '3015', diameter: 14 }]);
    const before = prepareBOM({ ...input, specification: 'Арматура; R_12_A500C_L400; 4' }, s.deps);
    expect(before).toMatchObject({ ok: true, prepared: { plannedEdges: [{ child: { element: { id: '4001' } } }] } });
    const result = prepareBOM({ ...input, specification: 'Арматура; R_14_A500C_L500; 4' }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.pendingElements).toHaveLength(exists ? 0 : 1);
    expect(result.prepared.plannedEdges).toHaveLength(exists ? 1 : 2);
    expect(result.prepared.plannedEdges.some(edge => edge.parent.kind === 'existing-element' && edge.parent.element.id !== root.ID)).toBe(false);
    expect(result.prepared.plannedEdges.some(edge => edge.child.kind === 'existing-element' && edge.child.element.id === oldPart.ID)).toBe(false);
    expect(result.prepared.writeScope.initializeMaterialBOMFor).toHaveLength(exists ? 0 : 1);
    if (exists) expect(result.prepared.plannedEdges[0].child).toMatchObject({ element: { id: '4002' } });
    expect(s.elements.findById('4001')).toMatchObject({ code: oldPart.Code, length: 400, diameter: 12, parentMaterialID: '3014' });
    expect(s.elements.findById(otherProduct.ID)).not.toBeNull();
    // No removal/cleanup instructions are part of the Prepare contract.
    expect(result.prepared).not.toHaveProperty('deletedElements');
    expect(result.prepared).not.toHaveProperty('orphanCleanup');
  });
  it.each([
    ['R_14_A500C_L400', { id: '3015', diameter: 14, class: 'A500C' }],
    ['R_12_A500C_L500', { id: '3014', diameter: 12, class: 'A500C' }],
    ['R_12_A240_L400', { id: '3016', diameter: 12, class: 'A240' }],
  ])('treats identity change %s as a different Part instead of modifying the old one', (code, material) => {
    const oldPart: ElementRow = { ...part, ID: '4001', Code: 'R_12_A500C_L400', ParentMaterialID: '3014',
      ProjectDocumentID: '', Diameter: 12, Class: 'A500C', Length: 400, ProfileType: 'round' };
    const s = setup([root, oldPart], [{ ...rebar, ...material }]);
    const result = prepareBOM({ ...input, specification: `Арматура; ${code}; 4` }, s.deps);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.prepared.pendingElements).toHaveLength(1);
    expect(result.prepared.pendingElements[0].row.Code).toBe(code);
    expect(result.prepared.plannedEdges[0].child.kind).toBe('pending-element');
    expect(s.elements.findById('4001')).toMatchObject({ code: oldPart.Code, diameter: 12, length: 400, className: 'A500C' });
  });
});
