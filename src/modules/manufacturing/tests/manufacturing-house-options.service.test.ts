/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-house-options.service.test.ts
 * Path: src\modules\manufacturing\tests\manufacturing-house-options.service.test.ts
 *
 * Тест ManufacturingHouseOptionsService на реальних 20_Houses.
 * ==========================================================
 */

import { getHouseRepository } from '../../../app/factories/house.factory';
import { ManufacturingHouseOptionsService } from '../services/manufacturing-house-options.service';

export function testManufacturingHouseOptionsService(): void {
  const houseRepository = getHouseRepository();

  const service = new ManufacturingHouseOptionsService(houseRepository);

  const options = service.getOptions();

  if (options.length === 0) {
    throw new Error('Список House options порожній.');
  }

  const noneOption = options[0];

  if (noneOption.value !== '' || noneOption.label !== 'NONE — поза проектом') {
    throw new Error('Некоректний NONE option.');
  }

  const activeHouseCodes = houseRepository
    .findAll()
    .filter((house) => house.status === 'Active')
    .map((house) => house.code);

  for (const code of activeHouseCodes) {
    const option = options.find((item) => item.value === code);

    if (!option) {
      throw new Error(`Активний будинок ${code} відсутній у House options.`);
    }
  }

  console.log(`Manufacturing House options: ${options.length}`);

  for (const option of options) {
    console.log(`✓ ${option.value || 'NONE'} — ${option.label}`);
  }

  console.log('MANUFACTURING HOUSE OPTIONS SERVICE TEST PASSED.');
}
