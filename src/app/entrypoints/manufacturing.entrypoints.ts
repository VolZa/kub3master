/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing.entrypoints.ts
 * Path: src\app\entrypoints\manufacturing.entrypoints.ts
 *
 * GAS entry points для операцій Manufacturing.
 * ==========================================================
 */

import { getManufacturingBufferCreationApplicationService } from '../factories/manufacturing-buffer-creation.factory';

import { getManufacturingRepository } from '../factories/manufacturing.factory';
import { getPlacementRepository } from '../factories/placement.factory';
import { getManufacturingSyncStateRepository } from '../factories/manufacturing-sync-state.factory';

import { ManufacturingPlacementRebuilder } from '../../modules/manufacturing/synchronization/manufacturing-placement-rebuilder';

export function createManufacturingFromBuffer(): void {
  const service = getManufacturingBufferCreationApplicationService();

  try {
    const manufacturing = service.createFromBuffer();

    SpreadsheetApp.getActive().toast(
      `Manufacturing ${manufacturing.id} створений.`,
      'Виготовлення',
      5,
    );

    console.log(`Manufacturing ${manufacturing.id} створений із буфера.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    SpreadsheetApp.getActive().toast(message, 'Помилка', 8);

    console.error(`Помилка створення Manufacturing: ${message}`);

    throw error;
  }
}

export function rebuildManufacturingState(): void {
  const ui = SpreadsheetApp.getUi();

  try {
    const manufacturingRepository = getManufacturingRepository();
    const placementRepository = getPlacementRepository();
    const manufacturingSyncStateRepository =
      getManufacturingSyncStateRepository();

    const rebuilder = new ManufacturingPlacementRebuilder(
      manufacturingRepository,
      placementRepository,
      manufacturingSyncStateRepository,
    );

    const result = rebuilder.analyze('EXECUTE');

    const response = ui.alert(
      'Повна синхронізація виробництва',
      [
        `Manufacturing: ${result.manufacturing.totalManufacturing}`,
        `  ACTIVE: ${result.manufacturing.activeManufacturing}`,
        `  CANCELLED: ${result.manufacturing.cancelledManufacturing}`,
        '',
        `Placement: ${result.placements.totalPlacements}`,
        `  → PRODUCED: ${result.placements.markProduced}`,
        `  → NONE: ${result.placements.resetToNone}`,
        `  Без змін: ${result.placements.unchanged}`,
        '',
        `Дублікатів PlacementId: ${result.duplicatePlacements.length}`,
        '',
        'Виконати повну синхронізацію?',
      ].join('\n'),
      ui.ButtonSet.YES_NO,
    );

    if (response !== ui.Button.YES) {
      ui.alert(
        'Повна синхронізація виробництва',
        'Операцію скасовано. Дані не змінено.',
        ui.ButtonSet.OK,
      );

      return;
    }

    rebuilder.execute(result);

    ui.alert(
      'Повна синхронізація виробництва',
      [
        'Синхронізацію успішно виконано.',
        '',
        `Placement: ${result.placements.totalPlacements}`,
        `Змінено: ${
          result.placements.markProduced + result.placements.resetToNone
        }`,
        `ManufacturingSyncState: ${result.syncStateRecords.length}`,
      ].join('\n'),
      ui.ButtonSet.OK,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    ui.alert(
      'Помилка',
      `Не вдалося виконати повну синхронізацію виробництва.\n\n${message}`,
      ui.ButtonSet.OK,
    );

    throw error;
  }
}
