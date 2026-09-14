/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Test
 * File: manufacturing-synchronization-execute.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-execute.test.ts
 *
 * Тест виконання синхронізації Manufacturing → Placement.
 *
 * Перевіряє:
 * 1. analyze() визначає MARK_PRODUCED;
 * 2. execute() змінює Placement на PRODUCED;
 * 3. execute() створює ManufacturingSyncState = SYNCED;
 * 4. повторний analyze() не вимагає повторної дії.
 * ==========================================================
 */

import { ManufacturingDomainMapper } from '../../manufacturing/mapping/manufacturingDomainMapper';
import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';

import { getManufacturingSyncStateRepository } from '../../../app/factories/manufacturing-sync-state.factory';
import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';

import { ManufacturingSynchronizationService } from '../services/manufacturing-synchronization.service';

export function testManufacturingSynchronizationExecute(): void {
  console.log('========================================');
  console.log('MANUFACTURING SYNCHRONIZATION EXECUTE TEST');
  console.log('========================================');

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
  console.log('Manufacturing:', manufacturing.id);
  console.log('PlacementId:', manufacturing.placementId);
  console.log('Status:', manufacturing.status);

  const placementRepository = getPlacementRepository();

  const syncStateRepository = getManufacturingSyncStateRepository();

  const service = new ManufacturingSynchronizationService(
    syncStateRepository,
    placementRepository,
  );

  // --------------------------------------------------------
  // 1. ANALYZE BEFORE EXECUTE
  // --------------------------------------------------------

  const analysis = service.analyze(manufacturing);

  console.log('----------------------------------------');
  console.log('BEFORE EXECUTE');
  console.log('Sync Status:', analysis.status);
  console.log('Action:', analysis.action.type);

  if (analysis.action.type !== 'MARK_PRODUCED') {
    throw new Error(
      `Очікував MARK_PRODUCED, отримано ${analysis.action.type}.`,
    );
  }

  // --------------------------------------------------------
  // 2. EXECUTE
  // --------------------------------------------------------

  const result = service.execute(analysis);

  console.log('----------------------------------------');
  console.log('EXECUTE RESULT');
  console.log('Status:', result.status);
  console.log('Action:', result.action.type);
  console.log('Message:', result.message);

  // --------------------------------------------------------
  // 3. CHECK PLACEMENT
  // --------------------------------------------------------

  if (manufacturing.placementId === undefined) {
    throw new Error('Manufacturing не має PlacementId.');
  }

  const placement = placementRepository.findById(manufacturing.placementId);

  if (!placement) {
    throw new Error(
      `Placement ${manufacturing.placementId} не знайдено після execute().`,
    );
  }

  console.log('----------------------------------------');
  console.log('PLACEMENT AFTER EXECUTE');
  console.log('PlacementId:', placement.id);
  console.log('Placement Status:', placement.status);

  if (placement.status !== 'PRODUCED') {
    throw new Error(
      `Очікував Placement Status = PRODUCED, отримано ${placement.status}.`,
    );
  }

  // --------------------------------------------------------
  // 4. CHECK SYNC STATE
  // --------------------------------------------------------

  const syncState = syncStateRepository.findByManufacturingId(manufacturing.id);

  console.log('----------------------------------------');
  console.log('SYNC STATE AFTER EXECUTE');

  if (!syncState) {
    throw new Error('ManufacturingSyncState не створено.');
  }

  console.log('ManufacturingId:', syncState.manufacturingId);

  console.log('PlacementId:', syncState.placementId);

  console.log('Sync Status:', syncState.status);

  if (syncState.status !== 'SYNCED') {
    throw new Error(
      `Очікував Sync Status = SYNCED, отримано ${syncState.status}.`,
    );
  }

  if (syncState.placementId !== manufacturing.placementId) {
    throw new Error('PlacementId у SyncState не відповідає Manufacturing.');
  }

  // --------------------------------------------------------
  // 5. ANALYZE AGAIN
  // --------------------------------------------------------

  const secondAnalysis = service.analyze(manufacturing);

  console.log('----------------------------------------');
  console.log('AFTER SECOND ANALYZE');
  console.log('Sync Status:', secondAnalysis.status);

  console.log('Action:', secondAnalysis.action.type);

  console.log('Message:', secondAnalysis.message);

  if (secondAnalysis.action.type !== 'NONE') {
    throw new Error(
      `Очікував NONE після execute(), отримано ${secondAnalysis.action.type}.`,
    );
  }

  console.log('========================================');
  console.log('TEST PASSED');
  console.log('========================================');
}
