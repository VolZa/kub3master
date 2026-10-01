/**
 * src/modules/reports/material-consumption/material-consumption-report.service.test.ts
 *
 * Модуль: Reports
 * Layer: Test
 *
 * Тестує:
 * - отримання реальної ProductSpecification;
 * - формування MaterialConsumptionReport;
 * - коректність кількості матеріалів для П-3.1.
 */

import { BOMExpansionService } from '../../bom/expansion/bom-expansion.service';
import { ProductSpecificationService } from '../../bom/specification/product-specification.service';

import { MaterialConsumptionReportService } from './material-consumption-report.service';

import { getBOMRepository } from '../../../app/factories/bom.factory';
import { getElementRepository } from '../../../app/factories/element.factory';
import { getMaterialRepository } from '../../../app/factories';

export function testMaterialConsumptionReportP31(): void {
  // ------------------------------------------------------------
  // Реальні repository
  // ------------------------------------------------------------

  const bomRepository = getBOMRepository();
  const elementRepository = getElementRepository();
  const materialRepository = getMaterialRepository();

  // ------------------------------------------------------------
  // BOM Expansion
  // ------------------------------------------------------------

  const bomExpansionService = new BOMExpansionService(
    bomRepository,
    elementRepository,
    materialRepository,
  );

  // ------------------------------------------------------------
  // Product Specification
  // ------------------------------------------------------------

  const specificationService = new ProductSpecificationService(
    bomExpansionService,
  );

  // ------------------------------------------------------------
  // Material Consumption Report
  // ------------------------------------------------------------

  const reportService = new MaterialConsumptionReportService();

  // Реальна зведена специфікація П-3.1
  const specification = specificationService.getSpecification('2027');

  // Формуємо звіт потреби матеріалів
  const report = reportService.buildReport(specification);

  console.log(`Material consumption report: ${report.rows.length} rows`);

  // ------------------------------------------------------------
  // Перевірка Product
  // ------------------------------------------------------------

  if (report.productId !== '2027') {
    throw new Error(`Expected productId 2027, got ${report.productId}`);
  }

  if (report.productCode !== 'П-3.1') {
    throw new Error(`Expected productCode П-3.1, got ${report.productCode}`);
  }

  // ------------------------------------------------------------
  // Перевірка кількості матеріалів
  // ------------------------------------------------------------

  if (report.rows.length !== 5) {
    throw new Error(`Expected 5 materials, got ${report.rows.length}`);
  }

  // ------------------------------------------------------------
  // Перевірка контрольних матеріалів
  // ------------------------------------------------------------

  const r12 = report.rows.find((row) => row.code === 'R_12_А500С');

  if (!r12) {
    throw new Error('R_12_А500С not found in report');
  }

  const EPSILON = 1e-9;

  if (Math.abs(r12.quantity - 31.24) > EPSILON) {
    throw new Error(`Expected R_12_А500С = 31.24, got ${r12.quantity}`);
  }

  const concrete = report.rows.find((row) => row.code === 'C_20_25');

  if (!concrete) {
    throw new Error('C_20_25 not found in report');
  }

  if (Math.abs(concrete.quantity - 1.563) > EPSILON) {
    throw new Error(`Expected C_20_25 = 1.563, got ${concrete.quantity}`);
  }

  // ------------------------------------------------------------
  // Вивід звіту
  // ------------------------------------------------------------

  for (const row of report.rows) {
    console.log(`${row.code} | ${row.name} | ` + `${row.quantity} ${row.unit}`);
  }

  console.log('✓ testMaterialConsumptionReportP31 passed');
}
