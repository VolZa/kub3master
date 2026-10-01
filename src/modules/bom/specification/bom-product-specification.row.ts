/**
 * src/modules/bom/specification/bom-product-specification.row.ts
 *
 * Модуль: BOM
 * Layer: Application / DTO
 *
 * Зведена специфікація одного Product.
 */

export interface BOMProductSpecificationRow {
  elementId: string;

  elementCode: string;
  elementName: string;
  elementType: string;

  qty: number;
  unit: string;
}
