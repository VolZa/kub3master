/**
 * src/modules/bom/specification/bom-product-specification.service.ts
 *
 * Модуль: BOM
 * Layer: Application
 *
 * Відповідальність:
 * - отримує розгорнутий BOM;
 * - агрегує однакові Element / Material;
 * - формує зведену специфікацію Product.
 *
 * Не відповідає за:
 * - рекурсивне проходження BOM;
 * - читання Google Sheets;
 * - визначення структури BOM.
 */

import { BOMExpansionRow } from '../expansion/bom-expansion.row';
import { BOMProductSpecificationRow } from './bom-product-specification.row';

import { roundSpecificationQty } from './roundSpecificationQty';

export class BOMProductSpecificationService {
  public aggregate(
    rows: readonly BOMExpansionRow[],
  ): BOMProductSpecificationRow[] {
    const result = new Map<string, BOMProductSpecificationRow>();

    for (const row of rows) {
      const key = `${row.elementId}|${row.unit}`;

      const existing = result.get(key);

      if (existing) {
        existing.qty += row.totalQty;
        continue;
      }

      result.set(key, {
        elementId: row.elementId,
        elementCode: row.elementCode,
        elementName: row.elementName,
        elementType: row.elementType,
        qty: row.totalQty,
        unit: row.unit,
      });
    }

    return Array.from(result.values()).map((row) => ({
      ...row,
      qty: roundSpecificationQty(row.qty, row.unit),
    }));
  }
}
