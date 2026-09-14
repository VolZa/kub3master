/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Test
 * File: manufacturing-synchronization-application.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-application.test.ts
 *
 * Інтеграційний тест повного циклу синхронізації:
 *
 * Manufacturing
 *      ↓
 * analyze()
 *      ↓
 * execute()
 *      ↓
 * save()
 *      ↓
 * Google Sheets
 *
 * Перевіряє фактичний запис Placement та ManufacturingSyncState.
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

export function testManufacturingSynchronizationApplication(): void {
  console.log('========================================');
  console.log('MANUFACTURING SYNCHRONIZATION APPLICATION TEST');
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

  // --------------------------------------------------------
  // 2. CREATE REPOSITORIES
  // --------------------------------------------------------

  const placementRepository = getPlacementRepository();

  const syncStateRepository = getManufacturingSyncStateRepository();

  const applicationService = new ManufacturingSynchronizationApplicationService(
    syncStateRepository,
    placementRepository,
  );

  // --------------------------------------------------------
  // 3. SYNCHRONIZE
  // --------------------------------------------------------

  console.log('----------------------------------------');
  console.log('SYNCHRONIZE');

  const result = applicationService.synchronize(manufacturing);

  console.log('Status:', result.status);
  console.log('Action:', result.action.type);
  console.log('Message:', result.message);

  if (result.action.type !== 'MARK_PRODUCED') {
    throw new Error(`Очікував MARK_PRODUCED, отримано ${result.action.type}.`);
  }

  // --------------------------------------------------------
  // 4. RE-READ PLACEMENT FROM GOOGLE SHEETS
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
    throw new Error(
      `Placement ${manufacturing.placementId} не знайдено в Google Sheets.`,
    );
  }

  console.log('PlacementId:', placement.PlacementId);

  console.log('Placement Status:', placement.Status);

  if (placement.Status !== 'PRODUCED') {
    throw new Error(
      `У Google Sheets очікував Status = PRODUCED, отримано "${placement.Status}".`,
    );
  }

  // --------------------------------------------------------
  // 5. RE-READ SYNC STATE FROM GOOGLE SHEETS
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
    throw new Error(
      `SyncState для ${manufacturing.id} не знайдено в Google Sheets.`,
    );
  }

  console.log('ManufacturingId:', syncState.ManufacturingId);

  console.log('PlacementId:', syncState.PlacementId);

  console.log('Sync Status:', syncState.Status);

  if (syncState.Status !== 'SYNCED') {
    throw new Error(
      `У Google Sheets очікував Sync Status = SYNCED, отримано "${syncState.Status}".`,
    );
  }

  if (syncState.PlacementId !== manufacturing.placementId) {
    throw new Error('PlacementId у SyncState не відповідає Manufacturing.');
  }

  // --------------------------------------------------------
  // 6. RESULT
  // --------------------------------------------------------

  console.log('========================================');
  console.log('INTEGRATION TEST PASSED');
  console.log('========================================');
}
