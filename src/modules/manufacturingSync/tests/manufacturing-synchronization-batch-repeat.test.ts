/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-batch-repeat.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-batch-repeat.test.ts
 *
 * Призначення:
 * Перевірка ідемпотентності пакетної синхронізації Manufacturing.
 *
 * Повторний запуск уже синхронізованих Manufacturing
 * не повинен виконувати повторних дій.
 * ==========================================================
 */

import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';
import { ManufacturingDomainMapper } from '../../manufacturing/mapping/manufacturingDomainMapper';

import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { getManufacturingSyncStateRepository } from '../../../app/factories/manufacturing-sync-state.factory';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';

import { ManufacturingSynchronizationService } from '../services/manufacturing-synchronization.service';
import { ManufacturingSynchronizationBatchApplicationService } from '../services/manufacturing-synchronization-batch-application.service';

import { getManufacturingRepository } from '../../../app/factories/manufacturing.factory';

export function testManufacturingSynchronizationBatchRepeat(): void {
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

  const batchAnalysis = batchService.analyze(manufacturingItems);

  console.log(`BATCH REPEAT ANALYSIS: TOTAL = ${batchAnalysis.total}`);

  const batchResult = batchService.execute(batchAnalysis);

  console.log('--- BATCH REPEAT RESULT ---');
  console.log(`TOTAL: ${batchResult.total}`);
  console.log(`EXECUTED: ${batchResult.executed}`);
  console.log(`SKIPPED: ${batchResult.skipped}`);
  console.log(`ERRORS: ${batchResult.errors}`);

  console.log('--- DETAILS ---');

  batchResult.results.forEach((item) => {
    console.log(`${item.manufacturingId} | ${item.status}`);
  });

  if (batchResult.total !== manufacturingItems.length) {
    throw new Error(
      `Невірний TOTAL: ${batchResult.total}. ` +
        `Очікувалось: ${manufacturingItems.length}.`,
    );
  }

  if (batchResult.executed !== 0) {
    throw new Error(
      `Невірний EXECUTED: ${batchResult.executed}. ` + `Очікувалось: 0.`,
    );
  }

  if (batchResult.skipped !== manufacturingItems.length) {
    throw new Error(
      `Невірний SKIPPED: ${batchResult.skipped}. ` +
        `Очікувалось: ${manufacturingItems.length}.`,
    );
  }

  if (batchResult.errors !== 0) {
    throw new Error(
      `Невірний ERRORS: ${batchResult.errors}. ` + `Очікувалось: 0.`,
    );
  }

  console.log('MANUFACTURING SYNCHRONIZATION BATCH REPEAT TEST PASSED.');
}
