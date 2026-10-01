/**
 * src/modules/bom/specification/roundSpecificationQty.ts
 *
 * Модуль: BOM
 * Layer: Application / Specification
 *
 * Округлення кількості у зведеній специфікації.
 */

export function roundSpecificationQty(qty: number, unit: string): number {
  switch (unit) {
    case 'шт':
      return Math.round(qty);

    case 'кг':
      return Math.round(qty * 100) / 100;

    case 'м3':
    case 'м³':
      return Math.round(qty * 1000) / 1000;

    default:
      return Math.round(qty * 1000) / 1000;
  }
}
