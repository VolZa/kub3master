/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing-repository-save.test.ts
 * Path: src/modules/manufacturing/tests/manufacturing-repository-save.test.ts
 *
 * Призначення:
 * Інтеграційний тест ManufacturingRepository.save().
 *
 * Перевіряє, що при збереженні Manufacturing:
 * - рядок 1 (заголовки) не змінюється;
 * - рядок 2 (буфер введення) не змінюється;
 * - Manufacturing записуються починаючи з рядка 3.
 * ==========================================================
 */

import { getManufacturingRepository } from '../../../app/factories/manufacturing.factory';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';
import { SheetKey } from '../../../infrastructure/sheets/SheetKey';

export function testManufacturingRepositorySave(): void {
  const sheet = sheetProvider.get(SheetKey.MANUFACTURING);

  const headersBefore = sheet.getRange(1, 1, 1, 12).getValues()[0];

  const bufferBefore = sheet.getRange(2, 1, 1, 12).getValues()[0];

  const repository = getManufacturingRepository();

  repository.save();

  const headersAfter = sheet.getRange(1, 1, 1, 12).getValues()[0];

  const bufferAfter = sheet.getRange(2, 1, 1, 12).getValues()[0];

  if (JSON.stringify(headersBefore) !== JSON.stringify(headersAfter)) {
    throw new Error('TEST FAILED: Рядок 1 (заголовки) був змінений.');
  }

  if (JSON.stringify(bufferBefore) !== JSON.stringify(bufferAfter)) {
    throw new Error('TEST FAILED: Рядок 2 (буфер) був змінений.');
  }

  Logger.log('MANUFACTURING REPOSITORY SAVE TEST PASSED.');
}
