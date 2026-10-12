/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/elements/element-repository-master.test.ts
 * Module: Elements
 * Layer: Tests
 * Responsibility: verify explicit MASTER access and existing service compatibility with GAS mocks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleSheetsElementRepository } from './element.repository';
import { ElementRow } from './element.model';
import { getOrCreateRootElement, getOrCreateAssembly } from './root-element.service';
import { getOrCreateRebarPart } from '../../services/part.service';
import { CatalogHelper } from '../catalog/catalog.helper';
import { SpreadsheetProvider } from '../../infrastructure/spreadsheets/SpreadsheetProvider';
import { SpreadsheetConfig } from '../../infrastructure/spreadsheets/SpreadsheetConfig';
import { SpreadsheetKey } from '../../infrastructure/spreadsheets/SpreadsheetKey';
import { generateIdByType } from '../../utils/id';
import { MaterialRepository } from '../../domain/materials/material.repository';
vi.mock('../../utils/id', () => ({ generateIdByType: vi.fn() }));
vi.mock('../../services/cache.service', () => ({ addElementToCache: vi.fn() }));
const headers = ['ID', 'Code', 'PrefixName', 'Name', 'Type', 'ProjectDocumentID', 'ParentMaterialID', 'Category', 'BaseUnit', 'ProfileType', 'Diameter', 'Class', 'Width', 'Height', 'Length', 'Thickness', 'IsActive', 'Comment', 'CreatedAt'];
const date = new Date('2026-03-01T00:00:00Z');
const product: ElementRow = { ID: '4000000', Code: 'П-1', PrefixName: 'Плита', Name: 'Плита П-1', Type: 'product', ProjectDocumentID: 'DOC-1', Category: 'concrete', BaseUnit: 'шт', IsActive: false, CreatedAt: date };
const part: ElementRow = { ID: '2000000', Code: 'R_8_A240_L1000', PrefixName: 'Арматура', Name: 'Стержень', Type: 'part', ParentMaterialID: '3001', Category: 'rebar', BaseUnit: 'шт', Diameter: 8, Class: 'A240', Length: 1000, CreatedAt: date };
const asRow = (value: ElementRow) => headers.map(key => value[key as keyof ElementRow]);
describe('explicit MASTER Elements', () => {
  let data: unknown[][];
  let active: unknown;
  let missing: boolean;
  const read = vi.fn(), append = vi.fn(), update = vi.fn(), foreignWrite = vi.fn();
  const getActive = vi.fn(), open = vi.fn(), getSheet = vi.fn(), insertSheet = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    missing = false;
    data = [headers, asRow(product), asRow(part)];
    active = { getSheetByName: () => ({ appendRow: foreignWrite, getRange: () => ({ setValue: foreignWrite }) }) };
    read.mockImplementation(() => data);
    append.mockImplementation((row: unknown[]) => data.push(row.map(cell => typeof cell === 'string' && cell.startsWith("'") ? cell.slice(1) : cell)));
    update.mockImplementation((row: number, col: number, value: unknown) => { data[row - 1][col - 1] = value; });
    const sheet = { getDataRange: () => ({ getValues: read }), appendRow: append, getRange: (row: number, col: number) => ({ setValue: (value: unknown) => update(row, col, value) }) };
    getSheet.mockImplementation((name: string) => name === '00_Elements' && !missing ? sheet : null);
    open.mockImplementation((id: string) => id === SpreadsheetConfig.MASTER.id ? { getSheetByName: getSheet, insertSheet } : { id });
    getActive.mockImplementation(() => active);
    vi.stubGlobal('SpreadsheetApp', { openById: open, getActive, getActiveSpreadsheet: getActive });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(generateIdByType).mockImplementation(type => ({ product: '4000014', part: '2000010', assembly: '3000001', material: '1000001' })[type]);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function untouched() {
    expect(getActive).not.toHaveBeenCalled();
    expect(foreignWrite).not.toHaveBeenCalled();
    expect(insertSheet).not.toHaveBeenCalled();
  }
  it('reads MASTER with unchanged types and mappings across all lookups', () => {
    const repo = new GoogleSheetsElementRepository();
    expect(open).toHaveBeenCalledWith(SpreadsheetConfig.MASTER.id);
    expect(getSheet).toHaveBeenCalledWith('00_Elements');
    expect(repo.findById('4000000')).toMatchObject({ id: '4000000', type: 'product', isActive: false, createdAt: date });
    expect(repo.findByCode('П-1', 'DOC-1')?.id).toBe('4000000');
    expect(repo.findByIdentity('DOC-1', 'product', 'П-1')?.id).toBe('4000000');
    expect(repo.findByCodeNormalized(' п-1 ', 'DOC-1')?.id).toBe('4000000');
    expect(repo.findByCodeInDocuments('П-1', ['OTHER', 'DOC-1'])?.id).toBe('4000000');
    expect(repo.findByTypeInDocuments('product', ['DOC-1']).map(row => row.id)).toEqual(['4000000']);
    expect(repo.findPartByMaterial('3001', part.Code)).toMatchObject({ id: '2000000', diameter: 8, className: 'A240', length: 1000 });
    expect(repo.findPart({ code: part.Code, prefixName: '', name: '', category: 'rebar', diameter: 8, class: 'A240', length: 1000 })?.ID).toBe('2000000');
    expect(repo.findAll()).toHaveLength(2);
    expect(repo.findByType('part')[0].id).toBe('2000000');
    expect(repo.findById('missing')).toBeNull();
    untouched();
  });
  it.each(['foreign', 'null', 'changed'])('inserts and updates MASTER with %s active context', context => {
    if (context === 'null') active = null;
    const repo = new GoogleSheetsElementRepository();
    if (context === 'changed') active = { getSheetByName: () => { throw new Error('wrong spreadsheet'); } };
    repo.insert({ ...product, ID: '4000014', Code: 'П-2' });
    expect(append.mock.calls[0][0]).toEqual(["'4000014", "'П-2", 'Плита', 'Плита П-1', 'product', "'DOC-1", '', 'concrete', 'шт', '', '', '', '', '', '', '', false, '', date]);
    expect(repo.findById('4000014')?.type).toBe('product');
    repo.updateType('4000014', 'assembly');
    expect(update).toHaveBeenCalledWith(4, 5, 'assembly');
    expect(repo.findById('4000014')?.type).toBe('assembly');
    expect(open).toHaveBeenCalledTimes(1);
    untouched();
  });
  it('fails clearly for missing MASTER sheet without fallback or creation', () => {
    missing = true;
    expect(() => new GoogleSheetsElementRepository()).toThrow('Лист 00_Elements не знайдено в MASTER');
    expect(read).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    untouched();
  });
  it('creates seven-digit Product, Assembly and Part through existing services', () => {
    const repo = new GoogleSheetsElementRepository();
    const helper = { resolveTemplate: () => ({ type: 'product', category: 'concrete' }) } as unknown as CatalogHelper;
    expect(getOrCreateRootElement('П-2', 'DOC-1', 'Плита', 'Плита П-2', repo, helper).id).toBe('4000014');
    expect(getOrCreateAssembly('К-2', 'DOC-1', repo).id).toBe('3000001');
    expect(getOrCreateRebarPart(10, 'A500', 1500, repo).id).toBe('2000010');
    expect(append).toHaveBeenCalledTimes(3);
    expect(new GoogleSheetsElementRepository().findById('2000010')).toMatchObject({ type: 'part', diameter: 10, className: 'A500', length: 1500 });
    untouched();
  });
  it('leaves provider routing for other consumers unchanged', () => {
    new GoogleSheetsElementRepository();
    const provider = new SpreadsheetProvider();
    for (const key of [SpreadsheetKey.OPERATIONAL, SpreadsheetKey.REPORTING]) {
      expect(provider.open(key)).toEqual({ id: SpreadsheetConfig[key].id });
      expect(open).toHaveBeenCalledWith(SpreadsheetConfig[key].id);
    }
    expect(getSheet).toHaveBeenCalledTimes(1);
    untouched();
  });
  it('leaves existing MaterialRepository data and lookups unchanged', () => {
    const materials = new MaterialRepository([{
      MaterialID: '3001', Code: 'R_8_A240', Name: 'Арматура', Category: 'rebar',
      ProfileType: 'round', Diameter: 8, Class: 'A240', Width: 0, Height: 0,
      Thickness: 0, Density: 7850, WeightPerMeter: 0.395, BaseUnit: 'кг',
      IsActive: false, Comment: '',
    }]);
    const before = structuredClone(materials.getAll());
    const repo = new GoogleSheetsElementRepository();
    repo.insert({ ...part, ID: '2000010' });
    repo.updateType('4000000', 'assembly');
    expect(materials.getAll()).toEqual(before);
    expect(materials.findById('3001')).toMatchObject({ id: '3001', isActive: false });
    expect(materials.findByCode('R_8_A240')?.id).toBe('3001');
    expect(getSheet.mock.calls.every(([name]) => name === '00_Elements')).toBe(true);
    untouched();
  });
});
