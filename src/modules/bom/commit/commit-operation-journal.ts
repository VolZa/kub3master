/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/commit-operation-journal.ts
 * Module: BOM
 * Layer: Infrastructure / Protocol
 * Responsibility: append-only framed events, retry and pre-creation evidence in the existing six-column journal.
 */
import { JOURNAL_HEADERS } from './safe-bom-writer';
import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
import { SpreadsheetKey } from '../../../infrastructure/spreadsheets/SpreadsheetKey';
import { normalizeIntegerId } from '../../../utils/id.logic';
import { normalizeCode, normalizeClassName } from '../../../utils/normalize';
import type { PreparedBOM, BOMPreparationInput } from '../preparation/bom-preparation.model';
import type { ElementRow } from '../../elements/element.model';
import type { OperationEvent, OperationManifest, OperationState, InsertIntent, CreationVerifier, JournalResult } from './commit-operation.model';

function canonical(value: unknown): unknown {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid date');
    return { $date: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new Error('Unsupported journal value');
}
const stringify = (value: unknown) => JSON.stringify(canonical(value));
const parse = (text: string) => JSON.parse(text, (_key, value) => value && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.$date === 'string' ? new Date(value.$date) : value);
export function commitDigest(value: unknown): string {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, stringify(value), Utilities.Charset.UTF_8)
    .map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}
function textDigest(text: string) { return commitDigest(text); }
const same = (a: unknown, b: unknown) => stringify(a) === stringify(b);
function token(value: string) { if (!/^[A-Za-z0-9:_-]{1,120}$/.test(value)) throw new Error('Invalid event/local key'); }
function realID(value: unknown): string {
  const id = String(normalizeIntegerId(value, 'Element ID'));
  if (value !== id) throw new Error('Element ID must be canonical text');
  return id;
}
function chunks(text: string): string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 20000, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    result.push(text.slice(start, end)); start = end;
  }
  return result;
}
interface Entry { kind: string; payload: string; digest: string }
interface Frame { eventID: string; count: number; length: number; digest: string }
interface Decoded { events: OperationEvent[]; incomplete?: { frame: Frame; pieces: string[] } }

