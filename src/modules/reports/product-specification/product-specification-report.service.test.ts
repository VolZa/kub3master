/**
 * src/modules/reports/product-specification/product-specification-report.service.test.ts
 *
 * Тест:
 * ProductSpecificationReportService
 *
 * Перевіряє:
 * - формування плоского звіту;
 * - збереження секцій assembly / part / material;
 * - кількість рядків;
 * - агрегацію вже сформованих даних.
 */

import { ProductSpecification } from '../../bom/specification/product-specification.model';

import { ProductSpecificationReportService } from './product-specification-report.service';

import { BOMExpansionService } from '../../bom/expansion/bom-expansion.service';

import { ProductSpecificationService } from '../../bom/specification/product-specification.service';

import { getBOMRepository } from '../../../app/factories/bom.factory';
import { getElementRepository } from '../../../app/factories/element.factory';
import { getMaterialRepository } from '../../../app/factories/material.factory';

export function testProductSpecificationReport(): void {
  const service = new ProductSpecificationReportService();

  const specification: ProductSpecification = {
    productId: '2027',
    productCode: 'П-3.1',

    assemblies: [
      {
        elementId: '2025',
        code: 'ВСП-П-3.1',
        name: 'Сітка ВСП-П-3.1',
        elementType: 'assembly',
        qty: 1,
        unit: 'шт',
      },
      {
        elementId: '2026',
        code: 'СП-П-3.1',
        name: 'Сітка СП-П-3.1',
        elementType: 'assembly',
        qty: 1,
        unit: 'шт',
      },
    ],

    parts: [
      {
        elementId: '4013',
        code: 'R_12_A500C_L800',
        name: 'Арматура Ø12 A500C L=800',
        elementType: 'part',
        qty: 44,
        unit: 'шт',
      },
    ],

    materials: [
      {
        elementId: '3014',
        code: 'R_12_А500С',
        name: 'арматура ø12 А500С',
        elementType: 'material',
        qty: 31.24,
        unit: 'кг',
      },
    ],
  };

  const rows = service.buildRows(specification);

  console.log(`Product specification report: ${rows.length} rows`);

  // ------------------------------------------------------------
  // Загальна кількість рядків
  // ------------------------------------------------------------

  if (rows.length !== 4) {
    throw new Error(`Expected 4 report rows, got ${rows.length}`);
  }

  // ------------------------------------------------------------
  // Перевірка assembly
  // ------------------------------------------------------------

  const assemblies = rows.filter((row) => row.section === 'assembly');

  if (assemblies.length !== 2) {
    throw new Error(`Expected 2 assemblies, got ${assemblies.length}`);
  }

  // ------------------------------------------------------------
  // Перевірка part
  // ------------------------------------------------------------

  const part = rows.find((row) => row.code === 'R_12_A500C_L800');

  if (!part) {
    throw new Error('R_12_A500C_L800 not found in report');
  }

  if (part.qty !== 44) {
    throw new Error(`Expected R_12_A500C_L800 = 44, got ${part.qty}`);
  }

  if (part.section !== 'part') {
    throw new Error(`Expected section "part", got ${part.section}`);
  }

  // ------------------------------------------------------------
  // Перевірка material
  // ------------------------------------------------------------

  const material = rows.find((row) => row.code === 'R_12_А500С');

  if (!material) {
    throw new Error('R_12_А500С not found in report');
  }

  if (material.qty !== 31.24) {
    throw new Error(`Expected R_12_А500С = 31.24, got ${material.qty}`);
  }

  if (material.section !== 'material') {
    throw new Error(`Expected section "material", got ${material.section}`);
  }

  // ------------------------------------------------------------
  // Вивід
  // ------------------------------------------------------------

  for (const row of rows) {
    console.log(
      `${row.section} | ` + `${row.code} | ` + `${row.qty} ${row.unit}`,
    );
  }

  console.log('✓ testProductSpecificationReport passed');
}

export function testProductSpecificationReportP31(): void {
  const bomRepository = getBOMRepository();
  const elementRepository = getElementRepository();
  const materialRepository = getMaterialRepository();

  const bomExpansionService = new BOMExpansionService(
    bomRepository,
    elementRepository,
    materialRepository,
  );

  const specificationService = new ProductSpecificationService(
    bomExpansionService,
  );

  const reportService = new ProductSpecificationReportService();

  // Реальна зведена специфікація П-3.1
  const specification = specificationService.getSpecification('2027');

  // Формуємо плоский звіт
  const rows = reportService.buildRows(specification);

  console.log(`P-3.1 report: ${rows.length} rows`);

  // ------------------------------------------------------------
  // Перевірка кількості секцій
  // ------------------------------------------------------------

  const assemblies = rows.filter((row) => row.section === 'assembly');

  const parts = rows.filter((row) => row.section === 'part');

  const materials = rows.filter((row) => row.section === 'material');

  if (assemblies.length !== 2) {
    throw new Error(`Expected 2 assemblies, got ${assemblies.length}`);
  }

  if (parts.length !== 13) {
    throw new Error(`Expected 13 parts, got ${parts.length}`);
  }

  if (materials.length !== 5) {
    throw new Error(`Expected 5 materials, got ${materials.length}`);
  }

  if (rows.length !== 20) {
    throw new Error(`Expected 20 total rows, got ${rows.length}`);
  }

  // ------------------------------------------------------------
  // Контрольна деталь
  // ------------------------------------------------------------

  const r12 = rows.find((row) => row.code === 'R_12_A500C_L800');

  if (!r12) {
    throw new Error('R_12_A500C_L800 not found in report');
  }

  if (r12.qty !== 44) {
    throw new Error(`Expected R_12_A500C_L800 = 44, got ${r12.qty}`);
  }

  // ------------------------------------------------------------
  // Контрольний матеріал
  // ------------------------------------------------------------

  const material = rows.find((row) => row.code === 'R_12_А500С');

  if (!material) {
    throw new Error('R_12_А500С not found in report');
  }

  if (material.qty !== 31.24) {
    throw new Error(`Expected R_12_А500С = 31.24, got ${material.qty}`);
  }

  // ------------------------------------------------------------
  // Вивід звіту
  // ------------------------------------------------------------

  for (const row of rows) {
    console.log(
      `${row.section} | ` + `${row.code} | ` + `${row.qty} ${row.unit}`,
    );
  }

  console.log('✓ testProductSpecificationReportP31 passed');
}
