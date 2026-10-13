/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/physical-bom-mapper.ts
 * Module: BOM
 * Layer: Application
 * Responsibility: map verified resolved references and preserve comments by logical edge, never by slot.
 */
import type { PreparedBOM, PreparedComponentRef } from '../preparation/bom-preparation.model';
import type { SafeBOMPlan } from './safe-bom-writer';
import { normalizeIntegerId } from '../../../utils/id.logic';
import { normalizeCode } from '../../../utils/normalize';
import { validateBOMHeaders, validateBOMRow, type PhysicalBOMRow } from './physical-bom-schema';
/** Server-side fresh-verified bindings; this pure mapper does not perform lookup or write. */
export interface ResolvedBOMBinding {
  ref: PreparedComponentRef; id: string; code: string; origin: 'existing' | 'material' | 'created' | 'reused';
}
export interface BOMCommentChange { parentID: string; childID: string; unit: string; comment: string }
const refKey = (ref: PreparedComponentRef) => ref.kind === 'pending-element' ? `pending:${ref.localKey}` :
  ref.kind === 'existing-element' ? `element:${ref.element.id}` : `material:${ref.material.id}`;
const edgeKey = (parent: unknown, child: unknown, unit: string) => JSON.stringify([String(normalizeIntegerId(parent, 'ParentID')), String(normalizeIntegerId(child, 'ChildID')), unit]);
export function mapPreparedBOMToPhysicalPlan(input: {
  prepared: PreparedBOM; writerOperationID: string; bindings: ResolvedBOMBinding[];
  createdParts: SafeBOMPlan['createdParts']; headers: unknown[]; existingRows: unknown[][];
  commentChanges?: BOMCommentChange[];
}): SafeBOMPlan {
  const { prepared, writerOperationID, createdParts } = input;
  validateBOMHeaders(input.headers);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(writerOperationID)) throw new Error('Invalid writer OperationID');
  const rows = input.existingRows.flatMap((row, index) => { const valid = validateBOMRow(row, index + 2); return valid ? [valid] : []; });
  const bindings = new Map<string, ResolvedBOMBinding>(), codes = new Map<string, string>();
  for (const binding of input.bindings) {
    if (String(normalizeIntegerId(binding.id, 'Resolved ID')) !== binding.id || typeof binding.code !== 'string' || !binding.code.trim()) throw new Error('Unresolved physical binding');
    const key = refKey(binding.ref);
    if (bindings.has(key) || (codes.has(binding.id) && codes.get(binding.id) !== binding.code)) throw new Error('Ambiguous physical binding');
    if (binding.ref.kind === 'pending-element') {
      const localKey = binding.ref.localKey;
      const pending = prepared.pendingElements.find(item => item.localKey === localKey);
      if (!pending || (pending.row.ParentMaterialID ? normalizeCode(pending.row.Code) !== normalizeCode(binding.code) : pending.row.Code !== binding.code) || !['created', 'reused'].includes(binding.origin)) throw new Error('Pending binding identity mismatch');
    } else {
      const source = binding.ref.kind === 'material' ? binding.ref.material : binding.ref.element;
      if (source.id !== binding.id || source.code !== binding.code || binding.origin !== (binding.ref.kind === 'material' ? 'material' : 'existing')) throw new Error('Existing binding identity mismatch');
    }
    bindings.set(key, binding); codes.set(binding.id, binding.code);
  }
  const resolve = (ref: PreparedComponentRef) => {
    const binding = bindings.get(refKey(ref));
    if (!binding) throw new Error(`Missing verified binding ${refKey(ref)}`);
    if (ref.kind !== 'pending-element') {
      const entity = ref.kind === 'material' ? ref.material : ref.element;
      if (entity.id !== binding.id || entity.code !== binding.code) throw new Error('Inconsistent reference identity');
    }
    return binding;
  };
  prepared.components.forEach(component => resolve(component.ref));
  prepared.pendingElements.forEach(item => resolve({ kind: 'pending-element', localKey: item.localKey }));
  const root = resolve(prepared.parent);
  if (refKey(prepared.writeScope.root) !== refKey(prepared.parent)) throw new Error('Root scope mismatch');
  const allowed = new Set([root.id]);
  const expectedReceipts = new Set<string>();
  for (const key of prepared.writeScope.initializeMaterialBOMFor) {
    const pending = prepared.pendingElements.find(item => item.localKey === key);
    if (!pending || pending.row.Type !== 'part' || !pending.row.ParentMaterialID) throw new Error('Invalid initialization scope');
    const binding = resolve({ kind: 'pending-element', localKey: key });
    if (binding.origin === 'created') { allowed.add(binding.id); expectedReceipts.add(binding.id); }
  }
  if (new Set(createdParts.map(receipt => receipt.id)).size !== createdParts.length || createdParts.length !== expectedReceipts.size ||
      createdParts.some(receipt => receipt.operationID !== writerOperationID || !expectedReceipts.has(receipt.id))) throw new Error('Missing/foreign creation receipt');
  if (rows.some(row => expectedReceipts.has(row[0]))) throw new Error('Cannot initialize an existing Part BOM');
  const comments = new Map<string, string>();
  for (const change of input.commentChanges ?? []) {
    const key = edgeKey(change.parentID, change.childID, change.unit);
    if (comments.has(key) || typeof change.comment !== 'string') throw new Error('Ambiguous comment change');
    comments.set(key, change.comment);
  }
  const emitted = new Set<string>();
  const targetRows: PhysicalBOMRow[] = [];
  for (const edge of prepared.plannedEdges) {
    const parent = resolve(edge.parent), child = resolve(edge.child);
    if (!allowed.has(parent.id)) {
      if (edge.parent.kind === 'pending-element' && prepared.writeScope.initializeMaterialBOMFor.includes(edge.parent.localKey) && parent.origin === 'reused') continue;
      throw new Error('Planned edge outside authorized scope');
    }
    const key = edgeKey(parent.id, child.id, edge.unit);
    if (emitted.has(key)) throw new Error('Duplicate planned edge');
    emitted.add(key);
    const existing = rows.filter(row => edgeKey(row[0], row[1], row[3]) === key);
    if (existing.length > 1 && !comments.has(key)) throw new Error('Ambiguous existing edge comment');
    const comment = comments.has(key) ? comments.get(key)! : existing[0]?.[4] ?? '';
    const row: PhysicalBOMRow = [parent.id, child.id, edge.qty, edge.unit, comment, parent.code, child.code];
    validateBOMRow(row); targetRows.push(row);
  }
  if ([...comments.keys()].some(key => !emitted.has(key))) throw new Error('Comment change does not refer to a target edge');
  if (!targetRows.some(row => row[0] === root.id) || [...expectedReceipts].some(id => !targetRows.some(row => row[0] === id))) throw new Error('Missing scoped target rows');
  return { operationID: writerOperationID, rootID: root.id, affectedParentIDs: [...allowed], createdParts, targetRows };
}
