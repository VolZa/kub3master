/**
 * src/modules/reports/product-specification/product-specification.model.ts
 *
 * Модуль: Reports
 * Layer: Domain
 *
 * Відповідальність:
 * - описує один рядок розгорнутої специфікації Product;
 * - зберігає кількість елемента безпосередньо у BOM;
 * - зберігає розраховану кількість елемента відносно Product.
 */

export interface ProductSpecificationRow {
  level: number;

  parentId: string;
  parentCode: string;

  elementId: string;
  elementCode: string;
  elementName: string;
  elementType: string;

  /** Кількість Child безпосередньо в Parent */
  directQty: number;

  /** Кількість Child на один Product з урахуванням шляху BOM */
  totalQty: number;

  unit: string;

  /** Шлях від Product до поточного елемента */
  path: readonly string[];
}
