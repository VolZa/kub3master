/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Test / Integration
 * File: manufacturing-synchronization-detach-integration.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-detach-integration.test.ts
 *
 * Інтеграційний тест повного виконання DETACH_PRODUCED.
 *
 * Початковий стан:
 *
 * Manufacturing:
 *   М00000010
 *   ACTIVE
 *   PlacementId = blank
 *
 * Placement:
 *   191 = PRODUCED
 *
 * SyncState:
 *   М00000010 | 191 | SYNCED
 *
 * Очікуваний результат:
 *
 * Placement 191:
 *   PRODUCED → NONE
 *
 * SyncState:
 *   SYNCED → NO_PLACEMENT
 *
 * Manufacturing:
 *   залишається ACTIVE
 *   PlacementId залишається blank
 * ==========================================================
 */

import { ManufacturingDomainMapper } from '../../manufacturing/mapping/manufacturingDomainMapper';
import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';
import { GoogleSheetsManufacturingSyncStateDataSource } from '../../../infrastructure/sheets/manufacturingSyncState/GoogleSheetsManufacturingSyncStateDataSource';
import { GoogleSheetsPlacementDataSource } from '../../../infrastructure/sheets/placement/GoogleSheetsPlacementDataSource';

import { mapRowsToPlacements } from '../../../domain/placement/placement.mapper';
import { PlacementStatus } from '../../../domain/placement/placement.status';

import { ManufacturingSynchronizationService } from '../services/manufacturing-synchronization.service';
import { ManufacturingSyncStateRepository } from '../manufacturing-sync-state.repository';
import { PlacementInMemoryRepository } from '../../placement/placement.repository';

import { sheetProvider } from '../../../app/factories/infrastructure.factory';

