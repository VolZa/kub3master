/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-input-buffer-mapper.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-input-buffer-mapper.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Перевірка перетворення рядка-буфера 01_Виготовлення
 * у ManufacturingInput.
 *
 * Тест нічого не змінює в Google Sheets.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';

import { ManufacturingInputBufferMapper } from '../mapping/manufacturingInputBufferMapper';

export function testManufacturingInputBufferMapper(): void {
  const sheet = sheetProvider.get(SheetKey.MANUFACTURING);

  const row = sheet.getRange(2, 1, 1, 12).getValues()[0];

  const input = ManufacturingInputBufferMapper.mapRowToInput(row);

  if (!(input.date instanceof Date)) {
    throw new Error('TEST FAILED: Дата не перетворена у Date.');
  }

  if (input.shift !== '') {
    throw new Error(
      `TEST FAILED: Очікувалася порожня зміна, отримано "${input.shift}".`,
    );
  }

  if (input.houseCode !== 'H001') {
    throw new Error(`TEST FAILED: Некоректний houseCode: ${input.houseCode}`);
  }

  if (input.productCode !== 'П- 1') {
    throw new Error(
      `TEST FAILED: Некоректний productCode: ${input.productCode}`,
    );
  }

  if (input.quantity !== 1) {
    throw new Error(`TEST FAILED: Некоректна quantity: ${input.quantity}`);
  }

  if (input.placementId !== undefined) {
    throw new Error(
      `TEST FAILED: PlacementId повинен бути undefined, отримано ${input.placementId}.`,
    );
  }

  if (input.master !== '') {
    throw new Error(
      `TEST FAILED: Master повинен бути порожнім, отримано "${input.master}".`,
    );
  }

  if (input.comment !== 'площ') {
    throw new Error(`TEST FAILED: Некоректний comment: ${input.comment}`);
  }

  Logger.log('✓ Дата правильно перетворена у Date.');
  Logger.log('✓ House / Product / Quantity прочитані правильно.');
  Logger.log('✓ Порожній Placement перетворений у undefined.');
  Logger.log('✓ Master / Comment прочитані правильно.');

  Logger.log('MANUFACTURING INPUT BUFFER MAPPER TEST PASSED.');
}
