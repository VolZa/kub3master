import { expect, it } from 'vitest';
import type { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import type { ElementFull } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';
import type { BOMRow } from '../../bom/model/bom-row.model';
import type { CatalogItem } from '../../catalog/catalog.model';
import { BOMExpansionService } from '../../bom/expansion/bom-expansion.service';
import { MaterialConsumptionReportUseCase } from './material-consumption-report.use-case';
import { GroupedByProductPresenter } from './grouped-by-product.presenter';

const request = { lossPercents: { rebar: 7, rolled: 2.5, concrete: 0 } };
const product = (id: string, code = id, doc = 'D1'): ElementFull => ({ id, code, name: code,
  type: 'product', projectDocumentID: doc, prefixName: 'Product', category: '', baseUnit: 'шт', isActive: true, createdAt: new Date(0) });
const fact = (id: string, extra: Partial<Manufacturing> = {}): Manufacturing => ({ id,
  date: new Date('2026-10-20T21:30:00Z'), shift: '1', houseCode: 'H001', productCode: 'P1', quantity: 2,
  status: 'ACTIVE', master: '', comment: '', createdAt: new Date(0), updatedAt: new Date(0), ...extra });
const material = (id: string, category: Material['category'], unit = 'кг'): Material => ({ id, code: id,
  name: id, category, profileType: 'round', baseUnit: unit, isActive: true });
const edge = (parentId: string, childId: string, qty: number, unit = 'кг'): BOMRow => ({ parentId, childId, qty, unit });
function setup(facts = [fact('M1')], products = [product('P1'), product('P2')], rows = [
  edge('P1', 'R', 0.123456789), edge('P1', 'S', 4), edge('P1', '3201', 0.5, 'м3'), edge('P2', 'R', 1),
]) {
  const materials = [material('R', 'rebar'), material('S', 'plate'), material('3201', 'concrete_mix', 'м3')];
  const expansion = new BOMExpansionService({ elements: products, materials, rows }, {
    resolveTemplate: () => ({ hasBOM: true } as CatalogItem),
  });
  const sources = { manufacturing: { getAll: () => facts },
    houses: { findByCode: (code: string) => code ? { projectID: 'PROJECT' } as any : undefined },
    documents: { findByProjectID: () => [{ id: 'D1' }, { id: 'D2' }] as any },
    elements: { findByTypeInDocuments: (_type: unknown, docs: readonly string[]) => products.filter(p => docs.includes(p.projectDocumentID!)) },
    materials: { findById: (id: string) => materials.find(m => m.id === id) ?? null }, expansion };
  return { useCase: new MaterialConsumptionReportUseCase(sources), sources, facts, products, rows, materials };
}

it('includes ACTIVE only, sums distinct facts and keeps products separate with independent losses', () => {
  const s = setup([fact('M1'), fact('M2', { quantity: 3 }), fact('M3', { status: 'CANCELLED', quantity: 100 }), fact('M4', { productCode: 'P2', quantity: 1 })]);
  const result = s.useCase.execute(request);
  expect(result.products.map(p => p.productQty)).toEqual([5, 1]);
  expect(result.products[0].manufacturingIds).toEqual(['M1', 'M2']);
  expect(result.products[0].materials.map(m => m.lossPercent)).toEqual([7, 2.5, 0]);
  expect(result.products[0].materials[0].baseQty).toBe(0.123456789 * 5);
  expect(result.products[0].materials[0].totalQty).toBeCloseTo(0.123456789 * 5 * 1.07, 12);
  expect(result.products[0].materials[2]).toMatchObject({ materialId: '3201', unit: 'м3', baseQty: 2.5, totalQty: 2.5 });
  expect(result.products[1].materials[0].baseQty).toBe(1);
});

it('filters house/product and inclusive Kyiv calendar days across UTC midnight', () => {
  const s = setup([fact('M1'), fact('M2', { houseCode: 'H002' }), fact('M3', { date: new Date('2026-10-20T20:59:59Z') })]);
  const r = s.useCase.execute({ ...request, houseCode: 'H001', productCode: 'P1', dateFrom: '2026-10-21', dateTo: '2026-10-21' });
  expect(r.products[0].manufacturingIds).toEqual(['M1']);
  expect(r.period.dateFrom).toBe('2026-10-21');
  const view = new GroupedByProductPresenter().present(r);
  expect(view.dateFrom).toBe('21-10-2026');
  expect(view.groups[0].rows).toEqual(r.products[0].materials);
  expect(view.groups[0].rows).not.toBe(r.products[0].materials);
});

it('rejects duplicate Manufacturing IDs rather than doubling consumption', () => {
  expect(() => setup([fact('M1'), fact('M1')]).useCase.execute(request)).toThrow('DUPLICATE_MANUFACTURING_ID');
});
it('rejects ambiguous product codes across project documents', () => {
  expect(() => setup(undefined, [product('P1'), product('OTHER', 'P1', 'D2')]).useCase.execute(request)).toThrow('AMBIGUOUS_PRODUCT_CODE');
});
it('does not silently drop unresolved products or facts without house', () => {
  expect(() => setup([fact('M1', { productCode: 'missing' })]).useCase.execute(request)).toThrow('PRODUCT_NOT_FOUND');
  expect(() => setup([fact('M1', { houseCode: '' })]).useCase.execute(request)).toThrow('HOUSE_NOT_FOUND');
});
it('aggregates by MaterialID plus exact Unit within each product only', () => {
  const s = setup(undefined, undefined, [edge('P1', 'R', 1), edge('P1', 'R', 2), edge('P1', 'R', 4, 'г')]);
  expect(s.useCase.execute(request).products[0].materials.map(m => [m.unit, m.baseQty])).toEqual([['кг', 6], ['г', 8]]);
});
it('returns empty dataset and still validates norms', () => {
  expect(setup([]).useCase.execute(request).products).toEqual([]);
  expect(() => setup([]).useCase.execute({ lossPercents: {} as any })).toThrow('MISSING_LOSS_NORM');
});
it('fails incomplete references, empty BOM, and terminal Elements without inventing material', () => {
  expect(() => setup(undefined, undefined, [edge('P1', 'missing', 1)]).useCase.execute(request)).toThrow('INCOMPLETE_BOM');
  expect(() => setup(undefined, undefined, []).useCase.execute(request)).toThrow('INCOMPLETE_BOM');
  const part = { ...product('PART'), type: 'part' as const, parentMaterialID: 'R', length: 1000 };
  expect(() => setup(undefined, [product('P1'), part], [edge('P1', 'PART', 1, 'шт')]).useCase.execute(request)).toThrow('INCOMPLETE_BOM');
});
it('uses the existing expansion for Assembly/Part/Material paths and counts explicit material once', () => {
  const assembly = { ...product('A'), type: 'assembly' as const };
  const part = { ...product('PART'), type: 'part' as const, parentMaterialID: 'R' };
  const s = setup(undefined, [product('P1'), assembly, part], [edge('P1', 'A', 3, 'шт'), edge('A', 'PART', 2, 'шт'), edge('PART', 'R', 0.5)]);
  expect(s.useCase.execute(request).products[0].materials[0].baseQty).toBe(6);
});
it('does not mutate sources and never compounds losses across executions or presentation', () => {
  const s = setup();
  const before = JSON.stringify([s.facts, s.products, s.rows, s.materials, request]);
  const first = s.useCase.execute(request);
  new GroupedByProductPresenter().present(first);
  expect(s.useCase.execute(request)).toEqual(first);
  expect(JSON.stringify([s.facts, s.products, s.rows, s.materials, request])).toBe(before);
});
it('rejects invalid periods, dates and quantities', () => {
  const s = setup();
  expect(() => s.useCase.execute({ ...request, dateFrom: '2026-02-30' })).toThrow('INVALID_REPORT_DATE');
  expect(() => s.useCase.execute({ ...request, dateFrom: '2026-10-22', dateTo: '2026-10-21' })).toThrow('INVALID_REPORT_PERIOD');
  expect(() => setup([fact('M1', { quantity: NaN })]).useCase.execute(request)).toThrow('INVALID_MANUFACTURING_QUANTITY');
});

it('filters unrelated unresolved products before resolver and fails included unresolved facts', () => {
  const s = setup([fact('M1'), fact('OTHER', { houseCode: 'H002', productCode: 'missing' })]);
  expect(s.useCase.execute({ ...request, houseCode: 'H001', productCode: 'P1' }).products).toHaveLength(1);
  expect(() => s.useCase.execute({ ...request, houseCode: 'H002' })).toThrow('PRODUCT_NOT_FOUND');
});
