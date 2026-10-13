/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/safe-commit.service.ts
 * Module: BOM commit
 * Layer: Application
 * Responsibility: trusted server-only orchestration of immutable preparation, recoverable creation and BOM recovery.
 */
import { prepareBOM } from '../preparation/bom-preparation.service';
import type { BOMPreparationInput, PreparedBOM, PreparedComponentRef, BOMPreparationError } from '../preparation/bom-preparation.model';
import { commitDigest, openCommitOperationJournal } from './commit-operation-journal';
import { freshCommitContext, type FreshCommitContext } from './fresh-commit-context';
import { MasterFreshElementStore } from './fresh-element-store';
import { RecoverableElementCreation, verifiedRow, candidates, identity } from './recoverable-element-creation';
import { mapPreparedBOMToPhysicalPlan, type ResolvedBOMBinding, type BOMCommentChange } from './physical-bom-mapper';
import { inspectSafeBOMUnderLock, readSafeBOMSnapshotUnderLock, writeSafeBOMUnderLock, recoverSafeBOMUnderLock, preflightSafeBOMPlanUnderLock } from './safe-bom-writer';
import { mapElementRowToDomain } from '../../elements/element.mapper';
import { SpreadsheetProvider } from '../../../infrastructure/spreadsheets/SpreadsheetProvider';
import { SpreadsheetKey } from '../../../infrastructure/spreadsheets/SpreadsheetKey';
import { normalizeIntegerId, calculateNextId } from '../../../utils/id.logic';
import type { ElementType } from '../../../config/config';
import { withScriptLock } from '../../../utils/script-lock';
import type { JournalResult, OperationState } from './commit-operation.model';
export interface BOMCommitInput extends BOMPreparationInput { commentChanges?: BOMCommentChange[] }
export interface BOMCommitResult {
  status: 'COMMITTED' | 'ALREADY_APPLIED' | 'RECOVERY_REQUIRED' | 'CONFLICT' | 'VALIDATION_ERROR';
  operationID: string; error?: string; diagnostics?: BOMPreparationError[]; localIDs?: Record<string, string>; rootID?: string;
}
function accepted(result: JournalResult): OperationState {
  if (result.status === 'CONFLICT') throw new Error(result.error); return result.state;
}
function counterPreflight(types: ElementType[]) {
  const master = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
  const sheet = master.getSheetByName('_Config_ID_Counters');
  if (!sheet) throw new Error('Missing _Config_ID_Counters');
  const [headers, ...rows] = sheet.getDataRange().getValues();
  if (headers?.[0] !== 'Type' || headers?.[1] !== 'LastID' || headers.length !== 2) throw new Error('Invalid counter schema');
  const occupied = new Set<number>();
  for (const [name, key] of [['00_Elements', 'ID'], ['05_Materials', 'MaterialID']]) {
    const source = master.getSheetByName(name); if (!source) throw new Error(`Missing ${name}`);
    const [columns, ...values] = source.getDataRange().getValues();
    if (columns.filter(column => column === key).length !== 1) throw new Error(`Invalid ${name} ID schema`);
    for (const row of values) { const value = row[columns.indexOf(key)]; if (value !== '' && value != null) occupied.add(normalizeIntegerId(value, key)); }
  }
  const virtualLast = new Map<ElementType, number>();
  for (const type of types) {
    const matches = rows.filter(row => row[0] === type);
    if (matches.length !== 1) throw new Error('Ambiguous counter type');
    const next = calculateNextId(type, virtualLast.get(type) ?? matches[0][1], occupied);
    virtualLast.set(type, next); occupied.add(next);
  }
}
function references(prepared: PreparedBOM): PreparedComponentRef[] {
  return [prepared.parent, ...prepared.components.map(item => item.ref), ...prepared.plannedEdges.flatMap(edge => [edge.parent, edge.child])];
}
function bindings(prepared: PreparedBOM, state: OperationState | undefined, store: MasterFreshElementStore, context: FreshCommitContext): ResolvedBOMBinding[] {
  const rows = store.read(), result = new Map<string, ResolvedBOMBinding>();
  const identityFields = ['id','code','type','projectDocumentID','parentMaterialID','baseUnit','category','profileType','diameter','className','width','height','length','thickness','isActive'] as const;
  for (const ref of references(prepared)) {
    if (ref.kind === 'pending-element') continue;
    const key = `${ref.kind}:${ref.kind === 'material' ? ref.material.id : ref.element.id}`;
    if (ref.kind === 'material') {
      const current = context.deps.materials.findById(ref.material.id);
      if (!current || commitDigest(current) !== commitDigest(ref.material)) throw new Error('Canonical Material identity conflict');
      if (rows.some(row => row.ID === current.id)) throw new Error('Material/Element ID collision conflict');
      result.set(key, { ref, id: current.id, code: current.code, origin: 'material' });
    } else {
      const matches = rows.filter(row => row.ID === ref.element.id);
      if (matches.length !== 1) throw new Error('Missing/ambiguous existing Element');
      const current = mapElementRowToDomain(matches[0]);
      if (context.deps.materials.findById(current.id)) throw new Error('Element/Material ID collision conflict');
      if (identityFields.some(field => (current[field] ?? '') !== (ref.element[field] ?? ''))) throw new Error('Existing Element identity conflict');
      const peers = rows.filter(row => row.ID !== current.id && row.Code === current.code && (current.parentMaterialID ? row.ParentMaterialID === current.parentMaterialID : (row.ProjectDocumentID ?? '') === (current.projectDocumentID ?? '')));
      if (peers.length) throw new Error('Ambiguous existing identity');
      result.set(key, { ref, id: current.id, code: current.code, origin: 'existing' });
    }
  }
  let placeholder = Number.MAX_SAFE_INTEGER;
  for (const pending of prepared.pendingElements) {
    const ref = { kind: 'pending-element' as const, localKey: pending.localKey }, decision = state?.elements[pending.localKey];
    const matches = candidates(rows, pending.row);
    if (matches.length > 1 || (matches.length === 1 && !identity(matches[0], pending.row))) throw new Error('Pending business identity conflict');
    let id: string, code = pending.row.Code, origin: ResolvedBOMBinding['origin'];
    if (decision?.intent) {
      const byID = rows.filter(row => row.ID === decision.id);
      if (byID.length) verifiedRow(store, decision.intent);
      else if (decision.status === 'CREATED' || matches.length) throw new Error('Owned Element identity conflict');
      id = decision.id!; origin = 'created';
    } else if (decision?.status === 'REUSED') {
      if (matches.length !== 1 || matches[0].ID !== decision.id) throw new Error('Reused identity conflict');
      id = decision.id!; code = matches[0].Code; origin = 'reused';
    } else if (matches.length) { id = matches[0].ID; code = matches[0].Code; origin = 'reused'; }
    else { while (rows.some(row => row.ID === String(placeholder)) || context.deps.materials.findById(String(placeholder))) placeholder--; id = String(placeholder--); origin = 'created'; }
    result.set(`pending:${pending.localKey}`, { ref, id, code, origin });
  }
  return [...result.values()];
}
export class SafeCommitService {
  /** Injection is for trusted server composition/tests, never a client-supplied dependency. */
  constructor(private readonly fresh = freshCommitContext) {}
  commitBOM(input: BOMCommitInput, operationID: string): BOMCommitResult { return this.run(operationID, input); }
  resumeBOMCommit(operationID: string): BOMCommitResult { return this.run(operationID); }
  private run(operationID: string, input?: BOMCommitInput): BOMCommitResult {
    let durable = false;
    try { return withScriptLock(lock => {
      if (!/^[A-Za-z0-9_-]{1,116}$/.test(operationID) || operationID.endsWith('_BOM')) throw new Error('Invalid OperationID');
      const store = new MasterFreshElementStore(lock);
      const journal = openCommitOperationJournal(lock, { readCreatedElement: intent => verifiedRow(store, intent) });
      durable = journal.hasOperation(operationID);
      let state: OperationState | undefined;
      if (durable) {
        let peek: OperationState | undefined;
        try { peek = journal.peek(operationID); } catch (error) {
          // No durable manifest yet: original input can replay Prepare, with frame digest enforcing exact equality.
          if (!input || !String(error).includes('Manifest payload unavailable')) throw error;
        }
        if (peek) {
          if (input && peek.manifest.requestDigest !== commitDigest(input)) return { status: 'CONFLICT', operationID, error: 'OperationID reused with another input' };
          state = journal.restore(operationID, (saved, eventID) => {
            if (eventID !== 'bom-plan' || inspectSafeBOMUnderLock(saved.manifest.writerOperationID, lock)) throw new Error('Writer target cannot be remapped');
            const fresh = this.fresh(lock, saved.manifest.input.projectDocumentID);
            if (commitDigest(fresh.validationContext) !== commitDigest(saved.manifest.validationContext)) throw new Error('Fresh context conflict');
            const resolved = bindings(saved.manifest.prepared, saved, store, fresh);
            const receipts = saved.manifest.prepared.writeScope.initializeMaterialBOMFor.flatMap(key => saved.elements[key]?.status === 'CREATED' ? [{ id: saved.elements[key].id!, operationID: saved.manifest.writerOperationID }] : []);
            const snapshot = readSafeBOMSnapshotUnderLock(lock);
            const plan = mapPreparedBOMToPhysicalPlan({ prepared: saved.manifest.prepared, writerOperationID: saved.manifest.writerOperationID, bindings: resolved, createdParts: receipts, headers: snapshot.headers, existingRows: snapshot.rows, commentChanges: (saved.manifest.input as BOMCommitInput).commentChanges });
            // persist() checks against the original frame digest: changed targets cannot be adopted.
            return { eventID, type: 'BOM_PLANNED', data: { plan, snapshotDigest: commitDigest(snapshot) } };
          });
          if (state.status === 'CONFLICT') return { status: 'CONFLICT', operationID, error: 'Terminal operation conflict' };
        }
      } else if (!input) return { status: 'CONFLICT', operationID, error: 'Operation not found' };
      const source = (state?.manifest.input ?? input!) as BOMCommitInput;
      let context = this.fresh(lock, source.projectDocumentID);
      let prepared: PreparedBOM;
      if (state) {
        if (!state.manifest.validationContext || commitDigest(context.validationContext) !== commitDigest(state.manifest.validationContext)) throw new Error('Material/Catalog/document validation context conflict');
        prepared = state.manifest.prepared;
      } else {
        const result = prepareBOM(source, context.deps);
        if (!result.ok) return { status: 'VALIDATION_ERROR', operationID, diagnostics: result.errors, error: JSON.stringify(result.errors) };
        prepared = result.prepared;
        const confirmed = this.fresh(lock, source.projectDocumentID);
        if (commitDigest(confirmed.validationContext) !== commitDigest(context.validationContext)) throw new Error('Fresh validation context conflict');
        context = confirmed;
      }
      store.validateWritable();
      const validated = bindings(prepared, state, store, context);
      counterPreflight(prepared.pendingElements.filter(item => !state?.elements[item.localKey]?.intent &&
        validated.find(binding => binding.ref.kind === 'pending-element' && binding.ref.localKey === item.localKey)?.origin === 'created').map(item => item.row.Type));
      const phase = inspectSafeBOMUnderLock(`${operationID}_BOM`, lock);
      if (phase && !state?.bomPlan) throw new Error('Orphan writer plan conflict');
      if (!phase && !state?.bomPlan) {
        const snapshot = readSafeBOMSnapshotUnderLock(lock);
        const receipts = prepared.writeScope.initializeMaterialBOMFor.flatMap(key => {
          const binding = validated.find(item => item.ref.kind === 'pending-element' && item.ref.localKey === key)!;
          return binding.origin === 'created' ? [{ id: binding.id, operationID: `${operationID}_BOM` }] : [];
        });
        const provisional = mapPreparedBOMToPhysicalPlan({ prepared, writerOperationID: `${operationID}_BOM`, bindings: validated, createdParts: receipts, commentChanges: source.commentChanges, headers: snapshot.headers, existingRows: snapshot.rows });
        preflightSafeBOMPlanUnderLock(provisional, lock);
      }
      if (!state) { durable = true; state = accepted(journal.begin(operationID, source, prepared, context.validationContext)); }
      const coordinator = new RecoverableElementCreation(journal, store, lock);
      for (const item of prepared.pendingElements) accepted(coordinator.create(operationID, item.localKey));
      state = journal.load(operationID);
      const resolved = bindings(prepared, state, store, context), receipts = coordinator.receipts(operationID);
      const localIDs = Object.fromEntries(Object.entries(state.elements).map(([key, value]) => [key, value.id!]));
      const wasCompleted = state.status === 'COMPLETED';
      if (!['BOM_READY', 'COMPLETED'].includes(state.status)) state = accepted(journal.bomReady(operationID, 'bom-ready'));
      if (!state.bomPlan) {
        const snapshot = readSafeBOMSnapshotUnderLock(lock);
        const plan = mapPreparedBOMToPhysicalPlan({ prepared, writerOperationID: state.manifest.writerOperationID, bindings: resolved, createdParts: receipts, commentChanges: source.commentChanges, headers: snapshot.headers, existingRows: snapshot.rows });
        state = accepted(journal.bomPlanned(operationID, plan, commitDigest(snapshot)));
      }
      const currentPhase = inspectSafeBOMUnderLock(state.manifest.writerOperationID, lock);
      if (currentPhase && commitDigest(currentPhase.plan) !== commitDigest(state.bomPlan)) throw new Error('Writer target conflict');
      // A completed no-op without a writer journal must never restore over a newer specification.
      if (wasCompleted && !currentPhase) {
        const snapshot = readSafeBOMSnapshotUnderLock(lock);
        const semantic = (rows: unknown[][]) => rows.map(row => JSON.stringify([String(row[0]), String(row[1]), ...row.slice(2)])).sort();
        const own = snapshot.rows.filter(row => state!.bomPlan!.affectedParentIDs.includes(String(row[0])));
        if (commitDigest(semantic(own)) !== commitDigest(semantic(state.bomPlan!.targetRows))) throw new Error('Completed BOM target conflict');
        return { status: 'ALREADY_APPLIED', operationID, localIDs, rootID: state.bomPlan!.rootID };
      }
      if (!currentPhase && state.bomSnapshotDigest !== commitDigest(readSafeBOMSnapshotUnderLock(lock))) throw new Error('Mapped BOM snapshot conflict; newer specification cannot be overwritten');
      const written = currentPhase ? recoverSafeBOMUnderLock(state.manifest.writerOperationID, lock) : writeSafeBOMUnderLock(state.bomPlan!, lock);
      if (written.status === 'CONFLICT') return { status: 'CONFLICT', operationID, error: written.error };
      if (!wasCompleted) accepted(journal.completed(operationID, 'completed', state.manifest.writerOperationID, written.status));
      return { status: wasCompleted || written.status === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'COMMITTED', operationID, localIDs, rootID: state.bomPlan!.rootID };
    }); } catch (error) {
      const message = String(error);
      return { status: durable ? /conflict|ambiguous|identity|corrupt|orphan|mismatch|differs/i.test(message) ? 'CONFLICT' : 'RECOVERY_REQUIRED' : /acquire|already held/i.test(message) ? 'RECOVERY_REQUIRED' : 'VALIDATION_ERROR', operationID, error: message };
    }
  }
}
export function commitBOM(input: BOMCommitInput, operationID: string) { return new SafeCommitService().commitBOM(input, operationID); }
export function resumeBOMCommit(operationID: string) { return new SafeCommitService().resumeBOMCommit(operationID); }
