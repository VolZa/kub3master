/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-batch-analyze.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-batch-analyze.test.ts
 *
 * Призначення:
 * Інтеграційний read-only тест пакетного аналізу Manufacturing.
 *
 * Перевіряє:
 * - читання всіх Manufacturing з 01_Виготовлення;
 * - пакетний analyze();
 * - розподіл результатів за статусами;
 * - розподіл результатів за діями.
 *
 * Тест НЕ змінює Placement або ManufacturingSyncState.
 * ==========================================================
 */

import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';
import { ManufacturingDomainMapper } from '../../manufacturing/mapping/manufacturingDomainMapper';

import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { getManufacturingSyncStateRepository } from '../../../app/factories/manufacturing-sync-state.factory';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';

import { ManufacturingSynchronizationService } from '../services/manufacturing-synchronization.service';
import { ManufacturingSynchronizationBatchApplicationService } from '../services/manufacturing-synchronization-batch-application.service';
import { getManufacturingRepository } from 'app/factories/manufacturing.factory';

export function testManufacturingSynchronizationBatchAnalyze(): void {
  const manufacturingDataSource = new GoogleSheetsManufacturingDataSource(
    sheetProvider,
  );

  const manufacturingRows = manufacturingDataSource.getRows();

  const manufacturingItems = manufacturingRows.map((row) =>
    ManufacturingDomainMapper.mapRowToDomain(row),
  );

  const placementRepository = getPlacementRepository();

  const syncStateRepository = getManufacturingSyncStateRepository();

  const synchronizationService = new ManufacturingSynchronizationService(
    syncStateRepository,
    placementRepository,
  );
  const manufacturingRepository = getManufacturingRepository();
  const batchService = new ManufacturingSynchronizationBatchApplicationService(
    synchronizationService,
    placementRepository,
    syncStateRepository,
    manufacturingRepository,
  );

  const result = batchService.analyze(manufacturingItems);

  console.log(`BATCH ANALYZE: TOTAL = ${result.total}`);

  const statusCounts: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};

  result.analyses.forEach((analysis) => {
    statusCounts[analysis.status] = (statusCounts[analysis.status] ?? 0) + 1;

    actionCounts[analysis.action.type] =
      (actionCounts[analysis.action.type] ?? 0) + 1;
  });

  console.log('--- STATUS ---');

  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`${status}: ${count}`);
  });

  console.log('--- ACTION ---');

  Object.entries(actionCounts).forEach(([action, count]) => {
    console.log(`${action}: ${count}`);
  });

  console.log('--- DETAILS ---');

  result.analyses.forEach((analysis) => {
    const placementId = analysis.manufacturing.placementId ?? 'blank';

    console.log(
      `${analysis.manufacturing.id} | ` +
        `${analysis.manufacturing.status} | ` +
        `${analysis.manufacturing.houseCode} | ` +
        `${analysis.manufacturing.productCode} | ` +
        `qty=${analysis.manufacturing.quantity} | ` +
        `Placement=${placementId} | ` +
        `status=${analysis.status} | ` +
        `action=${analysis.action.type}` +
        (analysis.message ? ` | ${analysis.message}` : ''),
    );
  });

  console.log('MANUFACTURING SYNCHRONIZATION BATCH ANALYZE TEST PASSED.');
}
