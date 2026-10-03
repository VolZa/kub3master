/**
 * ==========================================================
 * ERP КУБ
 * Module: Reports
 * File: report-filter.service.test.ts
 * Path: src/modules/reports/report-filter.service.test.ts
 *
 * Тест ReportFilterService на доменних об'єктах Manufacturing.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ReportFilterService } from '../report-filter.service';

export function testReportFilterService(): void {
  const service = new ReportFilterService();

  const rows: Manufacturing[] = [
    {
      id: 'M001',
      date: new Date('2026-09-01T08:00:00'),
      shift: '1',
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-3.1',
      quantity: 1,
      master: 'Майстер 1',
      comment: '',
      status: 'PRODUCED' as any,
      createdAt: new Date('2026-09-01T08:10:00'),
      updatedAt: new Date('2026-09-01T08:10:00'),
    },
    {
      id: 'M002',
      date: new Date('2026-09-15T10:00:00'),
      shift: '1',
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-3.1',
      quantity: 2,
      master: 'Майстер 2',
      comment: '',
      status: 'PRODUCED' as any,
      createdAt: new Date('2026-09-15T10:10:00'),
      updatedAt: new Date('2026-09-15T10:10:00'),
    },
    {
      id: 'M003',
      date: new Date('2026-09-20T12:00:00'),
      shift: '2',
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-2.2',
      quantity: 1,
      master: 'Майстер 3',
      comment: '',
      status: 'PRODUCED' as any,
      createdAt: new Date('2026-09-20T12:10:00'),
      updatedAt: new Date('2026-09-20T12:10:00'),
    },
    {
      id: 'M004',
      date: new Date('2026-10-01T08:00:00'),
      shift: '1',
      houseCode: 'Інший будинок',
      productCode: 'П-3.1',
      quantity: 1,
      master: 'Майстер 4',
      comment: '',
      status: 'PRODUCED' as any,
      createdAt: new Date('2026-10-01T08:10:00'),
      updatedAt: new Date('2026-10-01T08:10:00'),
    },
  ];

  // ------------------------------------------------------------
  // 1. Без фільтрів
  // ------------------------------------------------------------

  const all = service.filterManufacturing(rows, {});

  if (all.length !== 4) {
    throw new Error(`Expected 4 rows, got ${all.length}`);
  }

  // ------------------------------------------------------------
  // 2. Будинок
  // ------------------------------------------------------------

  const houseRows = service.filterManufacturing(rows, {
    houseCode: 'Д-05/2020 - КР.7',
  });

  if (houseRows.length !== 3) {
    throw new Error(`Expected 3 house rows, got ${houseRows.length}`);
  }

  // ------------------------------------------------------------
  // 3. Виріб
  // ------------------------------------------------------------

  const productRows = service.filterManufacturing(rows, {
    productCode: 'П-3.1',
  });

  if (productRows.length !== 3) {
    throw new Error(`Expected 3 product rows, got ${productRows.length}`);
  }

  // ------------------------------------------------------------
  // 4. Будинок + виріб
  // ------------------------------------------------------------

  const houseProductRows = service.filterManufacturing(rows, {
    houseCode: 'Д-05/2020 - КР.7',
    productCode: 'П-3.1',
  });

  if (houseProductRows.length !== 2) {
    throw new Error(
      `Expected 2 house/product rows, got ${houseProductRows.length}`,
    );
  }

  // ------------------------------------------------------------
  // 5. Період
  // ------------------------------------------------------------

  const periodRows = service.filterManufacturing(rows, {
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
  });

  if (periodRows.length !== 3) {
    throw new Error(`Expected 3 period rows, got ${periodRows.length}`);
  }

  // ------------------------------------------------------------
  // 6. Будинок + період
  // ------------------------------------------------------------

  const housePeriodRows = service.filterManufacturing(rows, {
    houseCode: 'Д-05/2020 - КР.7',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
  });

  if (housePeriodRows.length !== 3) {
    throw new Error(
      `Expected 3 house/period rows, got ${housePeriodRows.length}`,
    );
  }

  // ------------------------------------------------------------
  // 7. Будинок + виріб + період
  // ------------------------------------------------------------

  const fullFilterRows = service.filterManufacturing(rows, {
    houseCode: 'Д-05/2020 - КР.7',
    productCode: 'П-3.1',
    dateFrom: '2026-09-01',
    dateTo: '2026-09-30',
  });

  if (fullFilterRows.length !== 2) {
    throw new Error(
      `Expected 2 full-filter rows, got ${fullFilterRows.length}`,
    );
  }

  Logger.log(`Manufacturing rows: ${rows.length}`);
  Logger.log(`All: ${all.length}`);
  Logger.log(`House: ${houseRows.length}`);
  Logger.log(`Product: ${productRows.length}`);
  Logger.log(`House + Product: ${houseProductRows.length}`);
  Logger.log(`Period: ${periodRows.length}`);
  Logger.log(`House + Period: ${housePeriodRows.length}`);
  Logger.log(`House + Product + Period: ${fullFilterRows.length}`);

  Logger.log('✓ testReportFilterService passed');
}