export function testManufacturingSynchronizationDetachIntegration(): void {
  // ==========================================================
  // 1. Читаємо Manufacturing
  // ==========================================================

  const manufacturingDataSource = new GoogleSheetsManufacturingDataSource(
    sheetProvider,
  );

  const manufacturingRows = manufacturingDataSource.getRows();

  const manufacturingRow = manufacturingRows.find(
    (row) => row.ID === 'М00000010',
  );

  if (!manufacturingRow) {
    throw new Error('Manufacturing М00000010 не знайдено.');
  }

  const manufacturing =
    ManufacturingDomainMapper.mapRowToDomain(manufacturingRow);

  console.log(
    `BEFORE MANUFACTURING: ${manufacturing.id} | ` +
      `${manufacturing.status} | ` +
      `PlacementId=${manufacturing.placementId ?? 'blank'}`,
  );

  if (manufacturing.status !== 'ACTIVE') {
    throw new Error(
      `Manufacturing повинен бути ACTIVE, ` +
        `отримано ${manufacturing.status}.`,
    );
  }

  if (manufacturing.placementId !== undefined) {
    throw new Error(
      `Manufacturing PlacementId повинен бути blank, ` +
        `отримано ${manufacturing.placementId}.`,
    );
  }

  // ==========================================================
  // 2. Читаємо Placement
  // ==========================================================

  const placementDataSource = new GoogleSheetsPlacementDataSource(
    sheetProvider,
  );

  const placements = mapRowsToPlacements(placementDataSource.getRows());

  const placementRepository = new PlacementInMemoryRepository(
    placements,
    placementDataSource,
  );

  const placementBefore = placementRepository.findById(191);

  if (!placementBefore) {
    throw new Error('Placement 191 не знайдено.');
  }

  console.log(
    `BEFORE PLACEMENT: ${placementBefore.id} | ` +
      `${placementBefore.houseCode} | ` +
      `${placementBefore.productCode} | ` +
      `status=${placementBefore.status}`,
  );

  if (placementBefore.status !== PlacementStatus.PRODUCED) {
    throw new Error(
      `Placement 191 повинен бути PRODUCED перед тестом, ` +
        `отримано ${placementBefore.status}.`,
    );
  }

  // ==========================================================
  // 3. Читаємо SyncState
  // ==========================================================

  const syncStateDataSource = new GoogleSheetsManufacturingSyncStateDataSource(
    sheetProvider,
  );

  const syncStateRepository = new ManufacturingSyncStateRepository(
    syncStateDataSource.getRows(),
    syncStateDataSource,
  );

  const syncStateBefore =
    syncStateRepository.findByManufacturingId('М00000010');

  if (!syncStateBefore) {
    throw new Error('SyncState для М00000010 не знайдено.');
  }

  console.log(
    `BEFORE SYNC STATE: ` +
      `${syncStateBefore.manufacturingId} | ` +
      `${syncStateBefore.placementId ?? 'blank'} | ` +
      `${syncStateBefore.status}`,
  );

  if (syncStateBefore.placementId !== 191) {
    throw new Error(
      `SyncState повинен вказувати на Placement 191, ` +
        `отримано ${syncStateBefore.placementId}.`,
    );
  }

  if (syncStateBefore.status !== 'SYNCED') {
    throw new Error(
      `SyncState повинен мати SYNCED, ` + `отримано ${syncStateBefore.status}.`,
    );
  }

  // ==========================================================
  // 4. ANALYZE
  // ==========================================================

  const service = new ManufacturingSynchronizationService(
    syncStateRepository,
    placementRepository,
  );

  const analysis = service.analyze(manufacturing);

  console.log(
    `ANALYSIS: status=${analysis.status}, ` + `action=${analysis.action.type}`,
  );

  if (analysis.status !== 'READY') {
    throw new Error(`Очікувався READY, отримано ${analysis.status}.`);
  }

  if (analysis.action.type !== 'DETACH_PRODUCED') {
    throw new Error(
      `Очікувався DETACH_PRODUCED, ` + `отримано ${analysis.action.type}.`,
    );
  }

  console.log('ANALYZE PASSED: DETACH_PRODUCED.');

  // ==========================================================
  // 5. EXECUTE
  // ==========================================================

  const result = service.execute(analysis);

  console.log(
    `EXECUTE: status=${result.status}, ` + `action=${result.action.type}`,
  );

  // ==========================================================
  // 6. SAVE
  // ==========================================================

  placementRepository.save();
  syncStateRepository.save();

  console.log('SAVE PASSED.');

  // ==========================================================
  // 7. Повторно читаємо Placement із Google Sheets
  // ==========================================================

  const placementDataSourceAfter = new GoogleSheetsPlacementDataSource(
    sheetProvider,
  );

  const placementsAfter = mapRowsToPlacements(
    placementDataSourceAfter.getRows(),
  );

  const placementAfter = placementsAfter.find((item) => item.id === 191);

  if (!placementAfter) {
    throw new Error('Placement 191 не знайдено після save.');
  }

  console.log(
    `AFTER PLACEMENT: ${placementAfter.id} | ` +
      `status=${placementAfter.status}`,
  );

  if (placementAfter.status !== PlacementStatus.NONE) {
    throw new Error(
      `Placement 191 повинен бути NONE після detach, ` +
        `отримано ${placementAfter.status}.`,
    );
  }

  console.log('PLACEMENT INTEGRATION PASSED: PRODUCED → NONE.');

  // ==========================================================
  // 8. Повторно читаємо SyncState із Google Sheets
  // ==========================================================

  const syncStateDataSourceAfter =
    new GoogleSheetsManufacturingSyncStateDataSource(sheetProvider);

  const syncStateRepositoryAfter = new ManufacturingSyncStateRepository(
    syncStateDataSourceAfter.getRows(),
    syncStateDataSourceAfter,
  );

  const syncStateAfter =
    syncStateRepositoryAfter.findByManufacturingId('М00000010');

  if (!syncStateAfter) {
    throw new Error('SyncState для М00000010 не знайдено після save.');
  }

  console.log(
    `AFTER SYNC STATE: ` +
      `${syncStateAfter.manufacturingId} | ` +
      `${syncStateAfter.placementId ?? 'blank'} | ` +
      `${syncStateAfter.status}`,
  );

  if (syncStateAfter.placementId !== 191) {
    throw new Error(
      `SyncState повинен зберігати PlacementId 191, ` +
        `отримано ${syncStateAfter.placementId}.`,
    );
  }

  if (syncStateAfter.status !== 'NO_PLACEMENT') {
    throw new Error(
      `SyncState повинен мати NO_PLACEMENT, ` +
        `отримано ${syncStateAfter.status}.`,
    );
  }

  console.log('SYNC STATE INTEGRATION PASSED: SYNCED → NO_PLACEMENT.');

  // ==========================================================
  // 9. Перевіряємо Manufacturing повторним читанням
  // ==========================================================

  const manufacturingDataSourceAfter = new GoogleSheetsManufacturingDataSource(
    sheetProvider,
  );

  const manufacturingRowsAfter = manufacturingDataSourceAfter.getRows();

  const manufacturingRowAfter = manufacturingRowsAfter.find(
    (row) => row.ID === 'М00000010',
  );

  if (!manufacturingRowAfter) {
    throw new Error('Manufacturing М00000010 не знайдено після save.');
  }

  const manufacturingAfter = ManufacturingDomainMapper.mapRowToDomain(
    manufacturingRowAfter,
  );

  console.log(
    `AFTER MANUFACTURING: ${manufacturingAfter.id} | ` +
      `${manufacturingAfter.status} | ` +
      `PlacementId=${manufacturingAfter.placementId ?? 'blank'}`,
  );

  if (manufacturingAfter.status !== 'ACTIVE') {
    throw new Error(
      `Manufacturing повинен залишитися ACTIVE, ` +
        `отримано ${manufacturingAfter.status}.`,
    );
  }

  if (manufacturingAfter.placementId !== undefined) {
    throw new Error(
      `Manufacturing PlacementId повинен залишитися blank, ` +
        `отримано ${manufacturingAfter.placementId}.`,
    );
  }

  console.log('MANUFACTURING INTEGRATION PASSED: ACTIVE + blank PlacementId.');

  console.log('DETACH INTEGRATION TEST PASSED.');
}
