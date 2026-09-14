/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-batch-execute.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-batch-execute.test.ts
 *
 * Призначення:
 * Інтеграційний тест пакетного виконання Manufacturing.
 *
 * Перевіряє:
 * - batch analyze();
 * - batch execute();
 * - обробку SKIPPED;
 * - обробку EXECUTED;
 * - відсутність помилок;
 * - відсутність запису змін у Google Sheets.
 *
 * УВАГА:
 * execute() змінює репозиторії тільки в пам'яті.
 * save() навмисно НЕ викликається.
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

export function testManufacturingSynchronizationBatchExecute(): void {
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

  // --------------------------------------------------------
  // 1. Analyze
  // --------------------------------------------------------

  const batchAnalysis = batchService.analyze(manufacturingItems);

  console.log(`BATCH ANALYSIS: TOTAL = ${batchAnalysis.total}`);

  // --------------------------------------------------------
  // 2. Execute
  // --------------------------------------------------------

  const batchResult = batchService.execute(batchAnalysis);

  console.log('--- BATCH RESULT ---');

  console.log(`TOTAL: ${batchResult.total}`);
  console.log(`EXECUTED: ${batchResult.executed}`);
  console.log(`SKIPPED: ${batchResult.skipped}`);
  console.log(`ERRORS: ${batchResult.errors}`);

  // --------------------------------------------------------
  // 3. Details
  // --------------------------------------------------------

  console.log('--- DETAILS ---');

  batchResult.results.forEach((item) => {
    console.log(
      `${item.manufacturingId} | ` +
        `${item.status}` +
        (item.error ? ` | ERROR: ${item.error}` : ''),
    );
  });

  // --------------------------------------------------------
  // 4. Assertions
  // --------------------------------------------------------

  if (batchResult.total !== manufacturingItems.length) {
    throw new Error(
      `Невірний TOTAL: ${batchResult.total}. ` +
        `Очікувалось: ${manufacturingItems.length}.`,
    );
  }

  if (batchResult.executed !== 5) {
    throw new Error(
      `Невірний EXECUTED: ${batchResult.executed}. ` + `Очікувалось: 5.`,
    );
  }

  if (batchResult.skipped !== 70) {
    throw new Error(
      `Невірний SKIPPED: ${batchResult.skipped}. ` + `Очікувалось: 70.`,
    );
  }

  if (batchResult.errors !== 0) {
    throw new Error(`Очікувалось 0 помилок, отримано: ${batchResult.errors}.`);
  }

  console.log('MANUFACTURING SYNCHRONIZATION BATCH EXECUTE TEST PASSED.');
}
