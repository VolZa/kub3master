/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Test
 * File: manufacturing-synchronization-cancel.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-cancel.test.ts
 *
 * Інтеграційний тест скасування Manufacturing.
 *
 * Перевіряє:
 * CANCELLED Manufacturing
 *      ↓
 * analyze()
 *      ↓
 * UNMARK_PRODUCED
 *      ↓
 * synchronize()
 *      ↓
 * Placement → NONE
 * SyncState → CANCELLED
 *      ↓
 * повторне читання Google Sheets.
 * ==========================================================
 */

import { ManufacturingDomainMapper } from '../../manufacturing/mapping/manufacturingDomainMapper';

import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';
import { GoogleSheetsPlacementDataSource } from '../../../infrastructure/sheets/placement/GoogleSheetsPlacementDataSource';
import { GoogleSheetsManufacturingSyncStateDataSource } from '../../../infrastructure/sheets/manufacturingSyncState/GoogleSheetsManufacturingSyncStateDataSource';

import { getManufacturingSyncStateRepository } from '../../../app/factories/manufacturing-sync-state.factory';
import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';

import { ManufacturingSynchronizationApplicationService } from '../services/manufacturing-synchronization-application.service';

export function testManufacturingSynchronizationCancel(): void {
  console.log('========================================');
  console.log('MANUFACTURING SYNCHRONIZATION CANCEL TEST');
  console.log('========================================');

  // --------------------------------------------------------
  // 1. READ MANUFACTURING
  // --------------------------------------------------------

  const manufacturingDataSource = new GoogleSheetsManufacturingDataSource(
    sheetProvider,
  );

  const manufacturingRows = manufacturingDataSource.getRows();

  const manufacturingItems = manufacturingRows.map((row) =>
    ManufacturingDomainMapper.mapRowToDomain(row),
  );

  const manufacturing = manufacturingItems.find(
    (item) => item.id === 'М00000010',
  );

  if (!manufacturing) {
    throw new Error('Manufacturing М00000010 не знайдено.');
  }

  console.log('----------------------------------------');
  console.log('MANUFACTURING');
  console.log('ID:', manufacturing.id);
  console.log('Status:', manufacturing.status);
  console.log('PlacementId:', manufacturing.placementId);

  if (manufacturing.status !== 'CANCELLED') {
    throw new Error(
      `Очікував Manufacturing Status = CANCELLED, отримано "${manufacturing.status}".`,
    );
  }

  // --------------------------------------------------------
  // 2. CREATE APPLICATION SERVICE
  // --------------------------------------------------------

  const placementRepository = getPlacementRepository();

  const syncStateRepository = getManufacturingSyncStateRepository();

  const applicationService = new ManufacturingSynchronizationApplicationService(
    syncStateRepository,
    placementRepository,
  );

  // --------------------------------------------------------
  // 3. ANALYZE — повторний запуск
  // --------------------------------------------------------

  const analysis = applicationService.analyze(manufacturing);

  console.log('----------------------------------------');
  console.log('ANALYZE SECOND RUN');
  console.log('Sync Status:', analysis.status);
  console.log('Action:', analysis.action.type);
  console.log('Message:', analysis.message);

  if (analysis.action.type !== 'NONE') {
    throw new Error(
      `Очікував NONE для повторного запуску, отримано ${analysis.action.type}.`,
    );
  }

  if (analysis.status !== 'CANCELLED') {
    throw new Error(
      `Очікував Sync Status = CANCELLED, отримано "${analysis.status}".`,
    );
  }

  // --------------------------------------------------------
  // 4. SYNCHRONIZE — повторний запуск
  // --------------------------------------------------------

  console.log('----------------------------------------');
  console.log('SYNCHRONIZE SECOND RUN');

  const result = applicationService.synchronize(manufacturing);

  console.log('Status:', result.status);
  console.log('Action:', result.action.type);
  console.log('Message:', result.message);

  if (result.action.type !== 'NONE') {
    throw new Error(
      `Очікував NONE після повторного synchronize(), ` +
        `отримано ${result.action.type}.`,
    );
  }

  // --------------------------------------------------------
  // 5. RE-READ PLACEMENT
  // --------------------------------------------------------

  console.log('----------------------------------------');
  console.log('VERIFY PLACEMENT IN GOOGLE SHEETS');

  const placementDataSource = new GoogleSheetsPlacementDataSource(
    sheetProvider,
  );

  const placementRows = placementDataSource.getRows();

  const placement = placementRows.find(
    (row) => row.PlacementId === manufacturing.placementId,
  );

  if (!placement) {
    throw new Error(`Placement ${manufacturing.placementId} не знайдено.`);
  }

  console.log('PlacementId:', placement.PlacementId);

  console.log('Placement Status:', placement.Status);

  if (placement.Status !== '') {
    throw new Error(
      `Очікував порожній Placement Status, ` +
        `отримано "${placement.Status}".`,
    );
  }

  // --------------------------------------------------------
  // 6. RE-READ SYNC STATE
  // --------------------------------------------------------

  console.log('----------------------------------------');
  console.log('VERIFY SYNC STATE IN GOOGLE SHEETS');

  const syncStateDataSource = new GoogleSheetsManufacturingSyncStateDataSource(
    sheetProvider,
  );

  const syncStateRows = syncStateDataSource.getRows();

  const syncState = syncStateRows.find(
    (row) => row.ManufacturingId === manufacturing.id,
  );

  if (!syncState) {
    throw new Error(`SyncState для ${manufacturing.id} не знайдено.`);
  }

  console.log('ManufacturingId:', syncState.ManufacturingId);

  console.log('PlacementId:', syncState.PlacementId);

  console.log('Sync Status:', syncState.Status);

  if (syncState.Status !== 'CANCELLED') {
    throw new Error(
      `Очікував Sync Status = CANCELLED, ` + `отримано "${syncState.Status}".`,
    );
  }

  if (syncState.PlacementId !== manufacturing.placementId) {
    throw new Error(
      'PlacementId у SyncState змінився під час повторного запуску.',
    );
  }

  // --------------------------------------------------------
  // 7. TEST PASSED
  // --------------------------------------------------------

  console.log('========================================');
  console.log('CANCEL IDEMPOTENCY TEST PASSED');
  console.log('========================================');
}
