import { describe, expect, it, vi } from 'vitest';
import { BOMExplorerService } from '../services/bom-explorer.service';
import { BOMMaterialsService } from '../services/bom-materials.service';
import { InMemoryBOMRepository } from '../repositories/in-memory-bom.repository';
import type { BOMRow } from '../model/bom-row.model';
import type { ElementFull } from '../../elements/element.model';
import type { ElementRepository } from '../../elements/element.repository';
import type { Material } from '../../../domain/materials/material.model';
import type { MaterialRepository } from '../../../domain/materials/material.repository';

const element = (id: string, type: ElementFull['type'], extra: Partial<ElementFull> = {}): ElementFull => ({
  id, code: `E-${id}`, name: `Element ${id}`, prefixName: type, type,
  category: 'rebar', baseUnit: 'шт', isActive: true, createdAt: new Date(0), ...extra,
});
const product = element('4001', 'product');
const assembly = element('3001', 'assembly');
const part = element('2001', 'part', { parentMaterialID: '3014', length: 500 });
const concrete: Material = { id: '3201', code: 'C_20_25', name: 'Бетон C20/25',
  category: 'concrete_mix', profileType: 'concrete', baseUnit: 'м3', isActive: true };
const steel: Material = { id: '3014', code: 'R_12_A500C', name: 'Арматура',
  category: 'rebar', profileType: 'round', baseUnit: 'кг', weightPerMeter: 2, isActive: true };
const edge = (parentId: string, childId: string, qty: number, unit = 'шт'): BOMRow => ({ parentId, childId, qty, unit });
function setup(rows: BOMRow[], elements = [product, assembly, part], materials = [concrete, steel]) {
  const elementRepo = { findById: (id: string) => elements.find(item => item.id === id) ?? null } as ElementRepository;
  const materialRepo = { findById: (id: string) => materials.find(item => item.id === id) ?? null } as MaterialRepository;
  const bom = new InMemoryBOMRepository(rows);
  const readChildren = vi.spyOn(bom, 'getChildrenRows');
  const explorer = new BOMExplorerService(elementRepo, bom, materialRepo);
  return { explorer, service: new BOMMaterialsService(explorer, materialRepo), readChildren };
}

describe('canonical Material nodes in the existing BOM traversal', () => {
  it('reads Product -> concrete without a Material Element or weightPerMeter', () => {
    const s = setup([edge('4001', '3201', 1.317, 'м3')]);
    const child = s.explorer.getTree('4001').children[0];
    expect(child).toMatchObject({ element: { id: '3201', code: 'C_20_25', type: 'material' },
      qty: 1.317, totalQty: 1.317, unit: 'м3', children: [] });
    expect(child.element).not.toHaveProperty('parentMaterialID');
    expect(child.element).not.toHaveProperty('createdAt');
    expect(s.service.getMaterialRequirements('4001')).toEqual([{ materialId: '3201', qty: 1.317, unit: 'м3' }]);
  });

  it('treats Material as terminal in both tree and direct children reads', () => {
    const s = setup([edge('4001', '3201', 1.317, 'м3'), edge('3201', '3201', 9, 'м3')]);
    expect(s.service.getMaterialRequirements('4001')).toEqual([{ materialId: '3201', qty: 1.317, unit: 'м3' }]);
    expect(s.explorer.getChildren('3201')).toEqual([]);
    expect(s.readChildren).not.toHaveBeenCalledWith('3201');
  });

  it('multiplies direct Material quantities through an Assembly and aggregates distinct occurrences', () => {
    const s = setup([edge('4001', '3001', 2), edge('3001', '3201', 1.317, 'м3'), edge('4001', '3201', 0.5, 'м3')]);
    expect(s.service.getMaterialRequirements('4001')).toEqual([{ materialId: '3201', qty: 3.134, unit: 'м3' }]);
  });

  it('preserves legacy Part geometry calculation when no explicit Material edge exists', () => {
    const s = setup([edge('4001', '3001', 2), edge('3001', '2001', 3)]);
    expect(s.service.getMaterialRequirements('4001')).toEqual([{ materialId: '3014', qty: 6, unit: 'кг' }]);
  });

  it('counts Assembly -> Part -> Material once instead of adding derived mass again', () => {
    const s = setup([edge('4001', '3001', 2), edge('3001', '2001', 3), edge('2001', '3014', 0.25, 'кг')]);
    expect(s.service.getMaterialRequirements('4001')).toEqual([{ materialId: '3014', qty: 1.5, unit: 'кг' }]);
  });

  it('retains separate direct and Part-derived uses of the same Material', () => {
    const s = setup([edge('4001', '2001', 3), edge('4001', '3014', 0.5, 'кг')]);
    expect(s.service.getMaterialRequirements('4001')).toEqual([{ materialId: '3014', qty: 3.5, unit: 'кг' }]);
  });

  it('rejects ambiguous Element/Material IDs instead of choosing a catalog silently', () => {
    const s = setup([edge('4001', '3201', 1, 'м3')], [product, element('3201', 'part')]);
    expect(() => s.explorer.getTree('4001')).toThrow('Ambiguous Element/Material ID: 3201');
  });

  it('does not recreate support for noncanonical legacy Material Elements', () => {
    const s = setup([edge('4001', '3401', 1, 'м3')], [product, element('3401', 'material', { parentMaterialID: '3201' })]);
    expect(() => s.explorer.getTree('4001')).toThrow('Legacy Material Element is not canonical: 3401');
  });

  it('does not silently add quantities in different units for one Material', () => {
    const s = setup([edge('4001', '3201', 1, 'м3'), edge('4001', '3001', 1), edge('3001', '3201', 1, 'кг')]);
    expect(() => s.service.getMaterialRequirements('4001')).toThrow('Conflicting units for Material: 3201');
  });
});
