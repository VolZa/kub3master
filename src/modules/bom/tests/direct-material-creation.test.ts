/**
 * Path: C:/www/26/10/kub3master-codex-test/src/modules/bom/tests/direct-material-creation.test.ts
 * Module: BOM
 * Layer: Integration Test
 * Responsibility: verify direct Material identity and PART creation without Google Sheets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withLegacyBOMCompatibilityForTests as compatibility } from '../legacy-save-quarantine';
const buildBOMFromTable = (...args: Parameters<typeof legacyBuildBOMFromTable>) => compatibility(() => legacyBuildBOMFromTable(...args));
import { buildBOMRow, buildBOMFromTable as legacyBuildBOMFromTable, aggregateBOMRows } from '../bom.service';
import { getOrCreateElementFromBuilt } from '../../elements/element.factory';
import { MockElementRepository } from '../../elements/mock/mock.element.repository';
import { CatalogHelper } from '../../catalog/catalog.helper';
import { MaterialRepository } from '../../../domain/materials/material.repository';
import { Material } from '../../../domain/materials/material.model';
import { TableRowInput } from '../model/table-row-input.model';
import { generateIdByType } from '../../../utils/id';
import { MaterialBatchRepository } from '../../../domain/materials/material-batch.repository';

const stored = vi.hoisted(() => ({ rows: [] as any[][] }));
vi.mock('../bom.repository', () => ({
  deleteBOMTree: vi.fn(), insertBOMRows: vi.fn(),
  replaceBOMForParent: (_id: string, rows: any[][]) => { stored.rows = rows; },
}));
vi.mock('../../../app/factories/project-document-dependency.factory', () => ({
  getProjectDocumentDependencyRepository: () => ({ findByProjectDocumentId: () => [] }),
}));

vi.mock('../../../utils/id', () => ({ generateIdByType: vi.fn(() => '4001') }));

const now = new Date('2026-10-10T00:00:00Z');
const concrete: Material = {
  id: '3201', code: 'C_20_25', name: 'Бетон C20/25',
  category: 'concrete_mix', profileType: 'concrete', baseUnit: 'м3', isActive: true,
};
const input: TableRowInput = {
  prefix: 'бетон', code: 'position-1', spec: 'C20/25', qty: 1.169,
};

function setup(materials: Material[] = [concrete], legacy = false) {
  const repo = new MockElementRepository([{
    ID: '1012', Code: 'П-1.5', PrefixName: 'плита', Name: 'П-1.5',
    Type: 'product', Category: '', BaseUnit: 'шт', ProjectDocumentID: 'DOC', CreatedAt: now,
  }]);
  if (legacy) repo.insert({
    ID: '3403', Code: 'C_20_25', PrefixName: 'бетон', Name: 'Бетон',
    Type: 'material', Category: 'concrete_mix', BaseUnit: 'м3', CreatedAt: now,
  });
  const materialRepo = new MaterialRepository([]);
  materialRepo.setData(materials);
  const catalog = {
    resolveTemplate: vi.fn((prefix: string) => ({
      type: 'material', supportsLength: prefix !== 'бетон',
      category: prefix === 'бетон' ? 'concrete_mix' : 'steel',
      profileType: prefix === 'арматура' ? 'round' : prefix === 'кутник' ? 'angle' : 'plate',
    })),
  } as unknown as CatalogHelper;
  const insert = vi.spyOn(repo, 'insert');
  return { repo, materialRepo, catalog, insert,
    build: (row = input) => buildBOMRow('1012', row, now, repo, catalog, materialRepo, ['DOC']),
  };
}

describe('direct Material creation in BOM', () => {
  beforeEach(() => {
    vi.clearAllMocks(); stored.rows = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['C20/25', 'C_20_25'])('resolves parsed concrete %s without creating an Element', (spec) => {
    const s = setup();
    expect(s.build({ ...input, spec })).toEqual([
      ['1012', '3201', 1.169, 'м3', now, 'П-1.5', 'C_20_25'],
    ]);
    expect(s.insert).not.toHaveBeenCalled();
    expect(generateIdByType).not.toHaveBeenCalled();
  });

  it('uses MaterialID even when a legacy material Element matches the input code', () => {
    const s = setup([concrete], true);
    expect(s.build({ ...input, code: 'C_20_25' })[0][1]).toBe('3201');
    expect(s.repo.findById('3403')).not.toBeNull();
    expect(s.insert).not.toHaveBeenCalled();
  });

  it.each([false, true])('diagnoses missing Material with legacy Element=%s', (legacy) => {
    const s = setup([], legacy);
    expect(() => s.build({ ...input, code: 'C_20_25' })).toThrow('Material not found in 05_Materials: C_20_25');
    expect(s.insert).not.toHaveBeenCalled();
    expect(generateIdByType).not.toHaveBeenCalled();
  });

  it.each(['C_20_25', 'position-1'])('rejects ambiguous Material for input code %s', (code) => {
    const s = setup([concrete, { ...concrete, id: '3202' }], true);
    expect(() => s.build({ ...input, code })).toThrow('Ambiguous material code');
    expect(s.insert).not.toHaveBeenCalled();
  });

  it('repeated input does not create Elements and aggregates to one direct BOM edge', () => {
    const s = setup([concrete], true);
    const first = s.build();
    expect(s.build()).toEqual(first);
    const rows = aggregateBOMRows([...first, ...s.build()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].slice(0, 4)).toEqual(['1012', '3201', 2.338, 'м3']);
    expect(s.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['арматура', 'R_6_A500C_L800', 'R_6_A500C_L800', 'round', { diameter: 6, class: 'A500C' }],
    ['кутник', 'angle-part', 'L100x63x8, L=800', 'angle', { width: 100, height: 63, thickness: 8 }],
    ['полоса', 'plate-part', '5x40x800', 'plate', { width: 40, thickness: 5 }],
  ] as const)('creates and reuses a length PART for %s', (prefix, code, spec, profileType, dimensions) => {
    const material = { ...concrete, id: '3011', code: 'PROFILE', category: 'rebar',
      baseUnit: 'кг', profileType, weightPerMeter: 0.222, ...dimensions } as Material;
    const s = setup([material]);
    const row = { prefix, code, spec, qty: 2 };
    const first = s.build(row);
    expect(first[0].slice(0, 4)).toEqual(['1012', '4001', 2, 'шт']);
    expect(first[1].slice(0, 4)).toEqual(['4001', '3011', 0.18, 'кг']);
    expect(s.repo.findById('4001')?.parentMaterialID).toBe('3011');
    expect(s.build(row)).toEqual(first);
    expect(s.insert).toHaveBeenCalledTimes(1);
    expect(generateIdByType).toHaveBeenCalledTimes(1);
  });

  it('guards ElementFactory against creating or reusing a material Element', () => {
    const s = setup([concrete], true);
    expect(() => getOrCreateElementFromBuilt({ code: 'C_20_25', prefixName: 'бетон', name: 'Бетон' },
      s.repo, s.catalog, s.materialRepo)).toThrow('Material Elements cannot be created or reused');
    expect(s.insert).not.toHaveBeenCalled();
    expect(generateIdByType).not.toHaveBeenCalled();
  });

  it('repeated table submission replaces the same direct edge and preserves the legacy Element', () => {
    const s = setup([concrete], true);
    const bomRepo = {
      getChildrenRows: (id: string) => stored.rows.filter((r) => r[0] === id)
        .map((r) => ({ parentId: r[0], childId: r[1], qty: r[2], unit: r[3] })),
      getParentsRows: () => [],
    };
    const submit = () => buildBOMFromTable(
      { code: 'П-1.5', prefix: 'плита', name: 'П-1.5', projectDocumentID: 'DOC' },
      [{ ...input, code: 'C_20_25' }], s.repo, s.catalog, s.materialRepo,
      {} as MaterialBatchRepository, bomRepo,
    );
    expect(submit().errorCount).toBe(0);
    expect(submit().errorCount).toBe(0);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].slice(0, 4)).toEqual(['1012', '3201', 1.169, 'м3']);
    expect(s.repo.findById('3403')).not.toBeNull();
    expect(s.insert).not.toHaveBeenCalled();
  });

  it('returns the missing Material diagnostic to the table caller', () => {
    const s = setup([], true);
    const result = buildBOMFromTable(
      { code: 'П-1.5', prefix: 'плита', name: 'П-1.5', projectDocumentID: 'DOC' },
      [{ ...input, code: 'C_20_25' }], s.repo, s.catalog, s.materialRepo,
      {} as MaterialBatchRepository, { getChildrenRows: () => [], getParentsRows: () => [] },
    );
    expect(result.errorCount).toBe(1);
    expect(result.operatorMessage?.severity).toBe('ERROR');
    expect(result.operatorMessage?.text).toContain('Material not found in 05_Materials: C_20_25');
    expect(s.insert).not.toHaveBeenCalled();
  });
});
