/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Test / Integration
 * File: manufacturing-synchronization-detach-analyze.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-detach-analyze.test.ts
 *
 * Інтеграційний тест analyze() для DETACH_PRODUCED.
 *
 * Google Sheets тільки читаються.
 * Запис у таблиці НЕ виконується.
 *
 * Очікуваний стан:
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
 *   status = READY
 *   action = DETACH_PRODUCED
 *   placement = 191
 * ==========================================================
 */

import { ManufacturingDomainMapper } from '../../manufacturing/mapping/manufacturingDomainMapper';
import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';
import { GoogleSheetsManufacturingSyncStateDataSource } from '../../../infrastructure/sheets/manufacturingSyncState/GoogleSheetsManufacturingSyncStateDataSource';
import { GoogleSheetsPlacementDataSource } from '../../../infrastructure/sheets/placement/GoogleSheetsPlacementDataSource';

import { mapRowsToPlacements } from '../../../domain/placement/placement.mapper';
import { ManufacturingSynchronizationService } from '../services/manufacturing-synchronization.service';
import { ManufacturingSyncStateRepository } from '../manufacturing-sync-state.repository';
import { PlacementInMemoryRepository } from '../../placement/placement.repository';

import { sheetProvider } from '../../../app/factories/infrastructure.factory';

export function testManufacturingSynchronizationDetachAnalyze(): void {
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

  const placementDataSource = new GoogleSheetsPlacementDataSource(
    sheetProvider,
  );

  const placements = mapRowsToPlacements(placementDataSource.getRows());

  const placementRepository = new PlacementInMemoryRepository(
    placements,
    placementDataSource,
  );

  const syncStateDataSource = new GoogleSheetsManufacturingSyncStateDataSource(
    sheetProvider,
  );

  const syncStateRepository = new ManufacturingSyncStateRepository(
    syncStateDataSource.getRows(),
    syncStateDataSource,
  );

  const service = new ManufacturingSynchronizationService(
    syncStateRepository,
    placementRepository,
  );

  // ------------------------------------------------------------
  // Перевіряємо фактичний Manufacturing
  // ------------------------------------------------------------

  console.log(
    `MANUFACTURING: ${manufacturing.id} | ` +
      `${manufacturing.status} | ` +
      `PlacementId=${manufacturing.placementId ?? 'blank'}`,
  );

  if (manufacturing.id !== 'М00000010') {
    throw new Error(`Очікувався М00000010, отримано ${manufacturing.id}.`);
  }

  if (manufacturing.status !== 'ACTIVE') {
    throw new Error(
      `Manufacturing повинен бути ACTIVE, ` +
        `отримано ${manufacturing.status}.`,
    );
  }

  if (manufacturing.placementId !== undefined) {
    throw new Error(
      `PlacementId Manufacturing повинен бути blank, ` +
        `отримано ${manufacturing.placementId}.`,
    );
  }

  // ------------------------------------------------------------
  // Перевіряємо Placement 191
  // ------------------------------------------------------------

  const placement = placementRepository.findById(191);

  if (!placement) {
    throw new Error('Placement 191 не знайдено.');
  }

  console.log(
    `PLACEMENT: ${placement.id} | ` +
      `${placement.houseCode} | ` +
      `${placement.productCode} | ` +
      `status=${placement.status}`,
  );

  if (placement.status !== 'PRODUCED') {
    throw new Error(
      `Placement 191 повинен бути PRODUCED, ` + `отримано ${placement.status}.`,
    );
  }

  // ------------------------------------------------------------
  // Перевіряємо SyncState
  // ------------------------------------------------------------

  const syncState = syncStateRepository.findByManufacturingId('М00000010');

  if (!syncState) {
    throw new Error('SyncState для М00000010 не знайдено.');
  }

  console.log(
    `SYNC STATE: ${syncState.manufacturingId} | ` +
      `${syncState.placementId ?? 'blank'} | ` +
      `${syncState.status}`,
  );

  if (syncState.placementId !== 191) {
    throw new Error(
      `SyncState повинен вказувати на Placement 191, ` +
        `отримано ${syncState.placementId}.`,
    );
  }

  if (syncState.status !== 'SYNCED') {
    throw new Error(
      `SyncState повинен мати SYNCED, ` + `отримано ${syncState.status}.`,
    );
  }

  // ------------------------------------------------------------
  // ANALYZE
  // ------------------------------------------------------------

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

  if (analysis.action.placement.id !== 191) {
    throw new Error(
      `Очікувався Placement 191, ` +
        `отримано ${analysis.action.placement.id}.`,
    );
  }

  console.log('DETACH ANALYZE INTEGRATION TEST PASSED.');
}
