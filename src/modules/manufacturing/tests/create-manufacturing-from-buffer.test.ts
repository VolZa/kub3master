/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: create-manufacturing-from-buffer.test.ts
 * Path: src\modules\manufacturing\tests\create-manufacturing-from-buffer.test.ts
 *
 * Одноразовий інтеграційний тест GAS entry point
 * createManufacturingFromBuffer().
 *
 * УВАГА:
 * Тест змінює реальні дані Google Sheets.
 * ==========================================================
 */

import { createManufacturingFromBuffer } from '../../../app/entrypoints/manufacturing.entrypoints';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';

export function testCreateManufacturingFromBuffer(): void {
  const sheet = sheetProvider.get(SheetKey.MANUFACTURING);

  // Зберігаємо ID першого запису до запуску.
  const idBefore = String(sheet.getRange(3, 1).getValue() ?? '').trim();

  // Викликаємо реальний GAS entry point.
  createManufacturingFromBuffer();

  // Після створення новий запис повинен опинитися в рядку 3.
  const idAfter = String(sheet.getRange(3, 1).getValue() ?? '').trim();

  if (!idAfter) {
    throw new Error('Тест провалений: у рядку 3 не зʼявився Manufacturing.');
  }

  if (idAfter === idBefore) {
    throw new Error(`Тест провалений: рядок 3 не змінився. ID=${idAfter}`);
  }

  // Перевіряємо системні поля нового запису.
  const row = sheet.getRange(3, 1, 1, 12).getValues()[0];

  const status = String(row[9] ?? '').trim();
  const createdAt = row[10];
  const updatedAt = row[11];

  if (status !== 'ACTIVE') {
    throw new Error(
      `Тест провалений: очікувався статус ACTIVE, отримано "${status}".`,
    );
  }

  if (!(createdAt instanceof Date)) {
    throw new Error('Тест провалений: поле Створено не є Date.');
  }

  if (!(updatedAt instanceof Date)) {
    throw new Error('Тест провалений: поле Змінено не є Date.');
  }

  // Перевіряємо, що буфер знову знаходиться в рядку 2.
  const bufferId = String(sheet.getRange(2, 1).getValue() ?? '').trim();

  if (bufferId !== '') {
    throw new Error(
      `Тест провалений: рядок 2 не залишився буфером. ID="${bufferId}".`,
    );
  }

  console.log(`✓ Entry point створив Manufacturing ${idAfter}.`);

  console.log('✓ Новий Manufacturing записаний у рядок 3.');

  console.log('✓ Статус ACTIVE та системні дати записані.');

  console.log('✓ Рядок 2 залишився буфером.');

  console.log('CREATE MANUFACTURING FROM BUFFER TEST PASSED.');
}
