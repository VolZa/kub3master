// src/modules/reports/product-specification/product-specification-report.service.ts

/**
 * Модуль: Reports
 * Layer: Application
 *
 * Відповідальність:
 * - формує звіт зі зведеної специфікації Product;
 * - не виконує розгортання BOM;
 * - не виконує повторну агрегацію;
 * - працює виключно з ProductSpecification.
 */

import {
  ProductSpecification,
  ProductSpecificationRow,
} from '../../bom/specification/product-specification.model';

export interface ProductSpecificationReportRow {
  section: 'assembly' | 'part' | 'material';

  elementId: string;
  code: string;
  name: string;
  elementType: string;

  qty: number;
  unit: string;
}

export class ProductSpecificationReportService {
  /**
   * Перетворює зведену специфікацію у плоский набір
   * рядків майбутнього звіту.
   */
  public buildRows(
    specification: ProductSpecification,
  ): ProductSpecificationReportRow[] {
    const rows: ProductSpecificationReportRow[] = [];

    this.appendRows(rows, specification.assemblies, 'assembly');

    this.appendRows(rows, specification.parts, 'part');

    this.appendRows(rows, specification.materials, 'material');

    return rows;
  }

  private appendRows(
    result: ProductSpecificationReportRow[],
    source: ProductSpecificationRow[],
    section: ProductSpecificationReportRow['section'],
  ): void {
    for (const row of source) {
      result.push({
        section,

        elementId: row.elementId,
        code: row.code,
        name: row.name,
        elementType: row.elementType,

        qty: row.qty,
        unit: row.unit,
      });
    }
  }
}
