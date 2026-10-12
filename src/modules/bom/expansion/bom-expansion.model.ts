/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/expansion/bom-expansion.model.ts
 * Module: BOM
 * Layer: Domain
 * Responsibility: typed single-product expansion snapshots, occurrences, and failure results.
 */
import type { ElementFull } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';
import type { BOMRow } from '../model/bom-row.model';
import type { BOMComponentRef, BOMDiagnostic } from '../reference/bom-reference.model';

export type BOMElementRef = Extract<BOMComponentRef, { kind: 'ELEMENT' }>;
export interface BOMExpansionInput {
  readonly rows: readonly Readonly<BOMRow>[];
  readonly elements: readonly Readonly<ElementFull>[];
  readonly materials: readonly Readonly<Material>[];
}
export interface ResolvedBOMEdge {
  /** Local position in the input snapshot, not a physical Sheets row. */
  readonly sourceRowIndex: number;
  readonly parent: BOMElementRef;
  readonly child: BOMComponentRef;
  readonly directQty: number;
  readonly unit: string;
}
export interface ExpandedBOMLine {
  readonly occurrenceIndex: number;
  readonly parentOccurrenceIndex: number | null;
  readonly level: number;
  readonly edge: ResolvedBOMEdge;
  readonly totalQty: number;
  readonly path: readonly BOMComponentRef[];
}
export interface BOMExpansionDiagnostic extends Omit<BOMDiagnostic, 'code'> {
  readonly code: BOMDiagnostic['code'] | 'INVALID_ROOT' | 'INVALID_QUANTITY' |
    'CYCLE' | 'MATERIAL_HAS_CHILDREN' | 'EMPTY_BOM' | 'CATALOG_RULE_UNAVAILABLE';
}
export type BOMExpansionResult =
  | { readonly ok: true; readonly root: BOMElementRef; readonly lines: readonly ExpandedBOMLine[];
      readonly indexingDiagnostics: readonly BOMDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly BOMExpansionDiagnostic[];
      readonly indexingDiagnostics: readonly BOMDiagnostic[] };

export function componentId(ref: BOMComponentRef): string {
  return ref.kind === 'ELEMENT' ? ref.elementId : ref.materialId;
}
