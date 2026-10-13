/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/bom-master-routing.test.ts
 * Module: BOM
 * Layer: Tests
 * Responsibility: verify all BOM readers/writers and typed expansion use mocked MASTER.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllBOMRows, getChildrenRows, getParentsRows, hasChildren, insertBOMRows,
  replaceBOMForParent, deleteBOMByParentId, deleteBOMTree } from '../bom.repository';
import { GoogleSheetsBOMRepository } from '../repositories/google-sheets-bom.repository';
import { calcAssemblyWeight } from '../../elements/root-element.service';
import { GoogleSheetsElementRepository } from '../../elements/element.repository';
import { getBOMExpansionService } from '../../../app/factories/bom-expansion.factory';
import { SpreadsheetConfig } from '../../../infrastructure/spreadsheets/SpreadsheetConfig';
import { MATERIAL_HEADERS } from '../../material/material.headers';
vi.mock('../../../app/factories/catalog.factory', () => ({
  getCatalogRepository: () => ({ getAll: () => [{ typeCode: 'product', hasBOM: true }] }),
}));
const headers = ['ParentID', 'ChildID', 'Qty', 'Unit', 'Comment', 'ParentCode', 'ChildCode'];
const date = new Date('2026-03-01T00:00:00Z');
const edge = (parent: string | number, child: string | number, qty = 1) => [parent, child, qty, 'шт', '', 'P', 'PART'];

describe('BOM MASTER routing', () => {
  let data: unknown[][];
  let missing: boolean;
  const active = vi.fn(), foreign = vi.fn(), open = vi.fn(), clear = vi.fn(), write = vi.fn(), create = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    missing = false;
    data = [headers, edge(4000000, 2000000, 2), [2000000, 3001, 0.395, 'кг', '', 'PART', 'R_8_A240']];
    active.mockReturnValue({ getSheetByName: foreign });
    clear.mockImplementation(() => { data = []; });
    write.mockImplementation((row: number, col: number, values: unknown[][]) => {
      values.forEach((valuesRow, offset) => {
        data[row - 1 + offset] ??= [];
        valuesRow.forEach((value, column) => {
          data[row - 1 + offset][col - 1 + column] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value;
        });
      });
    });
    const bomSheet = {
      getDataRange: () => ({ getValues: () => data.map(row => [...row]), getFormulas: () => data.map(row => row.map(() => '')) }),
      getLastRow: () => data.length, clearContents: clear,
      getRange: (row: number, col: number, count = 1, columns = 1) => ({
        getValues: () => data.slice(row - 1, row - 1 + count).map(value => value.slice(col - 1, col - 1 + columns)),
        getValue: () => data[row - 1][col - 1],
        setValue: (value: unknown) => write(row, col, [[value]]),
        setValues: (values: unknown[][]) => write(row, col, values),
      }),
    };
    const elementHeaders = ['ID', 'Code', 'PrefixName', 'Name', 'Type', 'ParentMaterialID', 'BaseUnit', 'CreatedAt'];
    const elements = [elementHeaders,
      [4000000, 'P', 'product', 'Product', 'product', '', 'шт', date],
      [2000000, 'PART', 'part', 'Part', 'part', 3001, 'шт', date]];
    const material = { MaterialID: 3001, Code: 'R_8_A240', Name: 'Rebar', Category: 'rebar', ProfileType: 'round',
      Diameter: 8, Class: 'A240', WeightPerMeter: 0.395, IsActive: false };
    const materials = [MATERIAL_HEADERS, MATERIAL_HEADERS.map(header => material[header as keyof typeof material] ?? '')];
    const master = { insertSheet: create, getSheetByName: (name: string) => {
      if (name === '01_BOM') return missing ? null : bomSheet;
      if (name === '00_Elements') return { getDataRange: () => ({ getValues: () => elements }) };
      if (name === '05_Materials') return { getDataRange: () => ({ getValues: () => materials }) };
      throw new Error(`unexpected sheet ${name}`);
    } };
    open.mockImplementation((id: string) => {
      expect(id).toBe(SpreadsheetConfig.MASTER.id);
      return master;
    });
    vi.stubGlobal('SpreadsheetApp', { openById: open, getActive: active, getActiveSpreadsheet: active });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    expect(active).not.toHaveBeenCalled();
    expect(foreign).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  it.each(['foreign', 'absent'])('reads migrated IDs from MASTER with %s active spreadsheet', context => {
    if (context === 'absent') active.mockReturnValue(null);
    const repo = new GoogleSheetsBOMRepository();
    expect(getAllBOMRows()).toHaveLength(2);
    expect(repo.getChildrenRows('4000000')).toMatchObject([{ parentId: '4000000', childId: '2000000', qty: 2 }]);
    expect(repo.getParentsRows('2000000')[0].parentId).toBe('4000000');
    expect(hasChildren('4000000')).toBe(true);
  });
  it.each(['replace', 'insert', 'delete parent', 'delete tree'])('routes %s writes and subsequent reads to the same MASTER', operation => {
    if (operation === 'replace') {
      replaceBOMForParent('4000000', [edge('4000000', '2000009', 4)]);
      expect(getChildrenRows('4000000')[0].childId).toBe('2000009');
      expect(getChildrenRows('2000000')).toHaveLength(1);
    }
    if (operation === 'insert') {
      insertBOMRows([edge('4000000', '2000000', 5), edge('4000013', '2000009', 3)]);
      expect(getChildrenRows('4000000')[0].qty).toBe(5);
      expect(getParentsRows('2000009')[0].parentId).toBe('4000013');
    }
    if (operation === 'delete parent') {
      deleteBOMByParentId('4000000');
      expect(getChildrenRows('4000000')).toEqual([]);
      expect(getChildrenRows('2000000')).toHaveLength(1);
    }
    if (operation === 'delete tree') {
      deleteBOMTree('4000000');
      expect(getAllBOMRows()).toEqual([]);
    }
    expect(write).toHaveBeenCalled();
  });
  it.each(['read', 'replace', 'insert', 'delete parent', 'delete tree', 'weight'])('fails for missing MASTER BOM during %s without creating a sheet', operation => {
    missing = true;
    const action = () => {
      if (operation === 'read') getAllBOMRows();
      if (operation === 'replace') replaceBOMForParent('4000000', []);
      if (operation === 'insert') insertBOMRows([]);
      if (operation === 'delete parent') deleteBOMByParentId('4000000');
      if (operation === 'delete tree') deleteBOMTree('4000000');
      if (operation === 'weight') calcAssemblyWeight('4000000', new GoogleSheetsElementRepository());
    };
    expect(action).toThrow('Лист 01_BOM не знайдено в MASTER');
    expect(clear).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it('routes calcAssemblyWeight through MASTER with the existing weight semantics', () => {
    expect(calcAssemblyWeight('4000000', new GoogleSheetsElementRepository())).toBe(0);
  });
  it('assembles typed BOMExpansion from MASTER BOM, Elements and Materials', () => {
    const result = getBOMExpansionService().expandProduct('4000000');
    expect(result).toMatchObject({ ok: true, root: { elementId: '4000000' }, lines: [
      { totalQty: 2, edge: { child: { kind: 'ELEMENT', elementId: '2000000' } } },
      { totalQty: 0.79, edge: { child: { kind: 'MATERIAL', materialId: '3001', material: { isActive: false } } } },
    ] });
  });
});
