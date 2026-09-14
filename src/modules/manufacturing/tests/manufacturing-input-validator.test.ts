/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-creation-structure.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-creation-structure.test.ts
 *
 * Layer: Test
 *
 * Призначення:
 * Одноразовий інтеграційний тест фізичної підготовки
 * таблиць до створення Manufacturing.
 *
 * Перевіряє:
 * - вставку нового рядка перед рядком 2 у 01_Виготовлення;
 * - збереження формули 10_Оснастка!A3;
 * - вставку нового рядка перед рядком 3 у 10_Оснастка;
 * - відновлення формули в A3.
 *
 * УВАГА:
 * Тест реально змінює структуру таблиць.
 * Запускати один раз.
 * ==========================================================
 */

import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';
import { GoogleSheetsWriter } from '../../../infrastructure/sheets/GoogleSheetsWriter';

export function testManufacturingCreationStructure(): void {
  const manufacturingSheet = sheetProvider.get(SheetKey.MANUFACTURING);

  const toolingSheet = sheetProvider.get(SheetKey.TOOLING);

  // Запам'ятовуємо старий буфер 01_Виготовлення.
  const bufferBefore = manufacturingSheet.getRange(2, 1, 1, 12).getValues()[0];

  // Запам'ятовуємо формулу 10_Оснастка!A3.
  const formulaBefore = toolingSheet.getRange('A3').getFormula();

  if (!formulaBefore) {
    throw new Error('TEST FAILED: У 10_Оснастка!A3 відсутня формула.');
  }

  const writer = new GoogleSheetsWriter(sheetProvider);

  writer.prepareManufacturingCreation();

  // Перевіряємо, що старий буфер перемістився з рядка 2 у рядок 3.
  const bufferAfter = manufacturingSheet.getRange(3, 1, 1, 12).getValues()[0];

  if (JSON.stringify(bufferBefore) !== JSON.stringify(bufferAfter)) {
    throw new Error(
      'TEST FAILED: Старий буфер 01_Виготовлення не перемістився у рядок 3.',
    );
  }

  // Перевіряємо, що A3 10_Оснастка знову містить формулу.
  const formulaAfter = toolingSheet.getRange('A3').getFormula();

  if (formulaAfter !== formulaBefore) {
    throw new Error('TEST FAILED: Формула 10_Оснастка!A3 не відновлена.');
  }

  Logger.log('✓ Старий буфер 01_Виготовлення перемістився у рядок 3.');

  Logger.log('✓ Формула 10_Оснастка!A3 збережена та відновлена.');

  Logger.log('MANUFACTURING CREATION STRUCTURE TEST PASSED.');
}
