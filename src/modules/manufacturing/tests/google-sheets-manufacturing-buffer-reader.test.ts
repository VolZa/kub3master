/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: google-sheets-manufacturing-buffer-reader.test.ts
 * Path: src/modules/manufacturing/tests/google-sheets-manufacturing-buffer-reader.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Перевірка читання фізичного рядка-буфера
 * 01_Виготовлення через GoogleSheetsManufacturingBufferReader.
 *
 * Тест нічого не змінює в Google Sheets.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { GoogleSheetsManufacturingBufferReader } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingBufferReader';

export function testGoogleSheetsManufacturingBufferReader(): void {
  const reader = new GoogleSheetsManufacturingBufferReader(sheetProvider);

  const row = reader.read();

  if (row.length !== 12) {
    throw new Error(
      `TEST FAILED: Очікувалося 12 колонок, отримано ${row.length}.`,
    );
  }

  if (!(row[1] instanceof Date)) {
    throw new Error('TEST FAILED: Колонка Дата не прочитана як Date.');
  }

  if (row[3] !== 'H001') {
    throw new Error(
      `TEST FAILED: Очікувався будинок H001, отримано "${row[3]}".`,
    );
  }

  if (row[4] !== 'П- 1') {
    throw new Error(
      `TEST FAILED: Очікувався код виробу "П- 1", отримано "${row[4]}".`,
    );
  }

  if (row[5] !== 1) {
    throw new Error(
      `TEST FAILED: Очікувалася кількість 1, отримано "${row[5]}".`,
    );
  }

  if (row[6] !== '') {
    throw new Error(
      `TEST FAILED: Placement повинен бути порожнім, отримано "${row[6]}".`,
    );
  }

  Logger.log('✓ GoogleSheetsManufacturingBufferReader прочитав рядок 2.');

  Logger.log('✓ Отримано 12 колонок із правильними типами даних.');

  Logger.log('GOOGLE SHEETS MANUFACTURING BUFFER READER TEST PASSED.');
}
