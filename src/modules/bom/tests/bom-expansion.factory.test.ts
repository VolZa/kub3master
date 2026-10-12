/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/bom-expansion.factory.test.ts
 * Module: BOM
 * Layer: Automated Application Composition Test
 * Responsibility: verify complete snapshots using mocked data sources, including inactive Materials and PART geometry.
 */
import { describe, expect, it, vi } from 'vitest';
import { getBOMExpansionService } from '../../../app/factories/bom-expansion.factory';
import { mapElementRowToDomain } from '../../elements/element.mapper';
import type { ElementFull, ElementRow } from '../../elements/element.model';

const fixture = vi.hoisted(() => ({ elements: [] as ElementFull[] }));
vi.mock('../../../app/factories/element.factory', () => ({
  getElementRepository: () => ({ findByType: (type: string) => fixture.elements.filter((e) => e.type === type) }),
}));
vi.mock('../../../app/factories/catalog.factory', () => ({
  getCatalogRepository: () => ({ getAll: () => [{ typeCode: 'product', hasBOM: true }] }),
}));
vi.mock('../../../app/factories/infrastructure.factory', () => ({ sheetProvider: {} }));
vi.mock('../bom.repository', () => ({ getAllBOMRows: () => [{ parentId: '1012', childId: '3201', qty: 1.169, unit: 'м3' }] }));
vi.mock('../../../infrastructure/sheets/material/GoogleSheetsMaterialDataSource', () => ({
  GoogleSheetsMaterialDataSource: class {
    getRows() { return [{ MaterialID: '3201', Code: 'C_20_25', Name: 'Concrete', Category: 'concrete_mix',
      ProfileType: 'concrete', BaseUnit: 'м3', IsActive: false }]; }
  },
}));
function root(): ElementFull {
  return { id: '1012', code: 'P-1.5', name: 'Product', type: 'product', prefixName: 'product', category: '',
    baseUnit: 'шт', isActive: true, createdAt: new Date('2026-10-12') };
}

describe('typed Expansion snapshot factory', () => {
  it('retains inactive Materials from raw rows without setData filtering', () => {
    fixture.elements = [root()];
    const result = getBOMExpansionService().expandProduct('1012');
    expect(result).toMatchObject({ ok: true, lines: [{ totalQty: 1.169,
      edge: { child: { kind: 'MATERIAL', materialId: '3201', material: { isActive: false } } } }] });
  });
  it('retains legacy Elements so Resolver can diagnose cross-catalog collision', () => {
    fixture.elements = [root(), { ...root(), id: '3201', type: 'material' }];
    expect(getBOMExpansionService().expandProduct('1012')).toMatchObject({ ok: false,
      diagnostics: [{ code: 'AMBIGUOUS_REFERENCE', referenceId: '3201' }] });
  });
  it('maps the stored PART geometry into a full domain snapshot', () => {
    const row: ElementRow = { ID: '4185', Code: 'PART', PrefixName: 'part', Name: 'Part', Type: 'part',
      ParentMaterialID: '3015', Category: 'angle', BaseUnit: 'шт', Length: 800, Width: 100, Height: 63,
      Thickness: 8, CreatedAt: new Date('2026-10-12') };
    expect(mapElementRowToDomain(row)).toMatchObject({ id: '4185', parentMaterialID: '3015',
      length: 800, width: 100, height: 63, thickness: 8 });
  });
});
