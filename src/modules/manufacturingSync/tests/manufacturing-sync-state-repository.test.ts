/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Test
 * File: manufacturing-sync-state-repository.test.ts
 * Path: src\modules\manufacturingSync\tests\
 *       manufacturing-sync-state-repository.test.ts
 *
 * Перевірка Repository ManufacturingSyncState.
 *
 * Тестує:
 * - читання поточного стану;
 * - replaceAll();
 * - findByManufacturingId().
 *
 * Тест не виконує save() і не змінює Google Sheets.
 * ==========================================================
 */

import { getManufacturingSyncStateRepository } from '../../../app/factories/manufacturing-sync-state.factory';

export function testManufacturingSyncStateRepository(): void {
  const repository = getManufacturingSyncStateRepository();

  const before = repository.getAll();

  Logger.log('========================================');
  Logger.log('ManufacturingSyncStateRepository TEST');
  Logger.log('========================================');

  Logger.log(`До replaceAll: ${before.length}`);

  const testState = {
    manufacturingId: '__TEST__',
    placementId: 999999,
    status: 'SYNCED' as const,
    sourceUpdatedAt: new Date(),
    updatedAt: new Date(),
  };

  repository.replaceAll([testState]);

  const after = repository.getAll();

  Logger.log(`Після replaceAll: ${after.length}`);
  Logger.log(`ManufacturingId: ${after[0]?.manufacturingId ?? 'немає'}`);

  const found = repository.findByManufacturingId('__TEST__');

  Logger.log(
    `findByManufacturingId: ${found?.manufacturingId ?? 'НЕ ЗНАЙДЕНО'}`,
  );

  Logger.log('========================================');
}
