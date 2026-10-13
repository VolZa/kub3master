/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/safe-bom-writer.ts
 * Module: BOM
 * Layer: Application / Infrastructure
 * Responsibility: scope-bound stable-row replacement with durable journal and conservative roll-forward recovery.
 */
import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
import { SpreadsheetKey } from '../../../infrastructure/spreadsheets/SpreadsheetKey';
import { normalizeIntegerId } from '../../../utils/id.logic';

export const JOURNAL_HEADERS = ['OperationID', 'Kind', 'Sequence', 'Payload', 'Digest', 'UpdatedAt'];
const CORE = ['ParentID', 'ChildID', 'Qty', 'Unit', 'CreatedAt', 'ParentCode', 'ChildCode'];
export type JournalStatus = 'PREPARING' | 'READY' | 'APPLYING' | 'COMMITTED' | 'RECOVERY_REQUIRED' | 'CONFLICT' | 'RECOVERED';
export type Cell = string | number | boolean | { date: string } | { formula: string };
export interface SafeBOMPlan {
  operationID: string;
  rootID: string;
  affectedParentIDs: string[];
  /** Trusted creation receipts supplied by future Commit; writer never creates Elements. */
  createdParts: { id: string; operationID: string }[];
  /** Complete physical rows in the sheet header order, including additional columns/formulas. */
  targetRows: Cell[][];
}
interface Slot { row: number; before: Cell[]; target: Cell[] }
interface Payload { version: 1; request: SafeBOMPlan; headers: string[]; foreignDigest: string; slots: Slot[] }
interface RecordEntry { kind: string; sequence: number; payload: string; digest: string }
export interface SafeBOMResult { status: 'COMMITTED' | 'ALREADY_APPLIED' | 'RECOVERED' | 'CONFLICT'; operationID: string; error?: string }
const id = (value: unknown) => String(normalizeIntegerId(value, 'BOM ID'));
const json = (value: unknown) => JSON.stringify(value);
const equal = (a: unknown, b: unknown) => json(a) === json(b);
const blank = (width: number): Cell[] => Array(width).fill('');
function hash(text: string): string {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}
function encode(value: unknown, formula: string): Cell {
  if (formula) return { formula };
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid BOM date');
    return { date: value.toISOString() };
  }
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new Error('Unsupported BOM cell');
}
function wire(cell: Cell): string | number | boolean | Date {
  if (typeof cell === 'object') return 'formula' in cell ? cell.formula : new Date(cell.date);
  // Literal text is explicitly escaped, so values cannot turn into formulas.
  return typeof cell === 'string' && cell !== '' ? `'${cell}` : cell;
}
function requireSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Лист ${name} не знайдено в MASTER`);
  return sheet;
}
function readBOM(sheet: GoogleAppsScript.Spreadsheet.Sheet): { headers: string[]; rows: Cell[][] } {
  const range = sheet.getDataRange();
  if (range.getMergedRanges().length) throw new Error('Merged BOM cells require a separately approved mapping');
  const values = range.getValues();
  const formulas = range.getFormulas();
  const headers = values[0]?.map(String) ?? [];
  if (headers.length < CORE.length || CORE.some((name, index) => headers[index] !== name) ||
      headers.some(name => !name.trim()) || new Set(headers).size !== headers.length || formulas[0]?.some(Boolean)) {
    throw new Error('Unsupported 01_BOM schema; expected canonical core columns followed by unique extra headers');
  }
  const rows = values.slice(1).map((row, index) => headers.map((_, column) => encode(row[column], formulas[index + 1]?.[column] ?? '')));
  for (const row of rows) {
    if (row.every(cell => cell === '')) continue;
    if (row.slice(0, CORE.length).some(cell => typeof cell === 'object' && 'formula' in cell)) {
      throw new Error('Formulas in BOM core columns require a separately approved mapping');
    }

  }
  return { headers, rows };
}
function normalizePlan(plan: SafeBOMPlan): SafeBOMPlan {
  if (!plan.operationID || !/^[A-Za-z0-9_-]{1,120}$/.test(plan.operationID)) throw new Error('Invalid OperationID');
  const rootID = id(plan.rootID);
  const affectedParentIDs = plan.affectedParentIDs.map(id);
  if (!affectedParentIDs.includes(rootID) || new Set(affectedParentIDs).size !== affectedParentIDs.length) throw new Error('Invalid writeScope');
  const createdParts = plan.createdParts.map(receipt => ({ id: id(receipt.id), operationID: receipt.operationID }));
  if (new Set(createdParts.map(receipt => receipt.id)).size !== createdParts.length ||
      createdParts.some(receipt => receipt.operationID !== plan.operationID || receipt.id === rootID) ||
      affectedParentIDs.some(parent => parent !== rootID && !createdParts.some(receipt => receipt.id === parent)) ||
      createdParts.some(receipt => !affectedParentIDs.includes(receipt.id))) throw new Error('Scope requires creation receipts from this operation');
  const keys = new Set<string>();
  const targetRows = plan.targetRows.map(row => {
    const copy = row.map(cell => {
      if ((typeof cell === 'string' && cell.length > 45000) ||
          (typeof cell === 'object' && cell !== null && 'formula' in cell && cell.formula.length > 45000)) {
        throw new Error('Target cell exceeds conservative Sheets size limit');
      }
      if (typeof cell === 'object' && cell !== null) {
        if ('date' in cell && Object.keys(cell).length === 1 && Number.isFinite(new Date(cell.date).getTime())) return { date: new Date(cell.date).toISOString() };
        if ('formula' in cell && Object.keys(cell).length === 1 && typeof cell.formula === 'string' && cell.formula.startsWith('=')) return { formula: cell.formula };
        throw new Error('Invalid target cell');
      }
      return encode(cell, '');
    });
    copy[0] = id(copy[0]); copy[1] = id(copy[1]);
    if (!affectedParentIDs.includes(String(copy[0]))) throw new Error('ParentID outside writeScope');
    if (typeof copy[2] !== 'number' || !Number.isFinite(copy[2]) || copy[2] <= 0 || typeof copy[3] !== 'string' || !copy[3].trim()) throw new Error('Invalid quantity or unit');
    if (copy.slice(0, CORE.length).some(cell => typeof cell === 'object' && 'formula' in cell)) throw new Error('Target core formulas are unsupported');
    const key = json([copy[0], copy[1], copy[3]]);
    if (keys.has(key)) throw new Error('Duplicate target edge');
    keys.add(key);
    return copy;
  });
  if (!targetRows.some(row => row[0] === rootID) || createdParts.some(receipt => !targetRows.some(row => row[0] === receipt.id))) throw new Error('Empty replacement/deletion requires a separate explicit operation');
  return { operationID: plan.operationID, rootID, affectedParentIDs, createdParts, targetRows };
}
function scopedRows(rows: Cell[][], parents: string[]): Cell[][] {
  return rows.filter(row => row[0] !== '' && parents.includes(id(row[0])));
}
function semantic(rows: Cell[][]): string[] {
  // CreatedAt is physical metadata; it does not make a repeat a different BOM.
  return rows.map(row => json(row.map((cell, column) => column === 4 ? '' : column < 2 ? id(cell) : cell))).sort();
}
function sameRequest(a: SafeBOMPlan, b: SafeBOMPlan): boolean {
  return a.operationID === b.operationID && a.rootID === b.rootID &&
    equal([...a.affectedParentIDs].sort(), [...b.affectedParentIDs].sort()) &&
    equal(a.createdParts.map(receipt => json(receipt)).sort(), b.createdParts.map(receipt => json(receipt)).sort()) &&
    equal(semantic(a.targetRows), semantic(b.targetRows));
}
function foreignDigest(rows: Cell[][], slots: Slot[]): string {
  const numbers = new Set(slots.map(slot => slot.row));
  return hash(json(rows.flatMap((row, index) => numbers.has(index + 2) || row.every(cell => cell === '') ? [] : [[index + 2, row]])));
}
class CommitJournal {
  constructor(private readonly sheet: GoogleAppsScript.Spreadsheet.Sheet, private readonly operationID: string) {
    const headers = sheet.getRange(1, 1, 1, JOURNAL_HEADERS.length).getValues()[0];
    if (!equal(headers, JOURNAL_HEADERS) || sheet.getLastColumn() !== JOURNAL_HEADERS.length) throw new Error('Invalid _BOM_CommitJournal schema');
  }
  sheetHasOperation(): boolean {
    return this.sheet.getDataRange().getValues().slice(1).some(row => row[0] === this.operationID);
  }
  entries(): RecordEntry[] {
    const data = this.sheet.getDataRange().getValues().slice(1).filter(row => row[0] === this.operationID);
    let previous = '';
    return data.map((row, index) => {
      const [operation, kind, sequence, payload, digest] = row;
      if (sequence !== index || typeof kind !== 'string' || typeof payload !== 'string' ||
          hash(json([operation, kind, sequence, payload, previous])) !== digest) throw new Error('Incomplete or corrupt commit journal chain');
      previous = digest;
      return { kind, sequence, payload, digest };
    });
  }
  append(kind: string, payload: string): void {
    if (payload.length > 20000) throw new Error('Journal cell exceeds payload limit');
    const entries = this.entries();
    const sequence = entries.length;
    const digest = hash(json([this.operationID, kind, sequence, payload, entries[entries.length - 1]?.digest ?? '']));
    this.sheet.appendRow([this.operationID, kind, sequence, `'${payload}`, digest, new Date()]);
    SpreadsheetApp.flush();
    const persisted = this.entries();
    if (persisted.length !== sequence + 1 || persisted[sequence].digest !== digest) throw new Error('Journal write not confirmed');
  }
  status(status: JournalStatus, error = '') { this.append('STATUS', json({ status, error })); }
  save(payload: Payload) {
    const serialized = json(payload);
    const chunks: string[] = [];
    for (let start = 0; start < serialized.length;) {
      let end = Math.min(start + 20000, serialized.length);
      if (end < serialized.length && /[\uD800-\uDBFF]/.test(serialized[end - 1])) end--;
      chunks.push(serialized.slice(start, end)); start = end;
    }
    this.append('META', json({ status: 'PREPARING', count: chunks.length, length: serialized.length, digest: hash(serialized) }));
    for (const chunk of chunks) this.append('CHUNK', chunk);
    this.status('READY');
    const stored = this.load();
    if (!equal(stored.payload, payload) || stored.status !== 'READY') throw new Error('Journal READY verification failed');
  }
  load(): { payload: Payload; status: JournalStatus } {
    const entries = this.entries();
    if (entries[0]?.kind !== 'META') throw new Error('Missing journal manifest');
    const meta = JSON.parse(entries[0].payload);
    const chunks = entries.filter(entry => entry.kind === 'CHUNK');
    const serialized = chunks.map(entry => entry.payload).join('');
    if (chunks.length !== meta.count || serialized.length !== meta.length || hash(serialized) !== meta.digest ||
        entries.slice(1, 1 + meta.count).some(entry => entry.kind !== 'CHUNK')) throw new Error('Incomplete journal payload');
    const statuses = entries.filter(entry => entry.kind === 'STATUS').map(entry => JSON.parse(entry.payload).status);
    if (!statuses.includes('READY')) throw new Error('Journal not READY');
    if (statuses.some(status => !['READY', 'APPLYING', 'COMMITTED', 'RECOVERY_REQUIRED', 'CONFLICT', 'RECOVERED'].includes(status))) throw new Error('Invalid journal status');
    const payload = JSON.parse(serialized) as Payload;
    if (payload.version !== 1 || !Array.isArray(payload.slots) || !Array.isArray(payload.headers)) throw new Error('Invalid journal payload');
    return { payload, status: statuses[statuses.length - 1] };
  }
}
function withLock<T>(action: (lock: GoogleAppsScript.Lock.Lock) => T): T {
  const lock = LockService.getScriptLock();
  if (lock.hasLock()) throw new Error('Safe writer must not be called under an already held ScriptLock');
  if (!lock.tryLock(30000)) throw new Error('Cannot acquire BOM ScriptLock');
  try { return action(lock); } finally { lock.releaseLock(); }
}
function checkSlots(rows: Cell[][], payload: Payload, targetOnly: boolean): boolean {
  return payload.slots.every(slot => {
    const current = rows[slot.row - 2] ?? blank(payload.headers.length);
    return current.every((cell, column) => equal(cell, slot.target[column]) || (!targetOnly && equal(cell, slot.before[column])));
  });
}
function apply(sheet: GoogleAppsScript.Spreadsheet.Sheet, journal: CommitJournal, payload: Payload, recovery: boolean, terminal = false): SafeBOMResult {
  const operationID = payload.request.operationID;
  const read = () => {
    const state = readBOM(sheet);
    if (!equal(state.headers, payload.headers) || foreignDigest(state.rows, payload.slots) !== payload.foreignDigest ||
        scopedRows(state.rows, payload.request.affectedParentIDs).some(row => !payload.slots.some(slot => equal(row, state.rows[slot.row - 2])))) {
      throw new Error('External BOM/schema conflict');
    }
    return state.rows;
  };
  try {
    let rows = read();
    const noIncompleteRetiredRows = payload.slots.every(slot => {
      const current = rows[slot.row - 2] ?? blank(payload.headers.length);
      return current.every(cell => cell === '') || (current[0] !== '' && payload.request.affectedParentIDs.includes(id(current[0])));
    });
    if (noIncompleteRetiredRows && equal(semantic(scopedRows(rows, payload.request.affectedParentIDs)), semantic(payload.request.targetRows))) {
      if (terminal) return { status: 'ALREADY_APPLIED', operationID };
      journal.status(recovery ? 'RECOVERED' : 'COMMITTED');
      return { status: recovery ? 'RECOVERED' : 'ALREADY_APPLIED', operationID };
    }
    if (terminal) throw new Error('Completed operation conflict; current BOM no longer matches its target');
    if (!checkSlots(rows, payload, false)) throw new Error('Scoped BOM conflict; recovery cannot overwrite external values');
    journal.status('APPLYING');
    for (const slot of payload.slots) {
      rows = read();
      if (!checkSlots(rows, payload, false)) throw new Error('BOM conflict before write');
      const current = rows[slot.row - 2] ?? blank(payload.headers.length);
      if (!equal(current, slot.target)) {
        sheet.getRange(slot.row, 1, 1, payload.headers.length).setValues([slot.target.map(wire)]);
        SpreadsheetApp.flush();
      }
    }
    rows = read();
    if (!checkSlots(rows, payload, true) || !equal(semantic(scopedRows(rows, payload.request.affectedParentIDs)), semantic(payload.request.targetRows))) throw new Error('BOM verification failed');
    journal.status(recovery ? 'RECOVERED' : 'COMMITTED');
    return { status: recovery ? 'RECOVERED' : 'COMMITTED', operationID };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const conflict = /conflict/i.test(message);
    try { journal.status(conflict ? 'CONFLICT' : 'RECOVERY_REQUIRED', message); } catch { /* Earlier durable records remain the recovery source. */ }
    if (conflict) return { status: 'CONFLICT', operationID, error: message };
    throw new Error(`BOM recovery required for ${operationID}: ${message}`);
  }
}
export function writeSafeBOM(input: SafeBOMPlan): SafeBOMResult {
  normalizePlan(input);
  return withLock(lock => writeSafeBOMUnderLock(input, lock));
}
export function writeSafeBOMUnderLock(input: SafeBOMPlan, lock: GoogleAppsScript.Lock.Lock): SafeBOMResult {
  if (!lock.hasLock()) throw new Error('Caller-owned ScriptLock required');
  const plan = normalizePlan(input); // Invalid plans cannot cause any journal or BOM writes.
    const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
    const sheet = requireSheet(master, '01_BOM');
    const journal = new CommitJournal(requireSheet(master, '_BOM_CommitJournal'), plan.operationID);
    if (journal.sheetHasOperation()) {
      let stored: ReturnType<CommitJournal['load']>;
      try { stored = journal.load(); } catch (error) { return { status: 'CONFLICT', operationID: plan.operationID, error: String(error) }; }
      if (!sameRequest(stored.payload.request, plan)) return { status: 'CONFLICT', operationID: plan.operationID, error: 'OperationID reused with another request' };
      if (stored.status === 'CONFLICT') return { status: 'CONFLICT', operationID: plan.operationID, error: 'Explicit conflict resolution required' };
      const terminal = ['COMMITTED', 'RECOVERED'].includes(stored.status);
      return apply(sheet, journal, stored.payload, !terminal, terminal);
    }
    const state = readBOM(sheet);
    if (plan.targetRows.some(row => row.length !== state.headers.length)) throw new Error('Target rows must include every physical BOM column');
    const existing = scopedRows(state.rows, plan.affectedParentIDs);
    if (equal(semantic(existing), semantic(plan.targetRows))) return { status: 'ALREADY_APPLIED', operationID: plan.operationID };
    if (plan.createdParts.some(receipt => state.rows.some(row => row[0] !== '' && id(row[0]) === receipt.id))) throw new Error('Cannot initialize a Part with an existing BOM');
    const indices = state.rows.flatMap((row, index) => row[0] !== '' && plan.affectedParentIDs.includes(id(row[0])) ? [index + 2] : []);
    while (indices.length < plan.targetRows.length) indices.push(state.rows.length + 2 + (indices.length - existing.length));
    const slots = indices.map((row, index) => ({ row, before: state.rows[row - 2] ?? blank(state.headers.length), target: plan.targetRows[index] ?? blank(state.headers.length) }));
    if (slots.some(slot => sheet.getRange(slot.row, 1, 1, state.headers.length).isPartOfMerge())) throw new Error('Merged target BOM cells are unsupported');
    const payload: Payload = { version: 1, request: plan, headers: state.headers, foreignDigest: foreignDigest(state.rows, slots), slots };
    journal.save(payload);
    return apply(sheet, journal, payload, false);
}
export function recoverSafeBOM(operationID: string): SafeBOMResult {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(operationID)) throw new Error('Invalid OperationID');
  return withLock(lock => recoverSafeBOMUnderLock(operationID, lock));
}
export function recoverSafeBOMUnderLock(operationID: string, lock: GoogleAppsScript.Lock.Lock): SafeBOMResult {
  if (!lock.hasLock()) throw new Error('Caller-owned ScriptLock required');
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(operationID)) throw new Error('Invalid OperationID');
    const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
    const journal = new CommitJournal(requireSheet(master, '_BOM_CommitJournal'), operationID);
    let stored: ReturnType<CommitJournal['load']>;
    try { stored = journal.load(); } catch (error) { return { status: 'CONFLICT', operationID, error: String(error) }; }
    if (stored.status === 'CONFLICT') return { status: 'CONFLICT', operationID, error: 'Explicit conflict resolution required' };
    const terminal = ['COMMITTED', 'RECOVERED'].includes(stored.status);
    return apply(requireSheet(master, '01_BOM'), journal, stored.payload, !terminal, terminal);
}
