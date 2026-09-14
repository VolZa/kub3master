/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-input-buffer-debug.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-input-buffer-debug.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Діагностика фактичних значень рядка-буфера
 * 01_Виготовлення перед реалізацією його читання.
 *
 * Тест нічого не змінює в Google Sheets.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';

export function testManufacturingInputBufferDebug(): void {
  const sheet = sheetProvider.get(SheetKey.MANUFACTURING);

  const values = sheet.getRange(2, 1, 1, 12).getValues()[0];

  const displayValues = sheet.getRange(2, 1, 1, 12).getDisplayValues()[0];

  const headers = sheet.getRange(1, 1, 1, 12).getValues()[0];

  Logger.log('=== Manufacturing Input Buffer ===');

  for (let i = 0; i < headers.length; i++) {
    Logger.log(
      `${headers[i]} | value=${JSON.stringify(values[i])} | display=${JSON.stringify(displayValues[i])} | type=${typeof values[i]} | Date=${values[i] instanceof Date}`,
    );
  }

  Logger.log('MANUFACTURING INPUT BUFFER DEBUG PASSED.');
}
