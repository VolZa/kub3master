import { BOMRow } from './bom-row.model';
import { ElementFull } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';

/** Read-only BOM view; this Material is not an Element stored in 00_Elements. */
export type BOMEntity = ElementFull | (Material & { readonly type: 'material' });

export interface BOMNode {
  bom: BOMRow;
  element: BOMEntity;
}
