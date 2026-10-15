import { ID_RANGES, type ElementType } from '../config/config';
import { calculateNextId, normalizeIntegerId } from '../utils/id.logic';

/** Raw getValues-style snapshots, including headers and inactive records. No I/O. */
export type IDSnapshotTable = readonly (readonly unknown[])[];
export interface IDIntegrityInput {
  elements: IDSnapshotTable;
  materials: IDSnapshotTable;
  counters: IDSnapshotTable;
}
type Source = '00_Elements' | '05_Materials' | '_Config_ID_Counters';
export interface IDLocation { source: Source; row: number }
export interface IDFinding {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  type?: ElementType;
  id?: number;
  locations?: IDLocation[];
}
export interface IDTypeAnalysis {
  type: ElementType;
  lastId: number | null;
  /** Semantic grouping: explicit Element Type, plus Materials for material. */
  maxDeclaredTypeId: number | null;
  /** Allocator grouping: all sources/types/activity within this numeric range. */
  maxOccupiedInAllocationRange: number | null;
  counterPlusOne: number | null;
  counterPlusOneOccupied: boolean | null;
  /** Existing pure algorithm with an empty occupied set (includes migration floor). */
  candidateWithoutOccupied: number | null;
  candidateWithoutOccupiedIsOccupied: boolean | null;
  /** Preview only; null when allocation inputs are incomplete/invalid or exhausted. */
  nextId: number | null;
  nextIdOccupied: boolean | null;
}
export interface IDIntegrityResult {
  scope: 'ID_INTEGRITY_ONLY';
  integrityOk: boolean;
  allocationPreviewComplete: boolean;
  counts: Record<IDFinding['severity'], number>;
  occupiedUniqueCount: number;
  types: IDTypeAnalysis[];
  findings: IDFinding[];
}
const isType = (value: unknown): value is ElementType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ID_RANGES, value);
const blank = (value: unknown) => value === '' || value == null;
const maximum = (values: Iterable<number>): number | null => {
  let result: number | null = null;
  for (const value of values) result = result === null ? value : Math.max(result, value);
  return result;
};

/**
 * Audits supplied snapshots, never reserves IDs. Only id.logic supplies allocation math.
 * ERROR is an audit finding, not a claim that every Safe Commit path rejects it.
 * This does not validate full writable schemas, business identity, journals or permissions.
 */
