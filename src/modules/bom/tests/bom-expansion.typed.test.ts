/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/bom-expansion.typed.test.ts
 * Module: BOM
 * Layer: Automated Domain / Presentation Test
 * Responsibility: verify typed recursive expansion and preserved presentation without Google Sheets.
 */
import { describe, expect, it, vi } from 'vitest';
import { BOMExpansionService } from '../expansion/bom-expansion.service';
import { componentId } from '../expansion/bom-expansion.model';
import type { BOMExpansionInput, BOMExpansionResult, ExpandedBOMLine } from '../expansion/bom-expansion.model';
import type { ElementFull } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';
import type { BOMRow } from '../model/bom-row.model';
import { BOMVerticalReportService } from '../../reports/bom-vertical/bom-vertical-report.service';
import { BOMProductSpecificationService } from '../specification/bom-product-specification.service';
import { ProductSpecificationService } from '../specification/product-specification.service';
import { ProductSpecificationReportService } from '../../reports/product-specification/product-specification-report.service';
import type { CatalogItem } from '../../catalog/catalog.model';

const date = new Date('2026-10-12');
function element(id: string, type: ElementFull['type'], extra: Partial<ElementFull> = {}): ElementFull {
  return { id, type, code: id, name: id, prefixName: 'product', category: '', baseUnit: 'шт',
    isActive: true, createdAt: new Date(date), ...extra };
}
function material(id = '3201', extra: Partial<Material> = {}): Material {
  return { id, code: 'C_20_25', name: 'Concrete', category: 'concrete_mix', profileType: 'concrete',
    baseUnit: 'м3', isActive: true, ...extra };
}
const product = () => element('1012', 'product', { code: 'P-1.5' });
const part = () => element('4185', 'part', { code: 'R_14_A500C_L800', length: 800, parentMaterialID: '3015' });
const edge = (parentId: string, childId: string, qty: number, unit = 'шт'): BOMRow => ({ parentId, childId, qty, unit });
function setup(input: Partial<BOMExpansionInput> = {}, hasBOM = true) {
  const snapshot: BOMExpansionInput = { rows: [], elements: [product()], materials: [], ...input };
  const resolveTemplate = vi.fn((_prefix: string): CatalogItem => ({ id: 1, typeCode: 'product', name: 'Product',
    type: 'product', category: '', hasBOM, productionType: 'assembly' as CatalogItem['productionType'], supportsLength: false }));
  return { snapshot, resolveTemplate, service: new BOMExpansionService(snapshot, { resolveTemplate }) };
}
function lines(result: BOMExpansionResult): readonly ExpandedBOMLine[] {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.lines;
}
function failure(result: BOMExpansionResult, code: string) {
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('lines');
  expect(result).not.toHaveProperty('root');
  if (!result.ok) expect(result.diagnostics.map((d) => d.code)).toContain(code);
}
function chain() {
  return setup({ elements: [product(), element('2001', 'assembly'), part()], materials: [material('3015')],
    rows: [edge('1012', '2001', 2), edge('2001', '4185', 3), edge('4185', '3015', 0.71, 'кг')] });
}

