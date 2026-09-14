/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Tests
 * File: manufacturing-synchronization.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization.test.ts
 *
 * Read-only тест ManufacturingSynchronizationService.
 *
 * Перевіряє analyze() на реальних Manufacturing-записах
 * та Placement із Google Sheets.
 *
 * Тест НЕ змінює дані Google Sheets.
 * ==========================================================
 */

import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { getManufacturingSyncStateRepository } from '../../../app/factories/manufacturing-sync-state.factory';
import { getPlacementRepository } from '../../../app/factories/placement.factory';

import { ManufacturingDomainMapper } from '../../manufacturing/mapping/manufacturingDomainMapper';
import { ManufacturingSynchronizationService } from '../services/manufacturing-synchronization.service';

export function testManufacturingSynchronizationAnalyze(): void {
  const manufacturingDataSource = new GoogleSheetsManufacturingDataSource(
    sheetProvider,
  );

  const manufacturingRows = manufacturingDataSource.getRows();

  const targetIds = ['М00000007', 'М00000010'];

  const manufacturingItems = manufacturingRows
    .map((row) => ManufacturingDomainMapper.mapRowToDomain(row))
    .filter((item) => targetIds.includes(item.id));

  //   const manufacturingItems = manufacturingRows
  //     .map(ManufacturingDomainMapper.mapRowToDomain)
  //     .filter((item) => targetIds.includes(item.id));

  const placementRepository = getPlacementRepository();

  const syncStateRepository = getManufacturingSyncStateRepository();

  const service = new ManufacturingSynchronizationService(
    syncStateRepository,
    placementRepository,
  );

  Logger.log('========================================');
  Logger.log('MANUFACTURING SYNCHRONIZATION ANALYZE TEST');
  Logger.log('========================================');

  Logger.log(`Знайдено Manufacturing для тесту: ${manufacturingItems.length}`);

  for (const manufacturing of manufacturingItems) {
    const result = service.analyze(manufacturing);

    Logger.log('----------------------------------------');

    Logger.log(`Manufacturing: ${manufacturing.id}`);

    Logger.log(`HouseCode: ${manufacturing.houseCode}`);

    Logger.log(`ProductCode: ${manufacturing.productCode}`);

    Logger.log(`PlacementId: ${manufacturing.placementId ?? '—'}`);

    Logger.log(`Manufacturing Status: ${manufacturing.status}`);

    Logger.log(`Sync Status: ${result.status}`);

    Logger.log(`Action: ${result.action.type}`);

    Logger.log(`Message: ${result.message ?? '—'}`);

    if (result.placement) {
      Logger.log(`Placement: ${result.placement.id}`);

      Logger.log(`Placement Status: ${result.placement.status}`);
    }
  }

  Logger.log('========================================');
  Logger.log('TEST FINISHED');
  Logger.log('========================================');
}
