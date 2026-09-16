/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * Layer: Test
 * File: manufacturing-placement-rebuild.test.ts
 * Path: src\modules\manufacturing\tests\
 *       manufacturing-placement-rebuild.test.ts
 *
 * Тест повної реконструкції виробничого стану Placement.
 *
 * MFG-RESET-001
 * ==========================================================
 */

import { getManufacturingRepository } from '../../../app/factories/manufacturing.factory';
import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { getManufacturingSyncStateRepository } from '../../../app/factories/manufacturing-sync-state.factory';

import { ManufacturingPlacementRebuilder } from '../synchronization/manufacturing-placement-rebuilder';

export function testManufacturingPlacementRebuildExecute(): void {
  const manufacturingRepository = getManufacturingRepository();
  const placementRepository = getPlacementRepository();
  const syncStateRepository = getManufacturingSyncStateRepository();

  const rebuilder = new ManufacturingPlacementRebuilder(
    manufacturingRepository,
    placementRepository,
    syncStateRepository,
  );

  // ========================================================
  // 1. Побудова плану виконання
  // ========================================================

  const executePlan = rebuilder.analyze('EXECUTE');

  Logger.log('=== MFG-RESET-001 EXECUTE ===');

  Logger.log(`Placement: ${executePlan.placements.totalPlacements}`);

  Logger.log(`  MARK_PRODUCED: ${executePlan.placements.markProduced}`);

  Logger.log(`  RESET_TO_NONE: ${executePlan.placements.resetToNone}`);

  Logger.log(`  NONE: ${executePlan.placements.unchanged}`);

  Logger.log(`  Duplicates: ${executePlan.duplicatePlacements.length}`);

  // ========================================================
  // 2. Виконання
  // ========================================================

  rebuilder.execute(executePlan);

  Logger.log('MFG-RESET-001 EXECUTE завершено.');
  // ========================================================
  // 3. Перевірка ProducedDate / ProducedShift
  //
  // Для кожного ACTIVE Manufacturing з PlacementId
  // значення ProducedDate і ProducedShift у Placement
  // повинні відповідати Manufacturing.Date і Manufacturing.Shift.
  // ========================================================

  const manufacturing = manufacturingRepository.getAll();

  const activeManufacturingWithPlacement = manufacturing.filter(
    (item) => item.status === 'ACTIVE' && item.placementId !== undefined,
  );

  for (const item of activeManufacturingWithPlacement) {
    const placement = placementRepository.findById(item.placementId!);

    if (!placement) {
      throw new Error(
        `Placement ${item.placementId} не знайдено для Manufacturing ${item.id}.`,
      );
    }

    const expectedShift = Number(item.shift);

    if (
      !placement.producedDate ||
      placement.producedDate.getTime() !== item.date.getTime()
    ) {
      throw new Error(
        [
          `Помилка ProducedDate для Manufacturing ${item.id}.`,
          `PlacementId: ${item.placementId}`,
          `Очікувалось: ${item.date.toISOString()}`,
          `Отримано: ${placement.producedDate?.toISOString() ?? 'undefined'}`,
        ].join('\n'),
      );
    }

    if (placement.producedShift !== expectedShift) {
      throw new Error(
        [
          `Помилка ProducedShift для Manufacturing ${item.id}.`,
          `PlacementId: ${item.placementId}`,
          `Очікувалось: ${expectedShift}`,
          `Отримано: ${placement.producedShift ?? 'undefined'}`,
        ].join('\n'),
      );
    }
  }

  Logger.log(
    `✅ ProducedDate / ProducedShift перевірено: ${activeManufacturingWithPlacement.length} записів.`,
  );
  // ========================================================
  // 4. Повторний DRY_RUN
  //
  // Перевіряємо ідемпотентність:
  // після реконструкції повторний аналіз
  // не повинен знаходити змін.
  // ========================================================

  const verification = rebuilder.analyze('DRY_RUN');

  Logger.log('=== MFG-RESET-001 VERIFICATION ===');

  Logger.log(`Placement: ${verification.placements.totalPlacements}`);

  Logger.log(`  MARK_PRODUCED: ${verification.placements.markProduced}`);

  Logger.log(`  RESET_TO_NONE: ${verification.placements.resetToNone}`);

  Logger.log(`  unchanged: ${verification.placements.unchanged}`);

  Logger.log(`  Duplicates: ${verification.duplicatePlacements.length}`);

  // ========================================================
  // 5. Перевірка SyncState
  // ========================================================

  const syncedCount = verification.syncStateRecords.filter(
    (record) => record.status === 'SYNCED',
  ).length;

  const noPlacementCount = verification.syncStateRecords.filter(
    (record) => record.status === 'NO_PLACEMENT',
  ).length;

  const cancelledCount = verification.syncStateRecords.filter(
    (record) => record.status === 'CANCELLED',
  ).length;

  Logger.log('ManufacturingSyncState:');
  Logger.log(`  SYNCED: ${syncedCount}`);
  Logger.log(`  NO_PLACEMENT: ${noPlacementCount}`);
  Logger.log(`  CANCELLED: ${cancelledCount}`);
  Logger.log(`  Разом: ${verification.syncStateRecords.length}`);

  // ========================================================
  // 6. Жорсткі перевірки
  // ========================================================

  if (verification.placements.markProduced !== 0) {
    throw new Error('Помилка ідемпотентності: залишились MARK_PRODUCED.');
  }

  if (verification.placements.resetToNone !== 0) {
    throw new Error('Помилка ідемпотентності: залишились RESET_TO_NONE.');
  }

  if (verification.placements.unchanged !== 793) {
    throw new Error(
      `Очікувалось 793 unchanged, отримано ${verification.placements.unchanged}.`,
    );
  }

  if (
    verification.syncStateRecords.length !==
    verification.manufacturing.totalManufacturing
  ) {
    throw new Error(
      `Кількість SyncState (${verification.syncStateRecords.length}) не відповідає кількості Manufacturing (${verification.manufacturing.totalManufacturing}).`,
    );
  }

  if (syncedCount !== verification.manufacturing.withPlacement) {
    throw new Error(
      `SYNCED (${syncedCount}) не відповідає Manufacturing з Placement (${verification.manufacturing.withPlacement}).`,
    );
  }

  if (noPlacementCount !== verification.manufacturing.withoutPlacement) {
    throw new Error(
      `NO_PLACEMENT (${noPlacementCount}) не відповідає Manufacturing без Placement (${verification.manufacturing.withoutPlacement}).`,
    );
  }

  if (cancelledCount !== 2) {
    throw new Error(`Очікувалось CANCELLED = 2, отримано ${cancelledCount}.`);
  }

  Logger.log('✅ MFG-RESET-001 EXECUTE + IDEMPOTENCY: OK');
}
