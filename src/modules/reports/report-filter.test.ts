/**
 * src/modules/reports/report-filter.test.ts
 *
 * Тестує логіку застосування ReportFilter.
 */

import { ReportFilter } from './report-filter';

interface TestManufacturing {
  manufacturingId: string;
  date: string;
  houseCode: string;
  productCode: string;
}

function matchesReportFilter(
  item: TestManufacturing,
  filter: ReportFilter,
): boolean {
  if (filter.houseCode && item.houseCode !== filter.houseCode) {
    return false;
  }

  if (filter.productCode && item.productCode !== filter.productCode) {
    return false;
  }

  if (filter.dateFrom && item.date < filter.dateFrom) {
    return false;
  }

  if (filter.dateTo && item.date > filter.dateTo) {
    return false;
  }

  return true;
}

export function testReportFilter(): void {
  const rows: TestManufacturing[] = [
    {
      manufacturingId: 'M001',
      date: '2026-09-01',
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-3.1',
    },
    {
      manufacturingId: 'M002',
      date: '2026-09-15',
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-3.1',
    },
    {
      manufacturingId: 'M003',
      date: '2026-09-20',
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-2.2',
    },
    {
      manufacturingId: 'M004',
      date: '2026-10-01',
      houseCode: 'Інший будинок',
      productCode: 'П-3.1',
    },
  ];

  // ------------------------------------------------------------
  // 1. Без фільтрів
  // ------------------------------------------------------------

  const all = rows.filter((row) => matchesReportFilter(row, {}));

  if (all.length !== 4) {
    throw new Error(`Expected 4 rows, got ${all.length}`);
  }

  // ------------------------------------------------------------
  // 2. Фільтр за будинком
  // ------------------------------------------------------------

  const houseRows = rows.filter((row) =>
    matchesReportFilter(row, {
      houseCode: 'Д-05/2020 - КР.7',
    }),
  );

  if (houseRows.length !== 3) {
    throw new Error(`Expected 3 house rows, got ${houseRows.length}`);
  }

  // ------------------------------------------------------------
  // 3. Фільтр за виробом
  // ------------------------------------------------------------

  const productRows = rows.filter((row) =>
    matchesReportFilter(row, {
      productCode: 'П-3.1',
    }),
  );

  if (productRows.length !== 3) {
    throw new Error(`Expected 3 product rows, got ${productRows.length}`);
  }

  // ------------------------------------------------------------
  // 4. Будинок + виріб
  // ------------------------------------------------------------

  const houseProductRows = rows.filter((row) =>
    matchesReportFilter(row, {
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-3.1',
    }),
  );

  if (houseProductRows.length !== 2) {
    throw new Error(
      `Expected 2 house/product rows, got ${houseProductRows.length}`,
    );
  }

  // ------------------------------------------------------------
  // 5. Період
  // ------------------------------------------------------------

  const periodRows = rows.filter((row) =>
    matchesReportFilter(row, {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    }),
  );

  if (periodRows.length !== 3) {
    throw new Error(`Expected 3 period rows, got ${periodRows.length}`);
  }

  // ------------------------------------------------------------
  // 6. Будинок + період
  // ------------------------------------------------------------

  const housePeriodRows = rows.filter((row) =>
    matchesReportFilter(row, {
      houseCode: 'Д-05/2020 - КР.7',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    }),
  );

  if (housePeriodRows.length !== 3) {
    throw new Error(
      `Expected 3 house/period rows, got ${housePeriodRows.length}`,
    );
  }

  // ------------------------------------------------------------
  // 7. Будинок + виріб + період
  // ------------------------------------------------------------

  const fullFilterRows = rows.filter((row) =>
    matchesReportFilter(row, {
      houseCode: 'Д-05/2020 - КР.7',
      productCode: 'П-3.1',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    }),
  );

  if (fullFilterRows.length !== 2) {
    throw new Error(
      `Expected 2 full-filter rows, got ${fullFilterRows.length}`,
    );
  }

  Logger.log(`ReportFilter test: ${rows.length} source rows`);

  Logger.log(`All: ${all.length}`);
  Logger.log(`House: ${houseRows.length}`);
  Logger.log(`Product: ${productRows.length}`);
  Logger.log(`House + Product: ${houseProductRows.length}`);
  Logger.log(`Period: ${periodRows.length}`);
  Logger.log(`House + Period: ${housePeriodRows.length}`);
  Logger.log(`House + Product + Period: ${fullFilterRows.length}`);

  Logger.log('✓ testReportFilter passed');
}
