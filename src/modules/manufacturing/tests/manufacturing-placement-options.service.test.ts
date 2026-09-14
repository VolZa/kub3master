/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-placement-options.service.test.ts
 * Path: src\modules\manufacturing\tests\manufacturing-placement-options.service.test.ts
 *
 * Тест ManufacturingPlacementOptionsService
 * на реальних даних 13_Placement.
 * ==========================================================
 */

import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { PlacementStatus } from '../../../domain/placement/placement.status';
import { ManufacturingPlacementOptionsService } from '../services/manufacturing-placement-options.service';

export function testManufacturingPlacementOptionsService(): void {
  const placementRepository = getPlacementRepository();

  const service = new ManufacturingPlacementOptionsService(placementRepository);

  const options = service.getOptions('H001', 'П-2.2');

  console.log(
    `Manufacturing Placement options for H001 / П-2.2: ${options.length}`,
  );

  for (const option of options) {
    console.log(`✓ ${option.value} — ${option.label}`);
  }

  for (const option of options) {
    const placementId = Number(option.value);

    if (!Number.isInteger(placementId)) {
      throw new Error(`Некоректний PlacementId: ${option.value}`);
    }

    const placement = placementRepository.findById(placementId);

    if (!placement) {
      throw new Error(`Placement ${placementId} не знайдений.`);
    }

    if (placement.houseCode !== 'H001') {
      throw new Error(`Placement ${placementId} належить іншому будинку.`);
    }

    if (placement.productCode !== 'П-2.2') {
      throw new Error(`Placement ${placementId} має інший ProductCode.`);
    }

    if (
      placement.status !== PlacementStatus.NONE &&
      placement.status !== PlacementStatus.REJECTED
    ) {
      throw new Error(
        `Placement ${placementId} має недозволений статус: ${placement.status}`,
      );
    }
  }

  console.log('MANUFACTURING PLACEMENT OPTIONS SERVICE TEST PASSED.');
}
