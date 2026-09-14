/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-product-options.service.test.ts
 * Path: src\modules\manufacturing\tests\manufacturing-product-options.service.test.ts
 *
 * Тест ManufacturingProductOptionsService
 * на реальних даних 13_Placement.
 * ==========================================================
 */

import { getPlacementRepository } from '../../../app/factories/placement.factory';
import { ManufacturingProductOptionsService } from '../services/manufacturing-product-options.service';

export function testManufacturingProductOptionsService(): void {
  const placementRepository = getPlacementRepository();

  const service = new ManufacturingProductOptionsService(placementRepository);

  const options = service.getOptions('H001');

  if (options.length === 0) {
    throw new Error('Для H001 не знайдено жодного ProductCode.');
  }

  const values = options.map((option) => option.value);

  const uniqueValues = new Set(values);

  if (uniqueValues.size !== values.length) {
    throw new Error('ProductCode містить дублікати.');
  }

  for (const option of options) {
    if (!option.value || option.label !== option.value) {
      throw new Error(`Некоректний ProductOption: ${JSON.stringify(option)}`);
    }
  }

  console.log(`Manufacturing Product options for H001: ${options.length}`);

  for (const option of options) {
    console.log(`✓ ${option.value}`);
  }

  console.log('MANUFACTURING PRODUCT OPTIONS SERVICE TEST PASSED.');
}
