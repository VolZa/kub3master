/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Tests
 * File: testManufacturingSyncStateRepository.ts
 * Path: src/modules/manufacturingSync/tests/testManufacturingSyncStateRepository.ts
 *
 * Контрольна перевірка ManufacturingSyncStateRepository.
 *
 * Тест перевіряє читання порожнього листа
 * ManufacturingSyncState та пошук ManufacturingId.
 *
 * Тест НЕ змінює дані в Google Sheets.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';

import { GoogleSheetsManufacturingSyncStateDataSource } from '../../../infrastructure/sheets/manufacturingSyncState/GoogleSheetsManufacturingSyncStateDataSource';

import { ManufacturingSyncStateRepository } from '../../manufacturingSync/manufacturing-sync-state.repository';

export function testManufacturingSyncStateRepository(): void {
  Logger.log('========================================');
  Logger.log('TEST: ManufacturingSyncStateRepository');
  Logger.log('========================================');

  const dataSource = new GoogleSheetsManufacturingSyncStateDataSource(
    sheetProvider,
  );

  const rows = dataSource.getRows();

  Logger.log(`📋 Отримано рядків ManufacturingSyncState: ${rows.length}`);

  const repository = new ManufacturingSyncStateRepository(rows, dataSource);

  const state = repository.findByManufacturingId('М00000007');

  if (state !== null) {
    throw new Error('Очікувався null для ManufacturingId М00000007.');
  }

  Logger.log('✅ М00000007 → SyncState не знайдено (очікувано)');

  const state2 = repository.findByManufacturingId('М00000010');

  if (state2 !== null) {
    throw new Error('Очікувався null для ManufacturingId М00000010.');
  }

  Logger.log('✅ М00000010 → SyncState не знайдено (очікувано)');

  Logger.log('========================================');
  Logger.log('📋 Всього рядків: ' + rows.length);
  Logger.log('✅ Repository працює коректно.');
  Logger.log('========================================');
}
