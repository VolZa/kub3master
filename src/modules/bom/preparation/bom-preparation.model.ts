/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/preparation/bom-preparation.model.ts
 * Module: BOM
 * Layer: Domain Contracts
 * Responsibility: describe read-only preparation results and unresolved element references.
 */
import type { ElementFull, ElementRow } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';
import type { TableRowInput } from '../model/table-row-input.model';
import type { ElementType } from '../../../config/config';

export type PreparedElementRef =
  | { kind: 'existing-element'; element: ElementFull }
  | { kind: 'pending-element'; localKey: string };
export type PreparedComponentRef = PreparedElementRef | { kind: 'material'; material: Material };
export interface PendingBOMElement {
  localKey: string;
  row: Omit<ElementRow, 'ID' | 'CreatedAt'>;
}
export interface PlannedBOMEdge {
  parent: PreparedElementRef;
  child: PreparedComponentRef;
  qty: number;
  unit: string;
}
export interface PreparedBOMComponent {
  sourceRowIndex: number;
  input: TableRowInput;
  ref: PreparedComponentRef;
  identity: { kind: 'project-element' | 'material-part' | 'direct-material'; code: string;
    projectDocumentID?: string; materialID?: string; geometry?: Partial<ElementFull> };
}
export interface BOMPreparationInput {
  parentInput: string;
  specification: string;
  projectDocumentID?: string;
}
export interface PreparedBOM {
  rootType: ElementType;
  /** Local keys only: Commit may initialize these BOMs only if it actually creates the Parts. */
  writeScope: { root: PreparedElementRef; initializeMaterialBOMFor: string[] };
  parent: PreparedElementRef;
  components: PreparedBOMComponent[];
  pendingElements: PendingBOMElement[];
  plannedEdges: PlannedBOMEdge[];
  sourceContext: BOMPreparationInput & { searchProjectDocumentIDs: readonly string[] };
}
export interface BOMPreparationError {
  /** Zero-based physical specification line; -1 denotes parent/input context. */
  sourceRowIndex: number;
  code: 'EMPTY_SPECIFICATION' | 'PARENT_INVALID' | 'CONTEXT_INVALID' | 'COMPONENT_INVALID';
  message: string;
  sourceText?: string;
  component?: TableRowInput;
}
export type BOMPreparationResult =
  | { ok: true; prepared: PreparedBOM }
  | { ok: false; errors: BOMPreparationError[] };
