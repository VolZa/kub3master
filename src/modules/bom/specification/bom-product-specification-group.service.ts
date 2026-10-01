/**
 * src/modules/bom/specification/bom-product-specification-group.service.ts
 *
 * Модуль: BOM
 * Layer: Application
 *
 * Групує зведену специфікацію за elementType.
 */

import { BOMProductSpecificationRow } from './bom-product-specification.row';
import { BOMProductSpecificationGrouped } from './bom-product-specification-grouped.model';

export class BOMProductSpecificationGroupService {
  public group(
    rows: readonly BOMProductSpecificationRow[],
  ): BOMProductSpecificationGrouped {
    const result: BOMProductSpecificationGrouped = {
      assemblies: [],
      parts: [],
      materials: [],
    };

    for (const row of rows) {
      switch (row.elementType) {
        case 'assembly':
          result.assemblies.push(row);
          break;

        case 'part':
          result.parts.push(row);
          break;

        case 'material':
          result.materials.push(row);
          break;

        default:
          throw new Error(`Unknown elementType: ${row.elementType}`);
      }
    }

    return result;
  }
}
