/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/recoverable-element-creation.ts
 * Module: BOM commit
 * Layer: Application
 * Responsibility: durable-intent Element creation and fresh readback recovery without BOM mutation.
 */
import { generateIdByTypeUnderLock } from '../../../utils/id';
import { requireScriptLock, withScriptLock } from '../../../utils/script-lock';
import { normalizeCode, normalizeClassName } from '../../../utils/normalize';
import { commitDigest, openCommitOperationJournal, CommitOperationJournal } from './commit-operation-journal';
import { MasterFreshElementStore, physicalElement, type FreshElementStore } from './fresh-element-store';
import type { ElementRow } from '../../elements/element.model';
import type { CreationVerifier, InsertIntent, JournalResult } from './commit-operation.model';
import type { ElementType } from '../../../config/config';
type PendingRow = Omit<ElementRow, 'ID' | 'CreatedAt'>;
export function candidates(rows: ElementRow[], expected: PendingRow): ElementRow[] {
  return rows.filter(row => expected.ParentMaterialID
    ? normalizeCode(row.Code) === normalizeCode(expected.Code)
    : row.Code === expected.Code && (row.ProjectDocumentID ?? '') === (expected.ProjectDocumentID ?? ''));
}
export function identity(row: ElementRow, expected: PendingRow): boolean {
  const fields = ['Type', 'ProfileType', 'Diameter', 'Width', 'Height', 'Length', 'Thickness'] as const;
  return fields.every(key => (row[key] ?? '') === (expected[key] ?? '')) &&
    normalizeClassName(row.Class ?? '') === normalizeClassName(expected.Class ?? '') &&
    (expected.ParentMaterialID ? row.ParentMaterialID === expected.ParentMaterialID : !(row.ParentMaterialID ?? '')) &&
    row.BaseUnit === expected.BaseUnit;
}
export function verifiedRow(store: FreshElementStore, intent: InsertIntent): ElementRow {
  const rows = store.read(), byID = rows.filter(row => row.ID === intent.reservedID);
  const matches = candidates(rows, intent.row);
  if (byID.length !== 1 || matches.length !== 1 || matches[0].ID !== intent.reservedID ||
      commitDigest(physicalElement(byID[0])) !== commitDigest(physicalElement(intent.row))) throw new Error('Physical Element conflicts with durable intent');
  // Return the journal representation only after comparing every persisted column.
  return intent.row;
}
function accepted(result: JournalResult) {
  if (result.status === 'CONFLICT') throw new Error(result.error);
  return result.state;
}
export class RecoverableElementCreation {
  constructor(private readonly journal: CommitOperationJournal, private readonly store: FreshElementStore,
    private readonly lock: GoogleAppsScript.Lock.Lock,
    private readonly allocate: (type: ElementType, lock: GoogleAppsScript.Lock.Lock) => string = generateIdByTypeUnderLock,
    private readonly now: () => Date = () => new Date()) {}
  receipts(operationID: string): { id: string; operationID: string }[] {
    requireScriptLock(this.lock);
    const state = this.journal.load(operationID);
    for (const element of Object.values(state.elements)) {
      if (element.status === 'CREATED') verifiedRow(this.store, element.intent!);
    }
    return this.journal.createdReceipts(operationID);
  }
  create(operationID: string, localKey: string): JournalResult {
    try {
      requireScriptLock(this.lock);
      this.journal.repairCreationTail(operationID);
      let state = this.journal.load(operationID);
      if (!['READY', 'CREATING', 'BOM_READY', 'COMPLETED'].includes(state.status)) throw new Error('Operation is not creation-ready');
      const pending = state.manifest.prepared.pendingElements.find(item => item.localKey === localKey);
      if (!pending) throw new Error('Unknown pending localKey');
      const decision = state.elements[localKey];
      if (decision?.status === 'REUSED') {
        const matches = candidates(this.store.read(), pending.row);
        if (matches.length !== 1 || matches[0].ID !== decision.id || !identity(matches[0], pending.row)) throw new Error('Reused identity changed');
        return { status: 'ALREADY_APPLIED', state };
      }
      if (decision?.status === 'CREATED') {
        verifiedRow(this.store, decision.intent!);
        return { status: 'ALREADY_APPLIED', state };
      }
      if (!['READY', 'CREATING'].includes(state.status)) throw new Error('Unresolved Element in terminal phase');
      // Product policy permits only its root and newly planned material Parts.
      const isRoot = state.manifest.prepared.parent.kind === 'pending-element' && state.manifest.prepared.parent.localKey === localKey;
      if (state.manifest.prepared.rootType === 'product' && !isRoot &&
          !state.manifest.prepared.writeScope.initializeMaterialBOMFor.includes(localKey)) throw new Error('Product cannot create a project child');
      let intent = decision?.intent;
      if (!intent) {
        const matches = candidates(this.store.read(), pending.row);
        if (matches.length > 1 || (matches.length === 1 && !identity(matches[0], pending.row))) throw new Error('Ambiguous/conflicting business identity');
        if (matches.length === 1) return this.journal.reused(operationID, `reuse:${localKey}`, localKey, matches[0]);
        accepted(this.journal.reserving(operationID, `reserve:${localKey}`, localKey));
        const reservedID = this.allocate(pending.row.Type, this.lock);
        intent = { localKey, reservedID, row: { ...pending.row, ID: reservedID, CreatedAt: this.now() } };
        accepted(this.journal.insertIntent(operationID, `intent:${localKey}`, intent));
        // Re-read the confirmed record; never act on an unconfirmed in-memory intent.
        state = this.journal.load(operationID);
        intent = state.elements[localKey].intent!;
      }
      const rows = this.store.read(), byID = rows.filter(row => row.ID === intent!.reservedID);
      const matches = candidates(rows, intent.row);
      if (byID.length) verifiedRow(this.store, intent);
      else {
        if (matches.length) throw new Error('Foreign business identity appeared after INSERT_INTENT');
        this.store.insert(intent.row);
      }
      verifiedRow(this.store, intent);
      return this.journal.confirmCreated(operationID, `created:${localKey}`, localKey);
    } catch (error) { return { status: 'CONFLICT', error: String(error) }; }
  }
}
export function openRecoverableElementCreation(lock: GoogleAppsScript.Lock.Lock): RecoverableElementCreation {
  requireScriptLock(lock);
  const store = new MasterFreshElementStore(lock);
  const verifier: CreationVerifier = { readCreatedElement: intent => verifiedRow(store, intent) };
  return new RecoverableElementCreation(openCommitOperationJournal(lock, verifier), store, lock);
}
export function createRecoverableElement(operationID: string, localKey: string): JournalResult {
  return withScriptLock(lock => openRecoverableElementCreation(lock).create(operationID, localKey));
}
