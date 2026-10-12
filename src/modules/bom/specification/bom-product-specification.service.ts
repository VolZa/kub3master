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

import { ExpandedBOMLine, componentId } from '../expansion/bom-expansion.model';
import { BOMProductSpecificationRow } from './bom-product-specification.row';

import { roundSpecificationQty } from './roundSpecificationQty';

export class BOMProductSpecificationService {
  public aggregate(
    rows: readonly ExpandedBOMLine[],
  ): BOMProductSpecificationRow[] {
    const result = new Map<string, BOMProductSpecificationRow>();

    for (const row of rows) {
      const ref = row.edge.child;
      const component = ref.kind === 'ELEMENT' ? ref.element : ref.material;
      const id = componentId(ref);
      const key = `${ref.kind}|${id}|${row.edge.unit}`;

      const existing = result.get(key);

      if (existing) {
        existing.qty += row.totalQty;
        continue;
      }

      result.set(key, {
        elementId: id,
        elementCode: component.code,
        elementName: component.name,
        elementType: ref.kind === 'ELEMENT' ? ref.element.type : 'material',
        qty: row.totalQty,
        unit: row.edge.unit,
      });
    }

    return Array.from(result.values()).map((row) => ({
      ...row,
      qty: roundSpecificationQty(row.qty, row.unit),
    }));
  }
}
