/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-web-options-api.test.ts
 * Path: src\modules\manufacturing\tests\manufacturing-web-options-api.test.ts
 *
 * Інтеграційний тест GAS entry points для Manufacturing Web UI.
 * ==========================================================
 */

import {
  getManufacturingHouseOptions,
  getManufacturingProductOptions,
  getManufacturingPlacementOptions,
} from '../../../ui/webApp';

export function testManufacturingWebOptionsApi(): void {
  // --------------------------------------------------------
  // 1. Будинки
  // --------------------------------------------------------

  const houseOptions = getManufacturingHouseOptions();

  if (houseOptions.length === 0) {
    throw new Error('Manufacturing House options порожній.');
  }

  const noneOption = houseOptions[0];

  if (noneOption.value !== '' || noneOption.label !== 'NONE — поза проектом') {
    throw new Error('Некоректний NONE option.');
  }

  console.log(`House options: ${houseOptions.length}`);

  for (const option of houseOptions) {
    console.log(`✓ ${option.value || 'NONE'} — ${option.label}`);
  }

  // --------------------------------------------------------
  // 2. Вироби H001
  // --------------------------------------------------------

  const productOptions = getManufacturingProductOptions('H001');

  if (productOptions.length === 0) {
    throw new Error('Для H001 не знайдено Product options.');
  }

  console.log(`Product options H001: ${productOptions.length}`);

  // --------------------------------------------------------
  // 3. Placement H001 / П-2.2
  // --------------------------------------------------------

  const placementOptions = getManufacturingPlacementOptions('H001', 'П-2.2');

  if (placementOptions.length === 0) {
    throw new Error('Для H001 / П-2.2 не знайдено Placement options.');
  }

  console.log(`Placement options H001 / П-2.2: ${placementOptions.length}`);

  for (const option of placementOptions.slice(0, 5)) {
    console.log(`✓ ${option.value} — ${option.label}`);
  }

  console.log('MANUFACTURING WEB OPTIONS API TEST PASSED.');
}