/** Every API requires a caller-owned ScriptLock; this module never reserves IDs or inserts Elements. */
export class CommitOperationJournal {
  constructor(private readonly sheet: GoogleAppsScript.Spreadsheet.Sheet,
    private readonly lock: GoogleAppsScript.Lock.Lock, private readonly verifier?: CreationVerifier) {}
  private guard() {
    if (!this.lock.hasLock()) throw new Error('Caller-owned ScriptLock required');
    if (this.sheet.getLastColumn() !== JOURNAL_HEADERS.length ||
      !same(this.sheet.getRange(1, 1, 1, JOURNAL_HEADERS.length).getValues()[0], JOURNAL_HEADERS)) throw new Error('Invalid commit journal schema');
  }
  private entries(operationID: string): Entry[] {
    this.guard();
    let previous = '';
    return this.sheet.getDataRange().getValues().slice(1).filter(row => row[0] === operationID).map((row, index) => {
      const [op, kind, sequence, payload, digest] = row;
      // Same six-column physical chain tuple as writer, but canonical JSON for the operation protocol.
      const expected = commitDigest([op, kind, sequence, payload, previous]);
      if (sequence !== index || typeof payload !== 'string' || expected !== digest) throw new Error('Corrupt/incomplete operation record');
      previous = digest;
      return { kind, payload, digest };
    });
  }
  private appendRecord(operationID: string, kind: string, payload: string) {
    const entries = this.entries(operationID);
    if (payload.length > 20000) throw new Error('Journal record too large');
    const digest = commitDigest([operationID, kind, entries.length, payload, entries[entries.length - 1]?.digest ?? '']);
    this.sheet.appendRow([operationID, kind, entries.length, `'${payload}`, digest, new Date()]);
    SpreadsheetApp.flush();
    const confirmed = this.entries(operationID);
    if (confirmed.length !== entries.length + 1 || confirmed[confirmed.length - 1].digest !== digest) throw new Error('Operation record not confirmed');
  }
  private decode(operationID: string): Decoded {
    const entries = this.entries(operationID);
    const events: OperationEvent[] = [];
    for (let i = 0; i < entries.length;) {
      if (entries[i].kind !== 'OP_FRAME') throw new Error('Invalid event frame');
      const frame = parse(entries[i++].payload) as Frame;
      token(frame.eventID);
      if (!Number.isSafeInteger(frame.count) || frame.count < 1 || !Number.isSafeInteger(frame.length) || frame.length < 1 || !/^[0-9a-f]{64}$/.test(frame.digest)) throw new Error('Incomplete event manifest');
      const pieces: string[] = [];
      while (pieces.length < frame.count && i < entries.length) {
        if (entries[i].kind !== 'OP_DATA') throw new Error('Missing event chunks');
        pieces.push(entries[i++].payload);
      }
      if (pieces.length !== frame.count || i === entries.length) return { events, incomplete: { frame, pieces } };
      if (entries[i].kind !== 'OP_END' || !same(parse(entries[i++].payload), { eventID: frame.eventID, digest: frame.digest })) throw new Error('Invalid event completion marker');
      const text = pieces.join('');
      if (text.length !== frame.length || textDigest(text) !== frame.digest) throw new Error('Event payload digest mismatch');
      const event = parse(text) as OperationEvent;
      if (event.eventID !== frame.eventID || events.some(old => old.eventID === event.eventID)) throw new Error('Duplicate/conflicting event ID');
      events.push(event);
    }
    return { events };
  }
  private manifest(operationID: string, input: BOMPreparationInput, prepared: PreparedBOM): OperationManifest {
    if (!/^[A-Za-z0-9_-]{1,116}$/.test(operationID) || operationID.endsWith('_BOM')) throw new Error('Invalid/reserved OperationID');
    if (input.parentInput !== prepared.sourceContext.parentInput || input.specification !== prepared.sourceContext.specification ||
        (input.projectDocumentID ?? '') !== (prepared.sourceContext.projectDocumentID ?? '')) throw new Error('Prepared source context mismatch');
    const keys = prepared.pendingElements.map(item => item.localKey);
    keys.forEach(token);
    if (new Set(keys).size !== keys.length || new Set(prepared.writeScope.initializeMaterialBOMFor).size !== prepared.writeScope.initializeMaterialBOMFor.length ||
        prepared.writeScope.initializeMaterialBOMFor.some(key => !keys.includes(key))) throw new Error('Invalid pending scope');
    if (!same(prepared.parent, prepared.writeScope.root)) throw new Error('Root/writeScope mismatch');
    if (!['product', 'assembly', 'part'].includes(prepared.rootType) || !Array.isArray(prepared.components) ||
        !prepared.components.length || !Array.isArray(prepared.plannedEdges) || !prepared.plannedEdges.length ||
        !Array.isArray(prepared.sourceContext.searchProjectDocumentIDs)) throw new Error('Incomplete prepared manifest');
    const validRef = (ref: PreparedBOM['plannedEdges'][number]['child']) => {
      if (ref.kind === 'pending-element') { if (!keys.includes(ref.localKey)) throw new Error('Unknown pending reference'); }
      else if (ref.kind === 'existing-element') realID(ref.element.id);
      else if (ref.kind === 'material') { realID(ref.material.id); if (!ref.material.code || !ref.material.baseUnit) throw new Error('Incomplete canonical material'); }
      else throw new Error('Invalid prepared reference');
    };
    validRef(prepared.parent);
    const pendingRootKey = prepared.parent.kind === 'pending-element' ? prepared.parent.localKey : undefined;
    const rootRow = prepared.parent.kind === 'existing-element' ? prepared.parent.element
      : prepared.pendingElements.find(item => item.localKey === pendingRootKey)?.row;
    if (!rootRow || ('Type' in rootRow ? rootRow.Type : rootRow.type) !== prepared.rootType) throw new Error('Root type mismatch');
    prepared.pendingElements.forEach(item => {
      if (!item.row.Code || !item.row.Name || !item.row.PrefixName || !item.row.Category || !item.row.BaseUnit ||
          !['product', 'assembly', 'part'].includes(item.row.Type) || 'ID' in item.row || 'CreatedAt' in item.row) throw new Error('Incomplete pending Element');
    });
    prepared.components.forEach(component => {
      validRef(component.ref);
      if (!component.input || !component.identity?.code || !['project-element', 'material-part', 'direct-material'].includes(component.identity.kind)) throw new Error('Incomplete component identity');
      if (component.identity.kind !== 'project-element') realID(component.identity.materialID);
      if (component.identity.kind === 'material-part' && !component.identity.geometry) throw new Error('Material Part geometry required');
    });
    prepared.plannedEdges.forEach(edge => { validRef(edge.parent); validRef(edge.child); if (!Number.isFinite(edge.qty) || edge.qty <= 0 || !edge.unit) throw new Error('Invalid planned edge'); });
    for (const key of prepared.writeScope.initializeMaterialBOMFor) {
      const pending = prepared.pendingElements.find(item => item.localKey === key)!;
      const edges = prepared.plannedEdges.filter(edge => edge.parent.kind === 'pending-element' && edge.parent.localKey === key);
      if (pending.row.Type !== 'part' || !pending.row.ParentMaterialID || edges.length !== 1 || edges[0].child.kind !== 'material' ||
          realID(edges[0].child.material.id) !== realID(pending.row.ParentMaterialID)) throw new Error('Invalid material initialization scope');
    }
    if (prepared.plannedEdges.some(edge => !same(edge.parent, prepared.parent) &&
        !(edge.parent.kind === 'pending-element' && prepared.writeScope.initializeMaterialBOMFor.includes(edge.parent.localKey)))) throw new Error('Planned edge outside writeScope');
    return { version: 1, operationID, writerOperationID: `${operationID}_BOM`, requestDigest: commitDigest(input), input, prepared };
  }
  private reduce(events: OperationEvent[]): OperationState {
    const first = events[0];
    if (first?.type !== 'INITIALIZED') throw new Error('Operation manifest is not durable');
    const manifest = first.data.manifest as OperationManifest;
    if (!manifest || manifest.version !== 1 || !same(manifest, this.manifest(manifest.operationID, manifest.input, manifest.prepared))) throw new Error('Invalid operation manifest');
    const state: OperationState = { manifest, status: 'PREPARING', events: [], elements: {} };
    for (const event of events) {
      token(event.eventID);
      if (state.events.some(old => old.eventID === event.eventID)) throw new Error('Duplicate event');
      if (event !== first) {
        if (state.status === 'COMPLETED' || state.status === 'CONFLICT') throw new Error('Terminal operation cannot transition');
        const key = event.data.localKey as string;
        const pending = manifest.prepared.pendingElements.find(item => item.localKey === key);
        const previous = state.elements[key];
        if (event.type === 'READY') {
          if (state.status !== 'PREPARING') throw new Error('Invalid READY transition'); state.status = 'READY';
        } else if (event.type === 'CONFLICT') {
          if (typeof event.data.reason !== 'string' || !event.data.reason) throw new Error('Conflict reason required'); state.status = 'CONFLICT';
        } else if (event.type === 'BOM_READY') {
          if (!['READY', 'CREATING'].includes(state.status) || manifest.prepared.pendingElements.some(item => !['CREATED', 'REUSED'].includes(state.elements[item.localKey]?.status))) throw new Error('Unresolved Elements before BOM_READY');
          state.status = 'BOM_READY';
        } else if (event.type === 'COMPLETED') {
          if (state.status !== 'BOM_READY' || event.data.writerOperationID !== manifest.writerOperationID || !['COMMITTED', 'RECOVERED', 'ALREADY_APPLIED'].includes(String(event.data.writerStatus))) throw new Error('Writer completion evidence required'); state.status = 'COMPLETED';
        } else {
          if (!pending || !['READY', 'CREATING'].includes(state.status)) throw new Error('Element event requires durable READY and known localKey');
          if (event.type === 'RESERVING') {
            if (previous) throw new Error('Element already has a reservation/decision');
            state.elements[key] = { status: 'RESERVING' };
          } else if (event.type === 'INSERT_INTENT') {
            if (previous?.status !== 'RESERVING') throw new Error('RESERVING required before INSERT_INTENT');
            const intent = event.data.intent as InsertIntent;
            const knownRefs = [manifest.prepared.parent, ...manifest.prepared.plannedEdges.flatMap(edge => [edge.parent, edge.child])];
            const knownIDs = knownRefs.flatMap(ref => ref.kind === 'existing-element' ? [ref.element.id] : ref.kind === 'material' ? [ref.material.id] : []);
            if (!intent || intent.localKey !== key || realID(intent.reservedID) !== realID(intent.row.ID) || !(intent.row.CreatedAt instanceof Date) ||
                !same(intent.row, { ...pending.row, ID: intent.reservedID, CreatedAt: intent.row.CreatedAt }) ||
                knownIDs.includes(intent.reservedID) ||
                Object.values(state.elements).some(element => element.id === intent.reservedID)) throw new Error('Incomplete/conflicting canonical INSERT_INTENT');
            state.elements[key] = { status: 'INSERT_INTENT', intent, id: intent.reservedID };
          } else if (event.type === 'CREATED') {
            const intentEvent = state.events.find(old => old.type === 'INSERT_INTENT' && old.data.localKey === key);
            if (previous?.status !== 'INSERT_INTENT' || event.data.readbackKind !== 'physical-readback-v1' ||
                event.data.insertIntentEventID !== intentEvent?.eventID || event.data.insertIntentDigest !== commitDigest(previous.intent) ||
                !same(event.data.row, previous.intent?.row) || event.data.rowDigest !== commitDigest(previous.intent?.row)) throw new Error('Physical creation evidence required');
            state.elements[key] = { ...previous, status: 'CREATED' };
          } else if (event.type === 'REUSED') {
            if (previous && previous.status !== 'RESERVING') throw new Error('Cannot reuse after INSERT_INTENT');
            const row = event.data.row as ElementRow;
            realID(row.ID);
            const materialPart = !!pending.row.ParentMaterialID;
            const fields = ['Type', 'ProfileType', 'Diameter', 'Class', 'Width', 'Height', 'Length', 'Thickness'] as const;
            if (row.Type !== pending.row.Type || (materialPart ? normalizeCode(row.Code) !== normalizeCode(pending.row.Code) : row.Code !== pending.row.Code) ||
                (materialPart ? realID(row.ParentMaterialID) !== realID(pending.row.ParentMaterialID) : (row.ProjectDocumentID ?? '') !== (pending.row.ProjectDocumentID ?? '')) ||
                (!materialPart && (row.ParentMaterialID ?? '') !== (pending.row.ParentMaterialID ?? '')) ||
                fields.some(field => field === 'Class' ? normalizeClassName(String(row[field] ?? '')) !== normalizeClassName(String(pending.row[field] ?? '')) : row[field] !== pending.row[field])) throw new Error('Reused Element identity mismatch');
            state.elements[key] = { status: 'REUSED', id: row.ID };
          } else throw new Error('Invalid operation event type');
          state.status = 'CREATING';
        }
      }
      state.events.push(event);
    }
    return state;
  }
  load(operationID: string): OperationState {
    const decoded = this.decode(operationID);
    // Incomplete events are never exposed as durable or executable actions.
    const state = this.reduce(decoded.events);
    if (decoded.incomplete) throw new Error(`Incomplete event ${decoded.incomplete.frame.eventID}; retry original event to finish persistence`);
    return state;
  }
  private persist(operationID: string, event: OperationEvent): JournalResult {
    try {
      const decoded = this.decode(operationID);
      const old = decoded.events.find(item => item.eventID === event.eventID);
      if (old) {
        if (!same(old, event)) return { status: 'CONFLICT', error: 'EventID reused with another payload' };
        if (decoded.incomplete) return { status: 'CONFLICT', error: 'Another incomplete event must be repaired first' };
        return { status: 'ALREADY_APPLIED', state: this.reduce(decoded.events) };
      }
      const state = this.reduce([...decoded.events, event]); // Validate before any writes.
      const text = stringify(event), pieces = chunks(text);
      const frame: Frame = { eventID: event.eventID, count: pieces.length, length: text.length, digest: textDigest(text) };
      if (decoded.incomplete) {
        if (!same(decoded.incomplete.frame, frame) || decoded.incomplete.pieces.some((piece, index) => piece !== pieces[index])) return { status: 'CONFLICT', error: 'Incomplete event differs from retry' };
      } else this.appendRecord(operationID, 'OP_FRAME', stringify(frame));
      for (let index = decoded.incomplete?.pieces.length ?? 0; index < pieces.length; index++) this.appendRecord(operationID, 'OP_DATA', pieces[index]);
      this.appendRecord(operationID, 'OP_END', stringify({ eventID: event.eventID, digest: frame.digest }));
      const confirmed = this.load(operationID);
      if (!same(confirmed, state)) throw new Error('Event durability not confirmed');
      return { status: 'APPLIED', state: confirmed };
    } catch (error) { return { status: 'CONFLICT', error: String(error) }; }
  }
  begin(operationID: string, input: BOMPreparationInput, prepared: PreparedBOM): JournalResult {
    try {
      const manifest = this.manifest(operationID, input, prepared);
      const decoded = this.decode(operationID);
      if (!decoded.events.length && !decoded.incomplete && this.sheet.getDataRange().getValues().some(row => row[0] === manifest.writerOperationID)) return { status: 'CONFLICT', error: 'Orphan writer phase cannot be adopted' };
      const initialized: OperationEvent = { eventID: 'initial', type: 'INITIALIZED', data: { manifest } };
      if (decoded.events[0] && !same(decoded.events[0], initialized)) return { status: 'CONFLICT', error: 'OperationID reused with another input/plan' };
      if (!decoded.events.length || decoded.incomplete?.frame.eventID === 'initial') {
        const initial = this.persist(operationID, initialized); if (initial.status === 'CONFLICT') return initial;
      }
      if (decoded.incomplete?.frame.eventID === 'ready') return this.persist(operationID, { eventID: 'ready', type: 'READY', data: {} });
      const state = this.load(operationID);
      if (state.status !== 'PREPARING') return { status: 'ALREADY_APPLIED', state };
      return this.persist(operationID, { eventID: 'ready', type: 'READY', data: {} });
    } catch (error) { return { status: 'CONFLICT', error: String(error) }; }
  }
  reserving(operationID: string, eventID: string, localKey: string) { return this.persist(operationID, { eventID, type: 'RESERVING', data: { localKey } }); }
  insertIntent(operationID: string, eventID: string, intent: InsertIntent) { return this.persist(operationID, { eventID, type: 'INSERT_INTENT', data: { localKey: intent.localKey, intent } }); }
  reused(operationID: string, eventID: string, localKey: string, row: ElementRow) { return this.persist(operationID, { eventID, type: 'REUSED', data: { localKey, row } }); }
  confirmCreated(operationID: string, eventID: string, localKey: string): JournalResult {
    try {
      if (!this.verifier) throw new Error('Trusted physical creation verifier is not configured');
      const decoded = this.decode(operationID);
      if (decoded.incomplete && decoded.incomplete.frame.eventID !== eventID) throw new Error('Another incomplete event must be repaired first');
      const state = this.reduce(decoded.events), intent = state.elements[localKey]?.intent;
      if (!intent) throw new Error('Durable INSERT_INTENT required');
      const intentEvent = state.events.find(event => event.type === 'INSERT_INTENT' && event.data.localKey === localKey)!;
      const context = { operationID, writerOperationID: state.manifest.writerOperationID, requestDigest: state.manifest.requestDigest,
        insertIntentEventID: intentEvent.eventID, insertIntentDigest: commitDigest(intent) };
      const actual = this.verifier.readCreatedElement(parse(stringify(intent)), context);
      if (!same(actual, intent.row)) throw new Error('Physical readback differs from canonical INSERT_INTENT');
      return this.persist(operationID, { eventID, type: 'CREATED', data: { localKey, readbackKind: 'physical-readback-v1', row: actual,
        rowDigest: commitDigest(actual), insertIntentEventID: context.insertIntentEventID, insertIntentDigest: context.insertIntentDigest } });
    } catch (error) { return { status: 'CONFLICT', error: String(error) }; }
  }
  createdReceipts(operationID: string): { id: string; operationID: string }[] {
    const state = this.load(operationID);
    if (state.status === 'CONFLICT') throw new Error('Conflicted operation cannot authorize initialization');
    return state.manifest.prepared.writeScope.initializeMaterialBOMFor.flatMap(key => state.elements[key]?.status === 'CREATED'
      ? [{ id: state.elements[key].id!, operationID: state.manifest.writerOperationID }] : []);
  }
  bomReady(operationID: string, eventID: string) { return this.persist(operationID, { eventID, type: 'BOM_READY', data: {} }); }
  completed(operationID: string, eventID: string, writerOperationID: string, writerStatus: string) { return this.persist(operationID, { eventID, type: 'COMPLETED', data: { writerOperationID, writerStatus } }); }
  conflict(operationID: string, eventID: string, reason: string) { return this.persist(operationID, { eventID, type: 'CONFLICT', data: { reason } }); }
}
export function openCommitOperationJournal(lock: GoogleAppsScript.Lock.Lock, verifier?: CreationVerifier): CommitOperationJournal {
  if (!lock.hasLock()) throw new Error('Caller-owned ScriptLock required');
  const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
  const sheet = master.getSheetByName('_BOM_CommitJournal');
  if (!sheet) throw new Error('Лист _BOM_CommitJournal не знайдено в MASTER');
  return new CommitOperationJournal(sheet, lock, verifier);
}