describe('typed BOMExpansionService', () => {
  it('expands concrete 3201 with 1.169 and preserves BOM unit and source position', () => {
    const s = setup({ rows: [edge('1012', '3201', 1.169, 'м3')], materials: [material()] });
    const row = lines(s.service.expandProduct('1012'))[0];
    expect(row).toMatchObject({ occurrenceIndex: 0, parentOccurrenceIndex: null, level: 1, totalQty: 1.169,
      edge: { sourceRowIndex: 0, directQty: 1.169, unit: 'м3', child: { kind: 'MATERIAL', materialId: '3201' } } });
    expect(row.path.map(componentId)).toEqual(['1012', '3201']);
    expect(s.resolveTemplate).not.toHaveBeenCalled();
  });
  it('expands Product -> Assembly -> Part and multiplies for one Product only', () => {
    const s = setup({ elements: [product(), element('2001', 'assembly'), part()],
      rows: [edge('1012', '2001', 2), edge('2001', '4185', 3)] });
    const result = lines(s.service.expandProduct('1012'));
    expect(result.map((r) => r.totalQty)).toEqual([2, 6]);
    expect(result[1].edge.child).toMatchObject({ kind: 'ELEMENT', element: { length: 800, parentMaterialID: '3015' } });
  });
  it('keeps PART and its kg Material edge, without geometry conversion', () => {
    const result = lines(chain().service.expandProduct('1012'));
    expect(result.map((r) => r.totalQty)).toEqual([2, 6, 4.26]);
    expect(result[2]).toMatchObject({ occurrenceIndex: 2, parentOccurrenceIndex: 1,
      edge: { directQty: 0.71, unit: 'кг', parent: { elementId: '4185' }, child: { materialId: '3015' } } });
    expect(result[1].edge.child).toMatchObject({ element: { length: 800 } });
  });
  it('links each typed path and occurrence to its actual parent', () => {
    const result = lines(chain().service.expandProduct('1012'));
    expect(result.map((r) => [r.occurrenceIndex, r.parentOccurrenceIndex, r.level])).toEqual([[0, null, 1], [1, 0, 2], [2, 1, 3]]);
    expect(result[2].path.map((r) => r.kind)).toEqual(['ELEMENT', 'ELEMENT', 'ELEMENT', 'MATERIAL']);
    expect(result[2].path.map(componentId)).toEqual(['1012', '2001', '4185', '3015']);
  });
  it('preserves two paths to the same PART: migrated manual totals 34 and 10', () => {
    const s = setup({ elements: [product(), element('2012', 'assembly'), element('2016', 'assembly'), part()],
      materials: [material('3015')], rows: [edge('1012', '2012', 34), edge('1012', '2016', 10),
        edge('2012', '4185', 1), edge('2016', '4185', 1), edge('4185', '3015', 0.71, 'кг')] });
    const result = lines(s.service.expandProduct('1012'));
    const parts = result.filter((r) => componentId(r.edge.child) === '4185');
    expect(parts.map((r) => r.totalQty)).toEqual([34, 10]);
    expect(parts.map((r) => r.parentOccurrenceIndex)).toEqual([0, 3]);
    expect(new Set(result.map((r) => r.occurrenceIndex)).size).toBe(6);
    expect(parts[0].path.map(componentId)).toEqual(['1012', '2012', '4185']);
    expect(parts[1].path.map(componentId)).toEqual(['1012', '2016', '4185']);
  });
  it('reports a cycle with its path and snapshot row index', () => {
    const s = setup({ elements: [product(), element('2001', 'assembly')],
      rows: [edge('1012', '2001', 1), edge('2001', '1012', 1)] });
    const result = s.service.expandProduct('1012'); failure(result, 'CYCLE');
    expect(result).toMatchObject({ diagnostics: [{ path: ['1012', '2001', '1012'], sourceRowIndex: 1 }] });
  });
  it.each(['', '  ', null])('rejects an invalid ChildID %s', (childId) => {
    const row = { ...edge('1012', '3201', 1), childId } as unknown as BOMRow;
    failure(setup({ rows: [row] }).service.expandProduct('1012'), 'INVALID_REFERENCE');
  });
  it('reports a missing referenced component', () => {
    failure(setup({ rows: [edge('1012', '9999', 1)] }).service.expandProduct('1012'), 'REFERENCE_NOT_FOUND');
  });
  it('rejects legacy material Elements', () => {
    failure(setup({ elements: [product(), element('3403', 'material')], rows: [edge('1012', '3403', 1)] })
      .service.expandProduct('1012'), 'LEGACY_MATERIAL_ELEMENT');
  });
  it('reports cross-catalog collision', () => {
    failure(setup({ elements: [product(), element('3201', 'part')], materials: [material()],
      rows: [edge('1012', '3201', 1)] }).service.expandProduct('1012'), 'AMBIGUOUS_REFERENCE');
  });
  it.each(['ELEMENTS', 'MATERIALS'])('rejects referenced duplicate IDs in %s', (source) => {
    const input = source === 'ELEMENTS'
      ? { elements: [product(), part(), part()], rows: [edge('1012', '4185', 1)] }
      : { materials: [material(), material()], rows: [edge('1012', '3201', 1)] };
    failure(setup(input).service.expandProduct('1012'), 'DUPLICATE_ID');
  });
  it('does not block valid expansion on unrelated catalog errors', () => {
    const s = setup({ elements: [product(), part(), part(), element('', 'assembly')], materials: [material()],
      rows: [edge('1012', '3201', 1)] });
    const result = s.service.expandProduct('1012');
    expect(result.ok).toBe(true);
    expect(s.service.indexingDiagnostics.map((d) => d.code)).toEqual(['INVALID_REFERENCE', 'DUPLICATE_ID']);
    expect(result.indexingDiagnostics).toEqual(s.service.indexingDiagnostics);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid direct quantity %s', (qty) => {
    failure(setup({ materials: [material()], rows: [edge('1012', '3201', qty)] }).service.expandProduct('1012'), 'INVALID_QUANTITY');
  });
  it('rejects overflow in multiplication', () => {
    failure(setup({ elements: [product(), element('2001', 'assembly'), part()],
      rows: [edge('1012', '2001', 1e308), edge('2001', '4185', 1e308)] }).service.expandProduct('1012'), 'INVALID_QUANTITY');
  });
  it('rejects underflow to zero in multiplication', () => {
    failure(setup({ elements: [product(), element('2001', 'assembly'), part()],
      rows: [edge('1012', '2001', Number.MIN_VALUE), edge('2001', '4185', Number.MIN_VALUE)] }).service.expandProduct('1012'), 'INVALID_QUANTITY');
  });
  it('rejects Material with child edges', () => {
    failure(setup({ elements: [product(), part()], materials: [material()],
      rows: [edge('1012', '3201', 1), edge('3201', '4185', 1)] }).service.expandProduct('1012'), 'MATERIAL_HAS_CHILDREN');
  });
  it('reports EMPTY_BOM using the actual Catalog flag', () => {
    const s = setup(); failure(s.service.expandProduct('1012'), 'EMPTY_BOM');
    expect(s.resolveTemplate).toHaveBeenCalledWith('product');
  });
  it('permits empty BOM only with Catalog.HasBOM=false', () => {
    expect(setup({}, false).service.expandProduct('1012')).toMatchObject({ ok: true, lines: [] });
  });
  it('does not guess HasBOM when Catalog cannot identify a template', () => {
    const s = setup(); s.resolveTemplate.mockImplementation(() => { throw new Error('No template'); });
    failure(s.service.expandProduct('1012'), 'CATALOG_RULE_UNAVAILABLE');
  });
  it('does not treat missing Catalog.HasBOM as false', () => {
    const s = setup();
    s.resolveTemplate.mockImplementation(() => ({ hasBOM: undefined } as unknown as CatalogItem));
    failure(s.service.expandProduct('1012'), 'CATALOG_RULE_UNAVAILABLE');
  });
  it('sees inactive Materials', () => {
    const result = setup({ materials: [material('3201', { isActive: false })], rows: [edge('1012', '3201', 1)] })
      .service.expandProduct('1012');
    expect(lines(result)[0].edge.child).toMatchObject({ material: { isActive: false } });
  });
  it('never exposes partial lines when a later branch fails', () => {
    failure(setup({ materials: [material()], rows: [edge('1012', '3201', 1), edge('1012', 'missing', 1)] })
      .service.expandProduct('1012'), 'REFERENCE_NOT_FOUND');
  });
  it('does not mutate frozen snapshots and repeats deterministically', () => {
    const input = { elements: Object.freeze([Object.freeze(product()), Object.freeze(part())]),
      materials: Object.freeze([Object.freeze(material())]), rows: Object.freeze([Object.freeze(edge('1012', '3201', 1))]) };
    const s = setup(input); const first = s.service.expandProduct('1012');
    expect(s.service.expandProduct('1012')).toEqual(first);
    expect(input.rows[0].qty).toBe(1);
  });
  it('copies input BOM rows and catalog components into snapshots', () => {
    const row = edge('1012', '3201', 1); const m = material();
    const s = setup({ rows: [row], materials: [m] }); row.qty = 99; m.code = 'changed';
    expect(lines(s.service.expandProduct('1012'))[0]).toMatchObject({ totalQty: 1, edge: { child: { material: { code: 'C_20_25' } } } });
  });
  it('preserves edge unit instead of replacing it with Material.baseUnit', () => {
    const result = setup({ materials: [material('3201', { baseUnit: 'кг' })], rows: [edge('1012', '3201', 1.169, 'м3')] })
      .service.expandProduct('1012');
    expect(lines(result)[0].edge.unit).toBe('м3');
  });
  it.each(['missing', '', null])('rejects invalid or missing root %s', (id) => {
    const result = setup().service.expandProduct(id);
    expect(result.ok).toBe(false); expect(result).not.toHaveProperty('lines');
  });
  it('checks root collisions before validating Product type', () => {
    failure(setup({ materials: [material('1012')] }).service.expandProduct('1012'), 'AMBIGUOUS_REFERENCE');
  });
  it('rejects non-Product roots', () => {
    failure(setup({ elements: [part()] }).service.expandProduct('4185'), 'INVALID_ROOT');
  });
  it('retains snapshot row indexes and normalizes IDs without numeric conversion', () => {
    const s = setup({ materials: [material()], rows: [edge('elsewhere', 'missing', 1), edge(' 1012 ', ' 3201 ', 1)] });
    const result = lines(s.service.expandProduct(' 1012 '));
    expect(result[0].edge.sourceRowIndex).toBe(1);
    expect(result[0].path.map(componentId)).toEqual(['1012', '3201']);
  });
  it('forwards ChildCode mismatches from Resolver', () => {
    failure(setup({ materials: [material()], rows: [{ ...edge('1012', '3201', 1), childCode: 'OTHER' }] })
      .service.expandProduct('1012'), 'CODE_MISMATCH');
  });
});

