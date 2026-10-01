/**
 * src/modules/bom/specification/bom-product-specification-grouped.model.ts
 *
 * Модуль: BOM
 * Layer: Application / DTO
 *
 * Групована зведена специфікація Product.
 */

import { BOMProductSpecificationRow } from './bom-product-specification.row';

export interface BOMProductSpecificationGrouped {
  assemblies: BOMProductSpecificationRow[];
  parts: BOMProductSpecificationRow[];
  materials: BOMProductSpecificationRow[];
}
