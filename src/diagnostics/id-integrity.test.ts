import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeIdIntegrity, type IDIntegrityInput, type IDIntegrityResult } from './id-integrity';
import { calculateNextId } from '../utils/id.logic';
import { ID_RANGES, type ElementType } from '../config/config';

function fixture(): { elements: unknown[][]; materials: unknown[][]; counters: unknown[][] } {
  return {
    elements: [['ID', 'Type', 'IsActive'], [2000010, 'part', true], [4000014, 'product', true]],
    materials: [['MaterialID', 'IsActive'], [3014, true]],
    counters: [['Type', 'Last_ID'], ['material', 1000000], ['part', 2000010], ['assembly', 3000000], ['product', 4000014]],
  };
}
const codes = (result: IDIntegrityResult) => result.findings.map(finding => finding.code);
const typeResult = (result: IDIntegrityResult, type: ElementType) => result.types.find(item => item.type === type)!;
afterEach(() => vi.unstubAllGlobals());

describe('pure MASTER ID integrity diagnostic', () => {
  it.each(['Last_ID', 'LastID'])('accepts %s and previews the supplied counter baseline', header => {
    const data = fixture(); data.counters[0][1] = header;
    const result = analyzeIdIntegrity(data);
    expect(result).toMatchObject({ scope: 'ID_INTEGRITY_ONLY', integrityOk: true, allocationPreviewComplete: true, occupiedUniqueCount: 3 });
    expect(Object.fromEntries(result.types.map(item => [item.type, item.nextId]))).toEqual({ material: 1000001, part: 2000011, assembly: 3000001, product: 4000015 });
    expect(result.counts.ERROR).toBe(0);
  });
  it('keeps historical IDs and uses explicit Type instead of the numeric range', () => {
    const data = fixture();
    data.elements = [['ID', 'Type'], [4185, 'part'], [2064, 'product'], [4000099, 'part']];
    const result = analyzeIdIntegrity(data);
    expect(result.integrityOk).toBe(true);
    expect(typeResult(result, 'part')).toMatchObject({ maxDeclaredTypeId: 4000099, maxOccupiedInAllocationRange: null, nextId: 2000011 });
    expect(typeResult(result, 'product')).toMatchObject({ maxDeclaredTypeId: 2064, maxOccupiedInAllocationRange: 4000099, nextId: 4000100 });
    expect(result.findings).toContainEqual(expect.objectContaining({ severity: 'INFO', code: 'DECLARED_MAX_OUTSIDE_RANGE', type: 'part' }));
  });
  it.each(['elements', 'materials'] as const)('reports normalized duplicates inside %s with physical row numbers', source => {
    const data = fixture();
    if (source === 'elements') data.elements.push([' 02000010 ', 'assembly', false]);
    else data.materials.push(['03014', false]);
    const result = analyzeIdIntegrity(data);
    expect(result.integrityOk).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({ severity: 'ERROR', code: 'DUPLICATE_ID',
      locations: source === 'elements' ? [{ source: '00_Elements', row: 2 }, { source: '00_Elements', row: 4 }] : [{ source: '05_Materials', row: 2 }, { source: '05_Materials', row: 3 }] }));
  });
  it('reports cross-source collisions even for inactive records and numeric string aliases', () => {
    const data = fixture(); data.materials.push(['02000010', false]);
    expect(analyzeIdIntegrity(data).findings).toContainEqual(expect.objectContaining({ severity: 'ERROR', code: 'CROSS_SOURCE_COLLISION', id: 2000010 }));
  });
  it.each(['', null, undefined])('reports a missing ID %s on a nonempty row', id => {
    const data = fixture(); data.elements.push([id, 'part']);
    const result = analyzeIdIntegrity(data);
    expect(codes(result)).toContain('MISSING_ID');
    // The actual allocator skips empty ID cells; integrity still fails.
    expect(result).toMatchObject({ integrityOk: false, allocationPreviewComplete: true });
  });
  it.each([NaN, Infinity, -1, 1.5, '1e3', ' ', '12x', true, {}, [], Number.MAX_SAFE_INTEGER + 1])('rejects invalid ID %s and withholds previews', id => {
    const data = fixture(); data.materials.push([id, false]);
    const result = analyzeIdIntegrity(data);
    expect(codes(result)).toContain('INVALID_ID');
    expect(result.allocationPreviewComplete).toBe(false);
    expect(result.types.every(item => item.nextId === null)).toBe(true);
  });
  it.each(['', null, 'PART', 'unknown', 'toString', 42])('reports invalid Element Type %s without inferring it', type => {
    const data = fixture(); data.elements.push([3000001, type]);
    const result = analyzeIdIntegrity(data);
    expect(codes(result)).toContain('INVALID_ELEMENT_TYPE');
    expect(typeResult(result, 'assembly')).toMatchObject({ maxDeclaredTypeId: null, maxOccupiedInAllocationRange: 3000001, nextId: 3000002 });
  });
  it('reports missing and duplicate counter types separately', () => {
    const data = fixture(); data.counters.splice(1, 1); data.counters.push(['part', 2000011]);
    const result = analyzeIdIntegrity(data);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'MISSING_COUNTER_TYPE', type: 'material', severity: 'ERROR' }));
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_COUNTER_TYPE', type: 'part', severity: 'ERROR' }));
    expect(typeResult(result, 'part').nextId).toBeNull();
    expect(typeResult(result, 'material').nextId).toBeNull();
  });
  it.each(['unknown', 'Part', '', null, 'constructor'])('reports invalid counter type %s', type => {
    const data = fixture(); data.counters.push([type, 10]);
    expect(codes(analyzeIdIntegrity(data))).toContain('INVALID_COUNTER_TYPE');
  });
  it.each(['', null, undefined, -1, 0.5, 'NaN', Infinity, true])('rejects malformed Last_ID %s', last => {
    const data = fixture(); data.counters[1][1] = last;
    const result = analyzeIdIntegrity(data);
    expect(codes(result)).toContain('INVALID_LAST_ID');
    expect(typeResult(result, 'material').nextId).toBeNull();
  });
  it('normalizes decimal counters and accepts historical low counters with migration floors', () => {
    const data = fixture(); data.counters[2][1] = ' 004185 '; data.counters[4][1] = 2064;
    data.elements = [['ID', 'Type']];
    const result = analyzeIdIntegrity(data);
    expect(result.integrityOk).toBe(true);
    expect(typeResult(result, 'part')).toMatchObject({ lastId: 4185, nextId: 2000010 });
    expect(typeResult(result, 'product').nextId).toBe(4000014);
  });
  it('warns about occupied candidates but previews a free ID using the existing allocation math', () => {
    const data = fixture();
    data.elements.push([1000001, 'part', false]); data.materials.push([1000042, false]);
    const result = analyzeIdIntegrity(data), material = typeResult(result, 'material');
    expect(result.integrityOk).toBe(true);
    expect(material).toMatchObject({ counterPlusOne: 1000001, counterPlusOneOccupied: true, candidateWithoutOccupied: 1000001,
      candidateWithoutOccupiedIsOccupied: true, maxOccupiedInAllocationRange: 1000042, nextId: 1000043, nextIdOccupied: false });
    expect(result.findings).toContainEqual(expect.objectContaining({ severity: 'WARNING', code: 'CANDIDATE_OCCUPIED', type: 'material' }));
    expect(material.nextId).toBe(calculateNextId('material', 1000000, new Set([2000010, 4000014, 3014, 1000001, 1000042])));
  });
  it('checks migration-floor candidate occupancy separately from Last_ID + 1', () => {
    const data = fixture(); data.counters[2][1] = 4185;
    const part = typeResult(analyzeIdIntegrity(data), 'part');
    expect(part).toMatchObject({ counterPlusOne: 4186, counterPlusOneOccupied: false,
      candidateWithoutOccupied: 2000010, candidateWithoutOccupiedIsOccupied: true, nextId: 2000011 });
  });
  it.each(Object.keys(ID_RANGES) as ElementType[])('matches existing allocation boundaries and exhaustion for %s', type => {
    const data = fixture(), max = ID_RANGES[type][1];
    data.counters.find(row => row[0] === type)![1] = max - 1;
    expect(typeResult(analyzeIdIntegrity(data), type).nextId).toBe(max);
    data.materials.push([max, false]);
    const exhausted = analyzeIdIntegrity(data);
    expect(typeResult(exhausted, type).nextId).toBeNull();
    expect(exhausted.findings).toContainEqual(expect.objectContaining({ severity: 'ERROR', code: 'ALLOCATION_UNAVAILABLE', type }));
  });
  it.each([
    ['Last_ID', 'Type'], ['Type', 'Unknown'], ['Type', 'Last_ID', 'Extra'], ['Type', 'LastID', 'Extra'], ['type', 'Last_ID'], ['Type', 'Last_ID '], [],
  ])('rejects invalid counter schema %j', (...headers) => {
    const data = fixture(); data.counters[0] = headers;
    const result = analyzeIdIntegrity(data);
    expect(codes(result)).toContain('INVALID_COUNTER_SCHEMA');
    expect(result.allocationPreviewComplete).toBe(false);
  });
  it('requires unique source headers and does not guess column positions', () => {
    const data = fixture(); data.elements[0] = ['ID', 'ID', 'Type']; data.materials[0] = ['Wrong'];
    const result = analyzeIdIntegrity(data);
    expect(result.counts.ERROR).toBeGreaterThanOrEqual(2);
    expect(result.allocationPreviewComplete).toBe(false);
  });
  it('supports reordered source columns and ignores unrelated Material ID columns', () => {
    const data = fixture(); data.elements = [['Type', 'ID'], ['part', 4185]];
    data.materials = [['ID', 'MaterialID'], [1999999, '01000001']];
    expect(typeResult(analyzeIdIntegrity(data), 'material').nextId).toBe(1000002);
  });
  it('ignores fully blank physical rows but reports missing Type headers', () => {
    const data = fixture(); data.elements.push(['', null, undefined]); data.counters.push(['', '']);
    expect(analyzeIdIntegrity(data).integrityOk).toBe(true);
    data.elements[0][1] = 'Wrong';
    expect(codes(analyzeIdIntegrity(data))).toContain('INVALID_SOURCE_SCHEMA');
  });
  it('handles empty snapshots without throwing or claiming a valid allocation preview', () => {
    const result = analyzeIdIntegrity({ elements: [], materials: [], counters: [] });
    expect(result).toMatchObject({ integrityOk: false, allocationPreviewComplete: false });
  });
  it('accepts zero as a historical ID in accordance with normalizeIntegerId', () => {
    const data = fixture(); data.elements.push([0, 'assembly']);
    expect(analyzeIdIntegrity(data).integrityOk).toBe(true);
  });
  it('does not mutate deeply frozen snapshots or access GAS services', () => {
    const forbidden = new Proxy({}, { get() { throw new Error('GAS access forbidden'); } });
    for (const name of ['SpreadsheetApp', 'DriveApp', 'LockService']) vi.stubGlobal(name, forbidden);
    const data = fixture(); data.elements.push([1000001, 'part', false]);
    const before = structuredClone(data);
    for (const table of Object.values(data)) { table.forEach(row => Object.freeze(row)); Object.freeze(table); }
    Object.freeze(data);
    const result = analyzeIdIntegrity(data as IDIntegrityInput);
    expect(data).toEqual(before);
    expect(analyzeIdIntegrity(data)).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