export function analyzeIdIntegrity(input: IDIntegrityInput): IDIntegrityResult {
  const findings: IDFinding[] = [];
  const types = Object.keys(ID_RANGES) as ElementType[];
  const occupied = new Set<number>();
  const declared = new Map(types.map(type => [type, new Set<number>()]));
  const occurrences = new Map<number, IDLocation[]>();
  let occupiedComplete = true;
  const add = (severity: IDFinding['severity'], code: string, message: string,
    details: Omit<IDFinding, 'severity' | 'code' | 'message'> = {}) => findings.push({ severity, code, message, ...details });
  function column(table: IDSnapshotTable, source: Source, key: string): number {
    const headers = table[0] ?? [];
    if (headers.filter(value => value === key).length !== 1) {
      add('ERROR', 'INVALID_SOURCE_SCHEMA', `Expected exactly one ${key} header in ${source}`, { locations: [{ source, row: 1 }] });
      return -1;
    }
    return headers.indexOf(key);
  }
  for (const [source, table, key] of [
    ['00_Elements', input.elements, 'ID'], ['05_Materials', input.materials, 'MaterialID'],
  ] as const) {
    const idColumn = column(table, source, key);
    const typeColumn = source === '00_Elements' ? column(table, source, 'Type') : -1;
    if (idColumn < 0) occupiedComplete = false;
    table.slice(1).forEach((row, index) => {
      if (row.every(blank)) return;
      const locations = [{ source, row: index + 2 }];
      const type = source === '05_Materials' ? 'material' : row[typeColumn];
      if (source === '00_Elements' && typeColumn >= 0 && !isType(type)) {
        add('ERROR', 'INVALID_ELEMENT_TYPE', 'Missing, malformed or unknown Element Type; never inferred from ID', { locations });
      }
      if (idColumn < 0) return;
      const value = row[idColumn];
      if (blank(value)) {
        add('ERROR', 'MISSING_ID', 'Nonempty record has no ID (allocator skips empty ID cells)', { locations });
        return;
      }
      let id: number;
      try { id = normalizeIntegerId(value, key); } catch {
        occupiedComplete = false;
        add('ERROR', 'INVALID_ID', 'ID is not a nonnegative safe integer or decimal digit string', { locations });
        return;
      }
      occupied.add(id);
      occurrences.set(id, [...(occurrences.get(id) ?? []), ...locations]);
      if (isType(type)) {
        declared.get(type)!.add(id);
        const [min, max] = ID_RANGES[type];
        if (id < min || id > max) add('INFO', 'OUTSIDE_NEW_ID_RANGE',
          'Existing ID is outside its declared type new-allocation range; historical IDs are not rejected for this alone', { type, id, locations });
      }
    });
  }
  for (const [id, locations] of occurrences) {
    for (const source of ['00_Elements', '05_Materials'] as const) {
      const matches = locations.filter(location => location.source === source);
      if (matches.length > 1) add('ERROR', 'DUPLICATE_ID', `Duplicate normalized ID in ${source}`, { id, locations: matches });
    }
    if (new Set(locations.map(location => location.source)).size > 1) {
      add('ERROR', 'CROSS_SOURCE_COLLISION', 'Normalized ID exists in both Elements and Materials', { id, locations });
    }
  }
  const headers = input.counters[0] ?? [];
  const counterSchemaOk = headers.length === 2 && headers[0] === 'Type' && (headers[1] === 'LastID' || headers[1] === 'Last_ID');
  if (!counterSchemaOk) add('ERROR', 'INVALID_COUNTER_SCHEMA', 'Expected exactly Type | LastID or Type | Last_ID',
    { locations: [{ source: '_Config_ID_Counters', row: 1 }] });
  const counterRows = input.counters.slice(1);
  if (counterSchemaOk) counterRows.forEach((row, index) => {
    if (!row.every(blank) && !isType(row[0])) add('ERROR', 'INVALID_COUNTER_TYPE', 'Missing, malformed or unknown counter Type',
      { locations: [{ source: '_Config_ID_Counters', row: index + 2 }] });
  });
  const analysis: IDTypeAnalysis[] = types.map(type => {
    const [min, max] = ID_RANGES[type];
    const maxDeclaredTypeId = maximum(declared.get(type)!);
    const maxOccupiedInAllocationRange = maximum([...occupied].filter(id => id >= min && id <= max));
    const result: IDTypeAnalysis = { type, lastId: null, maxDeclaredTypeId, maxOccupiedInAllocationRange,
      counterPlusOne: null, counterPlusOneOccupied: null, candidateWithoutOccupied: null,
      candidateWithoutOccupiedIsOccupied: null, nextId: null, nextIdOccupied: null };
    if (!counterSchemaOk) return result;
    const matches = counterRows.map((row, index) => ({ row, index })).filter(({ row }) => row[0] === type);
    if (matches.length !== 1) {
      add('ERROR', matches.length ? 'DUPLICATE_COUNTER_TYPE' : 'MISSING_COUNTER_TYPE', 'Expected exactly one counter for type',
        { type, locations: matches.map(({ index }) => ({ source: '_Config_ID_Counters', row: index + 2 })) });
      return result;
    }
    try { result.lastId = normalizeIntegerId(matches[0].row[1], 'Last_ID'); } catch {
      add('ERROR', 'INVALID_LAST_ID', 'Last_ID is not a nonnegative safe integer or decimal digit string',
        { type, locations: [{ source: '_Config_ID_Counters', row: matches[0].index + 2 }] });
      return result;
    }
    const last = result.lastId;
    if (last < Number.MAX_SAFE_INTEGER) {
      result.counterPlusOne = last + 1;
      result.counterPlusOneOccupied = occupied.has(last + 1);
    }
    if (maxOccupiedInAllocationRange !== null && maxOccupiedInAllocationRange > last) {
      add('WARNING', 'COUNTER_BEHIND_OCCUPIED_RANGE', 'Occupied range maximum exceeds Last_ID; allocator scans both sources and advances beyond it, so this alone is not an allocation error', { type });
    }
    if (maxDeclaredTypeId !== null && maxDeclaredTypeId > last && (maxDeclaredTypeId < min || maxDeclaredTypeId > max)) {
      add('INFO', 'DECLARED_MAX_OUTSIDE_RANGE', 'Declared-type maximum exceeds Last_ID outside this allocation range; possible historical schema, not a reason to raise this counter automatically', { type });
    }
    try {
      result.candidateWithoutOccupied = calculateNextId(type, last, new Set());
      result.candidateWithoutOccupiedIsOccupied = occupied.has(result.candidateWithoutOccupied);
      if (result.counterPlusOneOccupied || result.candidateWithoutOccupiedIsOccupied) {
        add('WARNING', 'CANDIDATE_OCCUPIED', 'Counter-only candidate is occupied; actual allocator includes the occupied range maximum', { type });
      }
      if (occupiedComplete) {
        result.nextId = calculateNextId(type, last, occupied);
        result.nextIdOccupied = occupied.has(result.nextId);
        add('INFO', 'NEXT_ID_PREVIEW', 'Pure allocation preview, not a reservation or Safe Commit readiness approval', { type, id: result.nextId });
      } else add('ERROR', 'ALLOCATION_PREVIEW_UNAVAILABLE', 'Invalid occupied-ID input prevents a reliable allocation preview', { type });
    } catch (error) {
      add('ERROR', 'ALLOCATION_UNAVAILABLE', String(error), { type });
    }
    return result;
  });
  const counts = { ERROR: 0, WARNING: 0, INFO: 0 };
  findings.forEach(finding => counts[finding.severity]++);
  return { scope: 'ID_INTEGRITY_ONLY', integrityOk: counts.ERROR === 0,
    allocationPreviewComplete: analysis.every(item => item.nextId !== null), counts,
    occupiedUniqueCount: occupied.size, types: analysis, findings };
}
