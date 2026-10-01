/**
 * src/modules/reports/material-consumption/material-consumption-report.model.ts
 *
 * Модуль: Reports
 * Layer: Domain
 *
 * Відповідальність:
 * - описує один рядок звіту потреби в матеріалах;
 * - описує зведену потребу матеріалів для Product.
 */

export interface MaterialConsumptionReportRow {
  elementId: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface MaterialConsumptionReport {
  productId: string;
  productCode: string;
  rows: MaterialConsumptionReportRow[];
}
