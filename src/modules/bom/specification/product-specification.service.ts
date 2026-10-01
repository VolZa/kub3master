/**
 * src/modules/bom/specification/product-specification.service.ts
 *
 * Модуль: BOM
 * Layer: Application
 *
 * Відповідальність:
 * - отримує розгорнутий BOM Product;
 * - агрегує однакові елементи;
 * - розділяє результат на assemblies, parts та materials;
 * - формує ProductSpecification.
 */

import { ElementType } from '../../../config/config';

import { BOMExpansionService } from '../expansion/bom-expansion.service';
import { BOMExpansionRow } from '../expansion/bom-expansion.row';

import {
  ProductSpecification,
  ProductSpecificationRow,
} from './product-specification.model';
import { roundQuantity } from '../../../utils/quantity/quantity-rounding';

export class ProductSpecificationService {
  constructor(private readonly bomExpansionService: BOMExpansionService) {}

  /**
   * Формує зведену специфікацію Product.
   */
  public getSpecification(productId: string): ProductSpecification {
    const expansion = this.bomExpansionService.expandProduct(productId);

    const grouped = this.groupRows(expansion);

    return {
      productId,
      productCode: this.getProductCode(expansion),

      assemblies: grouped.assemblies,
      parts: grouped.parts,
      materials: grouped.materials,
    };
  }

  /**
   * Групує однакові елементи за elementId.
   */
  private groupRows(rows: BOMExpansionRow[]): {
    assemblies: ProductSpecificationRow[];
    parts: ProductSpecificationRow[];
    materials: ProductSpecificationRow[];
  } {
    const assemblies = new Map<string, ProductSpecificationRow>();
    const parts = new Map<string, ProductSpecificationRow>();
    const materials = new Map<string, ProductSpecificationRow>();

    for (const row of rows) {
      const target = this.getTargetMap(
        row.elementType,
        assemblies,
        parts,
        materials,
      );

      const existing = target.get(row.elementId);

      if (existing) {
        existing.qty = roundQuantity(existing.qty + row.totalQty);
      } else {
        target.set(row.elementId, {
          elementId: row.elementId,
          code: row.elementCode,
          name: row.elementName,
          elementType: row.elementType,

          qty: roundQuantity(row.totalQty),
          unit: row.unit,
        });
      }
    }

    return {
      assemblies: Array.from(assemblies.values()),
      parts: Array.from(parts.values()),
      materials: Array.from(materials.values()),
    };
  }

  /**
   * Визначає відповідну групу за типом елемента.
   */
  private getTargetMap(
    elementType: ElementType,
    assemblies: Map<string, ProductSpecificationRow>,
    parts: Map<string, ProductSpecificationRow>,
    materials: Map<string, ProductSpecificationRow>,
  ): Map<string, ProductSpecificationRow> {
    switch (elementType) {
      case 'assembly':
        return assemblies;

      case 'part':
        return parts;

      case 'material':
        return materials;

      default:
        throw new Error(
          `Product specification: unsupported element type: ${elementType}`,
        );
    }
  }

  /**
   * Отримує код Product з першого рядка розгорнутого BOM.
   *
   * Product сам у BOMExpansionRow не потрапляє,
   * тому код береться з parentCode першого рівня.
   */
  private getProductCode(rows: BOMExpansionRow[]): string {
    const firstRow = rows[0];

    if (!firstRow) {
      throw new Error('Product specification: BOM expansion is empty.');
    }

    return firstRow.path.length > 0 ? this.getRootProductCode(rows) : '';
  }

  private getRootProductCode(rows: BOMExpansionRow[]): string {
    const firstRow = rows[0];

    return firstRow.parentCode;
  }
}
