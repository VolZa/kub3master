/**
 * Path: C:/www/26/03/kub3master-ts/src/utils/id.test.ts
 * Module: ID generation
 * Layer: Tests
 * Responsibility: verify pure allocation and mocked GAS reservation failures and ordering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateNextId, normalizeIntegerId } from './id.logic';
import { generateIdByType } from './id';
import { ElementType, ID_RANGES } from '../config/config';
import { SpreadsheetConfig } from '../infrastructure/spreadsheets/SpreadsheetConfig';

const sequence = (first: number, count: number) => Array.from({ length: count }, (_, i) => first + i);

describe('pure ID allocation', () => {
  it.each([
    ['product', 2064, sequence(4000000, 14), 4000014],
    ['part', 4185, sequence(2000000, 10), 2000010],
    ['material', 3000, [], 1000001],
    ['assembly', 2000, [], 3000001],
    ['product', 2064, [], 4000014],
    ['part', 4185, [], 2000010],
    ['product', 4000050, [], 4000051],
    ['material', 3000, [1000042, 4000099, 1234], 1000043],
  ] as [ElementType, number, number[], number][])('%s advances from %s', (type, last, ids, next) => {
    expect(calculateNextId(type, last, new Set(ids))).toBe(next);
  });
  it.each(Object.keys(ID_RANGES) as ElementType[])('allows final %s ID then rejects exhaustion', (type) => {
    const max = ID_RANGES[type][1];
    expect(calculateNextId(type, max - 1, new Set())).toBe(max);
    expect(() => calculateNextId(type, max, new Set())).toThrow('Перевищено');
    expect(() => calculateNextId(type, max + 1, new Set())).toThrow('Перевищено');
    expect(() => calculateNextId(type, 1000, new Set([max]))).toThrow('Перевищено');
  });
  it.each([NaN, Infinity, 1.5, '', ' ', '123abc', '1.5', null, undefined, true, {}, [], -1, Number.MAX_SAFE_INTEGER + 1])('rejects malformed counter %s', (value) => {
    expect(() => calculateNextId('material', value, new Set())).toThrow('LastID');
  });
  it('normalizes numeric strings without truncation', () => {
    expect(normalizeIntegerId(' 01000001 ', 'ID')).toBe(1000001);
    expect(calculateNextId('material', '1000001', new Set())).toBe(1000002);
  });
  it.each([2000000, 4000000])('treats migrated boundary %s as a normal integer ID', (id) => {
    expect(normalizeIntegerId(id, 'ID')).toBe(id);
    expect(normalizeIntegerId(String(id), 'ID')).toBe(id);
  });
  it('uses the corrected lower bounds and migration high-water marks', () => {
    expect(ID_RANGES.part[0]).toBe(2000000);
    expect(ID_RANGES.product[0]).toBe(4000000);
    expect(calculateNextId('part', 2000009, new Set())).toBe(2000010);
    expect(calculateNextId('product', 4000013, new Set())).toBe(4000014);
  });
  it('rejects unknown types', () => {
    expect(() => calculateNextId('toString' as ElementType, 1000, new Set())).toThrow('Невідомий');
  });
});

describe('MASTER reservation', () => {
  let counters: unknown[][];
  let elements: unknown[][];
  let materials: unknown[][];
  let held: boolean;
  let missing: string;
  let failRead: boolean;
  let failWrite: boolean;
  const release = vi.fn();
  const acquire = vi.fn();
  const write = vi.fn();
  const flush = vi.fn();
  const open = vi.fn();
  const locked = () => expect(held).toBe(true);
  beforeEach(() => {
    vi.clearAllMocks();
    held = false;
    missing = '';
    failRead = failWrite = false;
    counters = [['Type', 'LastID'], ['material', 3000], ['part', 4185], ['assembly', 2000], ['product', 2064]];
    elements = [['Code', 'ID', 'Type', 'IsActive']];
    materials = [['MaterialID', 'IsActive']];
    acquire.mockImplementation(() => { held = true; return true; });
    release.mockImplementation(() => { locked(); held = false; });
    flush.mockImplementation(locked);
    write.mockImplementation((row: number, value: unknown) => {
      locked();
      if (failWrite) throw new Error('write failure');
      counters[row - 1][1] = value;
    });
    const sheet = (name: string, rows: unknown[][]) => ({
      getName: () => name,
      getLastRow: () => { locked(); return rows.length; },
      getDataRange: () => ({ getValues: () => { locked(); if (failRead) throw new Error('read failure'); return rows; } }),
      getRange: (row: number, _column: number, count?: number) => ({
        getValues: () => { locked(); return rows.slice(row - 1, row - 1 + (count ?? 1)); },
        setValue: (value: unknown) => write(row, value),
      }),
    });
    open.mockImplementation(() => {
      locked();
      return { getSheetByName: (name: string) => {
        if (name === missing) return null;
        if (name === '_Config_ID_Counters') return sheet(name, counters);
        if (name === '00_Elements') return sheet(name, elements);
        if (name === '05_Materials') return sheet(name, materials);
        throw new Error('unexpected sheet');
      } };
    });
    vi.stubGlobal('LockService', { getScriptLock: () => ({ hasLock: () => held, tryLock: acquire, releaseLock: release }) });
    vi.stubGlobal('SpreadsheetApp', { openById: open, flush, getActive: () => { throw new Error('active spreadsheet forbidden'); } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('reserves migrated Product and Part and returns strings', () => {
    elements.push(...sequence(4000000, 14).map(id => ['p', String(id), 'product', false]));
    elements.push(...sequence(2000000, 10).map(id => ['p', id, 'part', true]));
    expect(generateIdByType('product')).toBe('4000014');
    expect(generateIdByType('part')).toBe('2000010');
    expect(open).toHaveBeenCalledWith(SpreadsheetConfig.MASTER.id);
    expect(acquire).toHaveBeenCalledWith(30000);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('avoids all Elements and Materials IDs regardless of type or activity', () => {
    elements.push(['legacy', '1000001', 'part', false]);
    materials.push(['1000002', false]);
    expect(generateIdByType('material')).toBe('1000003');
    expect(generateIdByType('material')).toBe('1000004');
    expect(generateIdByType('assembly')).toBe('3000001');
  });
  it('uses MaterialID instead of an unrelated ID column', () => {
    materials = [['ID', 'IsActive', 'MaterialID'], [1999999, false, '01000001']];
    expect(generateIdByType('material')).toBe('1000002');
  });
  it('rejects duplicated MaterialID headers before reserving', () => {
    materials = [['MaterialID', 'MaterialID'], [1000001, 1000002]];
    expect(() => generateIdByType('material')).toThrow('MaterialID');
    expect(write).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('preserves reservation after record deletion and uses latest counter on each call', () => {
    counters[1][1] = 1000040;
    expect(generateIdByType('material')).toBe('1000041');
    expect(generateIdByType('material')).toBe('1000042');
  });
  it('advances beyond corrected migration reservations and IDs in either directory', () => {
    elements.push(['migrated', '4000000', 'product', false]);
    materials.push([2000000, false], ['4000014', false], [2000010, false]);
    expect(generateIdByType('product')).toBe('4000015');
    expect(generateIdByType('part')).toBe('2000011');
  });
  it('does not read or write when lock acquisition times out', () => {
    acquire.mockImplementation(() => false);
    expect(() => generateIdByType('material')).toThrow('lock');
    expect(open).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
  it('propagates acquisition failures without reading MASTER', () => {
    acquire.mockImplementation(() => { throw new Error('lock failure'); });
    expect(() => generateIdByType('material')).toThrow('lock failure');
    expect(open).not.toHaveBeenCalled();
  });
  it.each(['duplicate', 'missing type', 'empty counters', 'invalid counter', 'missing sheet', 'bad header', 'bad ID', 'read', 'write', 'flush', 'exhausted'])('fails closed and releases lock: %s', (failure) => {
    if (failure === 'duplicate') counters.push(['material', 3000]);
    if (failure === 'missing type') counters.splice(1, 1);
    if (failure === 'empty counters') counters.splice(1);
    if (failure === 'invalid counter') counters[1][1] = '';
    if (failure === 'missing sheet') missing = '05_Materials';
    if (failure === 'bad header') materials[0] = ['ID'];
    if (failure === 'bad ID') materials.push(['1000001garbage']);
    if (failure === 'read') failRead = true;
    if (failure === 'write') failWrite = true;
    if (failure === 'flush') flush.mockImplementation(() => { throw new Error('flush failure'); });
    if (failure === 'exhausted') counters[1][1] = 1999999;
    expect(() => generateIdByType('material')).toThrow();
    expect(release).toHaveBeenCalledTimes(1);
    expect(held).toBe(false);
    if (!['write', 'flush'].includes(failure)) expect(write).not.toHaveBeenCalled();
  });
});
