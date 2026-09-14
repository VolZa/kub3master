/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-web-input-mapper.test.ts
 * Path: src\modules\manufacturing\tests\manufacturing-web-input-mapper.test.ts
 *
 * Тест ManufacturingWebInputMapper.
 * ==========================================================
 */

import { ManufacturingWebInputMapper } from '../mapping/manufacturingWebInputMapper';
import { ManufacturingWebInput } from '../types/manufacturing-web-input';

export function testManufacturingWebInputMapper(): void {
  const webInput: ManufacturingWebInput = {
    date: '2026-09-12',
    shift: '1',
    houseCode: ' H001 ',
    productCode: ' П-2.3 ',
    quantity: 1,
    placementId: 9,
    master: ' Вася ',
    comment: ' Тест ',
  };

  const input = ManufacturingWebInputMapper.mapToInput(webInput);

  if (!(input.date instanceof Date)) {
    throw new Error('Дата не перетворена у Date.');
  }

  if (input.date.getFullYear() !== 2026) {
    throw new Error('Некоректний рік.');
  }

  if (input.date.getMonth() !== 8) {
    throw new Error('Некоректний місяць.');
  }

  if (input.date.getDate() !== 12) {
    throw new Error('Некоректний день.');
  }

  if (input.shift !== '1') {
    throw new Error('Некоректна зміна.');
  }

  if (input.houseCode !== 'H001') {
    throw new Error('Некоректний HouseCode.');
  }

  if (input.productCode !== 'П-2.3') {
    throw new Error('Некоректний ProductCode.');
  }

  if (input.quantity !== 1) {
    throw new Error('Некоректна кількість.');
  }

  if (input.placementId !== 9) {
    throw new Error('Некоректний PlacementId.');
  }

  if (input.master !== 'Вася') {
    throw new Error('Некоректний Master.');
  }

  if (input.comment !== 'Тест') {
    throw new Error('Некоректна примітка.');
  }

  console.log('✓ ManufacturingWebInput правильно перетворений.');

  console.log('MANUFACTURING WEB INPUT MAPPER TEST PASSED.');
}