describe('typed Expansion presentation', () => {
  it('preserves repeated occurrences and hierarchy in vertical BOM', () => {
    const result = lines(chain().service.expandProduct('1012'));
    const rows = new BOMVerticalReportService().buildRows(result);
    expect(rows.map((r) => r.level)).toEqual([1, 2, 3]);
    expect(rows[2]).toMatchObject({ parentId: '4185', elementId: '3015', elementType: 'material', directQty: 0.71, totalQty: 4.26,
      unit: 'кг', path: ['1012', '2001', '4185', '3015'] });
  });
  it('reuses shared specification grouping and uses root metadata directly', () => {
    const s = chain(); const specification = new ProductSpecificationService(s.service).getSpecification('1012');
    expect(specification).toMatchObject({ productId: '1012', productCode: 'P-1.5',
      assemblies: [{ elementId: '2001', qty: 2 }], parts: [{ elementId: '4185', qty: 6 }],
      materials: [{ elementId: '3015', qty: 4.26 }] });
    expect(new ProductSpecificationReportService().buildRows(specification).map((r) => r.section)).toEqual(['assembly', 'part', 'material']);
  });
  it('aggregates migrated manual repeated PART totals to 44 without changing expansion', () => {
    const s = setup({ elements: [product(), element('2012', 'assembly'), element('2016', 'assembly'), part()],
      rows: [edge('1012', '2012', 34), edge('1012', '2016', 10), edge('2012', '4185', 1), edge('2016', '4185', 1)] });
    const result = lines(s.service.expandProduct('1012'));
    const specification = new BOMProductSpecificationService().aggregate(result);
    expect(specification.find((r) => r.elementId === '4185')?.qty).toBe(44);
    expect(new BOMVerticalReportService().buildRows(result).filter((r) => r.elementId === '4185')).toHaveLength(2);
  });
  it('keeps different units separate for one Material', () => {
    const s = setup({ materials: [material()], rows: [edge('1012', '3201', 1, 'м3'), edge('1012', '3201', 2, 'кг')] });
    expect(new ProductSpecificationService(s.service).getSpecification('1012').materials.map((r) => [r.qty, r.unit]))
      .toEqual([[1, 'м3'], [2, 'кг']]);
  });
  it('presents Catalog-approved empty product without first-row assumptions', () => {
    expect(new ProductSpecificationService(setup({}, false).service).getSpecification('1012')).toEqual({
      productId: '1012', productCode: 'P-1.5', assemblies: [], parts: [], materials: [],
    });
  });
  it('does not present failed expansion as a successful specification', () => {
    expect(() => new ProductSpecificationService(setup().service).getSpecification('1012')).toThrow('EMPTY_BOM');
  });
});
