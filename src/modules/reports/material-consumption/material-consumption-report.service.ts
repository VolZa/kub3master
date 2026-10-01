/**
 * src/modules/reports/material-consumption/material-consumption-report.service.ts
 *
 * Модуль: Reports
 * Layer: Application
 *
 * Відповідальність:
 * - формує звіт потреби в матеріалах для Product;
 * - використовує вже розраховану ProductSpecification;
 * - не виконує повторного розгортання BOM;
 * - не працює з MaterialBatch або фактичним списанням.
 */

import {
  ProductSpecification,
  ProductSpecificationRow,
} from '../../bom/specification/product-specification.model';

import {
  MaterialConsumptionReport,
  MaterialConsumptionReportRow,
} from './material-consumption-report.model';

export class MaterialConsumptionReportService {
  /**
   * Формує звіт потреби в матеріалах
   * на основі зведеної специфікації Product.
   */
  public buildReport(
    specification: ProductSpecification,
  ): MaterialConsumptionReport {
    return {
      productId: specification.productId,
      productCode: specification.productCode,
      rows: specification.materials.map((row) => this.mapRow(row)),
    };
  }

  /**
   * Перетворює рядок ProductSpecification
   * у рядок MaterialConsumptionReport.
   */
  private mapRow(row: ProductSpecificationRow): MaterialConsumptionReportRow {
    return {
      elementId: row.elementId,
      code: row.code,
      name: row.name,
      quantity: row.qty,
      unit: row.unit,
    };
  }
}
