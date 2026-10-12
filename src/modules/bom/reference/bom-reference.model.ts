/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/reference/bom-reference.model.ts
 * Module: BOM
 * Layer: Domain
 * Responsibility: typed component references and deterministic resolution diagnostics.
 */
import type { ElementFull } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';

export type CanonicalElement = Omit<ElementFull, 'type'> & {
  type: 'product' | 'assembly' | 'part';
};

export type BOMComponentRef =
  | { readonly kind: 'ELEMENT'; readonly elementId: string; readonly element: Readonly<CanonicalElement> }
  | { readonly kind: 'MATERIAL'; readonly materialId: string; readonly material: Readonly<Material> };

export type BOMDiagnosticCode =
  | 'REFERENCE_NOT_FOUND' | 'AMBIGUOUS_REFERENCE' | 'DUPLICATE_ID'
  | 'LEGACY_MATERIAL_ELEMENT' | 'INVALID_REFERENCE' | 'CODE_MISMATCH';

export interface BOMDiagnostic {
  readonly code: BOMDiagnosticCode;
  readonly message: string;
  readonly referenceId: unknown;
  readonly source?: 'ELEMENTS' | 'MATERIALS';
  readonly catalogIndexes?: readonly number[];
  readonly path?: readonly string[];
  /** Position in the BOM input snapshot, never a physical Sheets row number. */
  readonly sourceRowIndex?: number;
  readonly expectedCode?: string;
  readonly actualCode?: string;
}

export interface BOMResolutionContext {
  readonly path?: readonly string[];
  readonly sourceRowIndex?: number;
  readonly childCode?: string;
}

export type BOMResolution =
  | { readonly ok: true; readonly ref: BOMComponentRef }
  | { readonly ok: false; readonly diagnostics: readonly BOMDiagnostic[] };
